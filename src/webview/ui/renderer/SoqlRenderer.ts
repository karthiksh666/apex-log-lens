import type { ParsedLog, SoqlStatement } from '../../../parser/types';
import { formatDuration } from '../../../utils/TimeUtils';

export function renderSoql(log: ParsedLog): string {
  if (log.soqlStatements.length === 0) {
    return `<div class="empty-state"><p>No SOQL queries found in this log.</p></div>`;
  }

  const repeated = log.soqlStatements.filter((s) => s.isRepeated);
  const banner = repeated.length > 0
    ? `<div class="warning-banner">⚠ ${repeated.length} repeated SOQL quer${repeated.length === 1 ? 'y' : 'ies'} detected — possible N+1 query problem.</div>`
    : '';

  // Sort by duration descending by default (slowest first)
  const sorted = [...log.soqlStatements].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));

  const rows = sorted.map((s, i) => renderSoqlRow(s, i + 1)).join('');

  return /* html */ `
    <div class="soql-view">
      ${banner}
      <div class="table-toolbar">
        <span class="table-count">${log.soqlStatements.length} quer${log.soqlStatements.length === 1 ? 'y' : 'ies'}</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Query</th>
            <th>Rows</th>
            <th>Duration</th>
            <th>Line</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderSoqlRow(s: SoqlStatement, index: number): string {
  const isSlow = s.durationMs !== null && s.durationMs > 100;
  const classes = [
    s.isRepeated ? 'row-repeated' : '',
    isSlow ? 'row-slow' : '',
  ].filter(Boolean).join(' ');

  const badge = s.isRepeated
    ? `<span class="badge badge-warning" title="This exact query ran more than once — check for N+1 loops">Repeated</span>`
    : '';

  return /* html */ `
    <tr class="${classes}">
      <td class="cell-num">${index}</td>
      <td class="cell-query">
        <code class="query-text" title="${escapeAttr(s.query)}">${escapeHtml(truncate(s.query, 120))}</code>
        ${badge}
        <button class="action-btn-sm" data-copy="${escapeAttr(s.query)}" title="Copy full query">Copy</button>
      </td>
      <td class="cell-rows">${s.rowsReturned ?? '—'}</td>
      <td class="cell-duration ${isSlow ? 'text-warning' : ''}">${formatDuration(s.durationMs)}</td>
      <td class="cell-line">
        <span class="line-link" data-line="${s.lineNumber}" title="Jump to line ${s.lineNumber}">L${s.lineNumber}</span>
      </td>
    </tr>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
