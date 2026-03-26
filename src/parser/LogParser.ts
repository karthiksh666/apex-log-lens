import { randomUUID } from 'crypto';
import { LogEventKind, LogCategory, LogSeverity } from './types';
import type {
  ParsedLog,
  ParsedEvent,
  SoqlStatement,
  DmlStatement,
  LogError,
  ExecutionUnit,
  OpenEvent,
  ParseOptions,
  UnparsedLine,
  DmlOperation,
} from './types';
import { parseLine } from './LineParser';
import { classifyEvent, renderDescription, isVerboseEventType } from './EventClassifier';
import { StackTracker, isEndType } from './StackTracker';
import { extractNamespace, parseLimitLines, mergeLimitSnapshots } from './LimitExtractor';

const DEFAULT_OPTIONS: ParseOptions = {
  includeMethodEntryExit: false,
};

/**
 * Main parser — orchestrates all sub-parsers to produce a ParsedLog
 * from raw Salesforce debug log text.
 *
 * Design: single-pass over lines. State machines handle paired events
 * (SOQL begin/end, DML begin/end, limit blocks) without backtracking.
 */
export function parseLog(
  rawText: string,
  filePath: string,
  fileSizeBytes: number,
  options: Partial<ParseOptions> = {}
): ParsedLog {
  const opts: ParseOptions = { ...DEFAULT_OPTIONS, ...options };
  const lines = rawText.split('\n');

  // ─── Mutable state ──────────────────────────────────────────────────────────
  const allEvents: ParsedEvent[] = [];
  const soqlStatements: SoqlStatement[] = [];
  const dmlStatements: DmlStatement[] = [];
  const errors: LogError[] = [];
  const unparsedLines: UnparsedLine[] = [];
  const limitSnapshots: ReturnType<typeof parseLimitLines>[] = [];

  const stack = new StackTracker();

  // Tracks open SOQL/DML events by lineNumber for begin/end matching
  const openSoql = new Map<number, { soql: SoqlStatement; nanoOffset: bigint }>();
  const openDml = new Map<number, { dml: DmlStatement; nanoOffset: bigint }>();

  // Open execution units stack (parallel to call stack, but coarser)
  const execUnitStack: ExecutionUnit[] = [];
  const rootExecUnits: ExecutionUnit[] = [];

  // Limit block accumulator
  let activeLimitNamespace: string | null = null;
  let activeLimitLines: string[] = [];

  // Nano offset of the first event — used to compute relative timestamps
  let baseNanoOffset: bigint | null = null;

  let eventCounter = 0;

  // ─── Line loop ──────────────────────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNumber = i + 1;

    // Emit progress every 5000 lines
    if (opts.onProgress && i % 5000 === 0) {
      opts.onProgress(Math.round((i / lines.length) * 100));
    }

    // If we're inside a LIMIT_USAGE_FOR_NS block, accumulate continuation lines
    if (activeLimitNamespace !== null) {
      const result = parseLine(raw, lineNumber);
      if (result.kind === 'unparsed' || result.line.eventType !== 'LIMIT_USAGE_FOR_NS') {
        // Check if the continuation line is another standard log event
        if (result.kind === 'parsed') {
          // Flush the limit block first, then process this line normally
          flushLimitBlock();
          processLine(result.line.lineNumber, raw);
        } else {
          // It's a continuation line (limit detail row)
          activeLimitLines.push(raw);
        }
        continue;
      } else {
        flushLimitBlock();
        // Fall through to process the new LIMIT_USAGE_FOR_NS line
      }
    }

    processLine(lineNumber, raw);
  }

  // Flush any remaining open limit block
  if (activeLimitNamespace !== null) {
    flushLimitBlock();
  }

  // Mark any still-open SOQL/DML as incomplete (truncated log)
  for (const { soql } of openSoql.values()) {
    soql.durationMs = null;
  }
  for (const { dml } of openDml.values()) {
    dml.durationMs = null;
  }

  // Close any still-open execution units (truncated log)
  for (const unit of stack.flushIncomplete()) {
    void unit; // already tracked in execUnitStack
  }

  // Mark N+1 SOQL queries
  markRepeatedSoql(soqlStatements);

  const governorLimits = limitSnapshots.length > 0
    ? { entries: limitSnapshots.flat(), hasWarnings: false, hasCritical: false }
    : { entries: [], hasWarnings: false, hasCritical: false };

  const mergedLimits = limitSnapshots.length > 0
    ? mergeLimitSnapshots(limitSnapshots)
    : governorLimits;

  const firstEvent = allEvents[0];
  const lastEvent = allEvents[allEvents.length - 1];
  const totalDurationMs = firstEvent && lastEvent
    ? lastEvent.timestampMs - firstEvent.timestampMs
    : null;

  const entryPoint = rootExecUnits[0]?.entryPoint ?? 'Unknown';

  return {
    filePath,
    fileSizeBytes,
    rawLineCount: lines.length,
    parsedAt: new Date(),
    allEvents,
    soqlStatements,
    dmlStatements,
    errors,
    governorLimits: mergedLimits,
    executionUnits: rootExecUnits,
    unparsedLines,
    summary: {
      entryPoint,
      totalDurationMs,
      soqlCount: soqlStatements.length,
      dmlCount: dmlStatements.length,
      errorCount: errors.length,
      totalEvents: allEvents.length,
      fileSizeBytes,
      rawLineCount: lines.length,
    },
  };

  // ─── Inner helpers ──────────────────────────────────────────────────────────

  function processLine(lineNumber: number, raw: string): void {
    const result = parseLine(raw, lineNumber);

    if (result.kind === 'unparsed') {
      unparsedLines.push(result.line);
      return;
    }

    const { line } = result;

    // Set base offset on first parseable event
    if (baseNanoOffset === null) {
      baseNanoOffset = line.nanoOffset;
    }

    const classification = classifyEvent(line.eventType);
    const timestampMs = Number(line.nanoOffset - baseNanoOffset!) / 1_000_000;

    // ── Skip verbose events unless opted in ────────────────────────────────
    if (!opts.includeMethodEntryExit && isVerboseEventType(line.eventType)) {
      // Still need to push/pop stack for depth tracking
      if (classification.kind === LogEventKind.BEGIN) {
        stack.push({
          eventType: line.eventType,
          lineNumber,
          nanoOffset: line.nanoOffset,
          wallTime: line.wallTime,
          fields: line.fields,
          raw,
          stackDepth: stack.depth,
        });
      } else if (classification.kind === LogEventKind.END || isEndType(line.eventType)) {
        stack.pop(line.eventType, line.nanoOffset);
      }
      return;
    }

    // ── LIMIT_USAGE_FOR_NS: start accumulating ─────────────────────────────
    if (line.eventType === 'LIMIT_USAGE_FOR_NS') {
      activeLimitNamespace = extractNamespace(line.fields);
      activeLimitLines = [];
      // Still emit an event for the Timeline
    }

    // ── Handle stack ────────────────────────────────────────────────────────
    let durationMs: number | null = null;
    let endLineNumber: number | null = null;
    const currentDepth = stack.depth;

    if (classification.kind === LogEventKind.BEGIN) {
      const openEvent: OpenEvent = {
        eventType: line.eventType,
        lineNumber,
        nanoOffset: line.nanoOffset,
        wallTime: line.wallTime,
        fields: line.fields,
        raw,
        stackDepth: currentDepth,
      };
      stack.push(openEvent);
    } else if (classification.kind === LogEventKind.END || isEndType(line.eventType)) {
      const result = stack.pop(line.eventType, line.nanoOffset);
      if (result) {
        durationMs = result.durationMs;
        endLineNumber = lineNumber;
        // Patch the corresponding BEGIN event's duration and endLineNumber
        patchBeginEvent(result.openEvent.lineNumber, durationMs, endLineNumber);
      }
    }

    const description = renderDescription(classification.descriptionTemplate, line.fields);
    const id = `evt-${++eventCounter}`;

    const event: ParsedEvent = {
      id,
      lineNumber,
      wallTime: line.wallTime,
      timestampMs,
      eventType: line.eventType,
      category: classification.category,
      severity: classification.severity,
      kind: classification.kind,
      label: classification.label,
      description,
      fields: line.fields,
      raw: line.raw,
      stackDepth: currentDepth,
      durationMs,
      endLineNumber,
    };

    allEvents.push(event);

    // ── Specialised collectors ──────────────────────────────────────────────
    handleSoql(event, line.nanoOffset);
    handleDml(event, line.nanoOffset);
    handleError(event);
    handleExecutionUnit(event, line.nanoOffset);
  }

  function handleSoql(event: ParsedEvent, nanoOffset: bigint): void {
    if (event.eventType === 'SOQL_EXECUTE_BEGIN') {
      // fields: [lineRef, query]
      const query = event.fields[1] ?? '';
      const soql: SoqlStatement = {
        id: `soql-${soqlStatements.length + 1}`,
        lineNumber: event.lineNumber,
        wallTime: event.wallTime,
        timestampMs: event.timestampMs,
        query,
        rowsReturned: null,
        durationMs: null,
        endLineNumber: null,
        isRepeated: false,
      };
      soqlStatements.push(soql);
      openSoql.set(event.lineNumber, { soql, nanoOffset });
    }

    if (event.eventType === 'SOQL_EXECUTE_END') {
      // Find the most recent open SOQL
      const entries = Array.from(openSoql.entries());
      if (entries.length > 0) {
        const [beginLine, { soql, nanoOffset: beginNano }] = entries[entries.length - 1];
        const rowsField = event.fields[1] ?? '0';
        // Field format is either "Rows:5" or plain "5"
        const rowsStr = rowsField.startsWith('Rows:') ? rowsField.slice(5) : rowsField;
        soql.rowsReturned = parseInt(rowsStr, 10) || 0;
        soql.durationMs = Number(nanoOffset - beginNano) / 1_000_000;
        soql.endLineNumber = event.lineNumber;
        openSoql.delete(beginLine);
      }
    }
  }

  function handleDml(event: ParsedEvent, nanoOffset: bigint): void {
    if (event.eventType === 'DML_BEGIN') {
      // fields: [lineRef, Op:Insert, Type:Contact, Rows:1]
      const opField = event.fields[1] ?? '';
      const typeField = event.fields[2] ?? '';
      const rowsField = event.fields[3] ?? '';

      const operation = parseDmlOperation(opField);
      const objectType = typeField.startsWith('Type:') ? typeField.slice(5) : typeField;
      const rowsAffected = rowsField.startsWith('Rows:') ? parseInt(rowsField.slice(5), 10) : null;

      const dml: DmlStatement = {
        id: `dml-${dmlStatements.length + 1}`,
        lineNumber: event.lineNumber,
        wallTime: event.wallTime,
        timestampMs: event.timestampMs,
        operation,
        objectType,
        rowsAffected,
        durationMs: null,
        endLineNumber: null,
      };
      dmlStatements.push(dml);
      openDml.set(event.lineNumber, { dml, nanoOffset });
    }

    if (event.eventType === 'DML_END') {
      const entries = Array.from(openDml.entries());
      if (entries.length > 0) {
        const [beginLine, { dml, nanoOffset: beginNano }] = entries[entries.length - 1];
        dml.durationMs = Number(nanoOffset - beginNano) / 1_000_000;
        dml.endLineNumber = event.lineNumber;
        openDml.delete(beginLine);
      }
    }
  }

  function handleError(event: ParsedEvent): void {
    if (
      event.eventType === 'FATAL_ERROR' ||
      event.eventType === 'EXCEPTION_THROWN'
    ) {
      errors.push({
        id: `err-${errors.length + 1}`,
        lineNumber: event.lineNumber,
        wallTime: event.wallTime,
        timestampMs: event.timestampMs,
        isFatal: event.eventType === 'FATAL_ERROR',
        message: event.fields[0] ?? event.description,
        stackTrace: event.fields[1] ?? null,
      });
    }
  }

  function handleExecutionUnit(event: ParsedEvent, _nanoOffset: bigint): void {
    if (event.eventType === 'CODE_UNIT_STARTED') {
      // fields: [lineRef, entryPoint]
      const entryPoint = event.fields[1] ?? event.fields[0] ?? 'Unknown';
      const unit: ExecutionUnit = {
        id: `unit-${rootExecUnits.length + execUnitStack.length + 1}`,
        lineNumber: event.lineNumber,
        name: entryPoint,
        entryPoint,
        durationMs: null,
        soqlCount: 0,
        dmlCount: 0,
        errorCount: 0,
        children: [],
      };

      if (execUnitStack.length > 0) {
        execUnitStack[execUnitStack.length - 1].children.push(unit);
      } else {
        rootExecUnits.push(unit);
      }
      execUnitStack.push(unit);
    }

    if (event.eventType === 'CODE_UNIT_FINISHED') {
      const unit = execUnitStack.pop();
      if (unit && event.durationMs !== null) {
        unit.durationMs = event.durationMs;
      }
    }

    // Tally SOQL/DML/errors into the current execution unit
    const currentUnit = execUnitStack[execUnitStack.length - 1];
    if (currentUnit) {
      if (event.eventType === 'SOQL_EXECUTE_BEGIN') {
        currentUnit.soqlCount++;
      }
      if (event.eventType === 'DML_BEGIN') {
        currentUnit.dmlCount++;
      }
      if (event.eventType === 'FATAL_ERROR' || event.eventType === 'EXCEPTION_THROWN') {
        currentUnit.errorCount++;
      }
    }
  }

  function flushLimitBlock(): void {
    if (activeLimitNamespace !== null && activeLimitLines.length > 0) {
      const entries = parseLimitLines(activeLimitNamespace, activeLimitLines);
      if (entries.length > 0) {
        limitSnapshots.push(entries);
      }
    }
    activeLimitNamespace = null;
    activeLimitLines = [];
  }

  /** Find a BEGIN event in allEvents by line number and patch its duration. */
  function patchBeginEvent(beginLineNumber: number, durationMs: number, endLineNumber: number): void {
    // Scan from the end since BEGIN events are usually recent
    for (let i = allEvents.length - 1; i >= 0; i--) {
      if (allEvents[i].lineNumber === beginLineNumber) {
        allEvents[i] = { ...allEvents[i], durationMs, endLineNumber };
        return;
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDmlOperation(opField: string): DmlOperation {
  const op = opField.startsWith('Op:') ? opField.slice(3) : opField;
  const valid: DmlOperation[] = ['Insert', 'Update', 'Delete', 'Upsert', 'Undelete', 'Merge'];
  return (valid.find((v) => v.toLowerCase() === op.toLowerCase()) as DmlOperation) ?? 'Unknown';
}

function markRepeatedSoql(statements: SoqlStatement[]): void {
  const seen = new Map<string, number>();
  for (const s of statements) {
    const normalized = s.query.trim().toLowerCase();
    seen.set(normalized, (seen.get(normalized) ?? 0) + 1);
  }
  for (const s of statements) {
    const normalized = s.query.trim().toLowerCase();
    if ((seen.get(normalized) ?? 0) > 1) {
      s.isRepeated = true;
    }
  }
}
