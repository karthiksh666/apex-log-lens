import type { ParsedLog } from '../../parser/types';
import { renderSummaryHeader } from './components/SummaryHeader';
import { renderTransactions, renderTransactionCard, TX_SCROLL_BATCH } from './renderer/TransactionRenderer';
import { renderIssues }        from './renderer/IssuesRenderer';
import { renderData }          from './renderer/DataRenderer';
import { renderAutomation }    from './renderer/AutomationRenderer';
import { renderCallouts }      from './renderer/CalloutsRenderer';
import { renderDebug }         from './renderer/DebugRenderer';
import { renderLimits }        from './renderer/LimitsRenderer';
import { renderRaw }           from './renderer/RawRenderer';
import { renderOrgContent, type OrgDataPayload } from './renderer/OrgRenderer';

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

let orgConnected   = false;
let orgDisplayName: string | null = null;

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

  // ── Extension → WebView messages ────────────────────────────────────────────
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'orgStatus') {
      orgConnected   = !!msg.connected;
      orgDisplayName = typeof msg.displayName === 'string' ? msg.displayName : null;
      // Patch the org skeleton inside the Limits tab if it's already visible
      const limitsEl = document.getElementById('tab-limits');
      if (limitsEl && !limitsEl.classList.contains('hidden') && limitsEl.innerHTML !== '') {
        const orgSkel = limitsEl.querySelector('#org-view, #org-not-connected');
        if (orgSkel) {
          // Re-render just the limits tab with updated connection state
          limitsEl.innerHTML = renderLimits(log, orgConnected, orgDisplayName);
          if (orgConnected) triggerOrgDataFetch();
        }
      }
    }

    if (msg.type === 'orgData') {
      const loading = document.getElementById('org-loading');
      const content = document.getElementById('org-content');
      if (!loading || !content) return;
      loading.style.display = 'none';
      content.style.display = 'block';
      if (!msg.connected) {
        content.innerHTML = `<div style="opacity:0.5;font-size:12px;padding:8px 0">Not connected to an org.</div>`;
      } else if (typeof msg.error === 'string') {
        content.innerHTML = `<div class="warning-banner warning-critical">⚠ ${escHtml(msg.error as string)}</div>`;
      } else {
        content.innerHTML = renderOrgContent(msg.data as OrgDataPayload);
      }
    }
  });

  renderApp(log);
  vscode.postMessage({ type: 'ready' });
}

function renderApp(log: ParsedLog): void {
  const app = document.getElementById('app')!;

  const phases    = log.transactions.flatMap(t => t.phases);
  const callCount = log.transactions.flatMap(t => t.callouts).length;
  const dbgCount  = [...new Set(
    log.transactions.flatMap(t => t.debugStatements).map(d => `${d.lineNumber}-${d.message}`)
  )].length;
  const hasAutomation = phases.some(p =>
    ['BEFORE_TRIGGER','AFTER_TRIGGER','FLOW','PROCESS_BUILDER','VALIDATION_RULE','WORKFLOW_RULE'].includes(p.type)
  );
  const hasData = log.soqlStatements.length > 0 || log.dmlStatements.length > 0;

  // ── 6 tabs max ──────────────────────────────────────────────────────────────
  const issuesBadge = log.summary.errorCount;
  const tabs = [
    { id: 'flow',       label: '⚡ Execution',  badge: null,        always: true,          error: log.summary.errorCount > 0 },
    { id: 'issues',     label: '🚨 Issues',     badge: issuesBadge, always: true,          error: log.summary.errorCount > 0 },
    { id: 'data',       label: '🗄 Data',       badge: null,        always: hasData,       error: false },
    { id: 'automation', label: '⚙ Automation', badge: null,        always: hasAutomation, error: false },
    { id: 'limits',     label: '📊 Limits',     badge: null,        always: true,          error: log.governorLimits.hasCritical },
    { id: 'callouts',   label: '🌐 Callouts',   badge: callCount,   always: callCount > 0, error: false },
    { id: 'debug',      label: '🐛 Debug',      badge: dbgCount,    always: dbgCount > 0,  error: false },
    { id: 'raw',        label: 'Raw',           badge: null,        always: false,         error: false },
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

  document.getElementById('summary-header')!.innerHTML = renderSummaryHeader(log);

  const renders: Record<string, () => string> = {
    flow:       () => renderTransactions(log),
    issues:     () => renderIssues(log),
    data:       () => renderData(log),
    automation: () => renderAutomation(log),
    limits:     () => renderLimits(log, orgConnected, orgDisplayName),
    callouts:   () => renderCallouts(log),
    debug:      () => renderDebug(log),
    raw:        () => renderRaw(log),
  };

  const rendered = new Set<string>();
  function renderTab(id: string): void {
    if (rendered.has(id)) return;
    rendered.add(id);
    const el = document.getElementById(`tab-${id}`);
    if (el && renders[id]) el.innerHTML = renders[id]();
    if (id === 'limits' && orgConnected) triggerOrgDataFetch();
  }

  renderTab(tabs[0].id);
  setupTxLazyLoad(log);

  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['tab']!;
      renderTab(tab);
      switchTab(tab);
      if (tab === 'limits' && orgConnected) triggerOrgDataFetch();
      // Re-attach lazy loader if the execution tab was just rendered
      if (tab === 'flow') setupTxLazyLoad(log);
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

  // Phase pill expand/collapse — uses pd-open for smooth height transition
  document.addEventListener('click', e => {
    const pill = (e.target as HTMLElement).closest('.phase-pill') as HTMLElement | null;
    if (!pill) return;
    e.stopPropagation();
    const phaseId = pill.dataset['phaseId'];
    if (!phaseId) return;
    const detail = document.getElementById(`phase-detail-${phaseId}`);
    if (detail) {
      const opening = !detail.classList.contains('pd-open');
      detail.classList.toggle('pd-open', opening);
      pill.classList.toggle('active', opening);
    }
  });

  // Transaction card collapse
  document.addEventListener('click', e => {
    const header = (e.target as HTMLElement).closest('.tx-header') as HTMLElement | null;
    if (!header) return;
    const card = header.closest('.tx-card');
    if (card) card.classList.toggle('collapsed');
  });

  // Flow tab search — flush all pending cards first so search covers everything.
  // Uses 'tx-hidden' (not 'hidden') to avoid conflict with tab pane CSS.
  document.addEventListener('input', e => {
    const input = e.target as HTMLElement;
    if (input.id !== 'tx-search') return;
    flushTxCards(log);
    const q = (input as HTMLInputElement).value.toLowerCase().trim();
    document.querySelectorAll<HTMLElement>('.tx-card').forEach(card => {
      const hit = !q || (card.dataset['searchText'] ?? '').toLowerCase().includes(q);
      card.classList.toggle('tx-hidden', !hit);
    });
  });

  // Auto-jump to issues tab if there are errors
  if (log.summary.errorCount > 0) {
    renderTab('issues');
    switchTab('issues');
  }
}

function triggerOrgDataFetch(): void {
  const loading = document.getElementById('org-loading');
  const content = document.getElementById('org-content');
  if (loading) loading.style.display = '';
  if (content) content.style.display = 'none';
  vscode.postMessage({ type: 'fetchOrgData' });
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

// ── Lazy transaction loading ────────────────────────────────────────────────

let _txObserver: IntersectionObserver | null = null;

/**
 * Attaches an IntersectionObserver to the #tx-sentinel element.
 * When the sentinel scrolls into view, the next batch of cards is appended.
 * Safe to call multiple times — disconnects any previous observer first.
 */
function setupTxLazyLoad(log: ParsedLog): void {
  _txObserver?.disconnect();
  _txObserver = null;

  const sentinel = document.getElementById('tx-sentinel') as HTMLElement | null;
  if (!sentinel) return;

  _txObserver = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;

    const next  = parseInt(sentinel.dataset['next'] ?? '20', 10);
    const batch = log.transactions.slice(next, next + TX_SCROLL_BATCH);
    if (batch.length === 0) {
      _txObserver?.disconnect();
      sentinel.remove();
      document.querySelector('.tx-loading-more')?.remove();
      return;
    }

    const list = document.getElementById('tx-list');
    if (!list) return;

    batch.forEach((tx, i) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderTransactionCard(tx, next + i + 1);
      const card = wrap.firstElementChild;
      if (card) list.appendChild(card);
    });

    sentinel.dataset['next'] = String(next + batch.length);

    if (next + batch.length >= log.transactions.length) {
      _txObserver?.disconnect();
      sentinel.remove();
      document.querySelector('.tx-loading-more')?.remove();
    }
  }, { rootMargin: '400px' });

  _txObserver.observe(sentinel);
}

/**
 * Immediately renders all remaining unrendered transaction cards.
 * Called before search so every card is in the DOM before filtering.
 */
function flushTxCards(log: ParsedLog): void {
  const sentinel = document.getElementById('tx-sentinel') as HTMLElement | null;
  if (!sentinel) return;

  _txObserver?.disconnect();
  _txObserver = null;

  const next = parseInt(sentinel.dataset['next'] ?? '20', 10);
  const remaining = log.transactions.slice(next);
  const list = document.getElementById('tx-list');
  if (!list || remaining.length === 0) { sentinel.remove(); document.querySelector('.tx-loading-more')?.remove(); return; }

  const fragment = document.createDocumentFragment();
  remaining.forEach((tx, i) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderTransactionCard(tx, next + i + 1);
    const card = wrap.firstElementChild;
    if (card) fragment.appendChild(card);
  });
  list.appendChild(fragment);

  sentinel.remove();
  document.querySelector('.tx-loading-more')?.remove();
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
