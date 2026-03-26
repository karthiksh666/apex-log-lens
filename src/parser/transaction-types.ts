/**
 * Types for the Transaction Engine layer.
 * A Transaction wraps a full Salesforce execution context (EXECUTION_STARTED → EXECUTION_FINISHED).
 * Within it, each CODE_UNIT_STARTED block is an ExecutionPhase.
 */

import type { ParsedEvent, SoqlStatement, DmlStatement, LogError, GovernorLimits } from './types';

// ─── Phase type ───────────────────────────────────────────────────────────────

export enum PhaseType {
  BEFORE_TRIGGER   = 'BEFORE_TRIGGER',
  AFTER_TRIGGER    = 'AFTER_TRIGGER',
  VALIDATION_RULE  = 'VALIDATION_RULE',
  WORKFLOW_RULE    = 'WORKFLOW_RULE',
  FLOW             = 'FLOW',
  PROCESS_BUILDER  = 'PROCESS_BUILDER',
  APEX_CLASS       = 'APEX_CLASS',
  ANONYMOUS_APEX   = 'ANONYMOUS_APEX',
  CALLOUT          = 'CALLOUT',
  ASSIGNMENT_RULE  = 'ASSIGNMENT_RULE',
  AUTO_RESPONSE    = 'AUTO_RESPONSE',
  ESCALATION_RULE  = 'ESCALATION_RULE',
  SYSTEM           = 'SYSTEM',
  UNKNOWN          = 'UNKNOWN',
}

export type PhaseStatus = 'ok' | 'warning' | 'error';

// ─── Execution Phase ──────────────────────────────────────────────────────────

export interface ExecutionPhase {
  id: string;
  type: PhaseType;
  /** Human-readable name, e.g. "AccountTrigger", "My_Flow", "Required_Name" */
  name: string;
  /** Salesforce object this phase operates on, e.g. "Account" */
  objectName: string | null;
  /** DML operation context, e.g. "before insert", "after update" */
  operation: string | null;
  /** Original CODE_UNIT_STARTED entry point string */
  entryPoint: string;
  startLineNumber: number;
  endLineNumber: number | null;
  wallTime: string;
  timestampMs: number;
  durationMs: number | null;
  /** Nesting depth within the transaction (0 = top-level phase) */
  depth: number;
  soqlCount: number;
  dmlCount: number;
  errorCount: number;
  calloutCount: number;
  /** All events that occurred within this phase */
  events: ParsedEvent[];
  /** SOQL statements executed within this phase */
  soqlStatements: SoqlStatement[];
  /** DML statements executed within this phase */
  dmlStatements: DmlStatement[];
  /** Debug statements (USER_DEBUG) within this phase */
  debugStatements: DebugStatement[];
  errors: LogError[];
  status: PhaseStatus;
  /** True if duration > slow threshold (default 100ms) */
  isSlow: boolean;
}

// ─── Callout ─────────────────────────────────────────────────────────────────

export interface CalloutPair {
  id: string;
  method: string;   // GET, POST, PUT, DELETE, PATCH
  url: string;
  requestLineNumber: number;
  responseLineNumber: number | null;
  statusCode: number | null;
  durationMs: number | null;
  wallTime: string;
  timestampMs: number;
  phaseId: string | null;
}

// ─── Debug statement ─────────────────────────────────────────────────────────

export interface DebugStatement {
  id: string;
  lineNumber: number;
  wallTime: string;
  timestampMs: number;
  /** Log level string inside the debug call, e.g. "DEBUG", "INFO", "WARN" */
  level: string;
  message: string;
  /** ID of the ExecutionPhase this debug belongs to */
  phaseId: string | null;
  /** Name of the phase for display */
  phaseName: string | null;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  id: string;
  ruleName: string;
  objectName: string;
  passed: boolean;
  lineNumber: number;
  durationMs: number | null;
  wallTime: string;
  timestampMs: number;
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  /** The top-level entry point, e.g. "execute_anonymous_apex", "AccountTrigger on Account before insert" */
  entryPoint: string;
  /** Primary Salesforce object involved, if detectable */
  objectName: string | null;
  /** Initiating DML operation, if detectable (Insert, Update, Delete, etc.) */
  dmlOperation: string | null;
  wallTime: string;
  timestampMs: number;
  durationMs: number | null;
  startLineNumber: number;
  endLineNumber: number | null;

  /** Ordered phases in execution sequence */
  phases: ExecutionPhase[];

  /** Aggregated across all phases */
  soqlStatements: SoqlStatement[];
  dmlStatements: DmlStatement[];
  callouts: CalloutPair[];
  debugStatements: DebugStatement[];
  validationResults: ValidationResult[];
  errors: LogError[];
  governorLimits: GovernorLimits;

  /** Convenience counts */
  soqlCount: number;
  dmlCount: number;
  errorCount: number;
  calloutCount: number;

  hasErrors: boolean;
  hasSlow: boolean;
}
