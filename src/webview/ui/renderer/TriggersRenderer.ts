import type { ParsedLog } from '../../../parser/types';
import { PhaseType } from '../../../parser/transaction-types';
import { formatDuration } from '../../../utils/TimeUtils';

export function renderTriggers(log: ParsedLog): string {
  const triggerPhases = log.transactions.flatMap(tx =>
    tx.phases.filter(p =>
      p.type === PhaseType.BEFORE_TRIGGER || p.type === PhaseType.AFTER_TRIGGER
    ).map(p => ({ phase: p, tx }))
  );

  if (triggerPhases.length === 0) {
    return `<div class="empty-state"><p>No trigger executions found in this log.</p></div>`;
  }

  // Group by object
  const byObject = new Map<string, typeof triggerPhases>();
  for (const entry of triggerPhases) {
    const obj = entry.phase.objectName ?? 'Unknown';
    if (!byObject.has(obj)) byObject.set(obj, []);
    byObject.get(obj)!.push(entry);
  }

  const groups = Array.from(byObject.entries()).map(([obj, entries]) => {
    const rows = entries.map(({ phase, tx }) => /* html */`
      <tr class="${phase.status === 'error' ? 'row-error' : phase.isSlow ? 'row-slow' : ''}">
        <td>
          <span class="trigger-type-badge ${phase.type === PhaseType.BEFORE_TRIGGER ? 'badge-before' : 'badge-after'}">
            ${phase.type === PhaseType.BEFORE_TRIGGER ? 'Before' : 'After'}
          </span>
        </td>
        <td class="cell-name">${escHtml(phase.name)}</td>
        <td>${escHtml(phase.operation ?? '—')}</td>
        <td class="cell-num">${phase.soqlCount}</td>
        <td class="cell-num">${phase.dmlCount}</td>
        <td class="cell-duration ${phase.isSlow ? 'text-warning' : ''}">${formatDuration(phase.durationMs)}</td>
        <td>${phase.status === 'error' ? '🚨' : phase.isSlow ? '⚠️' : '✅'}</td>
        <td><span class="line-link" data-line="${phase.startLineNumber}">L${phase.startLineNumber}</span></td>
      </tr>
      ${phase.debugStatements.length > 0 ? /* html */`
        <tr class="debug-sub-row">
          <td colspan="8">
            <div class="sub-debug">
              ${phase.debugStatements.map(d => /* html */`
                <span class="debug-level debug-${d.level.toLowerCase()}">${d.level}</span>
                <span class="debug-msg">${escHtml(d.message)}</span>
              `).join('<br/>')}
            </div>
          </td>
        </tr>
      ` : ''}
    `).join('');

    return /* html */`
      <div class="trigger-group">
        <div class="trigger-group-header">
          <span class="trigger-obj-icon">📦</span>
          <span class="trigger-obj-name">${escHtml(obj)}</span>
          <span class="trigger-count">${entries.length} trigger${entries.length > 1 ? 's' : ''}</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Type</th><th>Trigger Name</th><th>Operation</th>
              <th>SOQL</th><th>DML</th><th>Duration</th><th>Status</th><th>Line</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  return /* html */`
    <div class="triggers-view">
      <div class="table-toolbar">
        <span class="table-count">${triggerPhases.length} trigger execution${triggerPhases.length > 1 ? 's' : ''} across ${byObject.size} object${byObject.size > 1 ? 's' : ''}</span>
      </div>
      ${groups}
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
