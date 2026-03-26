import { parseLimitLines, mergeLimitSnapshots } from '../../../src/parser/LimitExtractor';

const SAMPLE_LINES = [
  '  SOQL queries: 3 out of 100',
  '  SOQL rows: 150 out of 50000',
  '  DML statements: 1 out of 150',
  '  CPU time: 450 out of 10000',
  '  Heap size: 200000 out of 6000000',
];

describe('parseLimitLines', () => {
  let entries: ReturnType<typeof parseLimitLines>;

  beforeAll(() => {
    entries = parseLimitLines('(default)', SAMPLE_LINES);
  });

  test('parses all valid lines', () => {
    expect(entries).toHaveLength(5);
  });

  test('parses used and max correctly', () => {
    const soql = entries.find((e) => e.name === 'SOQL queries')!;
    expect(soql.used).toBe(3);
    expect(soql.max).toBe(100);
    expect(soql.percentUsed).toBe(3);
  });

  test('assigns ok severity when under 50%', () => {
    const soql = entries.find((e) => e.name === 'SOQL queries')!;
    expect(soql.severity).toBe('ok');
  });

  test('assigns warning severity when between 50% and 80%', () => {
    // CPU: 450/10000 = 4.5% — ok. Let me test a warning case explicitly
    const cpu = parseLimitLines('(default)', ['  CPU time: 6000 out of 10000']);
    expect(cpu[0].severity).toBe('warning');
    expect(cpu[0].percentUsed).toBe(60);
  });

  test('assigns critical severity when over 80%', () => {
    const entries = parseLimitLines('(default)', ['  DML statements: 130 out of 150']);
    expect(entries[0].severity).toBe('critical');
  });

  test('ignores lines that do not match the pattern', () => {
    const lines = ['garbage line', '  SOQL queries: 1 out of 100'];
    const result = parseLimitLines('(default)', lines);
    expect(result).toHaveLength(1);
  });

  test('sets the namespace correctly', () => {
    const result = parseLimitLines('MyPackage', ['  SOQL queries: 1 out of 100']);
    expect(result[0].namespace).toBe('MyPackage');
  });
});

describe('mergeLimitSnapshots', () => {
  test('keeps highest usage when same limit appears in multiple snapshots', () => {
    const snap1 = parseLimitLines('(default)', ['  SOQL queries: 1 out of 100']);
    const snap2 = parseLimitLines('(default)', ['  SOQL queries: 5 out of 100']);
    const merged = mergeLimitSnapshots([snap1, snap2]);
    const soql = merged.entries.find((e) => e.name === 'SOQL queries')!;
    expect(soql.used).toBe(5);
  });

  test('sets hasWarnings and hasCritical flags correctly', () => {
    const snap = parseLimitLines('(default)', [
      '  SOQL queries: 85 out of 100',
    ]);
    const merged = mergeLimitSnapshots([snap]);
    expect(merged.hasCritical).toBe(true);
    expect(merged.hasWarnings).toBe(false);
  });

  test('handles empty snapshots array', () => {
    const merged = mergeLimitSnapshots([]);
    expect(merged.entries).toHaveLength(0);
    expect(merged.hasWarnings).toBe(false);
    expect(merged.hasCritical).toBe(false);
  });
});
