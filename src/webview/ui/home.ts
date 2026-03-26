import type { SerializedLog, LocalFileInfo } from '../HomeViewProvider';

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────
interface OrgStatus {
  connected:   boolean;
  displayName: string | null;
  userName:    string | null;
  instanceUrl: string | null;
}

let _orgStatus: OrgStatus = { connected: false, displayName: null, userName: null, instanceUrl: null };
let _logs: SerializedLog[] = [];
let _localFiles: LocalFileInfo[] = [];
let _loading = false;
let _openingLogId: string | null = null;
let _openingLocalFile: string | null = null;
let _logError: string | null = null;
let _searchQuery = '';

// ── Boot ──────────────────────────────────────────────────────────────────────

function boot(): void {
  const root = document.getElementById('home-root')!;
  root.innerHTML = renderShell();
  attachListeners();

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'orgStatus':
        _orgStatus = {
          connected:   !!msg.connected,
          displayName: (msg.displayName as string) ?? null,
          userName:    (msg.userName    as string) ?? null,
          instanceUrl: (msg.instanceUrl as string) ?? null,
        };
        _logError = null;
        render();
        break;

      case 'logLoading':
        _loading = !!(msg.loading);
        render();
        break;

      case 'logList':
        _loading          = false;
        _logError         = null;
        _openingLogId     = null;
        _openingLocalFile = null;
        _logs             = (msg.logs as SerializedLog[]) ?? [];
        render();
        break;

      case 'logError':
        _loading  = false;
        _logError = (msg.message as string) ?? 'Unknown error';
        render();
        break;

      case 'localFiles':
        _localFiles = (msg.files as LocalFileInfo[]) ?? [];
        render();
        break;

      case 'openingLog':
        _openingLogId = (msg.logId as string) ?? null;
        render();
        break;

      case 'openingLocalFile':
        _openingLocalFile = (msg.filePath as string) ?? null;
        render();
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });
}

// ── Shell (persistent chrome — header + search row) ──────────────────────────

function renderShell(): string {
  return /* html */`
    <header class="home-header">
      <div class="header-lens-wrap">
        <svg class="header-lens-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.6"/>
          <circle cx="10" cy="10" r="2.5" fill="currentColor" opacity="0.5"/>
          <line x1="15.2" y1="15.2" x2="21.5" y2="21.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="header-shine-layer"></span>
      </div>
      <div class="header-text-wrap">
        <span class="header-title">APEX</span>
        <span class="header-title header-title-accent">LOG LENS</span>
      </div>
    </header>
    <div id="home-body"></div>
  `;
}

// ── Render body based on state ────────────────────────────────────────────────

function render(): void {
  const body = document.getElementById('home-body');
  if (!body) return;
  body.innerHTML = _orgStatus.connected ? renderConnected() : renderDisconnected();
}

// ── Disconnected view ─────────────────────────────────────────────────────────

function renderDisconnected(): string {
  return /* html */`
    <div class="connect-screen">
      <div class="connect-icon-wrap">
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="connect-cloud-icon">
          <path d="M36 20.12A12 12 0 1 0 20.49 34H36a8 8 0 0 0 0-16z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
          <line x1="24" y1="38" x2="24" y2="44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line x1="18" y1="44" x2="30" y2="44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="connect-tagline">Connect to a Salesforce org to browse and analyze your Apex debug logs in real time.</p>
      <button class="btn btn-primary" id="btn-connect">
        <span class="btn-icon">⚡</span> Connect to Org
      </button>
      <div class="connect-divider">
        <span>How it works</span>
      </div>
      <ul class="connect-steps">
        <li><span class="step-num">1</span>Connect via SF CLI or Session ID</li>
        <li><span class="step-num">2</span>Your session logs load automatically</li>
        <li><span class="step-num">3</span>Click any log to open it in the viewer</li>
      </ul>
    </div>
    ${renderLocalFilesSection()}
  `;
}

// ── Connected view ────────────────────────────────────────────────────────────

function renderConnected(): string {
  const orgLabel = _orgStatus.displayName ?? _orgStatus.userName ?? 'Connected';
  const domain   = _orgStatus.instanceUrl
    ? new URL(_orgStatus.instanceUrl).hostname.replace('my.salesforce.com', '').replace(/\.$/, '')
    : '';

  const logItems = _logs
    .filter(l => {
      if (!_searchQuery) return true;
      const q = _searchQuery.toLowerCase();
      return (
        l.operation.toLowerCase().includes(q) ||
        l.application.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q)
      );
    })
    .map(renderLogItem)
    .join('');

  const listContent = _loading
    ? `<div class="list-loading"><div class="spinner"></div><span>Fetching logs…</span></div>`
    : _logError
    ? `<div class="list-error">⚠ ${escHtml(_logError)}</div>`
    : _logs.length === 0
    ? `<div class="list-empty"><span class="empty-icon">📋</span><p>No logs yet.<br>Run some Apex in your org,<br>then hit refresh.</p></div>`
    : logItems === ''
    ? `<div class="list-empty"><span class="empty-icon">🔍</span><p>No logs match your search.</p></div>`
    : logItems;

  return /* html */`
    <div class="org-bar">
      <div class="org-info">
        <span class="org-dot"></span>
        <div class="org-text">
          <span class="org-name">${escHtml(orgLabel)}</span>
          ${domain ? `<span class="org-domain">${escHtml(domain)}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="btn-disconnect" title="Disconnect">
        <span>⏻</span>
      </button>
    </div>

    <div class="log-toolbar">
      <input type="text" id="log-search" class="log-search" placeholder="Search logs…" value="${escHtml(_searchQuery)}"/>
      <button class="btn btn-ghost btn-icon-only" id="btn-refresh" title="Refresh logs" ${_loading ? 'disabled' : ''}>
        <span class="${_loading ? 'spin' : ''}">↻</span>
      </button>
    </div>

    <div class="log-list" id="log-list">
      ${listContent}
    </div>

    ${renderLocalFilesSection()}
    <div class="footer-note">Auto-refreshes every 30 s · session only</div>
  `;
}

function renderLogItem(log: SerializedLog): string {
  const isOpening = _openingLogId === log.id;
  const time      = relativeTime(new Date(log.lastModified));
  const size      = formatBytes(log.sizeBytes);
  const opShort   = log.operation.replace(/^Execute\s+/i, '').slice(0, 28);
  const statusDot = log.status === 'Success' ? 'dot-ok' : log.status === 'Skipped' ? 'dot-warn' : 'dot-err';

  return /* html */`
    <div class="log-item ${isOpening ? 'log-item-opening' : ''}" data-log-id="${escHtml(log.id)}" data-size="${log.sizeBytes}" role="button" tabindex="0">
      <span class="log-status-dot ${statusDot}"></span>
      <div class="log-item-body">
        <span class="log-op">${escHtml(opShort || log.application)}</span>
        <span class="log-meta">${escHtml(time)} · ${escHtml(size)} · ${escHtml(log.durationMs.toString())}ms</span>
      </div>
      ${isOpening
        ? `<span class="log-open-spinner"><div class="spinner spinner-sm"></div></span>`
        : `<span class="log-chevron">›</span>`
      }
    </div>
  `;
}

// ── Local files section ───────────────────────────────────────────────────────

function renderLocalFilesSection(): string {
  if (_localFiles.length === 0) return '';

  const filtered = _localFiles.filter(f => {
    if (!_searchQuery) return true;
    return f.name.toLowerCase().includes(_searchQuery.toLowerCase());
  });

  if (filtered.length === 0 && _searchQuery) return '';

  const items = filtered.map(renderLocalFileItem).join('');
  return /* html */`
    <div class="section-header">
      <span class="section-icon">📂</span>
      <span class="section-title">Workspace Files</span>
      <span class="section-badge">${filtered.length}</span>
    </div>
    <div class="log-list local-file-list">
      ${items}
    </div>
  `;
}

function renderLocalFileItem(file: LocalFileInfo): string {
  const isOpening = _openingLocalFile === file.filePath;
  const time      = relativeTime(new Date(file.mtimeMs));
  const size      = formatBytes(file.sizeBytes);

  return /* html */`
    <div class="log-item local-file-item ${isOpening ? 'log-item-opening' : ''}"
         data-file-path="${escHtml(file.filePath)}" role="button" tabindex="0">
      <span class="log-status-dot dot-file"></span>
      <div class="log-item-body">
        <span class="log-op">${escHtml(file.name)}</span>
        <span class="log-meta">${escHtml(time)} · ${escHtml(size)}</span>
      </div>
      ${isOpening
        ? `<span class="log-open-spinner"><div class="spinner spinner-sm"></div></span>`
        : `<span class="log-chevron">›</span>`
      }
    </div>
  `;
}

// ── Event delegation ──────────────────────────────────────────────────────────

function attachListeners(): void {
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;

    if (target.closest('#btn-connect')) {
      vscode.postMessage({ type: 'connectOrg' });
      return;
    }

    if (target.closest('#btn-disconnect')) {
      vscode.postMessage({ type: 'disconnectOrg' });
      return;
    }

    if (target.closest('#btn-refresh')) {
      vscode.postMessage({ type: 'refresh' });
      return;
    }

    const logItem = target.closest<HTMLElement>('.log-item');
    if (logItem?.dataset['logId']) {
      _openingLogId = logItem.dataset['logId'];
      render();
      vscode.postMessage({
        type:      'openLog',
        logId:     logItem.dataset['logId'],
        sizeBytes: parseInt(logItem.dataset['size'] ?? '0', 10),
      });
      return;
    }

    if (logItem?.dataset['filePath']) {
      _openingLocalFile = logItem.dataset['filePath'];
      render();
      vscode.postMessage({ type: 'openLocalFile', filePath: logItem.dataset['filePath'] });
      return;
    }
  });

  document.addEventListener('keydown', e => {
    const logItem = (e.target as HTMLElement).closest<HTMLElement>('.log-item');
    if (logItem && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      logItem.click();
    }
  });

  document.addEventListener('input', e => {
    if ((e.target as HTMLElement).id === 'log-search') {
      _searchQuery = ((e.target as HTMLInputElement).value ?? '').trim();
      render();
    }
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
