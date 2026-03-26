import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { logger } from './utils/Logger';
import { LogCodeLensProvider } from './providers/LogCodeLensProvider';
import { LogOutlineProvider } from './treeview/LogOutlineProvider';
import { LANGUAGE_ID, ViewIds } from './constants';

/**
 * Extension entry point — called by VS Code when the extension activates.
 */
export function activate(context: vscode.ExtensionContext): void {
  logger.info('Salesforce Log Viewer activating');

  // Register all commands
  const commandDisposables = registerCommands(context.extensionUri);
  context.subscriptions.push(...commandDisposables);

  // CodeLens: "Open in Log Viewer" on the first line of .log files
  const codeLensProvider = new LogCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: LANGUAGE_ID },
      codeLensProvider
    )
  );

  // Sidebar outline tree view
  const outlineProvider = new LogOutlineProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(ViewIds.OUTLINE, outlineProvider)
  );

  // Auto-open: if configured, open viewer when a .log file is opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const config = vscode.workspace.getConfiguration('sflog');
      const autoOpen: boolean = config.get('autoOpenOnLogFile') ?? false;
      if (autoOpen && doc.languageId === LANGUAGE_ID) {
        vscode.commands.executeCommand('sflog.openActiveEditor');
      }
    })
  );

  logger.info('Salesforce Log Viewer activated');
}

export function deactivate(): void {
  logger.info('Salesforce Log Viewer deactivated');
  logger.dispose();
}
