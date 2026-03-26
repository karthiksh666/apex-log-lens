import type { ParsedLog, ParsedEvent, LogCategory, LogSeverity } from '../../../parser/types';
import { formatDuration } from '../../../utils/TimeUtils';

/**
 * Timeline tab — the primary view for understanding what happened in a log.
 * Each event is a color-coded row, depth-indented by call stack level.
 */
export function renderTimeline(log: ParsedLog): string {
  if (log.allEvents.length === 0) {
    return emptyState('No events found in this log.');
  }

  const rows = log.allEvents.map(renderEventRow).join('');

  return /* html */ `
    <div class="timeline">
      <div class="timeline-filter-bar">
        <span class="filter-label">Filter:</span>
        ${renderCategoryFilters()}
        <input class="search-input" type="text" placeholder="Search events..." id="timeline-search" />
      </div>
      <div class="timeline-header">
        <span class="col-time">Time</span>
        <span class="col-event">Event</span>
        <span class="col-detail">Detail</span>
        <span class="col-duration">Duration</span>
      </div>
      <div class="timeline-body" id="timeline-body">
        ${rows}
      </div>
    </div>
    <script>
      (function() {
        // Category filter chips
        document.querySelectorAll('.filter-chip').forEach(function(chip) {
          chip.addEventListener('click', function() {
            chip.classList.toggle('active');
            applyFilters();
          });
        });

        // Search box
        var searchEl = document.getElementById('timeline-search');
        if (searchEl) {
          searchEl.addEventListener('input', function() { applyFilters(); });
        }

        function applyFilters() {
          var activeCategories = Array.from(document.querySelectorAll('.filter-chip.active'))
            .map(function(c) { return c.dataset.category; });
          var searchText = (searchEl ? searchEl.value : '').toLowerCase();

          document.querySelectorAll('.event-row').forEach(function(row) {
            var cat = row.dataset.category;
            var text = row.dataset.searchText || '';
            var catMatch = activeCategories.length === 0 || activeCategories.includes(cat);
            var textMatch = !searchText || text.includes(searchText);
            row.classList.toggle('hidden', !(catMatch && textMatch));
          });
        }

        // Expand/collapse event details
        document.querySelectorAll('.event-row').forEach(function(row) {
          row.addEventListener('click', function(e) {
            if (e.target.closest('[data-copy]') || e.target.closest('[data-line]')) return;
            row.classList.toggle('expanded');
            var detail = row.nextElementSibling;
            if (detail && detail.classList.contains('event-detail')) {
              detail.classList.toggle('hidden');
            }
          });
        });
      })();
    </script>
  `;
}

function renderCategoryFilters(): string {
  const categories = [
    { key: 'APEX_CODE', label: 'Apex', color: 'cat-apex' },
    { key: 'DB', label: 'DB', color: 'cat-db' },
    { key: 'SYSTEM', label: 'System', color: 'cat-system' },
    { key: 'CALLOUT', label: 'Callout', color: 'cat-callout' },
    { key: 'VALIDATION', label: 'Validation', color: 'cat-validation' },
    { key: 'WORKFLOW', label: 'Workflow', color: 'cat-workflow' },
    { key: 'LIMITS', label: 'Limits', color: 'cat-limits' },
    { key: 'EXECUTION', label: 'Execution', color: 'cat-execution' },
  ];

  return categories
    .map(
      (c) =>
        `<button class="filter-chip ${c.color}" data-category="${c.key}" title="Filter by ${c.label}">${c.label}</button>`
    )
    .join('');
}

function renderEventRow(event: ParsedEvent): string {
  const indent = Math.min(event.stackDepth, 8) * 16; // 16px per level, max 8 levels
  const categoryClass = `cat-${event.category.toLowerCase().replace('_', '-')}`;
  const severityClass = `sev-${event.severity.toLowerCase()}`;
  const isFatal = event.severity === 'FATAL' || event.eventType === 'FATAL_ERROR';
  const isError = event.severity === 'ERROR' || event.eventType === 'EXCEPTION_THROWN';

  const searchText = [event.label, event.description, event.eventType, ...event.fields]
    .join(' ')
    .toLowerCase();

  const durationHtml = event.durationMs !== null
    ? `<span class="duration ${event.durationMs > 100 ? 'duration-slow' : ''}">${formatDuration(event.durationMs)}</span>`
    : '';

  const lineLink = `<span class="line-link" data-line="${event.lineNumber}" title="Jump to line ${event.lineNumber} in raw log">L${event.lineNumber}</span>`;

  const row = /* html */ `
    <div class="event-row ${categoryClass} ${severityClass} ${isFatal ? 'row-fatal' : ''} ${isError ? 'row-error' : ''}"
         data-category="${event.category}"
         data-search-text="${escapeAttr(searchText)}"
         style="padding-left: ${indent + 12}px"
         role="row">
      <span class="col-time">${event.wallTime}</span>
      <span class="col-event">
        <span class="category-dot ${categoryClass}"></span>
        <span class="event-label">${escapeHtml(event.label)}</span>
      </span>
      <span class="col-detail">${escapeHtml(truncate(event.description, 80))}</span>
      <span class="col-duration">${durationHtml}${lineLink}</span>
    </div>
    <div class="event-detail hidden">
      <div class="detail-grid">
        <div class="detail-row"><span class="detail-key">Event type</span><span class="detail-val">${escapeHtml(event.eventType)}</span></div>
        <div class="detail-row"><span class="detail-key">Description</span><span class="detail-val">${escapeHtml(event.description)}</span></div>
        ${event.durationMs !== null ? `<div class="detail-row"><span class="detail-key">Duration</span><span class="detail-val">${formatDuration(event.durationMs)}</span></div>` : ''}
        ${event.fields.length > 0 ? `<div class="detail-row"><span class="detail-key">Raw fields</span><span class="detail-val detail-mono">${escapeHtml(event.fields.join(' | '))}</span></div>` : ''}
        <div class="detail-row">
          <span class="detail-key">Raw line</span>
          <span class="detail-val detail-mono">${escapeHtml(event.raw)}</span>
        </div>
      </div>
      <div class="detail-actions">
        <button class="action-btn" data-copy="${escapeAttr(event.raw)}">Copy raw</button>
        <button class="action-btn" data-line="${event.lineNumber}">Jump to line</button>
      </div>
    </div>
  `;

  return row;
}

function emptyState(message: string): string {
  return `<div class="empty-state"><p>${message}</p></div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
