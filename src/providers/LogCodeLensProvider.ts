import * as vscode from 'vscode';
import { Commands } from '../constants';

/**
 * Adds an "Open in Log Viewer" CodeLens on the first line of any Apex debug log file.
 * Gives users a one-click entry point directly from the editor.
 */
export class LogCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const topOfFile = new vscode.Range(0, 0, 0, 0);
    const lens = new vscode.CodeLens(topOfFile, {
      title: '$(preview) Open in Log Viewer',
      command: Commands.OPEN_ACTIVE_EDITOR,
      tooltip: 'Open this log file in the Salesforce Log Viewer',
    });
    return [lens];
  }
}
