import type { ParsedLog } from '../../../parser/types';
import { renderDataAccess } from './DataAccessRenderer';
import { renderSoql } from './SoqlRenderer';
import { renderDml } from './DmlRenderer';

/**
 * Data tab — Objects overview, SOQL queries, and DML statements in one place.
 * Segment switcher: Objects | SOQL | DML
 */
export function renderData(log: ParsedLog): string {
  const soqlCount = log.summary.soqlCount;
  const dmlCount  = log.summary.dmlCount;

  const segments = [
    { id: 'objects', label: '🗂 Objects',  badge: null },
    { id: 'soql',    label: '🔍 SOQL',    badge: soqlCount > 0 ? soqlCount : null },
    { id: 'dml',     label: '💾 DML',     badge: dmlCount  > 0 ? dmlCount  : null },
  ];

  const segBtns = segments.map((s, i) => /* html */`
    <button class="seg-btn ${i === 0 ? 'seg-active' : ''}" data-seg="${s.id}">
      ${s.label}
      ${s.badge !== null ? `<span class="tab-badge">${s.badge}</span>` : ''}
    </button>
  `).join('');

  return /* html */`
    <div class="data-tab-view">
      <div class="seg-bar">${segBtns}</div>
      <div class="seg-pane seg-pane-active" id="seg-objects">${renderDataAccess(log)}</div>
      <div class="seg-pane"                 id="seg-soql">${renderSoql(log)}</div>
      <div class="seg-pane"                 id="seg-dml">${renderDml(log)}</div>
    </div>
    <script>
    (function() {
      document.querySelectorAll('.data-tab-view .seg-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.dataset.seg;
          btn.closest('.data-tab-view').querySelectorAll('.seg-btn').forEach(function(b) {
            b.classList.toggle('seg-active', b === btn);
          });
          btn.closest('.data-tab-view').querySelectorAll('.seg-pane').forEach(function(p) {
            p.classList.toggle('seg-pane-active', p.id === 'seg-' + id);
          });
        });
      });
    })();
    </script>
  `;
}
