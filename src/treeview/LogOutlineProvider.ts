import * as vscode from 'vscode';
import type { ParsedLog, ExecutionUnit } from '../parser/types';
import { formatDuration } from '../utils/TimeUtils';

/**
 * Provides the sidebar "Log Outline" tree view.
 * Shows execution units, SOQL count, DML count, and errors at a glance.
 */
export class LogOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OutlineItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private parsedLog: ParsedLog | null = null;

  update(parsedLog: ParsedLog): void {
    this.parsedLog = parsedLog;
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this.parsedLog = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: OutlineItem): OutlineItem[] {
    if (!this.parsedLog) {
      return [];
    }

    if (!element) {
      return this.buildRootItems(this.parsedLog);
    }

    return element.children ?? [];
  }

  private buildRootItems(log: ParsedLog): OutlineItem[] {
    const items: OutlineItem[] = [];

    // Summary node
    const summary = new OutlineItem(
      `${log.summary.entryPoint}`,
      `${formatDuration(log.summary.totalDurationMs)} · ${log.summary.totalEvents} events`,
      vscode.TreeItemCollapsibleState.None,
      'execution'
    );
    summary.iconPath = new vscode.ThemeIcon('debug-start');
    items.push(summary);

    // Errors node (shown prominently if any)
    if (log.errors.length > 0) {
      const errorItem = new OutlineItem(
        `Errors (${log.errors.length})`,
        log.errors[0].message.slice(0, 60),
        vscode.TreeItemCollapsibleState.Collapsed,
        'errors'
      );
      errorItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      errorItem.children = log.errors.map((err, i) =>
        new OutlineItem(
          err.isFatal ? '⛔ ' + err.message.slice(0, 50) : '⚠️ ' + err.message.slice(0, 50),
          `Line ${err.lineNumber}`,
          vscode.TreeItemCollapsibleState.None,
          'error-item'
        )
      );
      items.push(errorItem);
    }

    // SOQL node
    if (log.soqlStatements.length > 0) {
      const soqlItem = new OutlineItem(
        `SOQL Queries (${log.soqlStatements.length})`,
        log.soqlStatements.some((s) => s.isRepeated) ? '⚠ Repeated queries detected' : '',
        vscode.TreeItemCollapsibleState.Collapsed,
        'soql'
      );
      soqlItem.iconPath = new vscode.ThemeIcon('database');
      soqlItem.children = log.soqlStatements.map((s) =>
        new OutlineItem(
          s.query.slice(0, 60),
          `Line ${s.lineNumber} · ${s.rowsReturned ?? '?'} rows · ${formatDuration(s.durationMs)}`,
          vscode.TreeItemCollapsibleState.None,
          'soql-item'
        )
      );
      items.push(soqlItem);
    }

    // DML node
    if (log.dmlStatements.length > 0) {
      const dmlItem = new OutlineItem(
        `DML Operations (${log.dmlStatements.length})`,
        '',
        vscode.TreeItemCollapsibleState.Collapsed,
        'dml'
      );
      dmlItem.iconPath = new vscode.ThemeIcon('edit');
      dmlItem.children = log.dmlStatements.map((d) =>
        new OutlineItem(
          `${d.operation} ${d.objectType}`,
          `Line ${d.lineNumber} · ${d.rowsAffected ?? '?'} rows · ${formatDuration(d.durationMs)}`,
          vscode.TreeItemCollapsibleState.None,
          'dml-item'
        )
      );
      items.push(dmlItem);
    }

    // Execution units
    if (log.executionUnits.length > 0) {
      const execItem = new OutlineItem(
        'Execution Units',
        '',
        vscode.TreeItemCollapsibleState.Collapsed,
        'exec-units'
      );
      execItem.iconPath = new vscode.ThemeIcon('symbol-event');
      execItem.children = log.executionUnits.map((u) => buildExecUnitItem(u));
      items.push(execItem);
    }

    return items;
  }
}

function buildExecUnitItem(unit: ExecutionUnit): OutlineItem {
  const hasChildren = unit.children.length > 0;
  const item = new OutlineItem(
    unit.entryPoint,
    `${formatDuration(unit.durationMs)} · SOQL:${unit.soqlCount} DML:${unit.dmlCount}${unit.errorCount > 0 ? ` Errors:${unit.errorCount}` : ''}`,
    hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    'exec-unit'
  );
  item.iconPath = new vscode.ThemeIcon('symbol-method');
  if (hasChildren) {
    item.children = unit.children.map(buildExecUnitItem);
  }
  return item;
}

class OutlineItem extends vscode.TreeItem {
  children?: OutlineItem[];

  constructor(
    label: string,
    description: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    contextValue: string
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = contextValue;
  }
}
