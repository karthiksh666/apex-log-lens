import type { ParsedLog } from '../../../parser/types';
import { renderTriggers } from './TriggersRenderer';
import { renderFlows } from './FlowsRenderer';
import { renderValidation } from './ValidationRenderer';
import { renderWorkflow } from './WorkflowRenderer';

/**
 * Automation tab — Triggers, Flows, Validation Rules, and Workflow Rules
 * in one place with a segment switcher.
 */
export function renderAutomation(log: ParsedLog): string {
  const phases = log.transactions.flatMap(t => t.phases);

  const trigCount = phases.filter(p => p.type === 'BEFORE_TRIGGER' || p.type === 'AFTER_TRIGGER').length;
  const flowCount = phases.filter(p => p.type === 'FLOW' || p.type === 'PROCESS_BUILDER').length;
  const valCount  = log.transactions.flatMap(t => t.validationResults).length;
  const wfCount   = phases.filter(p => p.type === 'WORKFLOW_RULE').length;

  // Only include segments that have data
  const segments: { id: string; label: string; badge: number | null; html: string }[] = [];
  if (trigCount > 0) segments.push({ id: 'triggers',   label: '⚡ Triggers',   badge: trigCount, html: renderTriggers(log) });
  if (flowCount > 0) segments.push({ id: 'flows',      label: '🌊 Flows',      badge: flowCount, html: renderFlows(log) });
  if (valCount  > 0) segments.push({ id: 'validation', label: '✅ Validation', badge: valCount,  html: renderValidation(log) });
  if (wfCount   > 0) segments.push({ id: 'workflow',   label: '🔄 Workflow',   badge: wfCount,   html: renderWorkflow(log) });

  if (segments.length === 0) {
    return `<div class="empty-state"><p>No triggers, flows, validation rules, or workflow rules fired in this log.</p></div>`;
  }

  // If only one type, render it directly (no switcher needed)
  if (segments.length === 1) return segments[0].html;

  const segBtns = segments.map((s, i) => /* html */`
    <button class="seg-btn ${i === 0 ? 'seg-active' : ''}" data-seg="${s.id}">
      ${s.label}
      ${s.badge !== null ? `<span class="tab-badge">${s.badge}</span>` : ''}
    </button>
  `).join('');

  const panes = segments.map((s, i) => /* html */`
    <div class="seg-pane ${i === 0 ? 'seg-pane-active' : ''}" id="seg-auto-${s.id}">${s.html}</div>
  `).join('');

  return /* html */`
    <div class="auto-tab-view">
      <div class="seg-bar">${segBtns}</div>
      ${panes}
    </div>
    <script>
    (function() {
      document.querySelectorAll('.auto-tab-view .seg-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.dataset.seg;
          btn.closest('.auto-tab-view').querySelectorAll('.seg-btn').forEach(function(b) {
            b.classList.toggle('seg-active', b === btn);
          });
          btn.closest('.auto-tab-view').querySelectorAll('.seg-pane').forEach(function(p) {
            p.classList.toggle('seg-pane-active', p.id === 'seg-auto-' + id);
          });
        });
      });
    })();
    </script>
  `;
}
