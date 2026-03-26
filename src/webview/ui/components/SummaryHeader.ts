import type { ParsedLog } from '../../../parser/types';
import { formatDuration, formatNumber } from '../../../utils/TimeUtils';

/** Top-of-page summary bar — instant health check for any developer. */
export function renderSummaryHeader(log: ParsedLog): string {
  const { summary } = log;
  const hasErrors = summary.errorCount > 0;
  const hasCriticalLimits = log.governorLimits.hasCritical;

  return /* html */ `
    <div class="summary-header ${hasErrors ? 'has-errors' : ''}">
      <div class="summary-entry-point">
        <span class="summary-icon">⚡</span>
        <span class="summary-label" title="${summary.entryPoint}">${truncate(summary.entryPoint, 60)}</span>
      </div>
      <div class="summary-stats">
        <div class="stat" title="Total execution duration">
          <span class="stat-icon">⏱</span>
          <span class="stat-value">${formatDuration(summary.totalDurationMs)}</span>
          <span class="stat-label">Duration</span>
        </div>
        <div class="stat ${summary.soqlCount > 0 ? 'stat-highlight' : ''}" title="SOQL queries executed">
          <span class="stat-icon">🔍</span>
          <span class="stat-value">${summary.soqlCount}</span>
          <span class="stat-label">SOQL</span>
        </div>
        <div class="stat" title="DML operations executed">
          <span class="stat-icon">💾</span>
          <span class="stat-value">${summary.dmlCount}</span>
          <span class="stat-label">DML</span>
        </div>
        <div class="stat ${hasErrors ? 'stat-error' : ''}" title="Errors and exceptions">
          <span class="stat-icon">${hasErrors ? '🚨' : '✅'}</span>
          <span class="stat-value">${summary.errorCount}</span>
          <span class="stat-label">Errors</span>
        </div>
        <div class="stat ${hasCriticalLimits ? 'stat-warning' : ''}" title="Log file size">
          <span class="stat-icon">📄</span>
          <span class="stat-value">${formatBytes(summary.fileSizeBytes)}</span>
          <span class="stat-label">Size</span>
        </div>
        <div class="stat" title="Total parsed events">
          <span class="stat-icon">📋</span>
          <span class="stat-value">${formatNumber(summary.totalEvents)}</span>
          <span class="stat-label">Events</span>
        </div>
      </div>
    </div>
  `;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
