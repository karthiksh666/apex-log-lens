import { classifyEvent, renderDescription, isVerboseEventType } from '../../../src/parser/EventClassifier';
import { LogCategory, LogSeverity, LogEventKind } from '../../../src/parser/types';

describe('classifyEvent', () => {
  test('classifies SOQL_EXECUTE_BEGIN correctly', () => {
    const c = classifyEvent('SOQL_EXECUTE_BEGIN');
    expect(c.category).toBe(LogCategory.DB);
    expect(c.severity).toBe(LogSeverity.DEBUG);
    expect(c.kind).toBe(LogEventKind.BEGIN);
    expect(c.label).toBe('SOQL Query');
  });

  test('classifies FATAL_ERROR correctly', () => {
    const c = classifyEvent('FATAL_ERROR');
    expect(c.category).toBe(LogCategory.APEX_CODE);
    expect(c.severity).toBe(LogSeverity.FATAL);
    expect(c.kind).toBe(LogEventKind.FATAL);
  });

  test('classifies DML_BEGIN correctly', () => {
    const c = classifyEvent('DML_BEGIN');
    expect(c.category).toBe(LogCategory.DB);
    expect(c.kind).toBe(LogEventKind.BEGIN);
  });

  test('classifies EXECUTION_STARTED correctly', () => {
    const c = classifyEvent('EXECUTION_STARTED');
    expect(c.category).toBe(LogCategory.EXECUTION);
    expect(c.kind).toBe(LogEventKind.BEGIN);
  });

  test('returns UNKNOWN category for unrecognised event types', () => {
    const c = classifyEvent('SOME_FUTURE_EVENT_TYPE');
    expect(c.category).toBe(LogCategory.UNKNOWN);
    expect(c.kind).toBe(LogEventKind.POINT);
  });
});

describe('renderDescription', () => {
  test('substitutes {field0}, {field1} tokens', () => {
    const result = renderDescription('Query: {field0} returned {field1} rows', ['SELECT Id', '5']);
    expect(result).toBe('Query: SELECT Id returned 5 rows');
  });

  test('leaves missing fields as empty string', () => {
    const result = renderDescription('{field0} - {field1}', ['only']);
    expect(result).toBe('only -');
  });

  test('returns template unchanged when no tokens', () => {
    const result = renderDescription('No tokens here', []);
    expect(result).toBe('No tokens here');
  });
});

describe('isVerboseEventType', () => {
  test('marks METHOD_ENTRY as verbose', () => {
    expect(isVerboseEventType('METHOD_ENTRY')).toBe(true);
  });

  test('marks METHOD_EXIT as verbose', () => {
    expect(isVerboseEventType('METHOD_EXIT')).toBe(true);
  });

  test('does not mark SOQL_EXECUTE_BEGIN as verbose', () => {
    expect(isVerboseEventType('SOQL_EXECUTE_BEGIN')).toBe(false);
  });

  test('does not mark USER_DEBUG as verbose', () => {
    expect(isVerboseEventType('USER_DEBUG')).toBe(false);
  });
});
