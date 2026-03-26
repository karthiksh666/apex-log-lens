import * as vscode from 'vscode';
import { OrgSession } from '../salesforce/OrgSession';
import { fetchLogList, fetchLogBody, type OrgLogEntry } from '../salesforce/LogFetcher';
import { SalesforceApiError } from '../salesforce/SalesforceClient';
import { parseLog } from '../parser';
import { LogViewerPanel } from '../webview/LogViewerPanel';
import { logger } from '../utils/Logger';

/**
 * Fetches the user's recent Apex logs from the connected org,
 * presents a quick-pick list, then opens the selected log in the viewer.
 *
 * User isolation is enforced server-side (LogUserId = current user).
 */
export async function fetchLogsCommand(extensionUri: vscode.Uri): Promise<void> {
  if (!OrgSession.isConnected) {
    const action = await vscode.window.showWarningMessage(
      'Not connected to a Salesforce org.',
      'Connect Now'
    );
    if (action === 'Connect Now') {
      await vscode.commands.executeCommand('sflog.connectOrg');
    }
    return;
  }

  let logs: OrgLogEntry[];

  try {
    logs = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Apex Log Lens', cancellable: false },
      async progress => {
        progress.report({ message: 'Fetching your logs...' });
        return fetchLogList(50);
      }
    );
  } catch (err) {
    handleFetchError(err);
    return;
  }

  if (logs.length === 0) {
    vscode.window.showInformationMessage('No Apex debug logs found for your user. Run some Apex and try again.');
    return;
  }

  // ── Quick-pick log selector ────────────────────────────────────────────────
  const picked = await vscode.window.showQuickPick(
    logs.map(log => ({
      label: `$(file-text) ${formatDate(log.lastModified)}`,
      description: `${formatBytes(log.sizeBytes)} · ${log.operation} · ${log.durationMs}ms`,
      detail: `${log.application} — ${log.status}`,
      logId: log.id,
      log,
    })),
    {
      title: `Your Apex Logs — ${OrgSession.identity?.displayName}`,
      placeHolder: 'Select a log to open in Apex Log Lens',
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );

  if (!picked) return;

  // ── Fetch and parse selected log ───────────────────────────────────────────
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Apex Log Lens', cancellable: false },
    async progress => {
      progress.report({ message: 'Downloading log body...' });

      let rawText: string;
      try {
        rawText = await fetchLogBody(picked.logId);
      } catch (err) {
        handleFetchError(err);
        return;
      }

      progress.report({ message: 'Parsing log...' });

      const config = vscode.workspace.getConfiguration('sflog');
      const includeMethodEntryExit: boolean = config.get('showMethodEntryExit') ?? false;

      try {
        const parsedLog = parseLog(
          rawText,
          `org://${OrgSession.identity?.instanceUrl}/${picked.logId}`,
          picked.log.sizeBytes,
          { includeMethodEntryExit }
        );

        logger.info(
          `Parsed org log ${picked.logId}: ${parsedLog.summary.totalEvents} events, ` +
          `${parsedLog.summary.soqlCount} SOQL, ${parsedLog.summary.errorCount} errors`
        );

        progress.report({ message: 'Opening viewer...' });
        LogViewerPanel.open(extensionUri, parsedLog);
      } catch (err) {
        logger.error('Parse failed', err);
        vscode.window.showErrorMessage('Failed to parse log. See Output panel for details.');
      }
    }
  );
}

function handleFetchError(err: unknown): void {
  if (err instanceof SalesforceApiError) {
    if (err.statusCode === 401) {
      vscode.window.showErrorMessage('Session expired. Please reconnect to your org.', 'Reconnect')
        .then(action => {
          if (action === 'Reconnect') vscode.commands.executeCommand('sflog.connectOrg');
        });
    } else {
      vscode.window.showErrorMessage(`Failed to fetch logs: ${err.message}`);
    }
  } else {
    vscode.window.showErrorMessage('Failed to fetch logs. Check Output panel for details.');
    logger.error('Fetch logs failed', err);
  }
}

function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
