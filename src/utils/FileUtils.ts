import * as fs from 'fs';
import * as vscode from 'vscode';
import { MAX_FILE_SIZE_BYTES_DEFAULT } from '../constants';

export type FileReadResult =
  | { kind: 'ok'; text: string; fileSizeBytes: number; filePath: string }
  | { kind: 'too-large'; fileSizeBytes: number; filePath: string; maxBytes: number }
  | { kind: 'error'; message: string };

/**
 * Reads a file from disk with a size guard.
 * Returns the text content or an error descriptor — never throws.
 */
export async function readLogFile(filePath: string): Promise<FileReadResult> {
  try {
    const stat = await fs.promises.stat(filePath);
    const fileSizeBytes = stat.size;

    const config = vscode.workspace.getConfiguration('sflog');
    const maxMB: number = config.get('maxFileSizeMB') ?? 50;
    const maxBytes = maxMB * 1024 * 1024;

    if (fileSizeBytes > maxBytes) {
      return { kind: 'too-large', fileSizeBytes, filePath, maxBytes };
    }

    const buffer = await fs.promises.readFile(filePath);
    // Sanitize invalid UTF-8 sequences (can occur in heap dump sections of logs)
    const text = buffer.toString('utf8').replace(/\uFFFD/g, '?');

    return { kind: 'ok', text, fileSizeBytes, filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'error', message };
  }
}

/** Prompt the user to pick a .log file via the native file dialog. */
export async function pickLogFile(): Promise<string | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'Apex Debug Logs': ['log'], 'All Files': ['*'] },
    title: 'Open Salesforce Debug Log',
  });

  return uris?.[0]?.fsPath;
}

/** Format bytes as a human-readable string (e.g. "1.2 MB") */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
