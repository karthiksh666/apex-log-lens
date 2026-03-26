import type { ParsedLog } from '../../../parser/types';
import { formatDuration } from '../../../utils/TimeUtils';

export function renderValidation(log: ParsedLog): string {
  const results = log.transactions.flatMap(tx => tx.validationResults);

  if (results.length === 0) {
    return `<div class="empty-state"><p>No validation rule executions found. Make sure your log level includes <strong>Validation: FINE</strong> or higher.</p></div>`;
  }

  const failed = results.filter(r => !r.passed);
  const passed = results.filter(r => r.passed);

  const banner = failed.length > 0
    ? `<div class="warning-banner warning-critical">🚨 ${failed.length} validation rule${failed.length > 1 ? 's' : ''} failed.</div>`
    : `<div class="info-banner">✅ All ${passed.length} validation rules passed.</div>`;

  const rows = results.map((r, i) => /* html */`
    <tr class="${!r.passed ? 'row-error' : ''}">
      <td class="cell-num">${i + 1}</td>
      <td>${!r.passed ? '❌' : '✅'}</td>
      <td class="cell-name">${escHtml(r.ruleName)}</td>
      <td>${escHtml(r.objectName)}</td>
      <td class="cell-duration">${formatDuration(r.durationMs)}</td>
      <td><span class="line-link" data-line="${r.lineNumber}">L${r.lineNumber}</span></td>
    </tr>
  `).join('');

  return /* html */`
    <div class="validation-view">
      ${banner}
      <table class="data-table">
        <thead>
          <tr><th>#</th><th>Result</th><th>Rule Name</th><th>Object</th><th>Duration</th><th>Line</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
