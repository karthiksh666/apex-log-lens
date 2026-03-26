import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

/**
 * Thin wrapper around VS Code's OutputChannel.
 * Used for extension-internal diagnostics (not shown to the user unless they open the output panel).
 */
class ExtensionLogger {
  private channel: vscode.OutputChannel | null = null;

  private getChannel(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    }
    return this.channel;
  }

  info(message: string): void {
    this.getChannel().appendLine(`[INFO]  ${timestamp()} ${message}`);
  }

  warn(message: string): void {
    this.getChannel().appendLine(`[WARN]  ${timestamp()} ${message}`);
  }

  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? ` — ${err.message}` : '';
    this.getChannel().appendLine(`[ERROR] ${timestamp()} ${message}${detail}`);
    if (err instanceof Error && err.stack) {
      this.getChannel().appendLine(err.stack);
    }
  }

  show(): void {
    this.getChannel().show();
  }

  dispose(): void {
    this.channel?.dispose();
    this.channel = null;
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = new ExtensionLogger();
