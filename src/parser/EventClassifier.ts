import { LogCategory, LogSeverity, LogEventKind, type EventClassification } from './types';

/**
 * Maps raw Salesforce log event type strings to their classification.
 *
 * Any event type not in this map falls back to the UNKNOWN category.
 */

type ClassificationMap = Record<string, EventClassification>;

const CLASSIFICATIONS: ClassificationMap = {
  // ─── Execution lifecycle ────────────────────────────────────────────────────
  EXECUTION_STARTED: {
    category: LogCategory.EXECUTION,
    severity: LogSeverity.INFO,
    kind: LogEventKind.BEGIN,
    label: 'Execution Started',
    descriptionTemplate: 'Apex execution started.',
  },
  EXECUTION_FINISHED: {
    category: LogCategory.EXECUTION,
    severity: LogSeverity.INFO,
    kind: LogEventKind.END,
    label: 'Execution Finished',
    descriptionTemplate: 'Apex execution finished.',
  },
  CODE_UNIT_STARTED: {
    category: LogCategory.EXECUTION,
    severity: LogSeverity.INFO,
    kind: LogEventKind.BEGIN,
    label: 'Code Unit Started',
    descriptionTemplate: 'Started executing: {field1}.',
  },
  CODE_UNIT_FINISHED: {
    category: LogCategory.EXECUTION,
    severity: LogSeverity.INFO,
    kind: LogEventKind.END,
    label: 'Code Unit Finished',
    descriptionTemplate: 'Finished executing: {field0}.',
  },

  // ─── Apex code ──────────────────────────────────────────────────────────────
  METHOD_ENTRY: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.BEGIN,
    label: 'Method Entry',
    descriptionTemplate: 'Entered method: {field1}.',
  },
  METHOD_EXIT: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.END,
    label: 'Method Exit',
    descriptionTemplate: 'Exited method: {field1}.',
  },
  CONSTRUCTOR_ENTRY: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.BEGIN,
    label: 'Constructor Entry',
    descriptionTemplate: 'Entered constructor: {field1}.',
  },
  CONSTRUCTOR_EXIT: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.END,
    label: 'Constructor Exit',
    descriptionTemplate: 'Exited constructor: {field1}.',
  },
  USER_DEBUG: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.DEBUG,
    kind: LogEventKind.POINT,
    label: 'Debug Statement',
    descriptionTemplate: '{field1}: {field2}',
  },
  VARIABLE_SCOPE_BEGIN: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.BEGIN,
    label: 'Variable Scope Begin',
    descriptionTemplate: 'Variable scope opened.',
  },
  VARIABLE_SCOPE_END: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.END,
    label: 'Variable Scope End',
    descriptionTemplate: 'Variable scope closed.',
  },
  VARIABLE_ASSIGNMENT: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.POINT,
    label: 'Variable Assignment',
    descriptionTemplate: '{field0} = {field1}',
  },
  STATEMENT_EXECUTE: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FINEST,
    kind: LogEventKind.POINT,
    label: 'Statement Execute',
    descriptionTemplate: 'Executed statement at line {field0}.',
  },

  // ─── Errors & exceptions ────────────────────────────────────────────────────
  FATAL_ERROR: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.FATAL,
    kind: LogEventKind.FATAL,
    label: 'Fatal Error',
    descriptionTemplate: '{field0}',
  },
  EXCEPTION_THROWN: {
    category: LogCategory.APEX_CODE,
    severity: LogSeverity.ERROR,
    kind: LogEventKind.POINT,
    label: 'Exception Thrown',
    descriptionTemplate: '{field1}: {field2}',
  },

  // ─── Database (SOQL) ────────────────────────────────────────────────────────
  SOQL_EXECUTE_BEGIN: {
    category: LogCategory.DB,
    severity: LogSeverity.DEBUG,
    kind: LogEventKind.BEGIN,
    label: 'SOQL Query',
    descriptionTemplate: '{field1}',
  },
  SOQL_EXECUTE_END: {
    category: LogCategory.DB,
    severity: LogSeverity.DEBUG,
    kind: LogEventKind.END,
    label: 'SOQL Result',
    descriptionTemplate: 'Returned {field1} rows.',
  },

  // ─── Database (DML) ─────────────────────────────────────────────────────────
  DML_BEGIN: {
    category: LogCategory.DB,
    severity: LogSeverity.DEBUG,
    kind: LogEventKind.BEGIN,
    label: 'DML Operation',
    descriptionTemplate: '{field1} on {field2} — {field3} rows.',
  },
  DML_END: {
    category: LogCategory.DB,
    severity: LogSeverity.DEBUG,
    kind: LogEventKind.END,
    label: 'DML End',
    descriptionTemplate: 'DML operation completed.',
  },

  // ─── Governor limits ────────────────────────────────────────────────────────
  LIMIT_USAGE_FOR_NS: {
    category: LogCategory.LIMITS,
    severity: LogSeverity.INFO,
    kind: LogEventKind.POINT,
    label: 'Governor Limits',
    descriptionTemplate: 'Governor limit snapshot for namespace: {field0}.',
  },
  LIMIT_USAGE: {
    category: LogCategory.LIMITS,
    severity: LogSeverity.INFO,
    kind: LogEventKind.POINT,
    label: 'Limit Usage',
    descriptionTemplate: 'Governor limits usage recorded.',
  },

  // ─── System ─────────────────────────────────────────────────────────────────
  ENTERING_MANAGED_PKG: {
    category: LogCategory.SYSTEM,
    severity: LogSeverity.INFO,
    kind: LogEventKind.POINT,
    label: 'Managed Package',
    descriptionTemplate: 'Entered managed package: {field0}.',
  },
  SYSTEM_MODE_ENTER: {
    category: LogCategory.SYSTEM,
    severity: LogSeverity.FINE,
    kind: LogEventKind.BEGIN,
    label: 'System Mode Enter',
    descriptionTemplate: 'Entered system mode.',
  },
  SYSTEM_MODE_EXIT: {
    category: LogCategory.SYSTEM,
    severity: LogSeverity.FINE,
    kind: LogEventKind.END,
    label: 'System Mode Exit',
    descriptionTemplate: 'Exited system mode.',
  },

  // ─── Callouts ───────────────────────────────────────────────────────────────
  CALLOUT_REQUEST: {
    category: LogCategory.CALLOUT,
    severity: LogSeverity.INFO,
    kind: LogEventKind.BEGIN,
    label: 'HTTP Callout',
    descriptionTemplate: '{field1} {field2}',
  },
  CALLOUT_RESPONSE: {
    category: LogCategory.CALLOUT,
    severity: LogSeverity.INFO,
    kind: LogEventKind.END,
    label: 'HTTP Response',
    descriptionTemplate: 'HTTP {field1} response received.',
  },

  // ─── Validation ─────────────────────────────────────────────────────────────
  VALIDATION_RULE: {
    category: LogCategory.VALIDATION,
    severity: LogSeverity.DEBUG,
    kind: LogEventKind.BEGIN,
    label: 'Validation Rule',
    descriptionTemplate: 'Evaluating validation rule: {field1} on {field0}.',
  },
  VALIDATION_PASS: {
    category: LogCategory.VALIDATION,
    severity: LogSeverity.DEBUG,
    kind: LogEventKind.END,
    label: 'Validation Passed',
    descriptionTemplate: 'Validation rule passed.',
  },
  VALIDATION_FAIL: {
    category: LogCategory.VALIDATION,
    severity: LogSeverity.WARN,
    kind: LogEventKind.END,
    label: 'Validation Failed',
    descriptionTemplate: 'Validation rule failed.',
  },
  VALIDATION_ERROR: {
    category: LogCategory.VALIDATION,
    severity: LogSeverity.ERROR,
    kind: LogEventKind.POINT,
    label: 'Validation Error',
    descriptionTemplate: '{field0}',
  },

  // ─── Workflow ────────────────────────────────────────────────────────────────
  WF_RULE_EVAL_BEGIN: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.FINE,
    kind: LogEventKind.BEGIN,
    label: 'Workflow Rule Eval',
    descriptionTemplate: 'Evaluating workflow rule.',
  },
  WF_RULE_EVAL_END: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.FINE,
    kind: LogEventKind.END,
    label: 'Workflow Rule Eval End',
    descriptionTemplate: 'Workflow rule evaluation complete.',
  },
  WF_RULE_FILTER: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.FINE,
    kind: LogEventKind.POINT,
    label: 'Workflow Filter',
    descriptionTemplate: 'Workflow rule filter evaluated.',
  },
  WF_CRITERIA_BEGIN: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.FINE,
    kind: LogEventKind.BEGIN,
    label: 'Workflow Criteria',
    descriptionTemplate: 'Evaluating workflow criteria: {field0}.',
  },
  WF_CRITERIA_END: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.FINE,
    kind: LogEventKind.END,
    label: 'Workflow Criteria End',
    descriptionTemplate: 'Workflow criteria evaluated.',
  },
  WF_ACTION: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.INFO,
    kind: LogEventKind.POINT,
    label: 'Workflow Action',
    descriptionTemplate: 'Workflow action: {field0}.',
  },
  WF_FIELD_UPDATE: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.INFO,
    kind: LogEventKind.POINT,
    label: 'Field Update',
    descriptionTemplate: 'Field update: {field0}.{field1} → {field2}.',
  },
  WF_EMAIL_ALERT: {
    category: LogCategory.WORKFLOW,
    severity: LogSeverity.INFO,
    kind: LogEventKind.POINT,
    label: 'Email Alert',
    descriptionTemplate: 'Email alert triggered.',
  },

  // ─── Visualforce ─────────────────────────────────────────────────────────────
  VF_SERIALIZE_VIEWSTATE_BEGIN: {
    category: LogCategory.VISUALFORCE,
    severity: LogSeverity.FINE,
    kind: LogEventKind.BEGIN,
    label: 'Serialize ViewState',
    descriptionTemplate: 'Serializing Visualforce view state.',
  },
  VF_SERIALIZE_VIEWSTATE_END: {
    category: LogCategory.VISUALFORCE,
    severity: LogSeverity.FINE,
    kind: LogEventKind.END,
    label: 'Serialize ViewState End',
    descriptionTemplate: 'ViewState serialization complete.',
  },
  VF_DESERIALIZE_VIEWSTATE_BEGIN: {
    category: LogCategory.VISUALFORCE,
    severity: LogSeverity.FINE,
    kind: LogEventKind.BEGIN,
    label: 'Deserialize ViewState',
    descriptionTemplate: 'Deserializing Visualforce view state.',
  },
  VF_DESERIALIZE_VIEWSTATE_END: {
    category: LogCategory.VISUALFORCE,
    severity: LogSeverity.FINE,
    kind: LogEventKind.END,
    label: 'Deserialize ViewState End',
    descriptionTemplate: 'ViewState deserialization complete.',
  },
  VF_PAGE_MESSAGE: {
    category: LogCategory.VISUALFORCE,
    severity: LogSeverity.INFO,
    kind: LogEventKind.POINT,
    label: 'VF Page Message',
    descriptionTemplate: 'Visualforce page message: {field0}.',
  },

  // ─── Profiling ───────────────────────────────────────────────────────────────
  CUMULATIVE_LIMIT_USAGE: {
    category: LogCategory.PROFILING,
    severity: LogSeverity.INFO,
    kind: LogEventKind.BEGIN,
    label: 'Cumulative Limits',
    descriptionTemplate: 'Cumulative governor limit usage recorded.',
  },
  CUMULATIVE_LIMIT_USAGE_END: {
    category: LogCategory.PROFILING,
    severity: LogSeverity.INFO,
    kind: LogEventKind.END,
    label: 'Cumulative Limits End',
    descriptionTemplate: 'Cumulative limit reporting complete.',
  },
  CUMULATIVE_PROFILING: {
    category: LogCategory.PROFILING,
    severity: LogSeverity.INFO,
    kind: LogEventKind.BEGIN,
    label: 'Cumulative Profiling',
    descriptionTemplate: 'Profiling summary started.',
  },
  CUMULATIVE_PROFILING_END: {
    category: LogCategory.PROFILING,
    severity: LogSeverity.INFO,
    kind: LogEventKind.END,
    label: 'Cumulative Profiling End',
    descriptionTemplate: 'Profiling summary complete.',
  },
};

const UNKNOWN_CLASSIFICATION: EventClassification = {
  category: LogCategory.UNKNOWN,
  severity: LogSeverity.DEBUG,
  kind: LogEventKind.POINT,
  label: 'Unknown Event',
  descriptionTemplate: '{field0}',
};

export function classifyEvent(eventType: string): EventClassification {
  return CLASSIFICATIONS[eventType] ?? UNKNOWN_CLASSIFICATION;
}

/**
 * Renders the description template for an event using its fields array.
 * Template tokens: {field0}, {field1}, etc.
 */
export function renderDescription(template: string, fields: string[]): string {
  return template.replace(/\{field(\d+)\}/g, (_, idx) => {
    return fields[Number(idx)] ?? '';
  }).trim();
}

/**
 * Returns true for event types that should be hidden by default
 * (too noisy for beginners, can be enabled in settings).
 */
export function isVerboseEventType(eventType: string): boolean {
  return (
    eventType === 'METHOD_ENTRY' ||
    eventType === 'METHOD_EXIT' ||
    eventType === 'CONSTRUCTOR_ENTRY' ||
    eventType === 'CONSTRUCTOR_EXIT' ||
    eventType === 'VARIABLE_SCOPE_BEGIN' ||
    eventType === 'VARIABLE_SCOPE_END' ||
    eventType === 'VARIABLE_ASSIGNMENT' ||
    eventType === 'STATEMENT_EXECUTE'
  );
}
