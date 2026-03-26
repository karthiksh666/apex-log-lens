import type { ParsedLog } from '../../../parser/types';

export function renderDebug(log: ParsedLog): string {
  const statements = log.transactions.flatMap(tx => tx.debugStatements);

  // Deduplicate (same debug may appear in multiple phase arrays)
  const seen = new Set<string>();
  const unique = statements.filter(d => {
    const key = `${d.lineNumber}-${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    return `<div class="empty-state"><p>No System.debug() statements found in this log.</p></div>`;
  }

  const rows = unique.map((d, i) => /* html */`
    <div class="debug-row">
      <span class="debug-num">${i + 1}</span>
      <span class="debug-time">${d.wallTime}</span>
      <span class="debug-level debug-${d.level.toLowerCase()}">${d.level}</span>
      ${d.phaseName ? `<span class="debug-phase">${escHtml(d.phaseName)}</span>` : ''}
      <span class="debug-message">${escHtml(d.message)}</span>
      <span class="debug-actions">
        <button class="action-btn-sm" data-copy="${escAttr(d.message)}" title="Copy">Copy</button>
        <span class="line-link" data-line="${d.lineNumber}">L${d.lineNumber}</span>
      </span>
    </div>
  `).join('');

  return /* html */`
    <div class="debug-view">
      <div class="table-toolbar">
        <span class="table-count">${unique.length} debug statement${unique.length > 1 ? 's' : ''}</span>
        <input class="search-input" type="text" placeholder="Search debug messages..." id="debug-search" />
      </div>
      <div class="debug-list" id="debug-list">
        ${rows}
      </div>
    </div>
    <script>
    (function() {
      var search = document.getElementById('debug-search');
      if (search) {
        search.addEventListener('input', function() {
          var q = search.value.toLowerCase();
          document.querySelectorAll('#debug-list .debug-row').forEach(function(row) {
            var text = row.textContent.toLowerCase();
            row.classList.toggle('hidden', !!q && !text.includes(q));
          });
        });
      }
    })();
    </script>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s: string): string {
  return s.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
