import type { ParsedLog } from '../../parser/types';
import { renderSummaryHeader } from './components/SummaryHeader';
import { renderTransactions } from './renderer/TransactionRenderer';
import { renderTriggers } from './renderer/TriggersRenderer';
import { renderFlows } from './renderer/FlowsRenderer';
import { renderCallouts } from './renderer/CalloutsRenderer';
import { renderValidation } from './renderer/ValidationRenderer';
import { renderWorkflow } from './renderer/WorkflowRenderer';
import { renderDebug } from './renderer/DebugRenderer';
import { renderSoql } from './renderer/SoqlRenderer';
import { renderDml } from './renderer/DmlRenderer';
import { renderErrors } from './renderer/ErrorRenderer';
import { renderLimits } from './renderer/LimitsRenderer';
import { renderRaw } from './renderer/RawRenderer';
import { renderDataAccess } from './renderer/DataAccessRenderer';

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

function boot(): void {
  const dataEl = document.getElementById('sflog-data');
  if (!dataEl) { renderFatalError('No log data found.'); return; }

  let log: ParsedLog;
  try {
    log = JSON.parse(dataEl.textContent ?? '{}') as ParsedLog;
  } catch {
    renderFatalError('Failed to parse log data.');
    return;
  }

  renderApp(log);
  vscode.postMessage({ type: 'ready' });
}

function renderApp(log: ParsedLog): void {
  const app = document.getElementById('app')!;

  // ── Smart tab visibility — only show tabs with data ──────────────────────
  const trigCount  = log.transactions.flatMap(t => t.phases).filter(p => p.type === 'BEFORE_TRIGGER' || p.type === 'AFTER_TRIGGER').length;
  const flowCount  = log.transactions.flatMap(t => t.phases).filter(p => p.type === 'FLOW' || p.type === 'PROCESS_BUILDER').length;
  const callCount  = log.transactions.flatMap(t => t.callouts).length;
  const valCount   = log.transactions.flatMap(t => t.validationResults).length;
  const wfCount    = log.transactions.flatMap(t => t.phases).filter(p => p.type === 'WORKFLOW_RULE').length;
  const dbgCount   = [...new Set(log.transactions.flatMap(t => t.debugStatements).map(d => `${d.lineNumber}-${d.message}`))].length;

  // Primary tabs always shown + secondary tabs only if they have data
  const objCount = log.soqlStatements.length + log.dmlStatements.length;
  const tabs = [
    { id: 'flow',       label: '⚡ Flow',        badge: null,                    always: true,             error: log.summary.errorCount > 0 },
    { id: 'errors',     label: '🚨 Errors',      badge: log.summary.errorCount,  always: true,             error: log.summary.errorCount > 0 },
    { id: 'objects',    label: '🗂 Objects',     badge: null,                    always: objCount > 0,     error: false },
    { id: 'soql',       label: '🔍 SOQL',        badge: log.summary.soqlCount,   always: log.summary.soqlCount > 0,  error: false },
    { id: 'dml',        label: '💾 DML',         badge: log.summary.dmlCount,    always: log.summary.dmlCount > 0,   error: false },
    { id: 'debug',      label: '🐛 Debug',       badge: dbgCount,                always: dbgCount > 0,     error: false },
    { id: 'triggers',   label: '⚡ Triggers',    badge: trigCount,               always: trigCount > 0,    error: false },
    { id: 'flows',      label: '🌊 Flows',       badge: flowCount,               always: flowCount > 0,    error: false },
    { id: 'callouts',   label: '🌐 Callouts',    badge: callCount,               always: callCount > 0,    error: false },
    { id: 'validation', label: '✅ Validation',  badge: valCount,                always: valCount > 0,     error: false },
    { id: 'workflow',   label: '🔄 Workflow',    badge: wfCount,                 always: wfCount > 0,      error: false },
    { id: 'limits',     label: '📊 Limits',      badge: null,                    always: true,             error: log.governorLimits.hasCritical },
    { id: 'raw',        label: 'Raw',            badge: null,                    always: false,            error: false },
  ].filter(t => t.always);

  const tabBtns = tabs.map((t, i) => /* html */`
    <button class="tab-btn ${i === 0 ? 'active' : ''} ${t.error ? 'tab-has-errors' : ''}"
            data-tab="${t.id}" role="tab" aria-selected="${i === 0}">
      ${t.label}${t.badge ? ` <span class="tab-badge ${t.error ? 'tab-badge-error' : ''}">${t.badge}</span>` : ''}
    </button>
  `).join('');

  const tabPanes = tabs.map((t, i) => /* html */`
    <div id="tab-${t.id}" class="tab-pane ${i === 0 ? 'active' : 'hidden'}"></div>
  `).join('');

  app.innerHTML = /* html */`
    <div class="sflog-app">
      <div id="summary-header"></div>
      <div class="tab-bar" role="tablist">${tabBtns}</div>
      <div class="tab-content">${tabPanes}</div>
    </div>
  `;

  // Render
  document.getElementById('summary-header')!.innerHTML = renderSummaryHeader(log);

  const renders: Record<string, () => string> = {
    flow:       () => renderTransactions(log),
    errors:     () => renderErrors(log),
    objects:    () => renderDataAccess(log),
    soql:       () => renderSoql(log),
    dml:        () => renderDml(log),
    debug:      () => renderDebug(log),
    triggers:   () => renderTriggers(log),
    flows:      () => renderFlows(log),
    callouts:   () => renderCallouts(log),
    validation: () => renderValidation(log),
    workflow:   () => renderWorkflow(log),
    limits:     () => renderLimits(log),
    raw:        () => renderRaw(log),
  };

  // Render only the first tab immediately; lazy-render others on first click
  const rendered = new Set<string>();
  function renderTab(id: string): void {
    if (rendered.has(id)) return;
    rendered.add(id);
    const el = document.getElementById(`tab-${id}`);
    if (el && renders[id]) el.innerHTML = renders[id]();
  }

  // Render first tab immediately
  renderTab(tabs[0].id);

  // Tab switching with lazy render
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['tab']!;
      renderTab(tab);
      switchTab(tab);
    });
  });

  // Jump-to-line
  document.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest('[data-line]') as HTMLElement | null;
    if (target?.dataset['line']) {
      vscode.postMessage({ type: 'jumpToLine', lineNumber: parseInt(target.dataset['line']!, 10), filePath: log.filePath });
    }
  });

  // Copy
  document.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('[data-copy]') as HTMLElement | null;
    if (btn?.dataset['copy']) {
      vscode.postMessage({ type: 'copyToClipboard', text: btn.dataset['copy'] });
    }
  });

  // Auto-jump to errors tab if there are errors
  if (log.summary.errorCount > 0) {
    const errTab = tabs.find(t => t.id === 'errors');
    if (errTab) {
      renderTab('errors');
      switchTab('errors');
    }
  }
}

function switchTab(tab: string): void {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = (btn as HTMLElement).dataset['tab'] === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    const active = pane.id === `tab-${tab}`;
    pane.classList.toggle('hidden', !active);
    pane.classList.toggle('active', active);
  });
}

function renderFatalError(msg: string): void {
  document.getElementById('app')!.innerHTML = `<div class="error-screen"><p>${msg}</p></div>`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
