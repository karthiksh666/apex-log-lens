import { StackTracker } from '../../../src/parser/StackTracker';
import type { OpenEvent } from '../../../src/parser/types';

function makeEvent(eventType: string, nanoOffset: bigint, lineNumber = 1): OpenEvent {
  return { eventType, lineNumber, nanoOffset, wallTime: '00:00:00.000', fields: [], raw: '', stackDepth: 0 };
}

describe('StackTracker', () => {
  let tracker: StackTracker;

  beforeEach(() => { tracker = new StackTracker(); });

  test('depth starts at 0', () => {
    expect(tracker.depth).toBe(0);
  });

  test('depth increases after push', () => {
    tracker.push(makeEvent('SOQL_EXECUTE_BEGIN', BigInt(100)));
    expect(tracker.depth).toBe(1);
    tracker.push(makeEvent('DML_BEGIN', BigInt(200)));
    expect(tracker.depth).toBe(2);
  });

  test('pop matches BEGIN event and computes duration', () => {
    tracker.push(makeEvent('SOQL_EXECUTE_BEGIN', BigInt(1_000_000)));
    const result = tracker.pop('SOQL_EXECUTE_END', BigInt(2_000_000));
    expect(result).not.toBeNull();
    // 1_000_000 ns = 1 ms
    expect(result!.durationMs).toBeCloseTo(1, 5);
    expect(result!.openEvent.eventType).toBe('SOQL_EXECUTE_BEGIN');
    expect(tracker.depth).toBe(0);
  });

  test('pop returns null when no matching BEGIN exists', () => {
    const result = tracker.pop('SOQL_EXECUTE_END', BigInt(999));
    expect(result).toBeNull();
  });

  test('matches innermost BEGIN for nested same-type events', () => {
    tracker.push(makeEvent('CODE_UNIT_STARTED', BigInt(100), 1));
    tracker.push(makeEvent('CODE_UNIT_STARTED', BigInt(200), 2));
    const result = tracker.pop('CODE_UNIT_FINISHED', BigInt(300));
    expect(result!.openEvent.lineNumber).toBe(2); // innermost
    expect(tracker.depth).toBe(1); // outer still open
  });

  test('flushIncomplete returns remaining open events and clears stack', () => {
    tracker.push(makeEvent('EXECUTION_STARTED', BigInt(100)));
    tracker.push(makeEvent('CODE_UNIT_STARTED', BigInt(200)));
    const remaining = tracker.flushIncomplete();
    expect(remaining).toHaveLength(2);
    expect(tracker.depth).toBe(0);
    expect(tracker.hasOpenEvents).toBe(false);
  });

  test('handles METHOD_ENTRY/EXIT pair', () => {
    tracker.push(makeEvent('METHOD_ENTRY', BigInt(500_000)));
    const result = tracker.pop('METHOD_EXIT', BigInt(1_500_000));
    expect(result).not.toBeNull();
    expect(result!.durationMs).toBeCloseTo(1, 5);
  });

  test('handles CALLOUT_REQUEST/RESPONSE irregular pair', () => {
    tracker.push(makeEvent('CALLOUT_REQUEST', BigInt(0)));
    const result = tracker.pop('CALLOUT_RESPONSE', BigInt(50_000_000));
    expect(result).not.toBeNull();
    expect(result!.openEvent.eventType).toBe('CALLOUT_REQUEST');
  });
});
