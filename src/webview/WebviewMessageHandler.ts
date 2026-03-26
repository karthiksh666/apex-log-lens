import * as vscode from 'vscode';
import { logger } from '../utils/Logger';
import { OrgSession } from '../salesforce/OrgSession';
import { fetchOrgData } from '../salesforce/LogFetcher';
import { SalesforceApiError } from '../salesforce/SalesforceClient';

/** Messages the WebView can send to the extension host */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'jumpToLine'; lineNumber: number; filePath: string }
  | { type: 'fetchOrgData' }
  | { type: 'error'; message: string };

/**
 * Handles messages arriving FROM the WebView and dispatches
 * the appropriate VS Code API calls.
 */
export class WebviewMessageHandler {
  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly logFilePath: string
  ) {}

  handle(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        logger.info('WebView ready');
        // Push connection state immediately so the webview knows if org is connected
        this.postOrgStatus();
        break;

      case 'copyToClipboard':
        vscode.env.clipboard.writeText(message.text).then(() => {
          vscode.window.showInformationMessage('Copied to clipboard.');
        });
        break;

      case 'jumpToLine':
        this.jumpToLine(message.filePath, message.lineNumber);
        break;

      case 'fetchOrgData':
        this.handleFetchOrgData();
        break;

      case 'error':
        logger.error(`WebView error: ${message.message}`);
        break;

      default:
        logger.warn(`Unknown message from WebView: ${JSON.stringify(message)}`);
    }
  }

  /** Tell the webview whether an org is connected */
  private postOrgStatus(): void {
    const identity = OrgSession.identity;
    this.panel.webview.postMessage({
      type: 'orgStatus',
      connected: !!identity,
      displayName: identity?.displayName ?? null,
      userName: identity?.userName ?? null,
    });
  }

  /** Fetch live org data (limits + licenses) and send to webview */
  private async handleFetchOrgData(): Promise<void> {
    if (!OrgSession.identity) {
      this.panel.webview.postMessage({ type: 'orgData', connected: false });
      return;
    }
    try {
      const data = await fetchOrgData();
      this.panel.webview.postMessage({ type: 'orgData', connected: true, data });
    } catch (err) {
      const msg = err instanceof SalesforceApiError ? err.message : 'Failed to fetch org data.';
      logger.error('fetchOrgData failed', err);
      this.panel.webview.postMessage({ type: 'orgData', connected: true, error: msg });
    }
  }

  private jumpToLine(filePath: string, lineNumber: number): void {
    const uri = vscode.Uri.file(filePath);
    const position = new vscode.Position(lineNumber - 1, 0);
    const range = new vscode.Range(position, position);

    vscode.window.showTextDocument(uri, {
      viewColumn: vscode.ViewColumn.One,
      selection: range,
      preserveFocus: true,
    });
  }
}
