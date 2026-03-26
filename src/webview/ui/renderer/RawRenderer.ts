import type { ParsedLog } from '../../../parser/types';

/**
 * Raw tab — shows the original log text with basic line numbers.
 * Error lines are highlighted.
 * Clicking a line number in other tabs jumps here via the data-line mechanism.
 */
export function renderRaw(log: ParsedLog): string {
  // Build a set of error line numbers for highlighting
  const errorLines = new Set(log.errors.map((e) => e.lineNumber));
  const soqlLines = new Set(log.soqlStatements.map((s) => s.lineNumber));
  const dmlLines = new Set(log.dmlStatements.map((s) => s.lineNumber));

  // We don't have the original raw text here — reconstruct from allEvents + unparsedLines
  // Build a line-number → raw text map
  const lineMap = new Map<number, string>();
  for (const event of log.allEvents) {
    lineMap.set(event.lineNumber, event.raw);
  }
  for (const unparsed of log.unparsedLines) {
    lineMap.set(unparsed.lineNumber, unparsed.raw);
  }

  // Sort by line number
  const lineNumbers = Array.from(lineMap.keys()).sort((a, b) => a - b);

  if (lineNumbers.length === 0) {
    return `<div class="empty-state"><p>No raw lines available.</p></div>`;
  }

  const rows = lineNumbers.map((ln) => {
    const text = lineMap.get(ln) ?? '';
    const isError = errorLines.has(ln);
    const isSoql = soqlLines.has(ln);
    const isDml = dmlLines.has(ln);

    const rowClass = isError ? 'raw-error' : isSoql ? 'raw-soql' : isDml ? 'raw-dml' : '';

    return /* html */ `<div class="raw-line ${rowClass}" id="raw-line-${ln}">` +
      `<span class="raw-ln" data-line="${ln}">${ln}</span>` +
      `<span class="raw-text">${escapeHtml(text)}</span>` +
      `</div>`;
  }).join('');

  return /* html */ `
    <div class="raw-view">
      <div class="raw-legend">
        <span class="raw-legend-item raw-error-dot">Error</span>
        <span class="raw-legend-item raw-soql-dot">SOQL</span>
        <span class="raw-legend-item raw-dml-dot">DML</span>
      </div>
      <div class="raw-body">${rows}</div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
