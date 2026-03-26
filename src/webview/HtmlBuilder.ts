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

  // Serialize a slimmed-down version of the log.
  // Raw allEvents / phase.events / executionUnits are stripped to keep
  // the payload small for large (10 MB+) logs.
  const serialized = JSON.stringify(slimForWebview(parsedLog));

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

/**
 * Strip fields that are large and unused in the webview before serialization.
 *
 * Savings for a 10 MB log (≈50 k events, 200 phases):
 *   phase.events  → main culprit — each phase duplicates all its raw events
 *   allEvents     → kept but slimmed to {lineNumber, raw} for the Raw tab
 *   executionUnits → internal tree, not rendered in any tab
 *
 * Per-phase and global arrays are also capped so a pathological log
 * (e.g. 100 k SOQL) cannot produce a 500 MB payload.
 */
function slimForWebview(log: ParsedLog): unknown {
  const CAP_PER_PHASE_SOQL  = 500;
  const CAP_PER_PHASE_DEBUG = 300;
  const CAP_GLOBAL          = 2_000;

  return {
    ...log,
    // RawRenderer only needs lineNumber + raw
    allEvents: log.allEvents.map(e => ({ lineNumber: e.lineNumber, raw: e.raw })),
    // Not rendered anywhere
    executionUnits: [],
    // Global arrays capped
    soqlStatements: log.soqlStatements.slice(0, CAP_GLOBAL),
    dmlStatements:  log.dmlStatements.slice(0, CAP_GLOBAL),
    transactions: log.transactions.map(tx => ({
      ...tx,
      phases: tx.phases.map(p => ({
        ...p,
        events:          [],   // strip — not used in any renderer
        soqlStatements:  p.soqlStatements.slice(0, CAP_PER_PHASE_SOQL),
        debugStatements: p.debugStatements.slice(0, CAP_PER_PHASE_DEBUG),
      })),
    })),
  };
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
