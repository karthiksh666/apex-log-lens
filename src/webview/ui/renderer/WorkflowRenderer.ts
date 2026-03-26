import type { ParsedLog } from '../../../parser/types';
import { PhaseType } from '../../../parser/transaction-types';
import { formatDuration } from '../../../utils/TimeUtils';

export function renderWorkflow(log: ParsedLog): string {
  const workflowPhases = log.transactions.flatMap(tx =>
    tx.phases
      .filter(p => p.type === PhaseType.WORKFLOW_RULE)
      .map(p => ({ phase: p, tx }))
  );

  // Also pull workflow-related events from allEvents
  const workflowEvents = log.allEvents.filter(e =>
    e.eventType === 'WF_RULE_EVAL_BEGIN' ||
    e.eventType === 'WF_FIELD_UPDATE' ||
    e.eventType === 'WF_EMAIL_ALERT' ||
    e.eventType === 'WF_ACTION' ||
    e.eventType === 'WF_CRITERIA_BEGIN'
  );

  if (workflowPhases.length === 0 && workflowEvents.length === 0) {
    return `<div class="empty-state"><p>No workflow rule executions found. Make sure your log level includes <strong>Workflow: FINE</strong> or higher.</p></div>`;
  }

  const phaseCards = workflowPhases.map(({ phase, tx }) => /* html */`
    <div class="workflow-card">
      <div class="workflow-header">
        <span>🔄</span>
        <span class="workflow-name">${escHtml(phase.name)}</span>
        <span class="workflow-duration">${formatDuration(phase.durationMs)}</span>
        <span class="line-link" data-line="${phase.startLineNumber}">L${phase.startLineNumber}</span>
      </div>
    </div>
  `).join('');

  const eventRows = workflowEvents.map(e => /* html */`
    <div class="wf-event-row">
      <span class="wf-event-time">${e.wallTime}</span>
      <span class="wf-event-label">${escHtml(e.label)}</span>
      <span class="wf-event-detail">${escHtml(e.description)}</span>
      <span class="line-link" data-line="${e.lineNumber}">L${e.lineNumber}</span>
    </div>
  `).join('');

  return /* html */`
    <div class="workflow-view">
      ${workflowPhases.length > 0 ? `<div class="workflow-phases">${phaseCards}</div>` : ''}
      ${workflowEvents.length > 0 ? /* html */`
        <div class="workflow-events">
          <div class="pd-section-title">Workflow Events (${workflowEvents.length})</div>
          ${eventRows}
        </div>
      ` : ''}
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
