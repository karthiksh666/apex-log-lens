import * as vscode from 'vscode';
import { OrgSession } from '../salesforce/OrgSession';
import { validateAndIdentify } from '../salesforce/LogFetcher';
import { getCliOrgInfo, listCliOrgs } from '../salesforce/CliAuthProvider';
import { SalesforceApiError } from '../salesforce/SalesforceClient';
import { logger } from '../utils/Logger';
import { updateStatusBar } from './statusBar';
import { HomeViewProvider } from '../webview/HomeViewProvider';

/**
 * Guides the user through connecting to a Salesforce org.
 *
 * Connection methods (in order of preference):
 * 1. SF CLI — zero typing, reads from CLI's secure store
 * 2. Session ID — user pastes a session ID (masked input, never stored)
 */
export async function connectOrgCommand(): Promise<void> {
  // ── Step 1: try SF CLI first ──────────────────────────────────────────────
  const cliOrgs = await listCliOrgs();

  const METHOD_CLI = '$(terminal) Use SF CLI authenticated org';
  const METHOD_SESSION = '$(key) Enter Session ID manually';

  let method: string | undefined;

  if (cliOrgs.length > 0) {
    method = await vscode.window.showQuickPick(
      [METHOD_CLI, METHOD_SESSION],
      {
        title: 'Connect to Salesforce Org',
        placeHolder: 'How would you like to connect?',
      }
    );
  } else {
    method = METHOD_SESSION;
  }

  if (!method) return;

  if (method === METHOD_CLI) {
    await connectViaCli(cliOrgs);
  } else {
    await connectViaSessionId();
  }
}

async function connectViaCli(
  orgs: Array<{ alias: string; username: string; instanceUrl: string }>
): Promise<void> {
  let targetOrg: string | undefined;

  if (orgs.length === 1) {
    targetOrg = orgs[0].alias || orgs[0].username;
  } else {
    const picked = await vscode.window.showQuickPick(
      orgs.map(o => ({
        label: o.alias || o.username,
        description: o.username,
        detail: o.instanceUrl,
      })),
      { title: 'Select org', placeHolder: 'Choose a connected org' }
    );
    if (!picked) return;
    targetOrg = picked.label;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Apex Log Lens', cancellable: false },
    async progress => {
      progress.report({ message: 'Reading SF CLI credentials...' });
      const info = await getCliOrgInfo(targetOrg);
      if (!info) {
        vscode.window.showErrorMessage('Could not read org info from SF CLI. Try reconnecting with `sf org login`.');
        return;
      }

      progress.report({ message: 'Validating session...' });
      try {
        const identity = await validateAndIdentify(info.instanceUrl, info.accessToken);
        OrgSession.connect(info.instanceUrl, info.accessToken, identity);
        updateStatusBar('connected', identity);
        HomeViewProvider.notifyOrgStatus();
        logger.info(`Connected to org ${identity.orgId} as ${identity.userName}`);
        vscode.window.showInformationMessage(`✅ Connected as ${identity.displayName} · ${identity.instanceUrl}`);
      } catch (err) {
        handleConnectError(err);
      }
    }
  );
}

async function connectViaSessionId(): Promise<void> {
  // Step 1: Instance URL
  const instanceUrl = await vscode.window.showInputBox({
    title: 'Salesforce Instance URL',
    prompt: 'Enter your org URL (e.g. https://mycompany.salesforce.com)',
    placeHolder: 'https://mycompany.my.salesforce.com',
    validateInput: val => {
      if (!val?.startsWith('https://')) return 'Must start with https://';
      return null;
    },
  });
  if (!instanceUrl) return;

  // Step 2: Session ID (masked — VS Code never shows it)
  const sessionId = await vscode.window.showInputBox({
    title: 'Session ID',
    prompt: 'Paste your Salesforce Session ID. It is never stored — only held in memory for this VS Code session.',
    placeHolder: '00D...',
    password: true, // ← masked input, not stored in history
    validateInput: val => {
      if (!val || val.trim().length < 10) return 'Session ID looks too short';
      return null;
    },
  });
  if (!sessionId) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Apex Log Lens', cancellable: false },
    async progress => {
      progress.report({ message: 'Validating session...' });
      try {
        const identity = await validateAndIdentify(instanceUrl, sessionId.trim());
        OrgSession.connect(instanceUrl, sessionId.trim(), identity);
        updateStatusBar('connected', identity);
        HomeViewProvider.notifyOrgStatus();
        logger.info(`Connected to ${identity.instanceUrl} as ${identity.userName}`);
        vscode.window.showInformationMessage(`✅ Connected as ${identity.displayName}`);
      } catch (err) {
        handleConnectError(err);
      }
    }
  );
}

function handleConnectError(err: unknown): void {
  if (err instanceof SalesforceApiError) {
    if (err.statusCode === 401) {
      vscode.window.showErrorMessage('Invalid or expired session ID. Please try again.');
    } else {
      vscode.window.showErrorMessage(`Connection failed: ${err.message}`);
    }
  } else {
    vscode.window.showErrorMessage('Connection failed. Check the Output panel for details.');
    logger.error('Connect failed', err);
  }
}

export async function disconnectOrgCommand(): Promise<void> {
  OrgSession.disconnect();
  updateStatusBar('disconnected');
  HomeViewProvider.notifyOrgStatus();
  vscode.window.showInformationMessage('Disconnected from Salesforce org.');
}
