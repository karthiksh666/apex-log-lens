import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/Logger';

const execFileAsync = promisify(execFile);

export interface CliOrgInfo {
  instanceUrl: string;
  accessToken: string;
  username: string;
  orgId: string;
  alias?: string;
}

/**
 * Attempts to read org credentials from the SF CLI.
 * If the user already has `sf org display` working, they never need to
 * type a session ID — we read it transparently from the CLI's secure store.
 *
 * Returns null if the CLI is not available or not authenticated.
 */
export async function getCliOrgInfo(targetOrg?: string): Promise<CliOrgInfo | null> {
  try {
    const args = ['org', 'display', '--json'];
    if (targetOrg) args.push('--target-org', targetOrg);

    // Try `sf` first (new CLI), fall back to `sfdx`
    const result = await tryExec('sf', args)
      ?? await tryExec('sfdx', ['force:org:display', '--json', ...(targetOrg ? ['-u', targetOrg] : [])]);

    if (!result) return null;

    // SECURITY: we parse the output but never log the accessToken field
    const parsed = JSON.parse(result) as {
      result?: {
        instanceUrl?: string;
        accessToken?: string;
        username?: string;
        id?: string;
        orgId?: string;
        alias?: string;
      };
      status?: number;
    };

    if (parsed.status !== 0 || !parsed.result) return null;

    const { instanceUrl, accessToken, username, id, orgId, alias } = parsed.result;

    if (!instanceUrl || !accessToken) return null;

    logger.info(`SF CLI auth found for ${username ?? 'unknown user'} @ ${instanceUrl}`);

    return {
      instanceUrl,
      accessToken,
      username: username ?? '',
      orgId: orgId ?? id ?? '',
      alias,
    };
  } catch (err) {
    // CLI not installed or not authenticated — not an error, just unavailable
    logger.info('SF CLI not available or not authenticated');
    return null;
  }
}

/**
 * Returns a list of all authenticated org aliases from the SF CLI.
 */
export async function listCliOrgs(): Promise<Array<{ alias: string; username: string; instanceUrl: string }>> {
  try {
    const result = await tryExec('sf', ['org', 'list', '--json']);
    if (!result) return [];

    const parsed = JSON.parse(result) as {
      result?: {
        nonScratchOrgs?: Array<{ alias: string; username: string; instanceUrl: string }>;
        scratchOrgs?: Array<{ alias: string; username: string; instanceUrl: string }>;
      };
    };

    const orgs = [
      ...(parsed.result?.nonScratchOrgs ?? []),
      ...(parsed.result?.scratchOrgs ?? []),
    ];

    return orgs.map(o => ({ alias: o.alias, username: o.username, instanceUrl: o.instanceUrl }));
  } catch {
    return [];
  }
}

async function tryExec(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: 10_000,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return stdout;
  } catch {
    return null;
  }
}
