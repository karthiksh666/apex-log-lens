import * as vscode from 'vscode';
import { logger } from '../utils/Logger';

/** Messages the WebView can send to the extension host */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'jumpToLine'; lineNumber: number; filePath: string }
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
        // WebView has initialized — nothing needed since we seed via JSON
        logger.info('WebView ready');
        break;

      case 'copyToClipboard':
        vscode.env.clipboard.writeText(message.text).then(() => {
          vscode.window.showInformationMessage('Copied to clipboard.');
        });
        break;

      case 'jumpToLine':
        this.jumpToLine(message.filePath, message.lineNumber);
        break;

      case 'error':
        logger.error(`WebView error: ${message.message}`);
        break;

      default:
        logger.warn(`Unknown message from WebView: ${JSON.stringify(message)}`);
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
