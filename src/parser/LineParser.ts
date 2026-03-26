import type { RawLogLine, UnparsedLine } from './types';

/**
 * Tokenizes a single raw log line into its constituent parts.
 *
 * Salesforce log line format:
 *   HH:MM:SS.mmm (nnnnnnnnn)|EVENT_TYPE|field1|field2|...
 *
 * Some lines (e.g. stack trace continuations, log header) do not match this
 * pattern and are returned as UnparsedLine.
 */

// Matches: "15:20:23.456 (123456789)|EVENT_TYPE" with optional payload
const LINE_PATTERN = /^(\d{2}:\d{2}:\d{2}\.\d+)\s+\((\d+)\)\|([A-Z_]+[A-Z0-9_]*)(?:\|(.*))?$/;

export type ParseLineResult =
  | { kind: 'parsed'; line: RawLogLine }
  | { kind: 'unparsed'; line: UnparsedLine };

export function parseLine(raw: string, lineNumber: number): ParseLineResult {
  const match = LINE_PATTERN.exec(raw);

  if (!match) {
    return { kind: 'unparsed', line: { lineNumber, raw } };
  }

  const [, wallTime, nanoStr, eventType, payload] = match;

  // Split the payload on pipe — Salesforce fields are pipe-delimited
  const fields = payload ? payload.split('|') : [];

  return {
    kind: 'parsed',
    line: {
      lineNumber,
      wallTime,
      nanoOffset: BigInt(nanoStr),
      eventType,
      fields,
      raw,
    },
  };
}

/**
 * Parses the wall-clock time string into milliseconds since midnight.
 * Used only for display; duration math uses nanoOffset.
 */
export function wallTimeToMs(wallTime: string): number {
  const [hms, ms] = wallTime.split('.');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3_600_000 + m * 60_000 + s * 1_000 + parseInt(ms.padEnd(3, '0').slice(0, 3), 10);
}
