import type { ParsedLog } from '../../../parser/types';
import { PhaseType } from '../../../parser/transaction-types';
import { formatDuration } from '../../../utils/TimeUtils';

export function renderFlows(log: ParsedLog): string {
  const flowPhases = log.transactions.flatMap(tx =>
    tx.phases
      .filter(p => p.type === PhaseType.FLOW || p.type === PhaseType.PROCESS_BUILDER)
      .map(p => ({ phase: p, tx }))
  );

  if (flowPhases.length === 0) {
    return `<div class="empty-state"><p>No Flow or Process Builder executions found in this log.</p></div>`;
  }

  const cards = flowPhases.map(({ phase, tx }) => /* html */`
    <div class="flow-card ${phase.status === 'error' ? 'flow-card-error' : phase.isSlow ? 'flow-card-warning' : ''}">
      <div class="flow-card-header">
        <span class="flow-type-icon">${phase.type === PhaseType.FLOW ? '🌊' : '⚙️'}</span>
        <span class="flow-name">${escHtml(phase.name)}</span>
        <span class="flow-type-label">${phase.type === PhaseType.FLOW ? 'Flow' : 'Process Builder'}</span>
        <span class="flow-duration ${phase.isSlow ? 'text-warning' : ''}">${formatDuration(phase.durationMs)}</span>
        ${phase.status === 'error' ? '<span class="flow-status">🚨</span>' : phase.isSlow ? '<span class="flow-status">⚠️</span>' : '<span class="flow-status">✅</span>'}
      </div>
      <div class="flow-card-meta">
        <span>Transaction: ${escHtml(tx.entryPoint)}</span>
        <span class="line-link" data-line="${phase.startLineNumber}">L${phase.startLineNumber}</span>
      </div>
      ${phase.soqlStatements.length > 0 || phase.dmlStatements.length > 0 ? /* html */`
        <div class="flow-stats-row">
          ${phase.soqlStatements.length > 0 ? `<span class="flow-stat">🔍 ${phase.soqlStatements.length} SOQL</span>` : ''}
          ${phase.dmlStatements.length > 0 ? `<span class="flow-stat">💾 ${phase.dmlStatements.length} DML</span>` : ''}
          ${phase.calloutCount > 0 ? `<span class="flow-stat">🌐 ${phase.calloutCount} Callout</span>` : ''}
        </div>
      ` : ''}
      ${phase.debugStatements.length > 0 ? /* html */`
        <div class="flow-debug">
          <div class="pd-section-title">Debug Output</div>
          ${phase.debugStatements.map(d => /* html */`
            <div class="pd-item pd-debug">
              <span class="debug-level debug-${d.level.toLowerCase()}">${d.level}</span>
              <span class="debug-msg">${escHtml(d.message)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${phase.errors.length > 0 ? /* html */`
        <div class="flow-errors">
          ${phase.errors.map(e => `<div class="tx-error-row"><span>${e.isFatal ? '⛔' : '⚠️'}</span><span class="error-message">${escHtml(e.message)}</span></div>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');

  return /* html */`
    <div class="flows-view">
      <div class="table-toolbar">
        <span class="table-count">${flowPhases.length} execution${flowPhases.length > 1 ? 's' : ''}</span>
      </div>
      ${cards}
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
