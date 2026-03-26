import type { ParsedLog } from '../../../parser/types';
import type { Transaction, ExecutionPhase, PhaseType } from '../../../parser/transaction-types';
import { phaseTypeClass } from '../../../parser/PhaseClassifier';
import { formatDuration } from '../../../utils/TimeUtils';

/**
 * Flow tab — the primary view.
 * Shows each Salesforce execution as a visual story card with a step-by-step
 * lifecycle flow. Designed to be readable by anyone, not just Salesforce experts.
 */
export function renderTransactions(log: ParsedLog): string {
  if (log.transactions.length === 0) {
    return `<div class="empty-state">
      <p style="font-size:32px;margin-bottom:8px">📭</p>
      <p>No transactions detected in this log.</p>
      <p style="font-size:11px;margin-top:4px;opacity:0.6">The log may not contain standard Salesforce execution context markers.</p>
    </div>`;
  }

  const cards = log.transactions.map((tx, i) => renderTransactionCard(tx, i + 1)).join('');

  return /* html */`
    <div class="transactions-view">
      <div class="tx-toolbar">
        <span class="tx-count">${log.transactions.length} execution${log.transactions.length > 1 ? 's' : ''} in this log</span>
        <input class="search-input" type="text" placeholder="Search..." id="tx-search" />
      </div>
      <div class="tx-list" id="tx-list">
        ${cards}
      </div>
    </div>
  `;
}

function renderTransactionCard(tx: Transaction, index: number): string {
  const isOk      = !tx.hasErrors && !tx.hasSlow;
  const isWarning = !tx.hasErrors && tx.hasSlow;
  const isError   = tx.hasErrors;

  const statusIcon  = isError ? '🔴' : isWarning ? '🟡' : '🟢';
  const statusLabel = isError ? 'Failed'  : isWarning ? 'Slow'  : 'Healthy';
  const statusClass = isError ? 'tx-error' : isWarning ? 'tx-warning' : 'tx-ok';

  const story = buildStory(tx);
  const searchText = [tx.entryPoint, tx.objectName, ...tx.phases.map(p => p.name)].filter(Boolean).join(' ');

  return /* html */`
    <div class="tx-card ${statusClass}" data-search-text="${escAttr(searchText)}">

      <!-- ── Header (click to collapse) ── -->
      <div class="tx-header">
        <div class="tx-title-row">
          <span class="tx-status-dot">${statusIcon}</span>
          <span class="tx-index">Run #${index}</span>
          <span class="tx-entry-point">${escHtml(tx.entryPoint)}</span>
          ${tx.objectName ? `<span class="tx-object-badge">${escHtml(tx.objectName)}</span>` : ''}
        </div>
        <p class="tx-story">${escHtml(story)}</p>
        <div class="tx-stats-row">
          <span class="tx-chip">⏱ ${formatDuration(tx.durationMs)}</span>
          <span class="tx-chip">🔍 ${tx.soqlCount} quer${tx.soqlCount === 1 ? 'y' : 'ies'}</span>
          <span class="tx-chip">💾 ${tx.dmlCount} write${tx.dmlCount !== 1 ? 's' : ''}</span>
          ${tx.calloutCount  > 0 ? `<span class="tx-chip">🌐 ${tx.calloutCount} callout${tx.calloutCount > 1 ? 's' : ''}</span>` : ''}
          ${tx.errorCount    > 0 ? `<span class="tx-chip tx-chip-error">🚨 ${tx.errorCount} error${tx.errorCount > 1 ? 's' : ''}</span>` : ''}
          <span class="tx-chip tx-chip-status ${statusClass}-chip">${statusLabel}</span>
        </div>
      </div>

      <!-- ── Body ── -->
      <div class="tx-body">

        ${tx.phases.length > 0 ? /* html */`
          <div class="tx-flow-label">Step-by-step execution flow</div>
          ${renderLifecycleFlow(tx)}
          <div class="tx-flow-hint">Click any step to see its details ↑</div>
        ` : ''}

        ${tx.phases.map(p => renderPhaseDetail(p, tx.durationMs ?? 0)).join('')}
        ${tx.errors.length > 0 ? renderTxErrors(tx) : ''}
      </div>
    </div>
  `;
}

// Build a plain-English story sentence for the transaction
function buildStory(tx: Transaction): string {
  const parts: string[] = [];

  if (tx.objectName && tx.dmlOperation) {
    parts.push(`${tx.objectName} was ${tx.dmlOperation.toLowerCase()}d`);
  } else if (tx.entryPoint.toLowerCase().includes('anonymous')) {
    parts.push('Anonymous Apex ran');
  } else {
    parts.push(tx.entryPoint);
  }

  const trigCount = tx.phases.filter(p => p.type === 'BEFORE_TRIGGER' || p.type === 'AFTER_TRIGGER').length;
  const flowCount = tx.phases.filter(p => p.type === 'FLOW' || p.type === 'PROCESS_BUILDER').length;
  const valCount  = tx.phases.filter(p => p.type === 'VALIDATION_RULE').length;
  const wfCount   = tx.phases.filter(p => p.type === 'WORKFLOW_RULE').length;

  const items: string[] = [];
  if (trigCount > 0) items.push(`${trigCount} trigger${trigCount > 1 ? 's' : ''} fired`);
  if (flowCount > 0) items.push(`${flowCount} flow${flowCount > 1 ? 's' : ''} ran`);
  if (valCount  > 0) items.push(`${valCount} validation${valCount > 1 ? 's' : ''} checked`);
  if (wfCount   > 0) items.push(`${wfCount} workflow rule${wfCount > 1 ? 's' : ''} evaluated`);

  if (items.length > 0) parts.push(`— ${items.join(', ')}`);

  if (tx.hasErrors)  parts.push('· ❌ Ended with errors');
  else if (tx.hasSlow) parts.push('· ⚠️ Some steps were slow');
  else parts.push('· ✅ Completed successfully');

  return parts.join(' ');
}

function renderLifecycleFlow(tx: Transaction): string {
  const totalMs = tx.durationMs ?? 1;
  const pills = tx.phases.map((p, i) => {
    const isLast = i === tx.phases.length - 1;
    return renderPhasePill(p, totalMs) + (isLast ? '' : `<span class="flow-arrow">→</span>`);
  }).join('');

  return /* html */`
    <div class="lifecycle-flow">
      <div class="flow-track">${pills}</div>
    </div>
  `;
}

function renderPhasePill(phase: ExecutionPhase, totalMs: number): string {
  const cls       = phaseTypeClass(phase.type);
  const statusCls = phase.status === 'error' ? 'pill-error' : phase.status === 'warning' ? 'pill-warning' : '';
  const icon      = getPhaseIcon(phase.type);
  const label     = getPhaseLabel(phase.type);
  const pct       = totalMs > 0 && phase.durationMs ? Math.round((phase.durationMs / totalMs) * 100) : 0;
  const barColor  = phase.status === 'error' ? 'var(--vscode-errorForeground)' :
                    phase.status === 'warning' ? 'var(--cat-db)' : 'var(--cat-apex)';

  return /* html */`
    <div class="phase-pill ${cls} ${statusCls}" data-phase-id="${phase.id}" title="Click to expand · ${escAttr(phase.entryPoint)}">
      <div class="pill-icon">${icon}</div>
      <div class="pill-body">
        <span class="pill-type-label">${label}</span>
        <span class="pill-label">${escHtml(phase.name.length > 18 ? phase.name.slice(0, 16) + '…' : phase.name)}</span>
        ${phase.operation ? `<span class="pill-op">${escHtml(phase.operation)}</span>` : ''}
      </div>
      <div class="pill-timing-bar-track">
        <div class="pill-timing-bar-fill" style="width:${Math.max(pct, 3)}%;background:${barColor};"></div>
      </div>
      <span class="pill-duration ${phase.isSlow ? 'pill-slow' : ''}">${formatDuration(phase.durationMs)}</span>
      <div class="pill-badges">
        ${phase.soqlCount > 0  ? `<span class="mini-badge" title="${phase.soqlCount} SOQL">Q:${phase.soqlCount}</span>` : ''}
        ${phase.dmlCount  > 0  ? `<span class="mini-badge" title="${phase.dmlCount} DML">W:${phase.dmlCount}</span>` : ''}
        ${phase.errorCount > 0 ? `<span class="mini-badge mini-badge-error" title="${phase.errorCount} error(s)">⚠</span>` : ''}
      </div>
    </div>
  `;
}

function renderPhaseDetail(phase: ExecutionPhase, _totalMs: number): string {
  const label = getPhaseLabel(phase.type);
  return /* html */`
    <div class="phase-detail hidden" id="phase-detail-${phase.id}">
      <div class="pd-header">
        <span class="pd-icon">${getPhaseIcon(phase.type)}</span>
        <div class="pd-title-group">
          <span class="pd-type-label">${label}</span>
          <span class="pd-title">${escHtml(phase.name)}</span>
        </div>
        ${phase.objectName ? `<span class="pd-obj">${escHtml(phase.objectName)}</span>` : ''}
        ${phase.operation  ? `<span class="pd-op">${escHtml(phase.operation)}</span>` : ''}
        <span class="pd-duration ${phase.isSlow ? 'text-warning' : ''}">${formatDuration(phase.durationMs)}</span>
      </div>

      ${phase.soqlStatements.length > 0 ? /* html */`
        <div class="pd-section">
          <div class="pd-section-title">🔍 Queries run (${phase.soqlStatements.length})</div>
          ${phase.soqlStatements.map(s => /* html */`
            <div class="pd-item pd-soql ${s.isRepeated ? 'pd-repeated' : ''}">
              <code>${escHtml(truncate(s.query, 120))}</code>
              <span class="pd-meta">${s.rowsReturned ?? '?'} row${s.rowsReturned !== 1 ? 's' : ''} · ${formatDuration(s.durationMs)}</span>
              ${s.isRepeated ? `<span class="badge badge-warning" title="Same query runs multiple times — N+1 risk">Repeated</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${phase.dmlStatements.length > 0 ? /* html */`
        <div class="pd-section">
          <div class="pd-section-title">💾 Data changes (${phase.dmlStatements.length})</div>
          ${phase.dmlStatements.map(d => /* html */`
            <div class="pd-item">
              <span class="op-badge op-${d.operation.toLowerCase()}">${d.operation}</span>
              <span>${escHtml(d.objectType)}</span>
              <span class="pd-meta">${d.rowsAffected ?? '?'} row${d.rowsAffected !== 1 ? 's' : ''} · ${formatDuration(d.durationMs)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${phase.debugStatements.length > 0 ? /* html */`
        <div class="pd-section">
          <div class="pd-section-title">🐛 System.debug messages (${phase.debugStatements.length})</div>
          ${phase.debugStatements.map(d => /* html */`
            <div class="pd-item pd-debug">
              <span class="debug-level debug-${d.level.toLowerCase()}">${d.level}</span>
              <span class="debug-msg">${escHtml(d.message)}</span>
              <span class="pd-meta">Line ${d.lineNumber}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${phase.errors.length > 0 ? /* html */`
        <div class="pd-section pd-section-error">
          <div class="pd-section-title">🚨 Errors in this step (${phase.errors.length})</div>
          ${phase.errors.map(e => /* html */`
            <div class="pd-item">
              <span>${e.isFatal ? '⛔' : '⚠️'}</span>
              <span class="error-message">${escHtml(e.message)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${phase.soqlStatements.length === 0 && phase.dmlStatements.length === 0 &&
        phase.debugStatements.length === 0 && phase.errors.length === 0 ? /* html */`
        <div style="padding:8px 0;opacity:0.5;font-size:12px">No queries, writes, or debug statements in this step.</div>
      ` : ''}
    </div>
  `;
}

function renderTxErrors(tx: Transaction): string {
  return /* html */`
    <div class="tx-errors">
      <div class="pd-section-title" style="color:var(--vscode-errorForeground);margin-bottom:6px">🚨 Errors in this execution</div>
      ${tx.errors.map(e => /* html */`
        <div class="tx-error-row">
          <span>${e.isFatal ? '⛔' : '⚠️'}</span>
          <span class="error-message">${escHtml(e.message)}</span>
          <span class="line-link" data-line="${e.lineNumber}">Line ${e.lineNumber}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Phase metadata ───────────────────────────────────────────────────────────

function getPhaseIcon(type: PhaseType): string {
  const icons: Record<string, string> = {
    BEFORE_TRIGGER:  '⚡',
    AFTER_TRIGGER:   '⚡',
    VALIDATION_RULE: '✅',
    WORKFLOW_RULE:   '🔄',
    FLOW:            '🌊',
    PROCESS_BUILDER: '⚙️',
    APEX_CLASS:      '🔷',
    ANONYMOUS_APEX:  '🔧',
    CALLOUT:         '🌐',
    ASSIGNMENT_RULE: '📋',
    AUTO_RESPONSE:   '📧',
    ESCALATION_RULE: '📈',
    SYSTEM:          '⚙',
    UNKNOWN:         '❓',
  };
  return icons[type] ?? '❓';
}

// Plain-English labels — no jargon
function getPhaseLabel(type: PhaseType): string {
  const labels: Record<string, string> = {
    BEFORE_TRIGGER:  'Before Save',
    AFTER_TRIGGER:   'After Save',
    VALIDATION_RULE: 'Validation',
    WORKFLOW_RULE:   'Workflow',
    FLOW:            'Flow',
    PROCESS_BUILDER: 'Process',
    APEX_CLASS:      'Apex Class',
    ANONYMOUS_APEX:  'Script',
    CALLOUT:         'API Call',
    ASSIGNMENT_RULE: 'Assignment',
    AUTO_RESPONSE:   'Auto-Response',
    ESCALATION_RULE: 'Escalation',
    SYSTEM:          'System',
    UNKNOWN:         'Unknown',
  };
  return labels[type] ?? type;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
