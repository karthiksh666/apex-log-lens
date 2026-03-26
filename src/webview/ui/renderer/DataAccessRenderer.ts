import type { ParsedLog } from '../../../parser/types';

/**
 * Objects tab — one-stop view of everything the code touched:
 *   • Every Salesforce object, with SOQL read-count and DML write-count
 *   • Fields accessed per object (parsed from SOQL SELECT lists)
 *   • External endpoints / named credentials used in callouts
 *
 * Designed so a developer can instantly see what object-level and field-level
 * permissions the code requires, without reading the full log.
 */
export function renderDataAccess(log: ParsedLog): string {
  const objMap  = buildObjectMap(log);
  const endpoints = extractEndpoints(log);

  if (objMap.size === 0 && endpoints.length === 0) {
    return `<div class="empty-state"><p>No SOQL, DML, or callouts found in this log.</p></div>`;
  }

  const rows = [...objMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const writeObjects   = rows.filter(r => r.dmlOps.size > 0).length;
  const readOnlyObjects = rows.filter(r => r.soqlCount > 0 && r.dmlOps.size === 0).length;

  return /* html */`
    <div class="da-view">

      <!-- ── Summary pills ── -->
      <div class="da-summary-bar">
        <span class="da-pill da-pill-total">${rows.length} object${rows.length !== 1 ? 's' : ''} accessed</span>
        ${readOnlyObjects > 0 ? `<span class="da-pill da-pill-read">${readOnlyObjects} read-only</span>` : ''}
        ${writeObjects    > 0 ? `<span class="da-pill da-pill-write">${writeObjects} written to</span>` : ''}
        ${endpoints.length > 0 ? `<span class="da-pill da-pill-callout">${endpoints.length} external endpoint${endpoints.length !== 1 ? 's' : ''}</span>` : ''}
        <span class="da-hint">Minimum permissions this code needs — derived from the log.</span>
      </div>

      <!-- ── Objects table ── -->
      ${rows.length > 0 ? /* html */`
        <table class="data-table da-table">
          <thead>
            <tr>
              <th class="cell-num">#</th>
              <th>Salesforce Object</th>
              <th>Read (SOQL)</th>
              <th>Fields Selected</th>
              <th>Write (DML)</th>
              <th class="da-cell-rows">Rows read</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((obj, i) => renderObjectRow(obj, i + 1)).join('')}
          </tbody>
        </table>
      ` : ''}

      <!-- ── External Endpoints ── -->
      ${endpoints.length > 0 ? /* html */`
        <div class="da-section-title">🌐 External Endpoints / Named Credentials</div>
        <table class="data-table">
          <thead>
            <tr>
              <th class="cell-num">#</th>
              <th>Endpoint</th>
              <th>Method(s)</th>
              <th class="da-cell-rows">Calls</th>
            </tr>
          </thead>
          <tbody>
            ${endpoints.map((ep, i) => /* html */`
              <tr>
                <td class="cell-num">${i + 1}</td>
                <td class="da-endpoint">${escHtml(ep.url)}</td>
                <td>${[...ep.methods].map(m => `<span class="method-badge method-${m.toLowerCase()}">${m}</span>`).join(' ')}</td>
                <td class="da-cell-rows">${ep.count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

    </div>
  `;
}

function renderObjectRow(obj: ObjectAccess, idx: number): string {
  const readCell = obj.soqlCount > 0
    ? `<span class="da-access da-read">Read <span class="da-count">${obj.soqlCount}</span></span>`
    : `<span class="da-no-access">—</span>`;

  const writeParts = [...obj.dmlOps.entries()].map(([op, count]) =>
    `<span class="da-access da-write op-${op.toLowerCase()}">${op} <span class="da-count">${count}</span></span>`
  ).join('');
  const writeCell = writeParts || `<span class="da-no-access">—</span>`;

  const fieldsCell = obj.fields.size > 0
    ? [...obj.fields].sort().map(f => `<span class="da-field">${escHtml(f)}</span>`).join('')
    : `<span class="da-no-access">—</span>`;

  const rowsCell = obj.soqlCount > 0
    ? (obj.totalRowsRead !== null ? obj.totalRowsRead.toLocaleString() : '?')
    : '—';

  return /* html */`
    <tr class="da-row">
      <td class="cell-num">${idx}</td>
      <td class="da-cell-name">
        <span class="da-obj-name">${escHtml(obj.name)}</span>
        ${obj.isRelationship ? `<span class="da-flag">↪ related</span>` : ''}
      </td>
      <td class="da-cell-read">${readCell}</td>
      <td class="da-cell-fields">${fieldsCell}</td>
      <td class="da-cell-write">${writeCell}</td>
      <td class="da-cell-rows" style="text-align:right;font-size:11px;opacity:0.75;">${rowsCell}</td>
    </tr>
  `;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

interface ObjectAccess {
  name: string;
  soqlCount: number;
  totalRowsRead: number | null;
  fields: Set<string>;
  dmlOps: Map<string, number>;
  isRelationship: boolean;
}

function buildObjectMap(log: ParsedLog): Map<string, ObjectAccess> {
  const map = new Map<string, ObjectAccess>();

  const get = (name: string): ObjectAccess => {
    const key = name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name, soqlCount: 0, totalRowsRead: null, fields: new Set(), dmlOps: new Map(), isRelationship: false });
    }
    return map.get(key)!;
  };

  for (const stmt of log.soqlStatements) {
    const parsed = parseSoql(stmt.query);
    for (const obj of parsed.objects) {
      const entry = get(obj.name);
      entry.soqlCount++;
      if (obj.isRelationship) entry.isRelationship = true;
      if (stmt.rowsReturned !== null) entry.totalRowsRead = (entry.totalRowsRead ?? 0) + stmt.rowsReturned;
    }
    // Fields — attribute to the primary FROM object
    if (parsed.objects.length > 0 && parsed.fields.length > 0) {
      const primaryKey = parsed.objects[0].name.toLowerCase();
      const entry = map.get(primaryKey);
      if (entry) parsed.fields.forEach(f => entry.fields.add(f));
    }
  }

  for (const stmt of log.dmlStatements) {
    if (!stmt.objectType || stmt.objectType === 'Unknown') continue;
    const entry = get(stmt.objectType);
    entry.dmlOps.set(stmt.operation, (entry.dmlOps.get(stmt.operation) ?? 0) + 1);
  }

  return map;
}

interface ParsedSoql {
  objects: { name: string; isRelationship: boolean }[];
  fields: string[];
}

function parseSoql(query: string): ParsedSoql {
  const objects: { name: string; isRelationship: boolean }[] = [];
  const fields: string[] = [];

  // Primary FROM clause
  const fromMatch = /\bFROM\s+(\w+)/i.exec(query);
  if (fromMatch) {
    objects.push({ name: fromMatch[1], isRelationship: fromMatch[1].endsWith('__r') });
  }

  // SELECT fields (stop at FROM)
  const selectMatch = /\bSELECT\s+([\s\S]+?)\s+FROM\b/i.exec(query);
  if (selectMatch) {
    const fieldList = selectMatch[1];
    // Split by comma, keep simple field names (no sub-selects)
    fieldList.split(',').forEach(raw => {
      const f = raw.trim().split(/\s+/)[0]; // handle aliases
      if (f && !/^\(/.test(f) && f.length < 60) {
        // Normalize: strip relationship prefix (Account.Name → Name for secondary display)
        const parts = f.split('.');
        fields.push(parts[parts.length - 1]);
      }
    });
  }

  return { objects, fields };
}

// ─── Callout endpoint extraction ──────────────────────────────────────────────

interface EndpointEntry {
  url: string;
  methods: Set<string>;
  count: number;
}

function extractEndpoints(log: ParsedLog): EndpointEntry[] {
  const map = new Map<string, EndpointEntry>();

  // Look in allEvents for CALLOUT_REQUEST events
  for (const ev of log.allEvents) {
    if (ev.eventType !== 'CALLOUT_REQUEST') continue;
    // fields[0] = method, fields[1] = URL
    const method = ev.fields[0] ?? 'UNKNOWN';
    const rawUrl = ev.fields[1] ?? '';
    if (!rawUrl) continue;

    // Normalize: strip query strings, keep host + path
    const url = normalizeUrl(rawUrl);
    if (!map.has(url)) {
      map.set(url, { url, methods: new Set(), count: 0 });
    }
    const entry = map.get(url)!;
    entry.methods.add(method.toUpperCase());
    entry.count++;
  }

  // Also check transactions callouts
  for (const tx of log.transactions) {
    for (const ph of tx.phases) {
      for (const co of (ph as { callouts?: { request: { method: string; url: string } }[] }).callouts ?? []) {
        const url = normalizeUrl(co.request.url);
        if (!map.has(url)) map.set(url, { url, methods: new Set(), count: 0 });
        const entry = map.get(url)!;
        entry.methods.add(co.request.method.toUpperCase());
        entry.count++;
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    // Might be a Named Credential reference like callout:MyNamedCred/api/v1
    return raw.split('?')[0].trim();
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
