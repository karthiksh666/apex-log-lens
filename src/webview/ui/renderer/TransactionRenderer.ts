import type { ParsedLog } from '../../../parser/types';
import type { Transaction, ExecutionPhase } from '../../../parser/transaction-types';
import { phaseTypeClass } from '../../../parser/PhaseClassifier';
import { formatDuration } from '../../../utils/TimeUtils';

/**
 * Transactions tab — the primary view.
 * Shows each Salesforce execution context as a visual lifecycle card.
 */
export function renderTransactions(log: ParsedLog): string {
  if (log.transactions.length === 0) {
    return `<div class="empty-state"><p>No transactions detected. The log may not contain standard Salesforce execution context markers.</p></div>`;
  }

  const cards = log.transactions.map((tx, i) => renderTransactionCard(tx, i + 1)).join('');

  return /* html */`
    <div class="transactions-view">
      <div class="tx-toolbar">
        <span class="tx-count">${log.transactions.length} transaction${log.transactions.length > 1 ? 's' : ''}</span>
        <input class="search-input" type="text" placeholder="Search transactions..." id="tx-search" />
      </div>
      <div class="tx-list" id="tx-list">
        ${cards}
      </div>
    </div>
    <script>
    (function() {
      // Search
      var search = document.getElementById('tx-search');
      if (search) {
        search.addEventListener('input', function() {
          var q = search.value.toLowerCase();
          document.querySelectorAll('.tx-card').forEach(function(card) {
            var text = (card.dataset.searchText || '').toLowerCase();
            card.classList.toggle('hidden', !!q && !text.includes(q));
          });
        });
      }

      // Expand/collapse phase detail
      document.querySelectorAll('.phase-pill').forEach(function(pill) {
        pill.addEventListener('click', function(e) {
          e.stopPropagation();
          var detail = document.getElementById('phase-detail-' + pill.dataset.phaseId);
          if (detail) {
            detail.classList.toggle('hidden');
            pill.classList.toggle('active');
          }
        });
      });

      // Expand/collapse full transaction
      document.querySelectorAll('.tx-header').forEach(function(header) {
        header.addEventListener('click', function() {
          var card = header.closest('.tx-card');
          if (card) card.classList.toggle('collapsed');
        });
      });
    })();
    </script>
  `;
}

function renderTransactionCard(tx: Transaction, index: number): string {
  const statusClass = tx.hasErrors ? 'tx-error' : tx.hasSlow ? 'tx-warning' : 'tx-ok';
  const statusIcon = tx.hasErrors ? '🚨' : tx.hasSlow ? '⚠️' : '✅';

  const searchText = [tx.entryPoint, tx.objectName, tx.dmlOperation, ...tx.phases.map(p => p.name)].filter(Boolean).join(' ');

  return /* html */`
    <div class="tx-card ${statusClass}" data-search-text="${escAttr(searchText)}">
      <div class="tx-header">
        <div class="tx-title-row">
          <span class="tx-index">#${index}</span>
          <span class="tx-status-icon">${statusIcon}</span>
          <span class="tx-entry-point">${escHtml(tx.entryPoint)}</span>
          ${tx.objectName ? `<span class="tx-object-badge">${escHtml(tx.objectName)}</span>` : ''}
          ${tx.dmlOperation ? `<span class="tx-dml-badge op-${tx.dmlOperation.toLowerCase()}">${tx.dmlOperation}</span>` : ''}
        </div>
        <div class="tx-meta-row">
          <span class="tx-time">${tx.wallTime}</span>
          <span class="tx-stat">⏱ ${formatDuration(tx.durationMs)}</span>
          <span class="tx-stat">🔍 ${tx.soqlCount} SOQL</span>
          <span class="tx-stat">💾 ${tx.dmlCount} DML</span>
          ${tx.calloutCount > 0 ? `<span class="tx-stat">🌐 ${tx.calloutCount} Callout${tx.calloutCount > 1 ? 's' : ''}</span>` : ''}
          ${tx.errorCount > 0 ? `<span class="tx-stat tx-stat-error">🚨 ${tx.errorCount} Error${tx.errorCount > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>

      <div class="tx-body">
        ${renderLifecycleFlow(tx)}
        ${tx.phases.map(p => renderPhaseDetail(p)).join('')}
        ${tx.errors.length > 0 ? renderTxErrors(tx) : ''}
      </div>
    </div>
  `;
}

function renderLifecycleFlow(tx: Transaction): string {
  if (tx.phases.length === 0) return '';

  const pills = tx.phases.map(p => renderPhasePill(p)).join(renderArrow());

  return /* html */`
    <div class="lifecycle-flow">
      <div class="flow-track">
        ${pills}
      </div>
    </div>
  `;
}

function renderArrow(): string {
  return `<span class="flow-arrow">→</span>`;
}

function renderPhasePill(phase: ExecutionPhase): string {
  const cls = phaseTypeClass(phase.type);
  const statusCls = phase.status === 'error' ? 'pill-error' : phase.status === 'warning' ? 'pill-warning' : '';
  const icon = getPhaseIcon(phase.type);

  return /* html */`
    <div class="phase-pill ${cls} ${statusCls}" data-phase-id="${phase.id}" title="${escAttr(phase.entryPoint)}">
      <span class="pill-icon">${icon}</span>
      <div class="pill-body">
        <span class="pill-label">${escHtml(phase.name.length > 20 ? phase.name.slice(0, 18) + '…' : phase.name)}</span>
        ${phase.operation ? `<span class="pill-op">${escHtml(phase.operation)}</span>` : ''}
        <span class="pill-duration ${phase.isSlow ? 'pill-slow' : ''}">${formatDuration(phase.durationMs)}</span>
      </div>
      <div class="pill-badges">
        ${phase.soqlCount > 0 ? `<span class="mini-badge">S:${phase.soqlCount}</span>` : ''}
        ${phase.dmlCount > 0 ? `<span class="mini-badge">D:${phase.dmlCount}</span>` : ''}
        ${phase.errorCount > 0 ? `<span class="mini-badge mini-badge-error">E:${phase.errorCount}</span>` : ''}
      </div>
    </div>
  `;
}

function renderPhaseDetail(phase: ExecutionPhase): string {
  return /* html */`
    <div class="phase-detail hidden" id="phase-detail-${phase.id}">
      <div class="pd-header">
        <span class="pd-title">${escHtml(phase.name)}</span>
        <span class="pd-type-badge ${phaseTypeClass(phase.type)}">${phase.type.replace(/_/g, ' ')}</span>
        ${phase.objectName ? `<span class="pd-obj">${escHtml(phase.objectName)}</span>` : ''}
        ${phase.operation ? `<span class="pd-op">${escHtml(phase.operation)}</span>` : ''}
        <span class="pd-duration">${formatDuration(phase.durationMs)}</span>
      </div>

      ${phase.soqlStatements.length > 0 ? /* html */`
        <div class="pd-section">
          <div class="pd-section-title">SOQL (${phase.soqlStatements.length})</div>
          ${phase.soqlStatements.map(s => /* html */`
            <div class="pd-item pd-soql ${s.isRepeated ? 'pd-repeated' : ''}">
              <code>${escHtml(truncate(s.query, 120))}</code>
              <span class="pd-meta">${s.rowsReturned ?? '?'} rows · ${formatDuration(s.durationMs)}</span>
              ${s.isRepeated ? `<span class="badge badge-warning">Repeated</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${phase.dmlStatements.length > 0 ? /* html */`
        <div class="pd-section">
          <div class="pd-section-title">DML (${phase.dmlStatements.length})</div>
          ${phase.dmlStatements.map(d => /* html */`
            <div class="pd-item">
              <span class="op-badge op-${d.operation.toLowerCase()}">${d.operation}</span>
              <span>${escHtml(d.objectType)}</span>
              <span class="pd-meta">${d.rowsAffected ?? '?'} rows · ${formatDuration(d.durationMs)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${phase.debugStatements.length > 0 ? /* html */`
        <div class="pd-section">
          <div class="pd-section-title">Debug (${phase.debugStatements.length})</div>
          ${phase.debugStatements.map(d => /* html */`
            <div class="pd-item pd-debug">
              <span class="debug-level debug-${d.level.toLowerCase()}">${d.level}</span>
              <span class="debug-msg">${escHtml(d.message)}</span>
              <span class="pd-meta">L${d.lineNumber}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${phase.errors.length > 0 ? /* html */`
        <div class="pd-section pd-section-error">
          <div class="pd-section-title">Errors (${phase.errors.length})</div>
          ${phase.errors.map(e => /* html */`
            <div class="pd-item">
              <span class="error-icon">${e.isFatal ? '⛔' : '⚠️'}</span>
              <span class="error-message">${escHtml(e.message)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderTxErrors(tx: Transaction): string {
  return /* html */`
    <div class="tx-errors">
      ${tx.errors.map(e => /* html */`
        <div class="tx-error-row">
          <span>${e.isFatal ? '⛔' : '⚠️'}</span>
          <span class="error-message">${escHtml(e.message)}</span>
          <span class="line-link" data-line="${e.lineNumber}">L${e.lineNumber}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function getPhaseIcon(type: import('../../../parser/transaction-types').PhaseType): string {
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

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s: string): string {
  return s.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
