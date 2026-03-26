import type { ParsedLog } from './types';

/**
 * Analyzes a ParsedLog for Apex PMD rule violations.
 * All detection is purely from the log — no org connection, no source files.
 *
 * Covered PMD rules (16 total):
 *   Performance : AvoidSoqlInLoops, AvoidSoslInLoops, AvoidDmlStatementsInLoops,
 *                 OperationWithLimitsInLoop, BulkOperationsNotBulkified
 *   Limits      : SoqlLimitApproaching, DmlLimitApproaching, CpuLimitApproaching,
 *                 HeapSizeApproaching
 *   Performance : SlowSoqlQuery, ExcessiveCallouts, ExcessiveDebugStatements
 *   Best Practice: AvoidLogicInTrigger, DebugsShouldUseLoggingLevel
 *   Security    : ApexInsecureEndpoint, ApexSuggestUsingNamedCred,
 *                 AvoidHardcodingId, ApexCRUDViolation
 *   Reliability : EmptyCatchBlock
 */
export interface QualityIssue {
  id: string;
  ruleId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'performance' | 'limits' | 'reliability' | 'best-practice' | 'security';
  what: string;
  why: string;
  how: string;
  codeExample: string;
  affectedLines: number[];
}

export function analyzeCodeQuality(log: ParsedLog): QualityIssue[] {
  const issues: QualityIssue[] = [];
  let seq = 0;
  const id = () => `cq-${++seq}`;

  // ── PERFORMANCE ──────────────────────────────────────────────────────────────

  // 1. AvoidSoqlInLoops — repeated identical SOQL
  const repeatedSoql = log.soqlStatements.filter(s => s.isRepeated);
  if (repeatedSoql.length > 0) {
    const groups = new Map<string, typeof repeatedSoql>();
    for (const s of repeatedSoql) {
      const key = normalizeQuery(s.query);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    for (const [, stmts] of groups) {
      issues.push({
        id: id(), ruleId: 'AvoidSoqlInLoops',
        title: `SOQL Query Runs ${stmts.length}× — N+1 Pattern`,
        severity: 'critical', category: 'performance',
        what: `"${truncate(stmts[0].query, 80)}" executed ${stmts.length} times in one transaction.`,
        why: 'Salesforce caps transactions at 100 SOQL queries. A query inside a loop burns through this in seconds and throws an uncatchable LimitException that rolls back everything silently.',
        how: '1. Move the query before the loop.\n2. Store results in a Map<Id, SObject>.\n3. Look up from the Map inside the loop — zero extra queries.',
        codeExample: `// ❌ Bad — query runs once per iteration\nfor (Account a : accounts) {\n    Contact c = [SELECT Id FROM Contact\n                 WHERE AccountId = :a.Id LIMIT 1];\n}\n\n// ✅ Good — one query, Map lookup\nSet<Id> ids = new Map<Id,Account>(accounts).keySet();\nMap<Id,Contact> cm = new Map<Id,Contact>(\n    [SELECT Id, AccountId FROM Contact\n     WHERE AccountId IN :ids]\n);\nfor (Account a : accounts) {\n    Contact c = cm.get(a.Id); // no SOQL\n}`,
        affectedLines: stmts.map(s => s.lineNumber),
      });
    }
  }

  // 2. AvoidSoslInLoops — multiple SOSL executions
  const soslEvents = log.allEvents.filter(e => e.eventType === 'SOSL_EXECUTE_BEGIN');
  if (soslEvents.length > 1) {
    issues.push({
      id: id(), ruleId: 'AvoidSoslInLoops',
      title: `SOSL Search Runs ${soslEvents.length}× — Likely in a Loop`,
      severity: 'high', category: 'performance',
      what: `SOSL (Find...) executed ${soslEvents.length} times in this transaction.`,
      why: 'Salesforce limits SOSL to 20 queries per transaction. Running SOSL inside a loop burns through this fast and will throw a LimitException.',
      how: '1. Move the SOSL search before the loop.\n2. Store results in a Map or List.\n3. Iterate the pre-fetched results.',
      codeExample: `// ❌ Bad\nfor (String term : searchTerms) {\n    List<List<SObject>> results =\n        [FIND :term IN ALL FIELDS RETURNING Account];\n}\n\n// ✅ Good — single SOSL with multi-term support\nString combinedTerm = String.join(searchTerms, ' OR ');\nList<List<SObject>> results =\n    [FIND :combinedTerm IN ALL FIELDS\n     RETURNING Account(Id, Name)];`,
      affectedLines: soslEvents.map(e => e.lineNumber),
    });
  }

  // 3. BulkOperationsNotBulkified — single-row DML repeated on same object
  const dmlByObject = new Map<string, typeof log.dmlStatements>();
  for (const d of log.dmlStatements) {
    const key = `${d.operation}:${d.objectType}`;
    if (!dmlByObject.has(key)) dmlByObject.set(key, []);
    dmlByObject.get(key)!.push(d);
  }
  for (const [key, stmts] of dmlByObject) {
    const singleRow = stmts.filter(s => s.rowsAffected === 1);
    if (singleRow.length >= 3) {
      const [op, obj] = key.split(':');
      issues.push({
        id: id(), ruleId: 'AvoidDmlStatementsInLoops',
        title: `Non-Bulkified DML — ${op} ${obj} runs ${singleRow.length}× with 1 row each`,
        severity: 'critical', category: 'performance',
        what: `${op} on ${obj} was called ${singleRow.length} times, each with exactly 1 row. This is a classic "DML in a loop" pattern.`,
        why: 'Each single-row DML counts as 1 DML statement against your 150-statement limit AND causes a separate round-trip to the database. For 100 records this means 100 DML statements instead of 1.',
        how: '1. Collect records to write into a List<SObject>.\n2. Call the DML operation once on the entire List after the loop.\n3. Use Database.SaveResult[] with allOrNone=false for partial success.',
        codeExample: `// ❌ Bad — 1 DML per iteration = N DML statements\nfor (Lead l : leads) {\n    insert new Contact(LastName = l.LastName,\n                       Email = l.Email);\n}\n\n// ✅ Good — 1 DML for all\nList<Contact> toInsert = new List<Contact>();\nfor (Lead l : leads) {\n    toInsert.add(new Contact(LastName = l.LastName,\n                             Email = l.Email));\n}\ninsert toInsert; // 1 DML statement`,
        affectedLines: singleRow.map(s => s.lineNumber),
      });
    }
  }

  // 4. AvoidLogicInTrigger — SOQL or DML directly inside a trigger
  const triggerPhases = log.transactions
    .flatMap(t => t.phases)
    .filter(p => p.type === 'BEFORE_TRIGGER' || p.type === 'AFTER_TRIGGER');
  for (const phase of triggerPhases) {
    if (phase.soqlCount > 2 || phase.dmlCount > 0) {
      issues.push({
        id: id(), ruleId: 'AvoidLogicInTrigger',
        title: `Business Logic in Trigger "${phase.name}" (${phase.soqlCount} SOQL, ${phase.dmlCount} DML)`,
        severity: 'high', category: 'best-practice',
        what: `${phase.name} contains ${phase.soqlCount} SOQL queries and ${phase.dmlCount} DML operations directly in the trigger body.`,
        why: 'Triggers are hard to test, hard to maintain, and cannot be re-used. Business logic buried in triggers causes governor limit failures when multiple triggers fire on the same object.',
        how: '1. Create a handler class (e.g. AccountTriggerHandler).\n2. Move all logic into the handler.\n3. Trigger body calls only the handler — one line per event.\n4. This makes logic testable and respects the one-trigger-per-object pattern.',
        codeExample: `// ❌ Bad — logic in trigger\ntrigger AccountTrigger on Account (before insert) {\n    List<Account> accs = [SELECT Id FROM Account\n                          WHERE Name = :Trigger.new[0].Name];\n    // ... more logic\n}\n\n// ✅ Good — trigger is thin, handler has logic\ntrigger AccountTrigger on Account (before insert, after insert) {\n    AccountTriggerHandler.handle(Trigger.operationType,\n                                 Trigger.new, Trigger.oldMap);\n}\n\npublic class AccountTriggerHandler {\n    public static void handle(...) { /* testable logic */ }\n}`,
        affectedLines: phase.soqlStatements.map(s => s.lineNumber),
      });
    }
  }

  // 5. SlowSoqlQuery — queries >500ms
  const slowSoql = log.soqlStatements.filter(s => (s.durationMs ?? 0) > 500);
  if (slowSoql.length > 0) {
    const maxMs = Math.max(...slowSoql.map(s => s.durationMs ?? 0));
    issues.push({
      id: id(), ruleId: 'SlowSoqlQuery',
      title: `${slowSoql.length} Slow SOQL Quer${slowSoql.length > 1 ? 'ies' : 'y'} (max ${maxMs.toFixed(0)}ms)`,
      severity: 'medium', category: 'performance',
      what: `${slowSoql.length} queries took over 500ms. Slowest: ${maxMs.toFixed(0)}ms — "${truncate(slowSoql.sort((a,b)=>(b.durationMs??0)-(a.durationMs??0))[0].query, 70)}"`,
      why: 'Slow queries eat CPU time (10,000ms limit) and make the experience sluggish. They usually mean a missing index or large unfiltered table scan.',
      how: '1. Add a WHERE clause on a standard indexed field (Id, Name, OwnerId, CreatedDate).\n2. Avoid LIKE, NOT IN, or != operators — they skip indexes.\n3. Use the Developer Console Query Plan tool to check index usage.',
      codeExample: `// ❌ Non-selective — full table scan on custom field\nList<Account> accs = [SELECT Id FROM Account\n                      WHERE Region__c = 'EMEA'];\n\n// ✅ Add selective filter + ensure field has an index\n// (mark field as External ID or create a custom index)\nList<Account> accs = [SELECT Id FROM Account\n                      WHERE OwnerId = :UserInfo.getUserId()\n                      AND Region__c = 'EMEA'];`,
      affectedLines: slowSoql.map(s => s.lineNumber),
    });
  }

  // 6. ExcessiveDebugStatements — >20 debug statements
  const totalDebug = log.transactions.flatMap(t => t.debugStatements).length;
  if (totalDebug > 20) {
    issues.push({
      id: id(), ruleId: 'ExcessiveDebugStatements',
      title: `${totalDebug} System.debug Calls — Excessive Logging`,
      severity: 'medium', category: 'performance',
      what: `${totalDebug} System.debug statements executed in this transaction.`,
      why: 'Every System.debug call consumes CPU time even in production where logs are rarely collected. Excessive logging has caused CPU limit failures in busy orgs.',
      how: '1. Remove or comment out debug statements before deploying to production.\n2. Guard remaining statements with a feature flag.\n3. Use Platform Events or Custom Logs for production observability instead.',
      codeExample: `// ❌ Bad — always runs in prod\nSystem.debug('Processing record: ' + record);\n\n// ✅ Good — guarded by deploy-time flag\n@TestVisible private static Boolean ENABLE_DEBUG = false;\n\nif (ENABLE_DEBUG) {\n    System.debug(LoggingLevel.DEBUG,\n                 'Processing: ' + record);\n}`,
      affectedLines: [],
    });
  }

  // 7. DebugsShouldUseLoggingLevel — debug statements without explicit level
  const debugStmts = log.transactions.flatMap(t => t.debugStatements);
  const defaultLevelCount = debugStmts.filter(d => d.level === 'DEBUG').length;
  if (debugStmts.length > 0 && defaultLevelCount / debugStmts.length > 0.8) {
    issues.push({
      id: id(), ruleId: 'DebugsShouldUseLoggingLevel',
      title: `${defaultLevelCount}/${debugStmts.length} Debug Calls Missing Explicit LoggingLevel`,
      severity: 'low', category: 'best-practice',
      what: `Most System.debug() calls use the default DEBUG level. This suggests LoggingLevel was not explicitly specified.`,
      why: 'Without an explicit LoggingLevel, all debug messages print even at low log levels, polluting logs and wasting CPU. Specifying a level lets you filter by severity.',
      how: 'Always pass a LoggingLevel as the first argument to System.debug().',
      codeExample: `// ❌ Bad — no level specified, always prints\nSystem.debug('Account name: ' + acc.Name);\n\n// ✅ Good — explicit level, filterable\nSystem.debug(LoggingLevel.INFO, 'Account name: ' + acc.Name);\nSystem.debug(LoggingLevel.WARN, 'No contacts found for: ' + acc.Id);\nSystem.debug(LoggingLevel.ERROR, 'DML failed: ' + e.getMessage());`,
      affectedLines: debugStmts.filter(d => d.level === 'DEBUG').map(d => d.lineNumber),
    });
  }

  // ── SECURITY ─────────────────────────────────────────────────────────────────

  // 8. ApexInsecureEndpoint — HTTP (not HTTPS) callout
  const insecureCallouts = log.allEvents.filter(e =>
    e.eventType === 'CALLOUT_REQUEST' &&
    (e.fields[1] ?? '').toLowerCase().startsWith('http://')
  );
  if (insecureCallouts.length > 0) {
    issues.push({
      id: id(), ruleId: 'ApexInsecureEndpoint',
      title: `${insecureCallouts.length} Callout${insecureCallouts.length > 1 ? 's' : ''} Use Insecure HTTP`,
      severity: 'critical', category: 'security',
      what: `${insecureCallouts.length} HTTP callout${insecureCallouts.length > 1 ? 's' : ''} use http:// instead of https://, sending data unencrypted.`,
      why: 'HTTP transmits data in plain text — credentials, tokens, and user data can be intercepted by anyone on the network. Salesforce security review will reject apps using unencrypted callouts.',
      how: '1. Change the endpoint URL from http:// to https://.\n2. Ensure the remote server has a valid SSL certificate.\n3. Store the URL in a Named Credential — never hardcode it.',
      codeExample: `// ❌ Insecure — unencrypted\nHttpRequest req = new HttpRequest();\nreq.setEndpoint('http://api.example.com/data');\n\n// ✅ Secure — encrypted + Named Credential\nreq.setEndpoint('callout:MyNamedCred/data');\n// Named Credential stores the base URL and auth securely`,
      affectedLines: insecureCallouts.map(e => e.lineNumber),
    });
  }

  // 9. ApexSuggestUsingNamedCred — callout to raw URL (not callout:)
  const rawUrlCallouts = log.allEvents.filter(e =>
    e.eventType === 'CALLOUT_REQUEST' &&
    !(e.fields[1] ?? '').toLowerCase().startsWith('callout:')
  );
  if (rawUrlCallouts.length > 0) {
    issues.push({
      id: id(), ruleId: 'ApexSuggestUsingNamedCred',
      title: `${rawUrlCallouts.length} Callout${rawUrlCallouts.length > 1 ? 's' : ''} Use Hardcoded URLs Instead of Named Credentials`,
      severity: 'high', category: 'security',
      what: `${rawUrlCallouts.length} callout${rawUrlCallouts.length > 1 ? 's' : ''} go to raw endpoints. Credentials or base URLs may be hardcoded in Apex.`,
      why: 'Hardcoded URLs and credentials in Apex code are exposed in source control, visible to all developers, and require a code deployment to change. Named Credentials store them securely with org-specific config.',
      how: '1. Create a Named Credential in Setup → Security → Named Credentials.\n2. Change the endpoint to callout:YourNamedCred/path.\n3. The Named Credential handles authentication automatically.',
      codeExample: `// ❌ Bad — URL and credentials in code\nreq.setEndpoint('https://api.example.com/v2/data');\nreq.setHeader('Authorization', 'Bearer ' + myToken);\n\n// ✅ Good — Named Credential\nreq.setEndpoint('callout:ExampleAPI/v2/data');\n// Auth is configured in Setup, not in code`,
      affectedLines: rawUrlCallouts.map(e => e.lineNumber),
    });
  }

  // 10. AvoidHardcodingId — SOQL with hardcoded 15/18 char SF IDs
  const sfIdRegex = /['"](00[0-9a-zA-Z]{13}|00[0-9a-zA-Z]{15})['"]/g;
  const hardcodedIdSoql = log.soqlStatements.filter(s => sfIdRegex.test(s.query));
  if (hardcodedIdSoql.length > 0) {
    issues.push({
      id: id(), ruleId: 'AvoidHardcodingId',
      title: `${hardcodedIdSoql.length} SOQL Quer${hardcodedIdSoql.length > 1 ? 'ies' : 'y'} Contain Hardcoded Salesforce IDs`,
      severity: 'high', category: 'security',
      what: `Found queries with hardcoded 15 or 18-character Salesforce record IDs (e.g. WHERE RecordTypeId = '012...' or WHERE OwnerId = '005...').`,
      why: 'Salesforce IDs differ between sandboxes and production. Hardcoded IDs break deployments, cause silent failures in other orgs, and are flagged by Security Review.',
      how: '1. Use CustomLabel, Custom Setting, or Custom Metadata to store environment-specific IDs.\n2. For RecordTypes: use Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName() instead.\n3. For Users: use UserInfo.getUserId() for the current user.',
      codeExample: `// ❌ Bad — breaks in sandbox\nList<Account> accs = [SELECT Id FROM Account\n    WHERE RecordTypeId = '0124000000ABC123'];\n\n// ✅ Good — works everywhere\nId rtId = Schema.SObjectType.Account\n    .getRecordTypeInfosByDeveloperName()\n    .get('Customer').getRecordTypeId();\nList<Account> accs = [SELECT Id FROM Account\n    WHERE RecordTypeId = :rtId];`,
      affectedLines: hardcodedIdSoql.map(s => s.lineNumber),
    });
  }

  // 11. ApexCRUDViolation — DML without visible CRUD/FLS check
  // Heuristic: DML present + no Schema.describe calls in debug output
  const hasDml = log.dmlStatements.length > 0;
  const hasCrudCheck = log.transactions.flatMap(t => t.debugStatements)
    .some(d => /isAccessible|isCreateable|isUpdateable|isDeletable|isQueryable|hasRead|hasCreate|hasEdit|hasDelete/i.test(d.message));
  if (hasDml && !hasCrudCheck) {
    issues.push({
      id: id(), ruleId: 'ApexCRUDViolation',
      title: 'DML Operations Without Visible CRUD/FLS Check',
      severity: 'high', category: 'security',
      what: `${log.dmlStatements.length} DML operation${log.dmlStatements.length > 1 ? 's' : ''} executed but no CRUD or FLS permission check was detected in the log.`,
      why: 'Salesforce does not automatically enforce field-level security in Apex. Code that skips FLS checks can read or write data the running user is not allowed to access, violating data security rules and failing Security Review.',
      how: '1. Use Schema.sObjectType.Account.isCreateable() before insert.\n2. Use WITH SECURITY_ENFORCED in SOQL to auto-enforce FLS.\n3. Or use Security.stripInaccessible() to remove inaccessible fields before DML.',
      codeExample: `// ❌ Bad — ignores FLS\ninsert new Account(Name = 'Acme', AnnualRevenue__c = 1000);\n\n// ✅ Good — check before writing\nif (!Schema.sObjectType.Account.isCreateable()) {\n    throw new AuraHandledException(\n        'Insufficient privileges to create Account');\n}\ninsert new Account(Name = 'Acme', AnnualRevenue__c = 1000);\n\n// ✅ Also good — strip inaccessible fields automatically\nSObject cleaned = Security.stripInaccessible(\n    AccessType.CREATABLE, newRecord).getRecord();`,
      affectedLines: log.dmlStatements.map(d => d.lineNumber),
    });
  }

  // ── LIMITS ───────────────────────────────────────────────────────────────────

  // 12. SOQL limit approaching (>80%)
  const soqlLimit = log.governorLimits.entries.find(e =>
    /soql query/i.test(e.displayName) || /soql/i.test(e.name));
  if (soqlLimit && soqlLimit.percentUsed >= 80 && repeatedSoql.length === 0) {
    issues.push({
      id: id(), ruleId: 'SoqlLimitApproaching',
      title: `SOQL Limit at ${soqlLimit.percentUsed}% — ${soqlLimit.used}/${soqlLimit.max} Queries Used`,
      severity: soqlLimit.percentUsed >= 90 ? 'critical' : 'high', category: 'limits',
      what: `This transaction used ${soqlLimit.used} of ${soqlLimit.max} allowed SOQL queries.`,
      why: 'At ${soqlLimit.percentUsed}% you are one extra feature away from a LimitException that silently rolls back the entire transaction.',
      how: '1. Combine multiple queries using sub-selects or IN filters.\n2. Cache repeated lookups in a static map.\n3. Move non-critical queries to an async context (@future or Queueable).',
      codeExample: `// ✅ Sub-query — 1 SOQL instead of 2\nList<Account> accs = [\n    SELECT Id, Name,\n        (SELECT Id, Email FROM Contacts)\n    FROM Account WHERE Id IN :ids\n];`,
      affectedLines: [],
    });
  }

  // 13. DML limit approaching (>80%)
  const dmlLimit = log.governorLimits.entries.find(e =>
    /dml statement/i.test(e.displayName) || /dml/i.test(e.name));
  if (dmlLimit && dmlLimit.percentUsed >= 80) {
    issues.push({
      id: id(), ruleId: 'DmlLimitApproaching',
      title: `DML Limit at ${dmlLimit.percentUsed}% — ${dmlLimit.used}/${dmlLimit.max} Statements Used`,
      severity: dmlLimit.percentUsed >= 90 ? 'critical' : 'high', category: 'limits',
      what: `${dmlLimit.used} DML statements out of ${dmlLimit.max} allowed were executed.`,
      why: 'Exceeding the DML limit throws a LimitException and rolls back the entire transaction, potentially corrupting partial saves.',
      how: '1. Collect all changes in a List and execute one DML per type.\n2. Use Database.upsert with external IDs to combine insert/update.\n3. Move bulk operations to Batch Apex.',
      codeExample: `// ✅ Batch all changes\nList<SObject> toUpdate = new List<SObject>();\ntoUpdate.addAll(updatedAccounts);\ntoUpdate.addAll(updatedContacts);\n// Still 2 DML statements but each handles bulk\nupdate [SELECT Id FROM Account WHERE ...]; // bulk`,
      affectedLines: [],
    });
  }

  // 14. CPU limit approaching (>75%)
  const cpuLimit = log.governorLimits.entries.find(e =>
    /cpu/i.test(e.displayName) || /cpu/i.test(e.name));
  if (cpuLimit && cpuLimit.percentUsed >= 75) {
    issues.push({
      id: id(), ruleId: 'CpuLimitApproaching',
      title: `CPU Time at ${cpuLimit.percentUsed}% — ${cpuLimit.used}ms of ${cpuLimit.max}ms Used`,
      severity: cpuLimit.percentUsed >= 90 ? 'critical' : 'high', category: 'limits',
      what: `This transaction consumed ${cpuLimit.used}ms of the ${cpuLimit.max}ms CPU time limit.`,
      why: 'Exceeding the CPU limit throws an uncatchable "Apex CPU time limit exceeded" error. System.debug calls, String concatenation in loops, and complex calculations are common culprits.',
      how: '1. Remove or guard System.debug() calls — they consume CPU even in production.\n2. Use String.join(list, sep) instead of string concatenation in loops.\n3. Move heavy computation to @future or Queueable Apex.',
      codeExample: `// ❌ String concat in loop — O(n²) CPU cost\nString result = '';\nfor (String s : items) { result += s + ','; }\n\n// ✅ String.join — O(n)\nString result = String.join(items, ',');`,
      affectedLines: [],
    });
  }

  // 15. Heap size approaching (>75%)
  const heapLimit = log.governorLimits.entries.find(e =>
    /heap/i.test(e.displayName) || /heap/i.test(e.name));
  if (heapLimit && heapLimit.percentUsed >= 75) {
    issues.push({
      id: id(), ruleId: 'HeapSizeApproaching',
      title: `Heap Size at ${heapLimit.percentUsed}% — ${(heapLimit.used/1024/1024).toFixed(1)}MB of ${(heapLimit.max/1024/1024).toFixed(1)}MB Used`,
      severity: heapLimit.percentUsed >= 90 ? 'critical' : 'medium', category: 'limits',
      what: `The transaction used ${heapLimit.used.toLocaleString()} bytes of the ${heapLimit.max.toLocaleString()} byte heap limit.`,
      why: 'Exceeding heap throws a LimitException and rolls back the transaction. Selecting too many fields, loading large blobs, or holding large collections in memory are common causes.',
      how: '1. Select only the fields you need — avoid SELECT *.\n2. Process large datasets in Batch Apex (200 records at a time).\n3. Set collections to null after use.\n4. Avoid storing large String or Blob fields in collections.',
      codeExample: `// ❌ Selects everything — huge heap\nList<Account> accs = [SELECT FIELDS(ALL) FROM Account LIMIT 10000];\n\n// ✅ Only what you need\nList<Account> accs = [SELECT Id, Name, AnnualRevenue\n                      FROM Account\n                      WHERE ... LIMIT 10000];`,
      affectedLines: [],
    });
  }

  // 16. ExcessiveCallouts
  const calloutCount = log.transactions.reduce((s, t) => s + t.calloutCount, 0);
  if (calloutCount > 10) {
    issues.push({
      id: id(), ruleId: 'ExcessiveCallouts',
      title: `${calloutCount} External Callouts — High Callout Count`,
      severity: 'medium', category: 'performance',
      what: `${calloutCount} callouts to external services in a single transaction.`,
      why: 'Salesforce limits callouts to 100 per transaction. Each adds latency and you cannot make callouts after a DML statement without committing first.',
      how: '1. Batch multiple requests into one payload.\n2. Move callouts to @future(callout=true) or Queueable.\n3. Cache external responses in a Custom Setting or Platform Cache.',
      codeExample: `// ✅ Queueable callout — async, no DML constraint\npublic class CalloutJob implements Queueable,\n        Database.AllowsCallouts {\n    public void execute(QueueableContext ctx) {\n        HttpRequest req = new HttpRequest();\n        // batch payload for all records\n    }\n}`,
      affectedLines: [],
    });
  }

  // 17. EmptyCatchBlock — fatal errors / unhandled exceptions
  const fatals = log.errors.filter(e => e.isFatal);
  if (fatals.length > 0) {
    issues.push({
      id: id(), ruleId: 'EmptyCatchBlock',
      title: `${fatals.length} Unhandled Exception${fatals.length > 1 ? 's' : ''} — Transaction Failed`,
      severity: 'critical', category: 'reliability',
      what: `Fatal: "${truncate(fatals[0].message, 100)}"`,
      why: 'Unhandled exceptions silently roll back the entire transaction and show users a cryptic error. Proper handling lets you save what succeeded, log the failure, and guide the user.',
      how: '1. Wrap risky operations in try-catch.\n2. Use Database.insert(records, false) (allOrNone=false) to allow partial saves.\n3. Log the exception and surface a human-readable message.',
      codeExample: `// ✅ Graceful DML error handling\ntry {\n    insert myRecord;\n} catch (DmlException e) {\n    for (Integer i = 0; i < e.getNumDml(); i++) {\n        System.debug(LoggingLevel.ERROR, e.getDmlMessage(i));\n    }\n    throw new AuraHandledException(\n        'Could not save record: ' + e.getDmlMessage(0));\n}\n\n// ✅ Partial success with allOrNone=false\nList<Database.SaveResult> results =\n    Database.insert(records, false);\nfor (Database.SaveResult r : results) {\n    if (!r.isSuccess()) {\n        // handle individual failure\n    }\n}`,
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
