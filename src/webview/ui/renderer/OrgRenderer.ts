/**
 * Org tab — live data from the connected Salesforce org.
 * Shows:
 *   • Org-level governor limits (API calls, storage, etc.)
 *   • User license usage (Salesforce, Platform, etc.)
 *   • Feature / permission set license usage
 *
 * Content is populated dynamically via postMessage from the extension host,
 * so this file only provides the skeleton HTML and the render functions
 * that main.ts calls when the 'orgData' message arrives.
 */

export function renderOrgSkeleton(connected: boolean, displayName?: string | null): string {
  if (!connected) {
    return /* html */`
      <div class="empty-state" id="org-not-connected">
        <div style="font-size:36px;margin-bottom:12px">☁️</div>
        <p style="font-size:15px;font-weight:700">Not connected to a Salesforce org</p>
        <p style="font-size:12px;opacity:0.6;margin-top:6px;max-width:360px;text-align:center">
          Connect to your org to see live governor limits, license usage, and org-level quotas.
        </p>
        <button class="action-btn" style="margin-top:16px" onclick="acquireVsCodeApiSingleton().postMessage({type:'openConnectCommand'})">
          Connect to Org…
        </button>
      </div>
    `;
  }

  return /* html */`
    <div class="org-view" id="org-view">
      <div class="org-header">
        <span style="font-size:18px">☁️</span>
        <div>
          <div class="org-name">${displayName ? escHtml(displayName) : 'Connected Org'}</div>
          <div class="org-sub">Live data — updates each time you open this tab</div>
        </div>
        <button class="action-btn" id="org-refresh-btn" onclick="window.orgTabRefresh && window.orgTabRefresh()">
          ↻ Refresh
        </button>
      </div>

      <div id="org-loading" class="org-loading">
        <span>Loading org data…</span>
      </div>
      <div id="org-content" style="display:none">
        <!-- Populated by main.ts when orgData message arrives -->
      </div>
    </div>
  `;
}

export function renderOrgContent(data: OrgDataPayload): string {
  return /* html */`
    ${renderOrgLimits(data.limits)}
    ${data.userLicenses.length > 0   ? renderLicenseSection('👤 User Licenses', data.userLicenses) : ''}
    ${data.featureLicenses.length > 0 ? renderLicenseSection('⚙️ Feature Licenses', data.featureLicenses) : ''}
  `;
}

function renderOrgLimits(limits: OrgLimitEntry[]): string {
  if (limits.length === 0) return '';

  const critical = limits.filter(l => l.severity === 'critical');
  const bannerHtml = critical.length > 0
    ? `<div class="warning-banner warning-critical">🚨 ${critical.length} org limit${critical.length > 1 ? 's' : ''} above 80% — action required.</div>`
    : '';

  return /* html */`
    ${bannerHtml}
    <div class="org-section-title">📊 Org Governor Limits</div>
    <div class="limits-grid">
      ${limits.map(l => /* html */`
        <div class="limit-card limit-${l.severity}">
          <div class="limit-header">
            <span class="limit-icon">${l.severity === 'critical' ? '🚨' : l.severity === 'warning' ? '⚠' : '✅'}</span>
            <span class="limit-name">${escHtml(l.displayName)}</span>
          </div>
          <div class="limit-bar-track">
            <div class="limit-bar-fill limit-${l.severity}-fill" style="width:${Math.min(l.percentUsed, 100)}%"></div>
          </div>
          <div class="limit-footer">
            <span class="limit-used">${l.used.toLocaleString()} / ${l.max.toLocaleString()}</span>
            <span class="limit-percent">${l.percentUsed}%</span>
          </div>
          <div style="font-size:10px;opacity:0.5;margin-top:2px">${l.remaining.toLocaleString()} remaining</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLicenseSection(title: string, licenses: LicenseEntry[]): string {
  return /* html */`
    <div class="org-section-title" style="margin-top:24px">${title}</div>
    <div class="license-grid">
      ${licenses.map(l => /* html */`
        <div class="license-card license-${l.severity}">
          <div class="license-name">${escHtml(l.name)}</div>
          <div class="license-bar-track">
            <div class="license-bar-fill license-${l.severity}-fill" style="width:${Math.min(l.percentUsed, 100)}%"></div>
          </div>
          <div class="license-footer">
            <span>${l.used} / ${l.total} used</span>
            <span class="license-percent ${l.severity === 'critical' ? 'text-warning' : ''}">${l.percentUsed}%</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Types (mirrored from LogFetcher — kept lean for webview bundle) ──────────

export interface OrgLimitEntry {
  key: string;
  displayName: string;
  max: number;
  remaining: number;
  used: number;
  percentUsed: number;
  severity: 'ok' | 'warning' | 'critical';
}

export interface LicenseEntry {
  name: string;
  total: number;
  used: number;
  percentUsed: number;
  severity: 'ok' | 'warning' | 'critical';
}

export interface OrgDataPayload {
  limits: OrgLimitEntry[];
  userLicenses: LicenseEntry[];
  featureLicenses: LicenseEntry[];
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
