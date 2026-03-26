import * as vscode from 'vscode';
import type { ParsedLog } from '../parser/types';
import { buildHtml } from './HtmlBuilder';
import { WebviewMessageHandler } from './WebviewMessageHandler';
import { ContextKeys } from '../constants';
import { logger } from '../utils/Logger';

/**
 * Manages the WebView panel lifecycle.
 *
 * Only one panel is open at a time (singleton). When the panel is hidden,
 * VS Code destroys the WebView content to save memory — we retain the
 * ParsedLog in the extension host and re-hydrate when it becomes visible.
 */
export class LogViewerPanel {
  private static instance: LogViewerPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly messageHandler: WebviewMessageHandler;
  private parsedLog: ParsedLog;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    parsedLog: ParsedLog
  ) {
    this.panel = panel;
    this.parsedLog = parsedLog;
    this.messageHandler = new WebviewMessageHandler(panel, parsedLog.filePath);

    this.render();
    this.setContextKeys();

    // Re-render when the panel becomes visible again after being hidden
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          this.render();
        }
      },
      null,
      this.disposables
    );

    // Handle messages from the WebView
    this.panel.webview.onDidReceiveMessage(
      (message) => this.messageHandler.handle(message),
      null,
      this.disposables
    );

    // Clean up when panel is closed by the user
    this.panel.onDidDispose(
      () => this.dispose(),
      null,
      this.disposables
    );
  }

  /** Open a new panel or replace the content of the existing one. */
  static open(
    extensionUri: vscode.Uri,
    parsedLog: ParsedLog,
    column: vscode.ViewColumn = vscode.ViewColumn.Two
  ): LogViewerPanel {
    if (LogViewerPanel.instance) {
      // Reuse existing panel — just update its content
      LogViewerPanel.instance.update(parsedLog);
      LogViewerPanel.instance.panel.reveal(column);
      return LogViewerPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      'sflogViewer',
      'Salesforce Log Viewer',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: false, // We handle re-hydration manually
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'resources'),
        ],
      }
    );

    LogViewerPanel.instance = new LogViewerPanel(panel, extensionUri, parsedLog);
    return LogViewerPanel.instance;
  }

  /** Replace the log currently shown in the panel. */
  update(parsedLog: ParsedLog): void {
    this.parsedLog = parsedLog;
    this.render();
    this.setContextKeys();
  }

  private render(): void {
    try {
      this.panel.title = `Log: ${shortName(this.parsedLog.filePath)}`;
      this.panel.webview.html = buildHtml(
        this.panel.webview,
        this.extensionUri,
        this.parsedLog
      );
    } catch (err) {
      logger.error('Failed to render WebView', err);
      vscode.window.showErrorMessage('Salesforce Log Viewer: Failed to render log. See output for details.');
    }
  }

  private setContextKeys(): void {
    vscode.commands.executeCommand('setContext', ContextKeys.PANEL_ACTIVE, true);
    vscode.commands.executeCommand('setContext', ContextKeys.LOG_LOADED, true);
    vscode.commands.executeCommand(
      'setContext',
      ContextKeys.HAS_ERRORS,
      this.parsedLog.errors.length > 0
    );
  }

  dispose(): void {
    LogViewerPanel.instance = undefined;

    vscode.commands.executeCommand('setContext', ContextKeys.PANEL_ACTIVE, false);
    vscode.commands.executeCommand('setContext', ContextKeys.HAS_ERRORS, false);

    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.panel.dispose();

    logger.info('LogViewerPanel disposed');
  }
}

function shortName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}
