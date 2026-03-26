import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { logger } from './utils/Logger';
import { LogCodeLensProvider } from './providers/LogCodeLensProvider';
import { LogOutlineProvider } from './treeview/LogOutlineProvider';
import { LogViewerPanel } from './webview/LogViewerPanel';
import { LANGUAGE_ID, ViewIds } from './constants';

export function activate(context: vscode.ExtensionContext): void {
  logger.info('Apex Log Lens activating');

  // Sidebar outline provider — register before commands so LogViewerPanel can update it
  const outlineProvider = new LogOutlineProvider();
  LogViewerPanel.registerOutlineProvider(outlineProvider);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(ViewIds.OUTLINE, outlineProvider)
  );

  // All commands
  context.subscriptions.push(...registerCommands(context.extensionUri));

  // CodeLens: "Open in Log Lens" on first line of .log files
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: LANGUAGE_ID },
      new LogCodeLensProvider()
    )
  );

  // Auto-open viewer when a .log file is opened (if setting enabled)
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
  LogViewerPanel.closeIfOpen();
  logger.info('Apex Log Lens deactivated');
  logger.dispose();
}
