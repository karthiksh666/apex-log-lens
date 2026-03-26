import type { ParsedLog } from '../../parser/types';
import { renderSummaryHeader } from './components/SummaryHeader';
import { renderTimeline } from './renderer/TimelineRenderer';
import { renderSoql } from './renderer/SoqlRenderer';
import { renderDml } from './renderer/DmlRenderer';
import { renderErrors } from './renderer/ErrorRenderer';
import { renderLimits } from './renderer/LimitsRenderer';
import { renderRaw } from './renderer/RawRenderer';

/**
 * WebView entry point — runs in the browser (sandboxed iframe) context.
 *
 * The parsed log is seeded via a JSON script tag by HtmlBuilder.ts,
 * so we can render immediately without waiting for a postMessage.
 */

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

// ─── Boot ────────────────────────────────────────────────────────────────────

function boot(): void {
  const dataEl = document.getElementById('sflog-data');
  if (!dataEl) {
    renderError('No log data found. Please re-open the file.');
    return;
  }

  let parsedLog: ParsedLog;
  try {
    parsedLog = JSON.parse(dataEl.textContent ?? '{}') as ParsedLog;
  } catch {
    renderError('Failed to parse log data. Please re-open the file.');
    return;
  }

  renderApp(parsedLog);
  vscode.postMessage({ type: 'ready' });
}

// ─── App render ──────────────────────────────────────────────────────────────

function renderApp(log: ParsedLog): void {
  const app = document.getElementById('app')!;

  app.innerHTML = /* html */ `
    <div class="sflog-app">
      <div id="summary-header"></div>
      <div class="tab-bar" role="tablist">
        <button class="tab-btn active" data-tab="timeline" role="tab" aria-selected="true">
          Timeline
        </button>
        <button class="tab-btn" data-tab="soql" role="tab" aria-selected="false">
          SOQL <span class="badge">${log.soqlStatements.length}</span>
        </button>
        <button class="tab-btn" data-tab="dml" role="tab" aria-selected="false">
          DML <span class="badge">${log.dmlStatements.length}</span>
        </button>
        <button class="tab-btn ${log.errors.length > 0 ? 'has-errors' : ''}" data-tab="errors" role="tab" aria-selected="false">
          Errors ${log.errors.length > 0 ? `<span class="badge badge-error">${log.errors.length}</span>` : '<span class="badge">0</span>'}
        </button>
        <button class="tab-btn" data-tab="limits" role="tab" aria-selected="false">
          Limits
        </button>
        <button class="tab-btn" data-tab="raw" role="tab" aria-selected="false">
          Raw
        </button>
      </div>
      <div class="tab-content">
        <div id="tab-timeline" class="tab-pane active"></div>
        <div id="tab-soql" class="tab-pane hidden"></div>
        <div id="tab-dml" class="tab-pane hidden"></div>
        <div id="tab-errors" class="tab-pane hidden"></div>
        <div id="tab-limits" class="tab-pane hidden"></div>
        <div id="tab-raw" class="tab-pane hidden"></div>
      </div>
    </div>
  `;

  // Render summary header
  document.getElementById('summary-header')!.innerHTML = renderSummaryHeader(log);

  // Render all tab contents upfront (they're hidden via CSS, no re-render on tab switch)
  document.getElementById('tab-timeline')!.innerHTML = renderTimeline(log);
  document.getElementById('tab-soql')!.innerHTML = renderSoql(log);
  document.getElementById('tab-dml')!.innerHTML = renderDml(log);
  document.getElementById('tab-errors')!.innerHTML = renderErrors(log);
  document.getElementById('tab-limits')!.innerHTML = renderLimits(log);
  document.getElementById('tab-raw')!.innerHTML = renderRaw(log);

  // Tab switching
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['tab']!;
      switchTab(tab);
    });
  });

  // Jump-to-line on event rows
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-line]') as HTMLElement | null;
    if (target?.dataset['line']) {
      vscode.postMessage({
        type: 'jumpToLine',
        lineNumber: parseInt(target.dataset['line'], 10),
        filePath: log.filePath,
      });
    }
  });

  // Copy on copy buttons
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-copy]') as HTMLElement | null;
    if (btn?.dataset['copy']) {
      vscode.postMessage({ type: 'copyToClipboard', text: btn.dataset['copy'] });
    }
  });

  // If there are errors, highlight the errors tab
  if (log.errors.length > 0) {
    // Optionally auto-switch to errors tab
    // switchTab('errors');
  }
}

function switchTab(tab: string): void {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const isActive = (btn as HTMLElement).dataset['tab'] === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('hidden', !pane.id.endsWith(tab));
    pane.classList.toggle('active', pane.id.endsWith(tab));
  });
}

function renderError(message: string): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `<div class="error-screen"><p>${message}</p></div>`;
}

// ─── Start ────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
