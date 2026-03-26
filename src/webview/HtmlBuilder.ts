import * as vscode from 'vscode';
import type { ParsedLog } from '../parser/types';

/**
 * Builds the initial HTML shell for the WebView panel.
 *
 * The HTML loads the compiled webview.js bundle and seeds the parsed log
 * data via a JSON script tag so the webview can render without a round-trip
 * message to the extension host.
 */
export function buildHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  parsedLog: ParsedLog
): string {
  const webviewScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
  );
  const webviewStyleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'resources', 'styles', 'webview.css')
  );

  const nonce = generateNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  // Serialize the parsed log as JSON — large logs can be big, but this avoids
  // a separate postMessage round-trip on first render.
  const serialized = JSON.stringify(parsedLog);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Salesforce Log Viewer</title>
  <link rel="stylesheet" href="${webviewStyleUri}" />
</head>
<body>
  <div id="app"></div>

  <!-- Seed data: parsed log JSON, read by webview.js on load -->
  <script nonce="${nonce}" id="sflog-data" type="application/json">
    ${serialized}
  </script>

  <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
}

/** Cryptographically random nonce for Content Security Policy */
function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
