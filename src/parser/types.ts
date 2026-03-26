/**
 * All type definitions for the parser layer.
 * These are the contracts between the parser, model, and UI layers.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum LogCategory {
  APEX_CODE = 'APEX_CODE',
  DB = 'DB',
  SYSTEM = 'SYSTEM',
  CALLOUT = 'CALLOUT',
  VALIDATION = 'VALIDATION',
  VISUALFORCE = 'VISUALFORCE',
  WORKFLOW = 'WORKFLOW',
  PROFILING = 'PROFILING',
  NBA = 'NBA',
  LIMITS = 'LIMITS',
  EXECUTION = 'EXECUTION',
  UNKNOWN = 'UNKNOWN',
}

export enum LogSeverity {
  FINEST = 'FINEST',
  FINER = 'FINER',
  FINE = 'FINE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

/** Whether this event is a standalone point, the start of a pair, the end of a pair, or a fatal. */
export enum LogEventKind {
  POINT = 'POINT',
  BEGIN = 'BEGIN',
  END = 'END',
  FATAL = 'FATAL',
}

// ─── Parsed line ─────────────────────────────────────────────────────────────

/** Raw data extracted from a single log line before classification. */
export interface RawLogLine {
  /** 1-based line number in the original file */
  lineNumber: number;
  /** Wall-clock time string, e.g. "15:20:23.456" */
  wallTime: string;
  /** Nanosecond offset from execution start */
  nanoOffset: bigint;
  /** Raw event type string, e.g. "SOQL_EXECUTE_BEGIN" */
  eventType: string;
  /** Everything after the event type, pipe-split */
  fields: string[];
  /** The full original line text */
  raw: string;
}

/** A line that did not match the standard log format */
export interface UnparsedLine {
  lineNumber: number;
  raw: string;
}

// ─── Event classification ─────────────────────────────────────────────────────

export interface EventClassification {
  category: LogCategory;
  severity: LogSeverity;
  kind: LogEventKind;
  /** Human-readable label shown in the UI */
  label: string;
  /** Template for a plain-English explanation. Use {field0}, {field1} etc. */
  descriptionTemplate: string;
}

// ─── Stack tracking ──────────────────────────────────────────────────────────

/** An open BEGIN event waiting to be matched by an END event */
export interface OpenEvent {
  eventType: string;
  lineNumber: number;
  nanoOffset: bigint;
  wallTime: string;
  fields: string[];
  raw: string;
  stackDepth: number;
}

// ─── Parsed event (output of the parser) ─────────────────────────────────────

export interface ParsedEvent {
  id: string;
  lineNumber: number;
  wallTime: string;
  /** Milliseconds from execution start (derived from nanoOffset) */
  timestampMs: number;
  eventType: string;
  category: LogCategory;
  severity: LogSeverity;
  kind: LogEventKind;
  label: string;
  /** Plain-English description of this specific event */
  description: string;
  /** Raw fields array for detailed display */
  fields: string[];
  /** Full original line text */
  raw: string;
  /** Nesting depth (0 = top level) */
  stackDepth: number;
  /** Duration in ms — only set for matched BEGIN/END pairs */
  durationMs: number | null;
  /** Line number of the matching END event (if this is a BEGIN) */
  endLineNumber: number | null;
}

// ─── SOQL ─────────────────────────────────────────────────────────────────────

export interface SoqlStatement {
  id: string;
  lineNumber: number;
  wallTime: string;
  timestampMs: number;
  query: string;
  rowsReturned: number | null;
  durationMs: number | null;
  endLineNumber: number | null;
  /** True if the exact same query text appears more than once in this log */
  isRepeated: boolean;
}

// ─── DML ─────────────────────────────────────────────────────────────────────

export type DmlOperation = 'Insert' | 'Update' | 'Delete' | 'Upsert' | 'Undelete' | 'Merge' | 'Unknown';

export interface DmlStatement {
  id: string;
  lineNumber: number;
  wallTime: string;
  timestampMs: number;
  operation: DmlOperation;
  objectType: string;
  rowsAffected: number | null;
  durationMs: number | null;
  endLineNumber: number | null;
}

// ─── Governor Limits ─────────────────────────────────────────────────────────

export type LimitSeverity = 'ok' | 'warning' | 'critical';

export interface LimitEntry {
  name: string;
  displayName: string;
  namespace: string;
  used: number;
  max: number;
  percentUsed: number;
  severity: LimitSeverity;
}

export interface GovernorLimits {
  entries: LimitEntry[];
  hasWarnings: boolean;
  hasCritical: boolean;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export interface LogError {
  id: string;
  lineNumber: number;
  wallTime: string;
  timestampMs: number;
  isFatal: boolean;
  message: string;
  stackTrace: string | null;
}

// ─── Execution Unit ──────────────────────────────────────────────────────────

export interface ExecutionUnit {
  id: string;
  lineNumber: number;
  name: string;
  /** e.g. "execute_anonymous_apex", "MyTrigger on Account before insert", "MyClass.myMethod" */
  entryPoint: string;
  durationMs: number | null;
  soqlCount: number;
  dmlCount: number;
  errorCount: number;
  children: ExecutionUnit[];
}

// ─── Log Summary ─────────────────────────────────────────────────────────────

export interface LogSummary {
  entryPoint: string;
  totalDurationMs: number | null;
  soqlCount: number;
  dmlCount: number;
  errorCount: number;
  totalEvents: number;
  fileSizeBytes: number;
  rawLineCount: number;
}

// ─── Parsed Log (root model) ─────────────────────────────────────────────────

export interface ParsedLog {
  filePath: string;
  fileSizeBytes: number;
  rawLineCount: number;
  parsedAt: Date;
  /** All events in chronological order for the Timeline tab */
  allEvents: ParsedEvent[];
  soqlStatements: SoqlStatement[];
  dmlStatements: DmlStatement[];
  errors: LogError[];
  governorLimits: GovernorLimits;
  executionUnits: ExecutionUnit[];
  summary: LogSummary;
  /** Lines that did not match the log format */
  unparsedLines: UnparsedLine[];
  /** High-level transaction groupings built by TransactionBuilder */
  transactions: import('./transaction-types').Transaction[];
}

// ─── Parser options ───────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Include METHOD_ENTRY/EXIT events in allEvents (default: false) */
  includeMethodEntryExit: boolean;
  /** Callback for progress updates on large files (percent 0-100) */
  onProgress?: (percent: number) => void;
}
