import type { ParsedLog, LimitEntry } from '../../../parser/types';

export function renderLimits(log: ParsedLog): string {
  const { governorLimits } = log;

  if (governorLimits.entries.length === 0) {
    return `<div class="empty-state"><p>No governor limit data found. Make sure your debug log level includes <strong>APEX_PROFILING: FINE</strong> or higher.</p></div>`;
  }

  const cards = governorLimits.entries.map(renderLimitCard).join('');

  const criticalCount = governorLimits.entries.filter((e) => e.severity === 'critical').length;
  const warningCount = governorLimits.entries.filter((e) => e.severity === 'warning').length;

  const bannerHtml = criticalCount > 0
    ? `<div class="warning-banner warning-critical">🚨 ${criticalCount} limit${criticalCount > 1 ? 's' : ''} above 80% — risk of LimitException!</div>`
    : warningCount > 0
    ? `<div class="warning-banner">⚠ ${warningCount} limit${warningCount > 1 ? 's' : ''} above 50% — monitor closely.</div>`
    : `<div class="info-banner">✅ All governor limits are within safe range.</div>`;

  return /* html */ `
    <div class="limits-view">
      ${bannerHtml}
      <div class="limits-grid">
        ${cards}
      </div>
    </div>
  `;
}

function renderLimitCard(entry: LimitEntry): string {
  const barWidth = Math.min(entry.percentUsed, 100);
  const severityClass = `limit-${entry.severity}`;
  const severityIcon = entry.severity === 'critical' ? '🚨' : entry.severity === 'warning' ? '⚠' : '✅';

  return /* html */ `
    <div class="limit-card ${severityClass}">
      <div class="limit-header">
        <span class="limit-icon">${severityIcon}</span>
        <span class="limit-name">${escapeHtml(entry.displayName)}</span>
        ${entry.namespace !== '(default)' ? `<span class="limit-ns">${escapeHtml(entry.namespace)}</span>` : ''}
      </div>
      <div class="limit-bar-track">
        <div class="limit-bar-fill ${severityClass}-fill" style="width: ${barWidth}%"></div>
      </div>
      <div class="limit-footer">
        <span class="limit-used">${entry.used.toLocaleString()} / ${entry.max.toLocaleString()}</span>
        <span class="limit-percent">${entry.percentUsed}%</span>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
