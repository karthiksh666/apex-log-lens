/**
 * Utility functions for timestamp and duration formatting.
 */

/** Format a duration in milliseconds to a human-readable string */
export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(ms < 10 ? 2 : 0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format a number with commas (e.g. 1000000 → "1,000,000") */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
