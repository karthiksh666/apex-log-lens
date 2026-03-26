import type { ParsedLog, LogError } from '../../../parser/types';

export function renderErrors(log: ParsedLog): string {
  if (log.errors.length === 0) {
    return /* html */ `
      <div class="empty-state success-state">
        <div class="success-icon">✅</div>
        <p>No errors or exceptions found in this log.</p>
      </div>
    `;
  }

  const fatals = log.errors.filter((e) => e.isFatal);
  const exceptions = log.errors.filter((e) => !e.isFatal);

  return /* html */ `
    <div class="errors-view">
      ${fatals.length > 0 ? renderErrorGroup('Fatal Errors', fatals, true) : ''}
      ${exceptions.length > 0 ? renderErrorGroup('Exceptions', exceptions, false) : ''}
    </div>
  `;
}

function renderErrorGroup(title: string, errors: LogError[], isFatal: boolean): string {
  const cards = errors.map((e) => renderErrorCard(e, isFatal)).join('');
  return /* html */ `
    <div class="error-group">
      <h3 class="error-group-title ${isFatal ? 'title-fatal' : 'title-exception'}">${title} (${errors.length})</h3>
      ${cards}
    </div>
  `;
}

function renderErrorCard(error: LogError, isFatal: boolean): string {
  return /* html */ `
    <div class="error-card ${isFatal ? 'error-fatal' : 'error-exception'}">
      <div class="error-header">
        <span class="error-icon">${isFatal ? '⛔' : '⚠️'}</span>
        <span class="error-message">${escapeHtml(error.message)}</span>
        <span class="line-link" data-line="${error.lineNumber}" title="Jump to line ${error.lineNumber}">L${error.lineNumber}</span>
      </div>
      <div class="error-meta">
        <span class="error-time">${error.wallTime}</span>
        <span class="error-type">${isFatal ? 'FATAL_ERROR' : 'EXCEPTION_THROWN'}</span>
      </div>
      ${error.stackTrace ? `<div class="error-stack"><pre>${escapeHtml(error.stackTrace)}</pre></div>` : ''}
      <div class="error-actions">
        <button class="action-btn" data-copy="${escapeAttr(error.message)}">Copy message</button>
        <button class="action-btn" data-line="${error.lineNumber}">Jump to line</button>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
