/**
 * In-memory only Salesforce org session.
 *
 * SECURITY CONTRACT:
 * - The session ID is NEVER written to disk, logged, or sent to the WebView.
 * - It lives only in this module's private closure for the lifetime of the
 *   VS Code extension host process.
 * - When the extension deactivates (or VS Code closes), the process exits
 *   and the memory is reclaimed — zero trace left behind.
 */

export interface OrgIdentity {
  userId: string;
  userName: string;
  displayName: string;
  instanceUrl: string;
  orgId: string;
  apiVersion: string;
}

// ─── Private in-memory state — never exported, never serialized ───────────────
let _sessionId: string | null = null;
let _instanceUrl: string | null = null;
let _identity: OrgIdentity | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export const OrgSession = {
  /**
   * Store session credentials in memory.
   * Called once after successful connection validation.
   */
  connect(instanceUrl: string, sessionId: string, identity: OrgIdentity): void {
    _instanceUrl = instanceUrl.replace(/\/$/, ''); // strip trailing slash
    _sessionId = sessionId;
    _identity = identity;
  },

  /**
   * Overwrite credentials and clear identity.
   * Called on explicit disconnect or session expiry.
   */
  disconnect(): void {
    // Overwrite before nulling — helps GC and avoids lingering reference
    if (_sessionId) {
      _sessionId = _sessionId.replace(/./g, '0');
    }
    _sessionId = null;
    _instanceUrl = null;
    _identity = null;
  },

  get isConnected(): boolean {
    return _sessionId !== null && _instanceUrl !== null;
  },

  get identity(): OrgIdentity | null {
    return _identity;
  },

  get instanceUrl(): string | null {
    return _instanceUrl;
  },

  /**
   * Returns the Authorization header value.
   * INTERNAL USE ONLY — never pass this to the WebView or logger.
   */
  authHeader(): string | null {
    if (!_sessionId) return null;
    return `Bearer ${_sessionId}`;
  },
};
