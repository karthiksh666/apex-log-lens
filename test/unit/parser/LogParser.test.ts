import { parseLog } from '../../../src/parser/LogParser';
import { LogCategory, LogSeverity } from '../../../src/parser/types';

const SAMPLE_LOG = `15:20:23.0 (100000)|EXECUTION_STARTED
15:20:23.1 (200000)|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex
15:20:23.2 (300000)|SOQL_EXECUTE_BEGIN|[12]|SELECT Id FROM Account WHERE Name = 'Test'
15:20:23.3 (400000)|SOQL_EXECUTE_END|[12]|Rows:5
15:20:23.4 (500000)|DML_BEGIN|[15]|Op:Insert|Type:Contact|Rows:1
15:20:23.5 (600000)|DML_END|[15]
15:20:23.6 (700000)|FATAL_ERROR|System.NullPointerException: Attempt to de-reference a null object
15:20:23.7 (800000)|CODE_UNIT_FINISHED|execute_anonymous_apex
15:20:23.8 (900000)|EXECUTION_FINISHED`;

describe('parseLog', () => {
  let result: ReturnType<typeof parseLog>;

  beforeAll(() => {
    result = parseLog(SAMPLE_LOG, '/test/test.log', 1024);
  });

  test('parses events from all lines', () => {
    expect(result.allEvents.length).toBeGreaterThan(0);
  });

  test('extracts 1 SOQL statement', () => {
    expect(result.soqlStatements).toHaveLength(1);
    expect(result.soqlStatements[0].query).toContain('SELECT Id FROM Account');
    expect(result.soqlStatements[0].rowsReturned).toBe(5);
  });

  test('computes SOQL duration', () => {
    const soql = result.soqlStatements[0];
    // (400000 - 300000) ns = 100000 ns = 0.1 ms
    expect(soql.durationMs).toBeCloseTo(0.1, 2);
  });

  test('extracts 1 DML statement', () => {
    expect(result.dmlStatements).toHaveLength(1);
    const dml = result.dmlStatements[0];
    expect(dml.operation).toBe('Insert');
    expect(dml.objectType).toBe('Contact');
    expect(dml.rowsAffected).toBe(1);
  });

  test('extracts 1 fatal error', () => {
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].isFatal).toBe(true);
    expect(result.errors[0].message).toContain('NullPointerException');
  });

  test('populates summary', () => {
    expect(result.summary.soqlCount).toBe(1);
    expect(result.summary.dmlCount).toBe(1);
    expect(result.summary.errorCount).toBe(1);
    expect(result.summary.entryPoint).toBe('execute_anonymous_apex');
  });

  test('has no unparsed lines for well-formed log', () => {
    expect(result.unparsedLines).toHaveLength(0);
  });

  test('execution units are populated', () => {
    expect(result.executionUnits.length).toBeGreaterThan(0);
    expect(result.executionUnits[0].entryPoint).toBe('execute_anonymous_apex');
  });
});

describe('parseLog — N+1 detection', () => {
  const repeatedLog = `15:20:23.0 (100000)|EXECUTION_STARTED
15:20:23.1 (200000)|SOQL_EXECUTE_BEGIN|[1]|SELECT Id FROM Account
15:20:23.2 (300000)|SOQL_EXECUTE_END|[1]|Rows:1
15:20:23.3 (400000)|SOQL_EXECUTE_BEGIN|[2]|SELECT Id FROM Account
15:20:23.4 (500000)|SOQL_EXECUTE_END|[2]|Rows:1
15:20:23.5 (600000)|EXECUTION_FINISHED`;

  test('marks repeated SOQL queries', () => {
    const r = parseLog(repeatedLog, '/test.log', 256);
    expect(r.soqlStatements).toHaveLength(2);
    expect(r.soqlStatements[0].isRepeated).toBe(true);
    expect(r.soqlStatements[1].isRepeated).toBe(true);
  });
});

describe('parseLog — empty input', () => {
  test('handles empty string without crashing', () => {
    const r = parseLog('', '/empty.log', 0);
    expect(r.allEvents).toHaveLength(0);
    expect(r.soqlStatements).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
  });
});

describe('parseLog — malformed lines', () => {
  test('tolerates non-matching lines', () => {
    const log = `not a log line at all
15:20:23.0 (100000)|EXECUTION_STARTED
another bad line`;
    const r = parseLog(log, '/test.log', 64);
    expect(r.unparsedLines).toHaveLength(2);
    expect(r.allEvents.length).toBeGreaterThan(0);
  });
});
