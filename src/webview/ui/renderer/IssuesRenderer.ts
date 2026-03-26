import type { ParsedLog } from '../../../parser/types';
import { renderErrors } from './ErrorRenderer';
import { renderCodeQuality } from './CodeQualityRenderer';
import { analyzeCodeQuality } from '../../../parser/CodeQualityAnalyzer';

/**
 * Issues tab — combines Errors and Code Quality in one place.
 * Two sub-sections with segment switcher at the top.
 */
export function renderIssues(log: ParsedLog): string {
  const errorCount   = log.summary.errorCount;
  const issues       = analyzeCodeQuality(log);
  const criticalIssues = issues.filter(i => i.severity === 'critical').length;

  const errorsHtml  = renderErrors(log);
  const qualityHtml = renderCodeQuality(log);

  return /* html */`
    <div class="issues-view">
      <div class="seg-bar">
        <button class="seg-btn seg-active" data-seg="errors">
          🚨 Errors
          ${errorCount > 0 ? `<span class="tab-badge tab-badge-error">${errorCount}</span>` : '<span class="seg-ok">✓</span>'}
        </button>
        <button class="seg-btn" data-seg="quality">
          🔬 Code Quality
          ${criticalIssues > 0 ? `<span class="tab-badge tab-badge-error">${criticalIssues}</span>` : issues.length > 0 ? `<span class="tab-badge">${issues.length}</span>` : '<span class="seg-ok">✓</span>'}
        </button>
      </div>

      <div class="seg-pane seg-pane-active" id="seg-errors">
        ${errorsHtml}
      </div>
      <div class="seg-pane" id="seg-quality">
        ${qualityHtml}
      </div>
    </div>
    <script>
    (function() {
      document.querySelectorAll('.seg-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.dataset.seg;
          document.querySelectorAll('.seg-btn').forEach(function(b) {
            b.classList.toggle('seg-active', b === btn);
          });
          document.querySelectorAll('.seg-pane').forEach(function(p) {
            p.classList.toggle('seg-pane-active', p.id === 'seg-' + id);
          });
        });
      });
    })();
    </script>
  `;
}
