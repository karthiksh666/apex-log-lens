import type { ParsedLog, LimitEntry } from '../../../parser/types';
import { renderOrgSkeleton, renderOrgContent, type OrgDataPayload } from './OrgRenderer';

export function renderLimits(log: ParsedLog, orgConnected = false, orgDisplayName: string | null = null): string {
  const { governorLimits } = log;

  const criticalCount = governorLimits.entries.filter((e) => e.severity === 'critical').length;
  const warningCount  = governorLimits.entries.filter((e) => e.severity === 'warning').length;

  const bannerHtml = criticalCount > 0
    ? `<div class="warning-banner warning-critical">🚨 ${criticalCount} per-transaction limit${criticalCount > 1 ? 's' : ''} above 80% — risk of LimitException!</div>`
    : warningCount > 0
    ? `<div class="warning-banner">⚠ ${warningCount} per-transaction limit${warningCount > 1 ? 's' : ''} above 50% — monitor closely.</div>`
    : `<div class="info-banner">✅ Per-transaction governor limits are within safe range.</div>`;

  const txLimitsSection = governorLimits.entries.length === 0
    ? `<div class="limits-hint">No limit data in log. Set <strong>APEX_PROFILING: FINE</strong> or higher in your debug log level.</div>`
    : /* html */`
      <div class="limits-section-label">Per-Transaction Limits (from this log)</div>
      <div class="limits-grid">${governorLimits.entries.map(renderLimitCard).join('')}</div>
    `;

  return /* html */`
    <div class="limits-view">
      ${bannerHtml}
      ${txLimitsSection}

      <div class="limits-section-label" style="margin-top:24px">Org-Level Limits &amp; Licenses (live from org)</div>
      ${renderOrgSkeleton(orgConnected, orgDisplayName)}
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
