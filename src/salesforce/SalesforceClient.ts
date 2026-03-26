import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { OrgSession } from './OrgSession';
import { logger } from '../utils/Logger';

export class SalesforceApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'SalesforceApiError';
  }
}

/**
 * Thin HTTPS wrapper for the Salesforce REST API.
 *
 * SECURITY:
 * - Never logs the Authorization header or session ID.
 * - All requests go over HTTPS with certificate validation enabled.
 * - Throws SalesforceApiError on 401 so callers can prompt reconnect.
 */
export const SalesforceClient = {
  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, body);
  },
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const instanceUrl = OrgSession.instanceUrl;
  const authHeader = OrgSession.authHeader();

  if (!instanceUrl || !authHeader) {
    throw new SalesforceApiError('Not connected to a Salesforce org.', 401);
  }

  const url = new URL(path, instanceUrl);

  const requestBody = body ? JSON.stringify(body) : undefined;

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method,
    headers: {
      // SECURITY: Authorization header is set here only — never logged
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(requestBody ? { 'Content-Length': Buffer.byteLength(requestBody) } : {}),
    },
    // Certificate validation is ON (default) — never set rejectUnauthorized: false
  };

  // Log the request path only — never the headers (which contain the token)
  logger.info(`SF API ${method} ${url.pathname}`);

  return new Promise<T>((resolve, reject) => {
    const req = https.request(options, (res: http.IncomingMessage) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => chunks.push(chunk));

      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');

        if (res.statusCode === 401) {
          OrgSession.disconnect();
          reject(new SalesforceApiError('Session expired. Please reconnect.', 401, 'INVALID_SESSION_ID'));
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          let errorMsg = `HTTP ${res.statusCode}`;
          let errorCode: string | undefined;
          try {
            const parsed = JSON.parse(raw) as Array<{ message: string; errorCode: string }>;
            errorMsg = parsed[0]?.message ?? errorMsg;
            errorCode = parsed[0]?.errorCode;
          } catch { /* raw text error */ }
          reject(new SalesforceApiError(errorMsg, res.statusCode, errorCode));
          return;
        }

        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new SalesforceApiError(`Invalid JSON response from ${url.pathname}`, 500));
        }
      });
    });

    req.on('error', (err: Error) => {
      reject(new SalesforceApiError(`Network error: ${err.message}`, 0));
    });

    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new SalesforceApiError('Request timed out after 30s.', 0));
    });

    if (requestBody) req.write(requestBody);
    req.end();
  });
}
