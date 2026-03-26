import type {
  Transaction,
  ExecutionPhase,
  CalloutPair,
  DebugStatement,
  ValidationResult,
} from './transaction-types';
import { PhaseType } from './transaction-types';
import type { ParsedLog, ParsedEvent, SoqlStatement, DmlStatement } from './types';
import { classifyPhase } from './PhaseClassifier';

const SLOW_PHASE_MS = 100;
let idCounter = 0;
const uid = (prefix: string) => `${prefix}-${++idCounter}`;

/**
 * Builds the Transaction layer on top of the flat ParsedLog.
 *
 * Strategy:
 *  - Each EXECUTION_STARTED/FINISHED block = one Transaction
 *  - Each top-level CODE_UNIT_STARTED within it = one ExecutionPhase
 *  - Nested CODE_UNIT_STARTED blocks = sub-phases (tracked but not shown at top level)
 *  - USER_DEBUG events → DebugStatement, associated with current phase
 *  - CALLOUT_REQUEST/RESPONSE pairs → CalloutPair
 *  - VALIDATION_RULE/PASS/FAIL → ValidationResult
 */
export function buildTransactions(log: ParsedLog): Transaction[] {
  idCounter = 0;
  const events = log.allEvents;
  if (events.length === 0) return [];

  const transactions: Transaction[] = [];

  // Find EXECUTION_STARTED boundaries
  const execStartIndices = events
    .map((e, i) => (e.eventType === 'EXECUTION_STARTED' ? i : -1))
    .filter((i) => i >= 0);

  // If no EXECUTION_STARTED found, treat the whole log as one transaction
  const boundaries =
    execStartIndices.length > 0
      ? execStartIndices
      : [0];

  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b];
    const endIdx = b + 1 < boundaries.length ? boundaries[b + 1] - 1 : events.length - 1;
    const slice = events.slice(startIdx, endIdx + 1);

    const tx = buildTransaction(slice, log);
    if (tx) transactions.push(tx);
  }

  return transactions;
}

function buildTransaction(events: ParsedEvent[], log: ParsedLog): Transaction | null {
  if (events.length === 0) return null;

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  // ── Phase building ─────────────────────────────────────────────────────────
  const phases: ExecutionPhase[] = [];
  const callouts: CalloutPair[] = [];
  const debugStatements: DebugStatement[] = [];
  const validationResults: ValidationResult[] = [];

  /**
   * Phases are pushed in PRE-ORDER (when the unit opens) so that
   * tx.phases preserves start-order across all depths.
   * On close we mutate the same object with duration + stats.
   * Child events are propagated up so parent phases show aggregate counts.
   */
  type OpenUnit = {
    event: ParsedEvent;
    depth: number;
    phaseId: string;
    phase: ExecutionPhase;  // reference to the already-pushed phase
    events: ParsedEvent[];
  };
  const unitStack: OpenUnit[] = [];
  const openCallouts = new Map<number, { pair: CalloutPair; startNano: number }>();

  for (const event of events) {
    const currentDepth = unitStack.length;
    const currentPhaseId = unitStack[unitStack.length - 1]?.phaseId ?? null;

    // ── CODE_UNIT_STARTED → open new phase, push immediately ────────────────
    if (event.eventType === 'CODE_UNIT_STARTED') {
      const entryPoint = event.fields[1] ?? event.fields[0] ?? '';
      const classification = classifyPhase(entryPoint);
      const phaseId = uid('phase');

      // Create a partial phase and push it now (pre-order) so that
      // tx.phases preserves the natural execution order across all depths.
      const phase: ExecutionPhase = {
        id: phaseId,
        type: classification.type,
        name: classification.name,
        objectName: classification.objectName,
        operation: classification.operation,
        entryPoint,
        startLineNumber: event.lineNumber,
        endLineNumber: null,
        wallTime: event.wallTime,
        timestampMs: event.timestampMs,
        durationMs: null,
        depth: currentDepth,
        soqlCount: 0,
        dmlCount: 0,
        errorCount: 0,
        calloutCount: 0,
        events: [],
        soqlStatements: [],
        dmlStatements: [],
        debugStatements: [],
        errors: [],
        status: 'ok',
        isSlow: false,
      };
      phases.push(phase);

      unitStack.push({ event, depth: currentDepth, phaseId, phase, events: [] });
      continue;
    }

    // ── CODE_UNIT_FINISHED → finalise the phase with stats ──────────────────
    if (event.eventType === 'CODE_UNIT_FINISHED') {
      const open = unitStack.pop();
      if (open) {
        const entryPoint = open.event.fields[1] ?? open.event.fields[0] ?? '';
        const durationMs = event.durationMs ?? open.event.durationMs ?? null;

        const phaseEvents = open.events;
        const phaseSoql   = extractSoqlForEvents(phaseEvents, log.soqlStatements);
        const phaseDml    = extractDmlForEvents(phaseEvents, log.dmlStatements);
        const phaseDebug  = extractDebugStatements(phaseEvents, open.phaseId, entryPoint);
        const phaseErrors = log.errors.filter((e) =>
          phaseEvents.some((pe) => pe.lineNumber === e.lineNumber)
        );

        debugStatements.push(...phaseDebug);

        const status: 'ok' | 'warning' | 'error' =
          phaseErrors.length > 0
            ? 'error'
            : durationMs !== null && durationMs > SLOW_PHASE_MS
            ? 'warning'
            : 'ok';

        // Mutate the phase that was already pushed in pre-order
        Object.assign(open.phase, {
          endLineNumber:    event.lineNumber,
          durationMs,
          soqlCount:        phaseSoql.length,
          dmlCount:         phaseDml.length,
          errorCount:       phaseErrors.length,
          events:           phaseEvents,
          soqlStatements:   phaseSoql,
          dmlStatements:    phaseDml,
          debugStatements:  phaseDebug,
          errors:           phaseErrors,
          status,
          isSlow: durationMs !== null && durationMs > SLOW_PHASE_MS,
        });

        // Propagate events to parent so parent phases show aggregate counts
        // (parent.soqlCount = its own SOQL + all nested SOQL)
        if (unitStack.length > 0) {
          unitStack[unitStack.length - 1].events.push(...phaseEvents);
        }
      }
      continue;
    }

    // ── CALLOUT_REQUEST → open callout ───────────────────────────────────────
    if (event.eventType === 'CALLOUT_REQUEST') {
      const method = event.fields[1] ?? 'GET';
      const url = event.fields[2] ?? '';
      const pair: CalloutPair = {
        id: uid('callout'),
        method,
        url,
        requestLineNumber: event.lineNumber,
        responseLineNumber: null,
        statusCode: null,
        durationMs: null,
        wallTime: event.wallTime,
        timestampMs: event.timestampMs,
        phaseId: currentPhaseId,
      };
      openCallouts.set(event.lineNumber, { pair, startNano: event.timestampMs });
      callouts.push(pair);
    }

    // ── CALLOUT_RESPONSE → close callout ─────────────────────────────────────
    if (event.eventType === 'CALLOUT_RESPONSE') {
      const entries = Array.from(openCallouts.entries());
      if (entries.length > 0) {
        const [reqLine, { pair, startNano }] = entries[entries.length - 1];
        pair.responseLineNumber = event.lineNumber;
        pair.statusCode = parseInt(event.fields[1] ?? '0', 10) || null;
        pair.durationMs = event.durationMs ?? (event.timestampMs - startNano);
        openCallouts.delete(reqLine);
      }
    }

    // ── VALIDATION_RULE → open validation ────────────────────────────────────
    if (event.eventType === 'VALIDATION_RULE') {
      const objectName = event.fields[0] ?? '';
      const ruleName = (event.fields[1] ?? '').replace(/_/g, ' ');
      validationResults.push({
        id: uid('val'),
        ruleName,
        objectName,
        passed: true, // will be updated on VALIDATION_FAIL
        lineNumber: event.lineNumber,
        durationMs: event.durationMs,
        wallTime: event.wallTime,
        timestampMs: event.timestampMs,
      });
    }

    if (event.eventType === 'VALIDATION_FAIL') {
      const last = validationResults[validationResults.length - 1];
      if (last) last.passed = false;
    }

    // ── USER_DEBUG → debug statement ─────────────────────────────────────────
    if (event.eventType === 'USER_DEBUG') {
      const level = event.fields[1] ?? 'DEBUG';
      const message = event.fields[2] ?? event.fields[1] ?? '';
      const phaseName = unitStack[unitStack.length - 1]
        ? classifyPhase(
            unitStack[unitStack.length - 1].event.fields[1] ??
              unitStack[unitStack.length - 1].event.fields[0] ??
              ''
          ).name
        : null;

      const ds: DebugStatement = {
        id: uid('debug'),
        lineNumber: event.lineNumber,
        wallTime: event.wallTime,
        timestampMs: event.timestampMs,
        level,
        message,
        phaseId: currentPhaseId,
        phaseName,
      };
      debugStatements.push(ds);
    }

    // Add event to the innermost open unit's event list
    if (unitStack.length > 0) {
      unitStack[unitStack.length - 1].events.push(event);
    }
  }

  // ── Determine transaction entry point ─────────────────────────────────────
  const firstPhase = phases[0];
  const entryPoint =
    firstPhase?.entryPoint ??
    events.find((e) => e.eventType === 'CODE_UNIT_STARTED')?.fields[1] ??
    'Unknown';

  const rootClassification = classifyPhase(entryPoint);

  // Detect initiating DML operation from entry point for trigger transactions
  const dmlOperation = rootClassification.operation
    ? extractDmlOp(rootClassification.operation)
    : null;

  const totalDuration =
    firstEvent.eventType === 'EXECUTION_STARTED' && lastEvent.eventType === 'EXECUTION_FINISHED'
      ? lastEvent.timestampMs - firstEvent.timestampMs
      : phases.reduce((sum, p) => sum + (p.durationMs ?? 0), 0) || null;

  // Update callout counts on phases
  for (const callout of callouts) {
    const phase = phases.find((p) => p.id === callout.phaseId);
    if (phase) phase.calloutCount++;
  }

  const allErrors = log.errors.filter((e) =>
    events.some((pe) => pe.lineNumber === e.lineNumber)
  );

  const txSoql = log.soqlStatements.filter((s) =>
    events.some((e) => e.lineNumber === s.lineNumber)
  );
  const txDml = log.dmlStatements.filter((d) =>
    events.some((e) => e.lineNumber === d.lineNumber)
  );

  return {
    id: uid('tx'),
    entryPoint,
    objectName: rootClassification.objectName,
    dmlOperation,
    wallTime: firstEvent.wallTime,
    timestampMs: firstEvent.timestampMs,
    durationMs: totalDuration,
    startLineNumber: firstEvent.lineNumber,
    endLineNumber: lastEvent.lineNumber,
    phases,
    soqlStatements: txSoql,
    dmlStatements: txDml,
    callouts,
    debugStatements,
    validationResults,
    errors: allErrors,
    governorLimits: log.governorLimits,
    soqlCount: txSoql.length,
    dmlCount: txDml.length,
    errorCount: allErrors.length,
    calloutCount: callouts.length,
    hasErrors: allErrors.length > 0,
    hasSlow: phases.some((p) => p.isSlow),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSoqlForEvents(
  phaseEvents: ParsedEvent[],
  allSoql: SoqlStatement[]
): SoqlStatement[] {
  const lineSet = new Set(phaseEvents.map((e) => e.lineNumber));
  return allSoql.filter((s) => lineSet.has(s.lineNumber));
}

function extractDmlForEvents(
  phaseEvents: ParsedEvent[],
  allDml: DmlStatement[]
): DmlStatement[] {
  const lineSet = new Set(phaseEvents.map((e) => e.lineNumber));
  return allDml.filter((d) => lineSet.has(d.lineNumber));
}

function extractDebugStatements(
  phaseEvents: ParsedEvent[],
  phaseId: string,
  phaseName: string
): DebugStatement[] {
  return phaseEvents
    .filter((e) => e.eventType === 'USER_DEBUG')
    .map((e) => ({
      id: uid('debug'),
      lineNumber: e.lineNumber,
      wallTime: e.wallTime,
      timestampMs: e.timestampMs,
      level: e.fields[1] ?? 'DEBUG',
      message: e.fields[2] ?? e.fields[1] ?? '',
      phaseId,
      phaseName: classifyPhase(phaseName).name,
    }));
}

function extractDmlOp(operation: string): string | null {
  const op = operation.toLowerCase();
  if (op.includes('insert')) return 'Insert';
  if (op.includes('update')) return 'Update';
  if (op.includes('delete')) return 'Delete';
  if (op.includes('upsert')) return 'Upsert';
  if (op.includes('undelete')) return 'Undelete';
  return null;
}
