import type { GovernorLimits, LimitEntry, LimitSeverity } from './types';

/**
 * Extracts governor limit data from LIMIT_USAGE_FOR_NS log lines.
 *
 * A LIMIT_USAGE_FOR_NS block looks like:
 *   15:20:23.465 (890123456)|LIMIT_USAGE_FOR_NS|(default)|
 *     SOQL queries: 3 out of 100
 *     SOQL rows: 150 out of 50000
 *     ...
 *
 * The lines after the header are continuation lines (not standard log format).
 * The LogParser feeds them here as raw strings.
 */

// Known display names for common limit keys
const DISPLAY_NAMES: Record<string, string> = {
  'SOQL queries': 'SOQL Queries',
  'SOQL rows': 'SOQL Rows',
  'SOSL queries': 'SOSL Queries',
  'DML statements': 'DML Statements',
  'DML rows': 'DML Rows',
  'CPU time': 'CPU Time (ms)',
  'MobileApex CPU time': 'Mobile Apex CPU Time (ms)',
  'Heap size': 'Heap Size (bytes)',
  'Callouts': 'Callouts',
  'Email invocations': 'Email Invocations',
  'Future calls': 'Future Calls',
  'Jobs added to queue': 'Queueable Jobs',
  'Push notifications': 'Push Notifications',
};

// Matches: "  SOQL queries: 3 out of 100"
const LIMIT_LINE_PATTERN = /^\s*(.+?):\s*(\d+)\s+out of\s+(\d+)\s*$/;

// Matches the namespace from LIMIT_USAGE_FOR_NS fields: "(default)" or "MyNS"
// The namespace is in fields[0] of the parsed LIMIT_USAGE_FOR_NS line
export function extractNamespace(fields: string[]): string {
  return fields[0]?.trim() || '(default)';
}

/**
 * Parse a block of continuation lines (the lines that follow LIMIT_USAGE_FOR_NS)
 * into structured LimitEntry objects.
 */
export function parseLimitLines(namespace: string, continuationLines: string[]): LimitEntry[] {
  const entries: LimitEntry[] = [];

  for (const line of continuationLines) {
    const match = LIMIT_LINE_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const [, name, usedStr, maxStr] = match;
    const used = parseInt(usedStr, 10);
    const max = parseInt(maxStr, 10);

    if (isNaN(used) || isNaN(max) || max === 0) {
      continue;
    }

    const percentUsed = Math.round((used / max) * 100);

    entries.push({
      name: name.trim(),
      displayName: DISPLAY_NAMES[name.trim()] ?? name.trim(),
      namespace,
      used,
      max,
      percentUsed,
      severity: computeSeverity(percentUsed),
    });
  }

  return entries;
}

/**
 * Merge multiple limit snapshots (there can be several LIMIT_USAGE_FOR_NS
 * blocks in a single log). The last snapshot for each namespace+name wins,
 * since it reflects the highest usage point.
 */
export function mergeLimitSnapshots(snapshots: LimitEntry[][]): GovernorLimits {
  const map = new Map<string, LimitEntry>();

  for (const snapshot of snapshots) {
    for (const entry of snapshot) {
      const key = `${entry.namespace}::${entry.name}`;
      const existing = map.get(key);
      // Keep whichever has higher usage (worst case)
      if (!existing || entry.used > existing.used) {
        map.set(key, entry);
      }
    }
  }

  const entries = Array.from(map.values()).sort((a, b) => b.percentUsed - a.percentUsed);

  return {
    entries,
    hasWarnings: entries.some((e) => e.severity === 'warning'),
    hasCritical: entries.some((e) => e.severity === 'critical'),
  };
}

function computeSeverity(percentUsed: number): LimitSeverity {
  if (percentUsed >= 80) {
    return 'critical';
  }
  if (percentUsed >= 50) {
    return 'warning';
  }
  return 'ok';
}
