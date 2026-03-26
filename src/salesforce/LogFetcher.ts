import { SalesforceClient, SalesforceApiError } from './SalesforceClient';
import { OrgSession } from './OrgSession';
import type { OrgIdentity } from './OrgSession';

const API_VERSION = 'v59.0';

// ─── Types matching Salesforce REST API responses ─────────────────────────────

interface SoqlResponse<T> {
  totalSize: number;
  done: boolean;
  records: T[];
}

interface ApexLogRecord {
  Id: string;
  LogUser: { Id: string; Name: string };
  LogLength: number;
  LastModifiedDate: string;
  Status: string;
  Operation: string;
  Application: string;
  DurationMilliseconds: number;
  Location: string;
}

export interface OrgLogEntry {
  id: string;
  userId: string;
  userName: string;
  sizeBytes: number;
  lastModified: Date;
  status: string;
  operation: string;
  application: string;
  durationMs: number;
  location: string;
}

/**
 * Validates the session and resolves the current user's identity.
 * Called immediately after the user provides credentials.
 */
export async function validateAndIdentify(
  instanceUrl: string,
  sessionId: string
): Promise<OrgIdentity> {
  // Temporarily set in session for the validation call
  // (OrgSession.connect is called AFTER validation succeeds)
  const tempAuth = `Bearer ${sessionId}`;

  // Use the userinfo endpoint — lightweight, always accessible
  const identity = await fetchWithTempAuth<{
    user_id: string;
    username: string;
    display_name: string;
    organization_id: string;
  }>(instanceUrl, `/services/oauth2/userinfo`, tempAuth);

  return {
    userId: identity.user_id,
    userName: identity.username,
    displayName: identity.display_name,
    instanceUrl: instanceUrl.replace(/\/$/, ''),
    orgId: identity.organization_id,
    apiVersion: API_VERSION,
  };
}

/**
 * Fetch the list of Apex debug logs for the CURRENT USER ONLY.
 * Salesforce enforces LogUserId = current user at the API level.
 */
export async function fetchLogList(limit = 50): Promise<OrgLogEntry[]> {
  const identity = OrgSession.identity;
  if (!identity) throw new SalesforceApiError('Not connected', 401);

  const query = encodeURIComponent(
    `SELECT Id, LogUser.Id, LogUser.Name, LogLength, LastModifiedDate, ` +
    `Status, Operation, Application, DurationMilliseconds, Location ` +
    `FROM ApexLog ` +
    `WHERE LogUserId = '${identity.userId}' ` +
    `ORDER BY LastModifiedDate DESC ` +
    `LIMIT ${limit}`
  );

  const response = await SalesforceClient.get<SoqlResponse<ApexLogRecord>>(
    `/services/data/${API_VERSION}/tooling/query?q=${query}`
  );

  return response.records.map(r => ({
    id: r.Id,
    userId: r.LogUser.Id,
    userName: r.LogUser.Name,
    sizeBytes: r.LogLength,
    lastModified: new Date(r.LastModifiedDate),
    status: r.Status,
    operation: r.Operation,
    application: r.Application,
    durationMs: r.DurationMilliseconds,
    location: r.Location,
  }));
}

/**
 * Fetch the raw body text of a specific Apex log.
 * Only works if LogUserId matches the current session user
 * (Salesforce enforces this).
 */
export async function fetchLogBody(logId: string): Promise<string> {
  return SalesforceClient.get<string>(
    `/services/data/${API_VERSION}/tooling/sobjects/ApexLog/${logId}/Body`
  );
}

// ─── Org-level data (limits + licenses) ──────────────────────────────────────

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

export interface OrgData {
  limits: OrgLimitEntry[];
  userLicenses: LicenseEntry[];
  featureLicenses: LicenseEntry[];
}

// Human-readable names for the most useful org limits
const LIMIT_DISPLAY_NAMES: Record<string, string> = {
  DailyApiRequests:                'API Requests (Daily)',
  DailyAsyncApexExecutions:        'Async Apex Executions (Daily)',
  DailyBulkApiBatches:             'Bulk API Batches (Daily)',
  DailyGenericStreamingApiEvents:  'Streaming API Events (Daily)',
  DailyWorkflowEmails:             'Workflow Emails (Daily)',
  DataStorageMB:                   'Data Storage (MB)',
  FileStorageMB:                   'File Storage (MB)',
  HourlyODataCallout:              'OData Callouts (Hourly)',
  HourlyPublishedPlatformEvents:   'Platform Events Published (Hourly)',
  HourlyTimeBasedWorkflow:         'Time-Based Workflows (Hourly)',
  ActiveScratchOrgs:               'Active Scratch Orgs',
  DailyScratchOrgs:                'Scratch Orgs (Daily)',
  DailyFunctionsApiCallLimit:      'Functions API Calls (Daily)',
};

/**
 * Fetches org-level limits (from /limits) and user/feature licenses.
 * Requires an active OrgSession.
 */
export async function fetchOrgData(): Promise<OrgData> {
  const [rawLimits, userLicenseRes, featureLicenseRes] = await Promise.all([
    SalesforceClient.get<Record<string, { Max: number; Remaining: number }>>(
      `/services/data/${API_VERSION}/limits/`
    ),
    SalesforceClient.get<SoqlResponse<{ Name: string; TotalLicenses: number; UsedLicenses: number }>>(
      `/services/data/${API_VERSION}/query?q=${encodeURIComponent(
        'SELECT Name, TotalLicenses, UsedLicenses FROM UserLicense ORDER BY Name'
      )}`
    ),
    SalesforceClient.get<SoqlResponse<{ Name: string; TotalLicenses: number; UsedLicenses: number }>>(
      `/services/data/${API_VERSION}/query?q=${encodeURIComponent(
        'SELECT Name, TotalLicenses, UsedLicenses FROM PermissionSetLicense ORDER BY Name'
      )}`
    ),
  ]);

  // Build limits list — only the ones with a known display name (most useful)
  const limits: OrgLimitEntry[] = Object.entries(rawLimits)
    .filter(([key]) => LIMIT_DISPLAY_NAMES[key] !== undefined)
    .map(([key, val]) => {
      const used = val.Max - val.Remaining;
      const pct  = val.Max > 0 ? Math.round((used / val.Max) * 100) : 0;
      return {
        key,
        displayName: LIMIT_DISPLAY_NAMES[key],
        max: val.Max,
        remaining: val.Remaining,
        used,
        percentUsed: pct,
        severity: (pct >= 80 ? 'critical' : pct >= 50 ? 'warning' : 'ok') as 'ok' | 'warning' | 'critical',
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);

  const mapLicense = (r: { Name: string; TotalLicenses: number; UsedLicenses: number }): LicenseEntry => {
    const pct = r.TotalLicenses > 0 ? Math.round((r.UsedLicenses / r.TotalLicenses) * 100) : 0;
    return {
      name: r.Name,
      total: r.TotalLicenses,
      used: r.UsedLicenses,
      percentUsed: pct,
      severity: pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : 'ok',
    };
  };

  return {
    limits,
    userLicenses:    userLicenseRes.records.map(mapLicense),
    featureLicenses: featureLicenseRes.records.map(mapLicense),
  };
}

// ─── Internal helper for pre-connect validation ───────────────────────────────

async function fetchWithTempAuth<T>(
  instanceUrl: string,
  path: string,
  authHeader: string
): Promise<T> {
  const https = await import('https');
  const { URL } = await import('url');

  const url = new URL(path, instanceUrl);

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          Authorization: authHeader, // SECURITY: never logged
          Accept: 'application/json',
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new SalesforceApiError('Invalid or expired session ID.', res.statusCode ?? 401, 'INVALID_SESSION_ID'));
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new SalesforceApiError(`HTTP ${res.statusCode}`, res.statusCode));
            return;
          }
          try { resolve(JSON.parse(raw) as T); }
          catch { reject(new SalesforceApiError('Invalid response from org', 500)); }
        });
      }
    );
    req.on('error', (e: Error) => reject(new SalesforceApiError(e.message, 0)));
    req.setTimeout(15_000, () => { req.destroy(); reject(new SalesforceApiError('Timeout', 0)); });
    req.end();
  });
}
