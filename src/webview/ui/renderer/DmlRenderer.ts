import type { ParsedLog, DmlStatement } from '../../../parser/types';
import { formatDuration } from '../../../utils/TimeUtils';

export function renderDml(log: ParsedLog): string {
  if (log.dmlStatements.length === 0) {
    return `<div class="empty-state"><p>No DML operations found in this log.</p></div>`;
  }

  const rows = log.dmlStatements.map((d, i) => renderDmlRow(d, i + 1)).join('');

  return /* html */ `
    <div class="dml-view">
      <div class="table-toolbar">
        <span class="table-count">${log.dmlStatements.length} operation${log.dmlStatements.length === 1 ? '' : 's'}</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Operation</th>
            <th>Object</th>
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

const OP_ICONS: Record<string, string> = {
  Insert: '➕',
  Update: '✏️',
  Delete: '🗑',
  Upsert: '🔀',
  Undelete: '♻️',
  Merge: '🔗',
  Unknown: '❓',
};

function renderDmlRow(d: DmlStatement, index: number): string {
  const icon = OP_ICONS[d.operation] ?? '❓';
  return /* html */ `
    <tr>
      <td class="cell-num">${index}</td>
      <td><span class="op-badge op-${d.operation.toLowerCase()}">${icon} ${d.operation}</span></td>
      <td class="cell-object">${escapeHtml(d.objectType)}</td>
      <td class="cell-rows">${d.rowsAffected ?? '—'}</td>
      <td class="cell-duration">${formatDuration(d.durationMs)}</td>
      <td class="cell-line">
        <span class="line-link" data-line="${d.lineNumber}" title="Jump to line ${d.lineNumber}">L${d.lineNumber}</span>
      </td>
    </tr>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
