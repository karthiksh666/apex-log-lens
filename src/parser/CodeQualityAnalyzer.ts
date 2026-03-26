import type { ParsedLog } from './types';

/**
 * Analyzes a ParsedLog for common Salesforce Apex anti-patterns —
 * the same issues that Apex PMD rules flag.
 *
 * Returns a list of QualityIssue objects, each with:
 *   - what went wrong (plain English)
 *   - why it matters
 *   - exactly how to fix it
 *   - a concrete code example
 *
 * All analysis is purely from the log — no org connection needed.
 */
export interface QualityIssue {
  id: string;
  ruleId: string;          // PMD-equivalent rule name
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'performance' | 'limits' | 'reliability' | 'best-practice';
  what: string;            // What is wrong (1–2 sentences)
  why: string;             // Why it's dangerous
  how: string;             // How to fix it (step-by-step)
  codeExample: string;     // ✅ correct pattern
  affectedLines: number[]; // Line numbers from the log
}

export function analyzeCodeQuality(log: ParsedLog): QualityIssue[] {
  const issues: QualityIssue[] = [];
  let idSeq = 0;
  const nextId = () => `cq-${++idSeq}`;

  // ─── 1. N+1 / Repeated SOQL (AvoidSoqlInLoops) ──────────────────────────────
  const repeatedSoql = log.soqlStatements.filter(s => s.isRepeated);
  if (repeatedSoql.length > 0) {
    // Group by normalized query text to surface distinct patterns
    const groups = new Map<string, typeof repeatedSoql>();
    for (const s of repeatedSoql) {
      const key = normalizeQuery(s.query);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    for (const [, stmts] of groups) {
      issues.push({
        id: nextId(),
        ruleId: 'AvoidSoqlInLoops',
        title: 'SOQL Query Runs Multiple Times (N+1 Pattern)',
        severity: 'critical',
        category: 'limits',
        what: `The query "${truncate(stmts[0].query, 80)}" ran ${stmts.length} times in a single transaction.`,
        why: 'Salesforce allows only 100 SOQL queries per transaction. Running queries inside a loop burns through this limit fast and will throw a "Too many SOQL queries: 101" LimitException in production.',
        how: `1. Move the query BEFORE the loop.\n2. Store results in a Map<Id, SObject>.\n3. Look up from the Map inside the loop — zero additional queries.`,
        codeExample: `// ❌ Bad — query runs once per iteration\nfor (Account acc : accountList) {\n    Contact c = [SELECT Id FROM Contact\n                 WHERE AccountId = :acc.Id LIMIT 1];\n}\n\n// ✅ Good — one query, Map lookup inside loop\nSet<Id> ids = new Map<Id,Account>(accountList).keySet();\nMap<Id,Contact> contactMap = new Map<Id,Contact>(\n    [SELECT Id, AccountId FROM Contact WHERE AccountId IN :ids]\n);\nfor (Account acc : accountList) {\n    Contact c = contactMap.get(acc.Id);\n}`,
        affectedLines: stmts.map(s => s.lineNumber),
      });
    }
  }

  // ─── 2. High SOQL usage (>80 of 100) ────────────────────────────────────────
  const soqlLimit = log.governorLimits.entries.find(e =>
    e.name.toLowerCase().includes('soql') || e.displayName.toLowerCase().includes('soql query'));
  if (soqlLimit && soqlLimit.percentUsed >= 80 && repeatedSoql.length === 0) {
    issues.push({
      id: nextId(),
      ruleId: 'SoqlLimitApproaching',
      title: `High SOQL Usage — ${soqlLimit.percentUsed}% of limit used`,
      severity: soqlLimit.percentUsed >= 90 ? 'critical' : 'high',
      category: 'limits',
      what: `This transaction executed ${soqlLimit.used} SOQL queries out of the ${soqlLimit.max} allowed.`,
      why: 'At this rate, adding more functionality will breach the 100-query limit and throw a LimitException that silently rolls back your entire transaction.',
      how: '1. Review all SOQL statements and consolidate queries where possible.\n2. Use parent-child sub-queries to fetch related records in one query.\n3. Move lookups to static maps or custom settings to avoid redundant queries.',
      codeExample: `// ✅ Parent-child sub-query — 1 query instead of N+1\nList<Account> accounts = [SELECT Id, Name,\n    (SELECT Id, Email FROM Contacts)\n    FROM Account WHERE Id IN :ids];`,
      affectedLines: [],
    });
  }

  // ─── 3. High DML usage (>80 of 150) ─────────────────────────────────────────
  const dmlLimit = log.governorLimits.entries.find(e =>
    e.name.toLowerCase().includes('dml') || e.displayName.toLowerCase().includes('dml statement'));
  if (dmlLimit && dmlLimit.percentUsed >= 80) {
    issues.push({
      id: nextId(),
      ruleId: 'AvoidDmlStatementsInLoops',
      title: `High DML Usage — ${dmlLimit.percentUsed}% of limit used`,
      severity: dmlLimit.percentUsed >= 90 ? 'critical' : 'high',
      category: 'limits',
      what: `This transaction performed ${dmlLimit.used} DML operations out of the ${dmlLimit.max} allowed.`,
      why: 'Each insert, update, delete, or upsert counts against your DML limit (150 per transaction). Individual DML inside a loop causes this to balloon.',
      how: '1. Collect records to insert/update in a List.\n2. Call DML once on the entire List AFTER the loop.\n3. This uses 1 DML statement instead of one per record.',
      codeExample: `// ❌ Bad — 1 DML per iteration\nfor (Lead l : leads) {\n    insert new Contact(LastName = l.LastName);\n}\n\n// ✅ Good — bulk DML outside the loop\nList<Contact> toInsert = new List<Contact>();\nfor (Lead l : leads) {\n    toInsert.add(new Contact(LastName = l.LastName));\n}\ninsert toInsert; // 1 DML statement`,
      affectedLines: log.dmlStatements.map(d => d.lineNumber),
    });
  }

  // ─── 4. High CPU usage ───────────────────────────────────────────────────────
  const cpuLimit = log.governorLimits.entries.find(e =>
    e.name.toLowerCase().includes('cpu') || e.displayName.toLowerCase().includes('cpu'));
  if (cpuLimit && cpuLimit.percentUsed >= 75) {
    issues.push({
      id: nextId(),
      ruleId: 'AvoidDebugStatements',
      title: `High CPU Time — ${cpuLimit.percentUsed}% of limit used`,
      severity: cpuLimit.percentUsed >= 90 ? 'critical' : 'high',
      category: 'performance',
      what: `Apex used ${cpuLimit.used}ms of the ${cpuLimit.max}ms CPU time limit in this transaction.`,
      why: 'Exceeding the CPU limit throws an uncatchable "System.LimitException: Apex CPU time limit exceeded" error. Async processing and excessive System.debug calls are common culprits.',
      how: '1. Remove or guard all System.debug() calls with a debug flag — they consume CPU even when not needed.\n2. Move heavy computation to @future or Queueable Apex.\n3. Avoid String concatenation in loops (use List<String> + String.join instead).',
      codeExample: `// ✅ Guard debug calls with a static flag\npublic class MyClass {\n    static final Boolean IS_DEBUG = false; // flip per deploy\n    // ...\n    if (IS_DEBUG) System.debug('value: ' + val);\n}`,
      affectedLines: [],
    });
  }

  // ─── 5. Heap size usage ──────────────────────────────────────────────────────
  const heapLimit = log.governorLimits.entries.find(e =>
    e.name.toLowerCase().includes('heap') || e.displayName.toLowerCase().includes('heap'));
  if (heapLimit && heapLimit.percentUsed >= 75) {
    issues.push({
      id: nextId(),
      ruleId: 'HeapSizeApproaching',
      title: `High Heap Usage — ${heapLimit.percentUsed}% of limit used`,
      severity: heapLimit.percentUsed >= 90 ? 'critical' : 'medium',
      category: 'limits',
      what: `The transaction consumed ${heapLimit.used.toLocaleString()} bytes of the ${heapLimit.max.toLocaleString()} byte heap limit.`,
      why: 'When the heap limit is exceeded Salesforce throws a LimitException and rolls back the transaction. Large collections of sObjects or Strings are the usual cause.',
      how: '1. Select only the fields you actually need in SOQL (avoid SELECT *).\n2. Process large datasets in batches (Batch Apex) instead of holding everything in memory.\n3. Set list variables to null when done with them.',
      codeExample: `// ✅ Select only needed fields\nList<Account> accs = [SELECT Id, Name FROM Account\n                      WHERE ... LIMIT 10000];\n// ✅ Batch Apex for large volumes\nglobal class MyBatch implements Database.Batchable<SObject> {\n    // processes 200 records at a time\n}`,
      affectedLines: [],
    });
  }

  // ─── 6. Slow SOQL queries (> 500ms) ─────────────────────────────────────────
  const slowSoql = log.soqlStatements.filter(s => s.durationMs !== null && s.durationMs > 500);
  if (slowSoql.length > 0) {
    issues.push({
      id: nextId(),
      ruleId: 'SlowSoqlQuery',
      title: `Slow SOQL Quer${slowSoql.length > 1 ? 'ies' : 'y'} (${slowSoql.length} over 500ms)`,
      severity: 'medium',
      category: 'performance',
      what: `${slowSoql.length} SOQL quer${slowSoql.length > 1 ? 'ies' : 'y'} took more than 500ms to execute. The slowest was ${Math.max(...slowSoql.map(s => s.durationMs ?? 0)).toFixed(0)}ms.`,
      why: 'Slow queries indicate missing indexes or large unfiltered datasets. They burn CPU time, contribute to the 10,000ms CPU limit, and make the user experience sluggish.',
      how: '1. Add a WHERE clause on an indexed field (Id, Name, CreatedDate, or custom external Id).\n2. Avoid LIKE or NOT IN operators — they prevent index use.\n3. Check Salesforce\'s Query Plan tool in the Developer Console to confirm index usage.',
      codeExample: `// ❌ No selective filter — full table scan\nList<Account> accs = [SELECT Id FROM Account\n                      WHERE CustomField__c = 'val'];\n\n// ✅ Add index by marking field as External ID or\n//    filter by a standard indexed field like OwnerId\nList<Account> accs = [SELECT Id FROM Account\n                      WHERE OwnerId = :UserInfo.getUserId()\n                      AND CustomField__c = 'val'];`,
      affectedLines: slowSoql.map(s => s.lineNumber),
    });
  }

  // ─── 7. Multiple callouts ────────────────────────────────────────────────────
  const calloutCount = log.transactions.reduce((sum, t) => sum + t.calloutCount, 0);
  if (calloutCount > 10) {
    issues.push({
      id: nextId(),
      ruleId: 'ExcessiveCallouts',
      title: `High Callout Count — ${calloutCount} external calls`,
      severity: 'medium',
      category: 'reliability',
      what: `This transaction made ${calloutCount} callouts to external services.`,
      why: 'Salesforce limits you to 100 callouts per transaction, and each callout adds latency. Callouts also cannot be made after a DML statement without committing first.',
      how: '1. Batch callout payloads — send one request with a list of items instead of one per item.\n2. Use @future(callout=true) or Queueable with callout=true to move callouts async.\n3. Cache external results in a Custom Setting or Platform Cache where appropriate.',
      codeExample: `// ✅ Queueable callout — async, no DML-before-callout constraint\npublic class CalloutJob implements Queueable, Database.AllowsCallouts {\n    public void execute(QueueableContext ctx) {\n        HttpRequest req = new HttpRequest();\n        // ... build and send single batched request\n    }\n}`,
      affectedLines: [],
    });
  }

  // ─── 8. Exceptions without proper handling ───────────────────────────────────
  const fatals = log.errors.filter(e => e.isFatal);
  if (fatals.length > 0) {
    issues.push({
      id: nextId(),
      ruleId: 'EmptyCatchBlock',
      title: `Unhandled Exception${fatals.length > 1 ? 's' : ''} — ${fatals.length} fatal error${fatals.length > 1 ? 's' : ''}`,
      severity: 'critical',
      category: 'reliability',
      what: `${fatals.length} fatal exception${fatals.length > 1 ? 's' : ''} caused the transaction to fail: "${truncate(fatals[0].message, 100)}"`,
      why: 'Unhandled exceptions roll back the entire transaction silently and give users a cryptic error. Proper exception handling lets you log the error, notify the user clearly, and continue safe processing.',
      how: '1. Wrap risky operations in try-catch.\n2. Log the full exception with System.debug(LoggingLevel.ERROR, e).\n3. Use Database.insert(records, false) (allOrNone=false) to collect errors without throwing.',
      codeExample: `// ✅ Graceful error handling\ntry {\n    insert myRecord;\n} catch (DmlException e) {\n    for (Integer i = 0; i < e.getNumDml(); i++) {\n        System.debug(LoggingLevel.ERROR,\n            e.getDmlMessage(i));\n    }\n    // surface a friendly message to the user\n}\n\n// ✅ allOrNone=false — partial success\nList<Database.SaveResult> results =\n    Database.insert(records, false);`,
      affectedLines: fatals.map(e => e.lineNumber),
    });
  }

  return issues;
}

function normalizeQuery(q: string): string {
  return q.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
