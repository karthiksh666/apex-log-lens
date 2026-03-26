import type { ParsedLog } from '../../parser/types';
import { renderSummaryHeader } from './components/SummaryHeader';
import { renderTransactions } from './renderer/TransactionRenderer';
import { renderTriggers } from './renderer/TriggersRenderer';
import { renderFlows } from './renderer/FlowsRenderer';
import { renderCallouts } from './renderer/CalloutsRenderer';
import { renderValidation } from './renderer/ValidationRenderer';
import { renderWorkflow } from './renderer/WorkflowRenderer';
import { renderDebug } from './renderer/DebugRenderer';
import { renderTimeline } from './renderer/TimelineRenderer';
import { renderSoql } from './renderer/SoqlRenderer';
import { renderDml } from './renderer/DmlRenderer';
import { renderErrors } from './renderer/ErrorRenderer';
import { renderLimits } from './renderer/LimitsRenderer';
import { renderRaw } from './renderer/RawRenderer';

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

function boot(): void {
  const dataEl = document.getElementById('sflog-data');
  if (!dataEl) { renderFatalError('No log data found.'); return; }

  let parsedLog: ParsedLog;
  try {
    parsedLog = JSON.parse(dataEl.textContent ?? '{}') as ParsedLog;
  } catch {
    renderFatalError('Failed to parse log data.');
    return;
  }

  renderApp(parsedLog);
  vscode.postMessage({ type: 'ready' });
}

function renderApp(log: ParsedLog): void {
  const app = document.getElementById('app')!;

  const txCount   = log.transactions.length;
  const trigCount = log.transactions.flatMap(t => t.phases).filter(p => p.type === 'BEFORE_TRIGGER' || p.type === 'AFTER_TRIGGER').length;
  const flowCount = log.transactions.flatMap(t => t.phases).filter(p => p.type === 'FLOW' || p.type === 'PROCESS_BUILDER').length;
  const callCount = log.transactions.flatMap(t => t.callouts).length;
  const valCount  = log.transactions.flatMap(t => t.validationResults).length;
  const wfCount   = log.transactions.flatMap(t => t.phases).filter(p => p.type === 'WORKFLOW_RULE').length;
  const dbgCount  = [...new Set(log.transactions.flatMap(t => t.debugStatements).map(d => `${d.lineNumber}-${d.message}`))].length;

  const tabs = [
    { id: 'transactions', label: 'Transactions',  badge: txCount,                      errorBadge: log.summary.errorCount > 0 },
    { id: 'triggers',     label: 'Triggers',       badge: trigCount,                    errorBadge: false },
    { id: 'flows',        label: 'Flows',           badge: flowCount,                   errorBadge: false },
    { id: 'callouts',     label: 'Callouts',        badge: callCount,                   errorBadge: false },
    { id: 'validation',   label: 'Validation',      badge: valCount,                    errorBadge: false },
    { id: 'workflow',     label: 'Workflow',         badge: wfCount,                    errorBadge: false },
    { id: 'debug',        label: 'Debug',            badge: dbgCount,                   errorBadge: false },
    { id: 'timeline',     label: 'Timeline',         badge: log.summary.totalEvents,    errorBadge: false },
    { id: 'soql',         label: 'SOQL',             badge: log.summary.soqlCount,      errorBadge: false },
    { id: 'dml',          label: 'DML',              badge: log.summary.dmlCount,       errorBadge: false },
    { id: 'errors',       label: 'Errors',           badge: log.summary.errorCount,     errorBadge: log.summary.errorCount > 0 },
    { id: 'limits',       label: 'Limits',           badge: null,                       errorBadge: log.governorLimits.hasCritical },
    { id: 'raw',          label: 'Raw',              badge: null,                       errorBadge: false },
  ];

  const tabBtns = tabs.map((t, i) => /* html */`
    <button class="tab-btn ${i === 0 ? 'active' : ''} ${t.errorBadge ? 'has-errors' : ''}"
            data-tab="${t.id}" role="tab" aria-selected="${i === 0}">
      ${t.label}
      ${t.badge !== null ? `<span class="badge ${t.errorBadge ? 'badge-error' : ''}">${t.badge}</span>` : ''}
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

  document.getElementById('summary-header')!.innerHTML = renderSummaryHeader(log);

  // Render all tabs
  document.getElementById('tab-transactions')!.innerHTML = renderTransactions(log);
  document.getElementById('tab-triggers')!.innerHTML     = renderTriggers(log);
  document.getElementById('tab-flows')!.innerHTML        = renderFlows(log);
  document.getElementById('tab-callouts')!.innerHTML     = renderCallouts(log);
  document.getElementById('tab-validation')!.innerHTML   = renderValidation(log);
  document.getElementById('tab-workflow')!.innerHTML     = renderWorkflow(log);
  document.getElementById('tab-debug')!.innerHTML        = renderDebug(log);
  document.getElementById('tab-timeline')!.innerHTML     = renderTimeline(log);
  document.getElementById('tab-soql')!.innerHTML         = renderSoql(log);
  document.getElementById('tab-dml')!.innerHTML          = renderDml(log);
  document.getElementById('tab-errors')!.innerHTML       = renderErrors(log);
  document.getElementById('tab-limits')!.innerHTML       = renderLimits(log);
  document.getElementById('tab-raw')!.innerHTML          = renderRaw(log);

  // Tab switching
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset['tab']!));
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
