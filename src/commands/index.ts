import * as vscode from 'vscode';
import { Commands } from '../constants';
import { pickLogFile, readLogFile, formatBytes } from '../utils/FileUtils';
import { parseLog } from '../parser';
import { LogViewerPanel } from '../webview/LogViewerPanel';
import { logger } from '../utils/Logger';

/**
 * Registers all extension commands and returns a disposable array.
 * Call this from extension.ts activate().
 */
export function registerCommands(extensionUri: vscode.Uri): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(Commands.OPEN_FILE, () => openFileCommand(extensionUri)),
    vscode.commands.registerCommand(Commands.OPEN_ACTIVE_EDITOR, () => openActiveEditorCommand(extensionUri)),
    vscode.commands.registerCommand(Commands.CLEAR_PANEL, clearPanelCommand),
    vscode.commands.registerCommand(Commands.EXPORT_SUMMARY, exportSummaryCommand),
  ];
}

/** Prompt user to pick a .log file then open it in the viewer */
async function openFileCommand(extensionUri: vscode.Uri): Promise<void> {
  const filePath = await pickLogFile();
  if (!filePath) {
    return;
  }
  await openLog(filePath, extensionUri);
}

/** Open the currently active editor's file in the viewer */
async function openActiveEditorCommand(extensionUri: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor found.');
    return;
  }
  const filePath = editor.document.uri.fsPath;
  await openLog(filePath, extensionUri);
}

/** Core: read → parse → open panel */
async function openLog(filePath: string, extensionUri: vscode.Uri): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Salesforce Log Viewer',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Reading log file...' });

      const readResult = await readLogFile(filePath);

      if (readResult.kind === 'error') {
        logger.error(`Failed to read file: ${readResult.message}`);
        vscode.window.showErrorMessage(`Could not read log file: ${readResult.message}`);
        return;
      }

      if (readResult.kind === 'too-large') {
        const answer = await vscode.window.showWarningMessage(
          `Log file is ${formatBytes(readResult.fileSizeBytes)} — above the ${formatBytes(readResult.maxBytes)} limit. Parsing may be slow.`,
          'Parse Anyway',
          'Cancel'
        );
        if (answer !== 'Parse Anyway') {
          return;
        }
        // Re-read without limit check by falling through with the raw text approach
        // For now we just warn and continue — a future iteration can add raw-only mode
      }

      progress.report({ message: 'Parsing log...' });

      const config = vscode.workspace.getConfiguration('sflog');
      const includeMethodEntryExit: boolean = config.get('showMethodEntryExit') ?? false;

      try {
        const parsedLog = parseLog(
          (readResult as { kind: 'ok'; text: string; fileSizeBytes: number; filePath: string }).text,
          filePath,
          (readResult as { kind: 'ok'; text: string; fileSizeBytes: number; filePath: string }).fileSizeBytes,
          { includeMethodEntryExit }
        );

        logger.info(
          `Parsed ${filePath}: ${parsedLog.summary.totalEvents} events, ` +
          `${parsedLog.summary.soqlCount} SOQL, ${parsedLog.summary.dmlCount} DML, ` +
          `${parsedLog.summary.errorCount} errors`
        );

        progress.report({ message: 'Opening viewer...' });
        LogViewerPanel.open(extensionUri, parsedLog);
      } catch (err) {
        logger.error('Parse failed', err);
        vscode.window.showErrorMessage('Salesforce Log Viewer: Failed to parse log. See output panel for details.');
      }
    }
  );
}

function clearPanelCommand(): void {
  LogViewerPanel.closeIfOpen();
}

async function exportSummaryCommand(): Promise<void> {
  vscode.window.showInformationMessage('Export coming in a future release.');
}
