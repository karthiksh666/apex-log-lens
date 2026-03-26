import type { ParsedLog } from '../../../parser/types';
import type { Transaction, ExecutionPhase, PhaseType } from '../../../parser/transaction-types';
import { phaseTypeClass } from '../../../parser/PhaseClassifier';
import { formatDuration } from '../../../utils/TimeUtils';

/** Number of cards rendered immediately; the rest load on scroll. */
export const TX_INITIAL_BATCH = 20;
export const TX_SCROLL_BATCH  = 20;

/**
 * Execution tab — the primary view.
 *
 * Renders the first TX_INITIAL_BATCH transaction cards immediately.
 * Remaining cards are loaded progressively as the user scrolls via
 * an IntersectionObserver set up in main.ts (no DOM bloat on big logs).
 */
export function renderTransactions(log: ParsedLog): string {
  if (log.transactions.length === 0) {
    return `<div class="empty-state">
      <p style="font-size:32px;margin-bottom:8px">📭</p>
      <p>No transactions detected in this log.</p>
      <p style="font-size:11px;margin-top:4px;opacity:0.6">The log may not contain standard Salesforce execution context markers.</p>
    </div>`;
  }

  const initial  = log.transactions.slice(0, TX_INITIAL_BATCH);
  const hasMore  = log.transactions.length > TX_INITIAL_BATCH;
  const cards    = initial.map((tx, i) => renderTransactionCard(tx, i + 1)).join('');

  return /* html */`
    <div class="transactions-view">
      <div class="tx-toolbar">
        <span class="tx-count">${log.transactions.length} execution${log.transactions.length > 1 ? 's' : ''} in this log</span>
        <input class="search-input" type="text" placeholder="Search..." id="tx-search" />
      </div>
      <div class="tx-list" id="tx-list">
        ${cards}
      </div>
      ${hasMore ? /* html */`
        <div id="tx-sentinel" data-next="${TX_INITIAL_BATCH}" style="height:1px"></div>
        <div class="tx-loading-more">Loading more executions…</div>
      ` : ''}
    </div>
  `;
}

export function renderTransactionCard(tx: Transaction, index: number): string {
  const isError   = tx.hasErrors;
  const isWarning = !tx.hasErrors && tx.hasSlow;

  const statusIcon  = isError ? '🔴' : isWarning ? '🟡' : '🟢';
  const statusLabel = isError ? 'Failed'  : isWarning ? 'Slow'  : 'Healthy';
  const statusClass = isError ? 'tx-error' : isWarning ? 'tx-warning' : 'tx-ok';

  const story      = buildStory(tx);
  // Include every useful field so the user can search by class name,
  // object, operation, flow name, trigger name, etc.
  const searchText = [
    tx.entryPoint, tx.objectName, tx.dmlOperation,
    ...tx.phases.map(p => [p.name, p.objectName, p.operation, p.entryPoint].filter(Boolean).join(' ')),
  ].filter(Boolean).join(' ');

  _nodeSeq = 0;
  const treeNodes  = buildExecutionTree(tx.phases);

  return /* html */`
    <div class="tx-card ${statusClass}" data-search-text="${escAttr(searchText)}" style="--card-i:${index - 1}">

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

      <!-- ── Body: execution tree + detail panels ── -->
      <div class="tx-body">
        ${treeNodes.length > 0 ? /* html */`
          <div class="tx-flow-label">
            Steps run <strong>top-to-bottom in sequence</strong> — a single call can chain Apex, Flows, and more
            <span class="tx-flow-hint-inline">· Click any step to expand</span>
          </div>
          <div class="exec-tree">${treeNodes.map(n => renderTreeNode(n)).join('')}</div>
        ` : ''}

        <!-- Detail panels (hidden until a row is clicked) -->
        ${tx.phases.map(p => renderPhaseDetail(p)).join('')}
        ${tx.errors.length > 0 ? renderTxErrors(tx) : ''}
      </div>
    </div>
  `;
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

interface TreeNode {
  phase: ExecutionPhase;
  connector: string;   // label on the edge from parent → this node
  children: TreeNode[];
}

function buildExecutionTree(phases: ExecutionPhase[]): TreeNode[] {
  const roots: TreeNode[] = [];
  // stack[depth] = last node seen at that depth level
  const stack: Array<TreeNode | undefined> = [];

  for (const phase of phases) {
    const node: TreeNode = {
      phase,
      connector: getConnectorLabel(phase, stack[phase.depth - 1]?.phase ?? null),
      children: [],
    };

    if (phase.depth === 0) {
      roots.push(node);
    } else {
      const parent = stack[phase.depth - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node); // orphaned node — surface at root
      }
    }

    stack[phase.depth] = node;
    stack.length = phase.depth + 1; // discard deeper stale entries
  }

  return roots;
}

/** Infer the human-readable reason this phase fired, given its parent. */
function getConnectorLabel(child: ExecutionPhase, parent: ExecutionPhase | null): string {
  const ct = child.type as string;
  const pt = parent?.type as string | undefined;
  const op = (child.operation ?? parent?.operation ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  if (ct === 'BEFORE_TRIGGER') return `before ${op || 'save'} →`;
  if (ct === 'AFTER_TRIGGER')  return `after ${op || 'save'} →`;

  if (ct === 'VALIDATION_RULE') return 'validate record';

  if (ct === 'WORKFLOW_RULE')   return 'workflow rule evaluates';

  if (ct === 'FLOW') {
    if (pt === 'WORKFLOW_RULE')  return 'field update fires flow';
    if (pt === 'FLOW')           return 'sub-flow called';
    if (pt === 'PROCESS_BUILDER') return 'process calls flow';
    if (pt === 'BEFORE_TRIGGER' || pt === 'AFTER_TRIGGER') return 'record-triggered flow';
    return 'flow triggered';
  }

  if (ct === 'PROCESS_BUILDER') {
    if (pt === 'WORKFLOW_RULE')  return 'workflow launches process';
    return 'process builder evaluates';
  }

  if (ct === 'ASSIGNMENT_RULE') return 'assignment rule runs';
  if (ct === 'AUTO_RESPONSE')   return 'auto-response sends';
  if (ct === 'ESCALATION_RULE') return 'escalation rule checks';

  if (ct === 'APEX_CLASS') {
    if (pt === 'BEFORE_TRIGGER' || pt === 'AFTER_TRIGGER') return 'trigger calls class';
    if (pt === 'FLOW')           return 'flow invokes Apex';
    return 'calls class';
  }

  if (ct === 'CALLOUT') return 'HTTP callout';

  return 'calls';
}

// ─── Tree renderer ────────────────────────────────────────────────────────────

let _nodeSeq = 0; // stagger counter, reset per card render call

function renderTreeNode(node: TreeNode): string {
  const step      = _nodeSeq++;
  const p         = node.phase;
  const cls       = phaseTypeClass(p.type);
  const statusCls = p.status === 'error' ? 'etree-err' : p.status === 'warning' ? 'etree-warn' : '';
  const icon      = getPhaseIcon(p.type);
  const label     = getPhaseLabel(p.type);
  const durCls    = p.status === 'error' ? 'etree-dur-err' : p.isSlow ? 'etree-dur-slow' : '';
  const context   = getPhaseContext(p);

  const row = /* html */`
    <div class="etree-row ${cls} ${statusCls} phase-pill" data-phase-id="${p.id}"
         title="${escAttr(p.entryPoint)}">
      <span class="etree-step">${step + 1}</span>
      <span class="etree-icon">${icon}</span>
      <div class="etree-info">
        <div class="etree-name-row">
          <span class="etree-type-label">${label}</span>
          <span class="etree-name">${escHtml(p.name)}</span>
        </div>
        ${context ? `<span class="etree-context">${escHtml(context)}</span>` : ''}
      </div>
      <div class="etree-badges">
        ${p.soqlCount    > 0 ? `<span class="etree-badge">🔍 ${p.soqlCount}</span>` : ''}
        ${p.dmlCount     > 0 ? `<span class="etree-badge">💾 ${p.dmlCount}</span>` : ''}
        ${p.calloutCount > 0 ? `<span class="etree-badge">🌐 ${p.calloutCount}</span>` : ''}
        ${p.errorCount   > 0 ? `<span class="etree-badge etree-badge-err">⚠ ${p.errorCount}</span>` : ''}
      </div>
      <span class="etree-dur ${durCls}">${formatDuration(p.durationMs)}</span>
      <span class="etree-chevron">▶</span>
    </div>
  `;

  const children = node.children.length > 0
    ? /* html */`
      <div class="etree-children">
        ${node.children.map(child => /* html */`
          <div class="etree-connector">
            <span class="etree-connector-label">${escHtml(child.connector)}</span>
          </div>
          ${renderTreeNode(child)}
        `).join('')}
      </div>
    `
    : '';

  return `<div class="etree-node" style="--node-i:${i}">${row}${children}</div>`;
}

// ─── Phase detail panel ───────────────────────────────────────────────────────

function renderPhaseDetail(phase: ExecutionPhase): string {
  const label = getPhaseLabel(phase.type);
  return /* html */`
    <div class="phase-detail" id="phase-detail-${phase.id}">
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

// ─── Story sentence ───────────────────────────────────────────────────────────

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
  if (flowCount > 0) items.push(`${flowCount} automation${flowCount > 1 ? 's' : ''} ran`);
  if (valCount  > 0) items.push(`${valCount} validation${valCount > 1 ? 's' : ''} checked`);
  if (wfCount   > 0) items.push(`${wfCount} workflow rule${wfCount > 1 ? 's' : ''} evaluated`);

  if (items.length > 0) parts.push(`— ${items.join(', ')}`);

  if (tx.hasErrors)    parts.push('· ❌ Ended with errors');
  else if (tx.hasSlow) parts.push('· ⚠️ Some steps were slow');
  else                 parts.push('· ✅ Completed successfully');

  return parts.join(' ');
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

// ─── Phase context subtitle ───────────────────────────────────────────────────

/**
 * Returns a short context string shown below the phase name.
 * Examples:
 *   BEFORE_TRIGGER on Account · before insert  → "Account · before insert"
 *   APEX_CLASS MyClass.doWork()                → "MyClass.doWork()"  (if entryPoint != name)
 *   FLOW   My_Flow                             → ""  (name is self-explanatory)
 */
function getPhaseContext(p: ExecutionPhase): string {
  const parts: string[] = [];
  if (p.objectName) parts.push(p.objectName);
  if (p.operation)  parts.push(p.operation);
  if (parts.length > 0) return parts.join(' · ');
  // For Apex classes the entryPoint carries the full method signature
  if ((p.type as string) === 'APEX_CLASS' && p.entryPoint && p.entryPoint !== p.name) {
    return p.entryPoint.length > 55 ? p.entryPoint.slice(0, 53) + '…' : p.entryPoint;
  }
  return '';
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
