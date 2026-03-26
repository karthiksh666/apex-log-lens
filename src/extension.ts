import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { logger } from './utils/Logger';
import { LogCodeLensProvider } from './providers/LogCodeLensProvider';
import { LogOutlineProvider } from './treeview/LogOutlineProvider';
import { LogViewerPanel } from './webview/LogViewerPanel';
import { OrgSession } from './salesforce/OrgSession';
import { createStatusBar } from './commands/statusBar';
import { LANGUAGE_ID, ViewIds } from './constants';

export function activate(context: vscode.ExtensionContext): void {
  logger.info('Apex Log Lens activating');

  // Status bar — shows connection state, always visible
  createStatusBar(context);

  // Sidebar outline
  const outlineProvider = new LogOutlineProvider();
  LogViewerPanel.registerOutlineProvider(outlineProvider);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(ViewIds.OUTLINE, outlineProvider)
  );

  // All commands
  context.subscriptions.push(...registerCommands(context.extensionUri));

  // CodeLens on .log files
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: LANGUAGE_ID },
      new LogCodeLensProvider()
    )
  );

  // Auto-open viewer on .log file open (if setting enabled)
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const config = vscode.workspace.getConfiguration('sflog');
      const autoOpen: boolean = config.get('autoOpenOnLogFile') ?? false;
      if (autoOpen && doc.languageId === LANGUAGE_ID) {
        vscode.commands.executeCommand('sflog.openActiveEditor');
      }
    })
  );

  logger.info('Apex Log Lens activated');
}

export function deactivate(): void {
  // Clear in-memory session — no credentials linger after VS Code closes
  OrgSession.disconnect();
  LogViewerPanel.closeIfOpen();
  logger.info('Apex Log Lens deactivated');
  logger.dispose();
}
