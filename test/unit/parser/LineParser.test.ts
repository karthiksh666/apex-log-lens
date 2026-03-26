import { parseLine, wallTimeToMs } from '../../../src/parser/LineParser';

describe('parseLine', () => {
  test('parses a well-formed log line', () => {
    const raw = "15:20:23.456 (123456789)|SOQL_EXECUTE_BEGIN|[12]|SELECT Id FROM Account";
    const result = parseLine(raw, 1);

    expect(result.kind).toBe('parsed');
    if (result.kind !== 'parsed') return;

    expect(result.line.wallTime).toBe('15:20:23.456');
    expect(result.line.nanoOffset).toBe(BigInt(123456789));
    expect(result.line.eventType).toBe('SOQL_EXECUTE_BEGIN');
    expect(result.line.fields).toEqual(['[12]', 'SELECT Id FROM Account']);
    expect(result.line.lineNumber).toBe(1);
  });

  test('parses a line with no payload fields', () => {
    const raw = "15:20:23.0 (100000)|EXECUTION_STARTED";
    const result = parseLine(raw, 5);

    expect(result.kind).toBe('parsed');
    if (result.kind !== 'parsed') return;
    expect(result.line.eventType).toBe('EXECUTION_STARTED');
    expect(result.line.fields).toEqual([]);
  });

  test('returns unparsed for a non-matching line', () => {
    const raw = "This is not a log line";
    const result = parseLine(raw, 3);
    expect(result.kind).toBe('unparsed');
    if (result.kind !== 'unparsed') return;
    expect(result.line.lineNumber).toBe(3);
    expect(result.line.raw).toBe(raw);
  });

  test('returns unparsed for an empty line', () => {
    expect(parseLine('', 1).kind).toBe('unparsed');
  });

  test('handles very large nano offsets', () => {
    const raw = "15:20:23.456 (9999999999999)|USER_DEBUG|[1]|DEBUG|Hello";
    const result = parseLine(raw, 1);
    expect(result.kind).toBe('parsed');
    if (result.kind !== 'parsed') return;
    expect(result.line.nanoOffset).toBe(BigInt('9999999999999'));
  });
});

describe('wallTimeToMs', () => {
  test('converts HH:MM:SS.mmm to milliseconds', () => {
    expect(wallTimeToMs('00:00:00.000')).toBe(0);
    expect(wallTimeToMs('00:00:01.000')).toBe(1000);
    expect(wallTimeToMs('00:01:00.000')).toBe(60000);
    expect(wallTimeToMs('01:00:00.000')).toBe(3600000);
    expect(wallTimeToMs('15:20:23.456')).toBe(15 * 3600000 + 20 * 60000 + 23 * 1000 + 456);
  });
});
