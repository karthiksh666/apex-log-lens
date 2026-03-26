import { PhaseType } from './transaction-types';

export interface PhaseClassification {
  type: PhaseType;
  /** Display name, e.g. "AccountTrigger", "My_Flow" */
  name: string;
  /** Salesforce object, e.g. "Account" */
  objectName: string | null;
  /** Trigger operation, e.g. "before insert" */
  operation: string | null;
  /** Short label shown in the phase pill */
  label: string;
  /** Emoji icon for visual identification */
  icon: string;
}

/**
 * Classifies a CODE_UNIT_STARTED entry point string into a structured phase.
 *
 * Salesforce entry point formats:
 *   "AccountTrigger on Account before insert"   → BEFORE_TRIGGER
 *   "AccountTrigger on Account after update"    → AFTER_TRIGGER
 *   "Validation:Required_Name:Account"          → VALIDATION_RULE
 *   "Workflow:Account"                          → WORKFLOW_RULE
 *   "Flow:Account_Onboarding_Flow"              → FLOW
 *   "Process:My_Process_Builder"                → PROCESS_BUILDER
 *   "execute_anonymous_apex"                    → ANONYMOUS_APEX
 *   "MyClass.myMethod"                          → APEX_CLASS
 *   "Batchable scope execute"                   → APEX_CLASS
 *   "ESCALATION_RULE:Account"                   → ESCALATION_RULE
 *   "ASSIGNMENT_RULE:Lead"                      → ASSIGNMENT_RULE
 */
export function classifyPhase(entryPoint: string): PhaseClassification {
  const ep = entryPoint.trim();

  // ── Before Trigger ────────────────────────────────────────────────────────
  const beforeTrigger = /^(.+?)\s+on\s+(\w+)\s+(before\s+\w+)/i.exec(ep);
  if (beforeTrigger) {
    return {
      type: PhaseType.BEFORE_TRIGGER,
      name: beforeTrigger[1],
      objectName: beforeTrigger[2],
      operation: beforeTrigger[3],
      label: 'Before Trigger',
      icon: '⚡',
    };
  }

  // ── After Trigger ─────────────────────────────────────────────────────────
  const afterTrigger = /^(.+?)\s+on\s+(\w+)\s+(after\s+\w+)/i.exec(ep);
  if (afterTrigger) {
    return {
      type: PhaseType.AFTER_TRIGGER,
      name: afterTrigger[1],
      objectName: afterTrigger[2],
      operation: afterTrigger[3],
      label: 'After Trigger',
      icon: '⚡',
    };
  }

  // ── Validation Rule ───────────────────────────────────────────────────────
  const validation = /^Validation:([^:]+):(\w+)/i.exec(ep);
  if (validation) {
    return {
      type: PhaseType.VALIDATION_RULE,
      name: validation[1].replace(/_/g, ' '),
      objectName: validation[2],
      operation: null,
      label: 'Validation Rule',
      icon: '✅',
    };
  }

  // ── Workflow Rule ─────────────────────────────────────────────────────────
  const workflow = /^Workflow:(\w+)/i.exec(ep);
  if (workflow) {
    return {
      type: PhaseType.WORKFLOW_RULE,
      name: workflow[1],
      objectName: workflow[1],
      operation: null,
      label: 'Workflow',
      icon: '🔄',
    };
  }

  // ── Flow ──────────────────────────────────────────────────────────────────
  const flow = /^Flow:(.+)/i.exec(ep);
  if (flow) {
    return {
      type: PhaseType.FLOW,
      name: flow[1].replace(/_/g, ' '),
      objectName: null,
      operation: null,
      label: 'Flow',
      icon: '🌊',
    };
  }

  // ── Process Builder ───────────────────────────────────────────────────────
  const process = /^Process:(.+)/i.exec(ep);
  if (process) {
    return {
      type: PhaseType.PROCESS_BUILDER,
      name: process[1].replace(/_/g, ' '),
      objectName: null,
      operation: null,
      label: 'Process',
      icon: '⚙️',
    };
  }

  // ── Assignment Rule ───────────────────────────────────────────────────────
  const assignment = /^ASSIGNMENT_RULE:(\w+)/i.exec(ep);
  if (assignment) {
    return {
      type: PhaseType.ASSIGNMENT_RULE,
      name: 'Assignment Rule',
      objectName: assignment[1],
      operation: null,
      label: 'Assignment',
      icon: '📋',
    };
  }

  // ── Escalation Rule ───────────────────────────────────────────────────────
  const escalation = /^ESCALATION_RULE:(\w+)/i.exec(ep);
  if (escalation) {
    return {
      type: PhaseType.ESCALATION_RULE,
      name: 'Escalation Rule',
      objectName: escalation[1],
      operation: null,
      label: 'Escalation',
      icon: '📈',
    };
  }

  // ── Auto-Response ─────────────────────────────────────────────────────────
  if (/auto.?response/i.test(ep)) {
    return {
      type: PhaseType.AUTO_RESPONSE,
      name: 'Auto-Response Rule',
      objectName: null,
      operation: null,
      label: 'Auto-Response',
      icon: '📧',
    };
  }

  // ── Anonymous Apex ────────────────────────────────────────────────────────
  if (/execute_anonymous_apex/i.test(ep)) {
    return {
      type: PhaseType.ANONYMOUS_APEX,
      name: 'Anonymous Apex',
      objectName: null,
      operation: null,
      label: 'Anonymous Apex',
      icon: '🔧',
    };
  }

  // ── Callout ───────────────────────────────────────────────────────────────
  if (/^(GET|POST|PUT|PATCH|DELETE)\s/i.test(ep)) {
    return {
      type: PhaseType.CALLOUT,
      name: ep,
      objectName: null,
      operation: null,
      label: 'Callout',
      icon: '🌐',
    };
  }

  // ── System internal ───────────────────────────────────────────────────────
  if (/^(Batchable|Schedulable|Queueable|Finalizer)/i.test(ep)) {
    return {
      type: PhaseType.APEX_CLASS,
      name: ep,
      objectName: null,
      operation: null,
      label: 'Apex',
      icon: '🔷',
    };
  }

  // ── Generic Apex class / method ───────────────────────────────────────────
  if (/[A-Z]/.test(ep[0]) && ep.includes('.')) {
    return {
      type: PhaseType.APEX_CLASS,
      name: ep,
      objectName: null,
      operation: null,
      label: 'Apex',
      icon: '🔷',
    };
  }

  return {
    type: PhaseType.UNKNOWN,
    name: ep || 'Unknown',
    objectName: null,
    operation: null,
    label: 'Unknown',
    icon: '❓',
  };
}

/** Returns the CSS class name for a given phase type */
export function phaseTypeClass(type: PhaseType): string {
  const map: Record<PhaseType, string> = {
    [PhaseType.BEFORE_TRIGGER]:  'phase-before-trigger',
    [PhaseType.AFTER_TRIGGER]:   'phase-after-trigger',
    [PhaseType.VALIDATION_RULE]: 'phase-validation',
    [PhaseType.WORKFLOW_RULE]:   'phase-workflow',
    [PhaseType.FLOW]:            'phase-flow',
    [PhaseType.PROCESS_BUILDER]: 'phase-process',
    [PhaseType.APEX_CLASS]:      'phase-apex',
    [PhaseType.ANONYMOUS_APEX]:  'phase-anonymous',
    [PhaseType.CALLOUT]:         'phase-callout',
    [PhaseType.ASSIGNMENT_RULE]: 'phase-assignment',
    [PhaseType.AUTO_RESPONSE]:   'phase-auto-response',
    [PhaseType.ESCALATION_RULE]: 'phase-escalation',
    [PhaseType.SYSTEM]:          'phase-system',
    [PhaseType.UNKNOWN]:         'phase-unknown',
  };
  return map[type] ?? 'phase-unknown';
}

/** Canonical ordering of phases in the Salesforce execution lifecycle */
export const PHASE_ORDER: PhaseType[] = [
  PhaseType.ANONYMOUS_APEX,
  PhaseType.APEX_CLASS,
  PhaseType.BEFORE_TRIGGER,
  PhaseType.VALIDATION_RULE,
  PhaseType.AFTER_TRIGGER,
  PhaseType.ASSIGNMENT_RULE,
  PhaseType.AUTO_RESPONSE,
  PhaseType.WORKFLOW_RULE,
  PhaseType.ESCALATION_RULE,
  PhaseType.PROCESS_BUILDER,
  PhaseType.FLOW,
  PhaseType.CALLOUT,
  PhaseType.SYSTEM,
  PhaseType.UNKNOWN,
];
