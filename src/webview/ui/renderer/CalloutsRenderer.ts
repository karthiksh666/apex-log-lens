import type { ParsedLog } from '../../../parser/types';
import { formatDuration } from '../../../utils/TimeUtils';

export function renderCallouts(log: ParsedLog): string {
  const callouts = log.transactions.flatMap(tx => tx.callouts);

  if (callouts.length === 0) {
    return `<div class="empty-state"><p>No HTTP callouts found in this log.</p></div>`;
  }

  const rows = callouts.map((c, i) => {
    const statusClass =
      c.statusCode && c.statusCode >= 500 ? 'row-error' :
      c.statusCode && c.statusCode >= 400 ? 'row-slow' : '';
    const statusIcon =
      c.statusCode && c.statusCode >= 400 ? '🚨' :
      c.statusCode ? '✅' : '⏳';

    return /* html */`
      <tr class="${statusClass}">
        <td class="cell-num">${i + 1}</td>
        <td><span class="method-badge method-${(c.method || 'GET').toLowerCase()}">${c.method || 'GET'}</span></td>
        <td class="cell-url" title="${escAttr(c.url)}">
          <span class="url-text">${escHtml(truncate(c.url, 80))}</span>
          <button class="action-btn-sm" data-copy="${escAttr(c.url)}" title="Copy URL">Copy</button>
        </td>
        <td class="cell-num">${c.statusCode ?? '—'} ${statusIcon}</td>
        <td class="cell-duration">${formatDuration(c.durationMs)}</td>
        <td class="cell-line"><span class="line-link" data-line="${c.requestLineNumber}">L${c.requestLineNumber}</span></td>
      </tr>
    `;
  }).join('');

  return /* html */`
    <div class="callouts-view">
      <div class="table-toolbar">
        <span class="table-count">${callouts.length} callout${callouts.length > 1 ? 's' : ''}</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>Line</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s: string): string {
  return s.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
