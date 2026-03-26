import type { ParsedLog } from '../../../parser/types';
import { analyzeCodeQuality, type QualityIssue } from '../../../parser/CodeQualityAnalyzer';

/**
 * Code Quality tab — PMD-style guided fix cards.
 * Each card shows WHAT is wrong, WHY it matters, and a concrete HOW-TO-FIX
 * with a code example. No jargon, beginner-readable.
 */
export function renderCodeQuality(log: ParsedLog): string {
  const issues = analyzeCodeQuality(log);

  if (issues.length === 0) {
    return /* html */`
      <div class="empty-state success-state">
        <div class="success-icon">🎉</div>
        <p style="font-size:16px;font-weight:700">No code quality issues detected!</p>
        <p style="font-size:12px;opacity:0.6;margin-top:4px">
          This log doesn't show any common Apex anti-patterns.<br>
          Governor limits are safe, no repeated SOQL, no unhandled exceptions.
        </p>
      </div>
    `;
  }

  const critical = issues.filter(i => i.severity === 'critical');
  const high     = issues.filter(i => i.severity === 'high');
  const medium   = issues.filter(i => i.severity === 'medium');
  const low      = issues.filter(i => i.severity === 'low');

  const bannerHtml = critical.length > 0
    ? `<div class="warning-banner warning-critical">🚨 ${critical.length} critical issue${critical.length > 1 ? 's' : ''} — these will likely cause failures in production.</div>`
    : high.length > 0
    ? `<div class="warning-banner">⚠ ${high.length} high-severity issue${high.length > 1 ? 's' : ''} — fix before deploying to production.</div>`
    : `<div class="info-banner">⚠ ${issues.length} code quality hint${issues.length > 1 ? 's' : ''} — good to fix but not urgent.</div>`;

  const summaryPills = [
    critical.length > 0 ? `<span class="cq-pill cq-pill-critical">${critical.length} Critical</span>` : '',
    high.length     > 0 ? `<span class="cq-pill cq-pill-high">${high.length} High</span>` : '',
    medium.length   > 0 ? `<span class="cq-pill cq-pill-medium">${medium.length} Medium</span>` : '',
    low.length      > 0 ? `<span class="cq-pill cq-pill-low">${low.length} Low</span>` : '',
  ].filter(Boolean).join('');

  const cards = issues
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map(renderIssueCard)
    .join('');

  return /* html */`
    <div class="cq-view">
      ${bannerHtml}
      <div class="cq-summary-bar">
        ${summaryPills}
        <span class="cq-hint">Based on log analysis · same rules as Apex PMD</span>
      </div>
      <div class="cq-cards">
        ${cards}
      </div>
    </div>
  `;
}

function renderIssueCard(issue: QualityIssue): string {
  const sevIcon  = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[issue.severity];
  const catIcon  = { performance: '⚡', limits: '📊', reliability: '🛡', 'best-practice': '✅', security: '🔒' }[issue.category as string];
  const sevLabel = issue.severity[0].toUpperCase() + issue.severity.slice(1);

  const linesHtml = issue.affectedLines.length > 0
    ? /* html */`<div class="cq-affected-lines">
        📍 Log lines: ${issue.affectedLines.slice(0, 8).map(l => `<span class="cq-line-chip" data-line="${l}">L${l}</span>`).join('')}
        ${issue.affectedLines.length > 8 ? `<span style="opacity:0.5;font-size:10px"> +${issue.affectedLines.length - 8} more</span>` : ''}
      </div>`
    : '';

  return /* html */`
    <div class="cq-card cq-${issue.severity}" id="${issue.id}">

      <!-- Card header -->
      <div class="cq-card-header" onclick="this.closest('.cq-card').classList.toggle('cq-expanded')">
        <span class="cq-sev-icon">${sevIcon}</span>
        <div class="cq-card-title-group">
          <div class="cq-card-title">${escHtml(issue.title)}</div>
          <div class="cq-card-meta">
            <span class="cq-sev-badge cq-badge-${issue.severity}">${sevLabel}</span>
            <span class="cq-cat-badge">${catIcon} ${capitalise(issue.category)}</span>
            <code class="cq-rule-id">${escHtml(issue.ruleId)}</code>
          </div>
        </div>
        <span class="cq-chevron">›</span>
      </div>

      <!-- Expandable body -->
      <div class="cq-card-body">
        <div class="cq-section">
          <div class="cq-section-label">🔍 What's happening</div>
          <p class="cq-text">${escHtml(issue.what)}</p>
        </div>

        <div class="cq-section">
          <div class="cq-section-label">⚠️ Why it matters</div>
          <p class="cq-text">${escHtml(issue.why)}</p>
        </div>

        <div class="cq-section">
          <div class="cq-section-label">✅ How to fix it</div>
          <div class="cq-steps">
            ${issue.how.split('\n').map(step => `<p class="cq-step">${escHtml(step)}</p>`).join('')}
          </div>
        </div>

        <div class="cq-section">
          <div class="cq-section-label">💡 Code example</div>
          <pre class="cq-code">${escHtml(issue.codeExample)}</pre>
        </div>

        ${linesHtml}
      </div>
    </div>
  `;
}

function severityRank(s: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s] ?? 4;
}

function capitalise(s: string): string {
  return s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
