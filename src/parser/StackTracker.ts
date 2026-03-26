import { LogEventKind } from './types';
import type { OpenEvent } from './types';

/**
 * Tracks open BEGIN events and matches them with their corresponding END events
 * to compute nesting depth and duration.
 *
 * Salesforce logs can be truncated (at the 2MB limit), so unmatched BEGIN events
 * are flushed at end-of-file as incomplete events with null duration.
 */
export class StackTracker {
  private stack: OpenEvent[] = [];

  /** Current nesting depth (0 = top level) */
  get depth(): number {
    return this.stack.length;
  }

  /**
   * Push a BEGIN event onto the stack.
   * Call this when you encounter a BEGIN-kind event.
   */
  push(event: OpenEvent): void {
    this.stack.push(event);
  }

  /**
   * Pop a matching BEGIN event from the stack when an END event arrives.
   *
   * Matching strategy: find the most recent open event with the same event type
   * base (e.g. SOQL_EXECUTE_BEGIN matches SOQL_EXECUTE_END).
   *
   * Returns the matched open event, or null if no match found.
   * Duration in ms is computed from the nanoOffset difference.
   */
  pop(endEventType: string, endNanoOffset: bigint): { openEvent: OpenEvent; durationMs: number } | null {
    const beginType = endToBeginType(endEventType);
    if (!beginType) {
      return null;
    }

    // Search from top of stack downward (innermost first)
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].eventType === beginType) {
        const openEvent = this.stack.splice(i, 1)[0];
        const nanoDiff = endNanoOffset - openEvent.nanoOffset;
        // Convert nanoseconds → milliseconds (keep 3 decimal places precision)
        const durationMs = Number(nanoDiff) / 1_000_000;
        return { openEvent, durationMs };
      }
    }

    return null;
  }

  /**
   * At end-of-file, return all still-open events (incomplete due to truncation).
   * Clears the stack.
   */
  flushIncomplete(): OpenEvent[] {
    const remaining = [...this.stack];
    this.stack = [];
    return remaining;
  }

  /** True if there are any unclosed BEGIN events on the stack */
  get hasOpenEvents(): boolean {
    return this.stack.length > 0;
  }
}

/** Maps an END event type to its corresponding BEGIN event type. */
function endToBeginType(endType: string): string | null {
  // Most follow the pattern FOO_END → FOO_BEGIN or FOO_EXIT → FOO_ENTRY
  const suffixMap: Record<string, string> = {
    _END: '_BEGIN',
    _EXIT: '_ENTRY',
    _FINISHED: '_STARTED',
  };

  for (const [endSuffix, beginSuffix] of Object.entries(suffixMap)) {
    if (endType.endsWith(endSuffix)) {
      return endType.slice(0, -endSuffix.length) + beginSuffix;
    }
  }

  // Explicit overrides for irregular pairs
  const explicitMap: Record<string, string> = {
    VALIDATION_PASS: 'VALIDATION_RULE',
    VALIDATION_FAIL: 'VALIDATION_RULE',
    CALLOUT_RESPONSE: 'CALLOUT_REQUEST',
  };

  return explicitMap[endType] ?? null;
}

/**
 * Determine the LogEventKind from the classifier and derive the open/close
 * relationship without needing to import the full classifier.
 *
 * This helper is used by the LogParser to decide whether to push/pop the stack.
 */
export function isEndType(eventType: string): boolean {
  return endToBeginType(eventType) !== null;
}
