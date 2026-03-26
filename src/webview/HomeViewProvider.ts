import * as vscode from 'vscode';
import { OrgSession } from '../salesforce/OrgSession';
import { fetchLogList, fetchLogBody, type OrgLogEntry } from '../salesforce/LogFetcher';
import { SalesforceApiError } from '../salesforce/SalesforceClient';
import { parseLog } from '../parser';
import { LogViewerPanel } from './LogViewerPanel';
import { logger } from '../utils/Logger';
import { ViewIds } from '../constants';

/**
 * Always-visible activity bar sidebar.
 *
 * Shows:
 *  - Funky "APEX LOG LENS" header
 *  - Connect screen (first-time or disconnected)
 *  - Connected: org info + live session log list with auto-refresh
 */
export class HomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = ViewIds.HOME;

  // ── Static reference so ConnectOrgCommand can ping the sidebar ─────────────
  private static _instance: HomeViewProvider | null = null;

  private _view: vscode.WebviewView | null = null;
  private _extensionUri: vscode.Uri;
  private _refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    HomeViewProvider._instance = this;
  }

  // ── Called by ConnectOrgCommand / DisconnectOrgCommand after state change ──
  public static notifyOrgStatus(): void {
    HomeViewProvider._instance?._pushOrgStatus();
    if (OrgSession.isConnected) {
      HomeViewProvider._instance?._fetchAndSendLogs();
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'ready':
          this._pushOrgStatus();
          if (OrgSession.isConnected) {
            await this._fetchAndSendLogs();
            this._startAutoRefresh();
          }
          break;

        case 'connectOrg':
          await vscode.commands.executeCommand('sflog.connectOrg');
          // After the command finishes, push current state
          this._pushOrgStatus();
          if (OrgSession.isConnected) {
            await this._fetchAndSendLogs();
            this._startAutoRefresh();
          }
          break;

        case 'disconnectOrg':
          await vscode.commands.executeCommand('sflog.disconnectOrg');
          this._stopAutoRefresh();
          this._pushOrgStatus();
          break;

        case 'fetchLogs':
        case 'refresh':
          await this._fetchAndSendLogs();
          break;

        case 'openLog': {
          const logId    = msg.logId as string;
          const sizePad  = (msg.sizeBytes as number) ?? 0;
          await this._openLog(logId, sizePad);
          break;
        }
      }
    });

    // Clean up timer when the view is hidden/disposed
    webviewView.onDidDispose(() => {
      this._stopAutoRefresh();
      this._view = null;
    });

    // Resume refresh when view becomes visible again
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && OrgSession.isConnected) {
        this._startAutoRefresh();
      } else {
        this._stopAutoRefresh();
      }
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _pushOrgStatus(): void {
    if (!this._view) return;
    const identity = OrgSession.identity;
    this._view.webview.postMessage({
      type:        'orgStatus',
      connected:   OrgSession.isConnected,
      displayName: identity?.displayName ?? null,
      userName:    identity?.userName    ?? null,
      instanceUrl: identity?.instanceUrl ?? null,
    });
  }

  private async _fetchAndSendLogs(): Promise<void> {
    if (!this._view || !OrgSession.isConnected) return;

    this._view.webview.postMessage({ type: 'logLoading', loading: true });

    try {
      const logs = await fetchLogList(30);
      this._view?.webview.postMessage({ type: 'logList', logs: logs.map(serializeLog) });
    } catch (err) {
      const msg = err instanceof SalesforceApiError ? err.message : 'Failed to fetch logs';
      this._view?.webview.postMessage({ type: 'logError', message: msg });
      logger.error('HomeView: fetch logs failed', err);
    }
  }

  private async _openLog(logId: string, sizeBytes: number): Promise<void> {
    if (!this._view) return;
    this._view.webview.postMessage({ type: 'openingLog', logId });

    try {
      const rawText = await fetchLogBody(logId);
      const config = vscode.workspace.getConfiguration('sflog');
      const includeMethodEntryExit: boolean = config.get('showMethodEntryExit') ?? false;
      const instanceUrl = OrgSession.identity?.instanceUrl ?? 'org';

      const parsedLog = parseLog(
        rawText,
        `org://${instanceUrl}/${logId}`,
        sizeBytes,
        { includeMethodEntryExit }
      );

      LogViewerPanel.open(this._extensionUri, parsedLog);
    } catch (err) {
      const msg = err instanceof SalesforceApiError ? err.message : 'Failed to open log';
      this._view?.webview.postMessage({ type: 'logError', message: msg });
      logger.error('HomeView: open log failed', err);
    }
  }

  private _startAutoRefresh(): void {
    this._stopAutoRefresh();
    // Auto-refresh every 30 s while the view is visible
    this._refreshTimer = setInterval(() => {
      if (this._view?.visible && OrgSession.isConnected) {
        void this._fetchAndSendLogs();
      }
    }, 30_000);
  }

  private _stopAutoRefresh(): void {
    if (this._refreshTimer !== null) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ── HTML shell ─────────────────────────────────────────────────────────────

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'home.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'resources', 'styles', 'home.css')
    );
    const nonce = generateNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy" content="${csp}"/>
  <title>Apex Log Lens</title>
  <link rel="stylesheet" href="${styleUri}"/>
</head>
<body>
  <div id="home-root">
    <div id="home-loading" class="boot-spinner">
      <div class="spinner"></div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let n = '';
  for (let i = 0; i < 32; i++) n += chars.charAt(Math.floor(Math.random() * chars.length));
  return n;
}

/** Strip fields not needed in the sidebar (keep it lean for quick rendering) */
function serializeLog(log: OrgLogEntry): SerializedLog {
  return {
    id:           log.id,
    sizeBytes:    log.sizeBytes,
    lastModified: log.lastModified.toISOString(),
    status:       log.status,
    operation:    log.operation,
    application:  log.application,
    durationMs:   log.durationMs,
    location:     log.location,
  };
}

export interface SerializedLog {
  id:           string;
  sizeBytes:    number;
  lastModified: string;
  status:       string;
  operation:    string;
  application:  string;
  durationMs:   number;
  location:     string;
}
