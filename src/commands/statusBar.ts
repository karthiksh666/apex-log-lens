import * as vscode from 'vscode';
import type { OrgIdentity } from '../salesforce/OrgSession';

let statusBarItem: vscode.StatusBarItem | undefined;

export function createStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  updateStatusBar('disconnected');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function updateStatusBar(state: 'connected' | 'disconnected' | 'loading', identity?: OrgIdentity): void {
  if (!statusBarItem) return;

  switch (state) {
    case 'connected':
      statusBarItem.text = `$(cloud) ${identity?.displayName ?? 'Connected'}`;
      statusBarItem.tooltip = `Connected to ${identity?.instanceUrl}\nClick to disconnect`;
      statusBarItem.command = 'sflog.disconnectOrg';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'disconnected':
      statusBarItem.text = '$(cloud-offline) Connect to Org';
      statusBarItem.tooltip = 'Click to connect to a Salesforce org';
      statusBarItem.command = 'sflog.connectOrg';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'loading':
      statusBarItem.text = '$(loading~spin) Connecting...';
      statusBarItem.tooltip = 'Connecting to Salesforce org...';
      statusBarItem.command = undefined;
      break;
  }
}
