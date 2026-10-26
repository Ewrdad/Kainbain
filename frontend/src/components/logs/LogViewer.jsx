/**
 * MARK: LogViewer
 * @description Presentational unified log viewer: presettable category chips
 *   (every lane always selectable, even with zero records), search,
 *   compact/full density, timestamps, grouped rows with
 *   expansion, and copy/clear actions. The whole filter block collapses
 *   behind one toggle (collapsed by default; filters hidden) so the
 *   small screens keep the log stream visible. No data fetching and no
 *   surface-specific knowledge — every surface adapts its own source into
 *   LogRecords (see `adapters.js`) and owns a `useLogViewerState` instance.
 *   Owners that render extra content through `footer` pass `scrollKey` to
 *   follow-scroll when that content changes.
 *
 *   Accessibility: the scroll region keeps `role="log"`, `aria-live`,
 *   keyboard scroll (`tabIndex={0}`); chips and density use `aria-pressed`;
 *   expansions are buttons with `aria-expanded`.
 *
 *   Follow-scroll (stick-to-bottom): programmatic scrolling engages only
 *   when content overflows the viewport AND the user is already near the
 *   bottom; a short log never scrolls, a scrolled-up reader is not yanked,
 *   and the page itself never moves — follow-scroll assigns the log pane's
 *   own `scrollTop` directly and never calls `scrollIntoView` (which would
 *   scroll every scrollable ancestor, including the page, past the logs
 *   into blank space on mobile). `overscroll-contain` on the scroll region
 *   additionally stops touch/wheel gestures at the pane edge from chaining
 *   out into the page. The Auto-scroll toggle and hidden-tab pause remain
 *   the master overrides. `scrollKey` reuses the same gating for
 *   footer/owner content changes.
 *
 *   Mobile invariant: log surfaces must keep `min-w-0` down the entire
 *   flex chain (root, group wrappers, rows, scroll region) and
 *   `overflow-wrap: anywhere` (+ `break-words`) on every element that
 *   renders raw payloads (main text span, meta line, both expanded detail
 *   blocks), so long unbroken tokens can never force the page to scroll
 *   horizontally on phone-narrow viewports. The project pill truncates
 *   (`max-w` + `truncate`) instead of wrapping so a long project UUID can
 *   never set the row width. Fail-safe: the scroll region clamps
 *   `overflow-x-hidden`, so any residue scrolls vertically or clips inside
 *   the console — never sideways into the page. Wrapping only changes
 *   display; copy/export still uses the raw records, so payloads survive
 *   mid-word breaks intact.
 */

// Single source of truth for payload wrapping: `break-words` covers older
// engines (`overflow-wrap: break-word`) while the inline `anywhere` style
// breaks truly unbreakable tokens (UUIDs, `bash({...})` JSON, paths) that
// `break-word` alone can leave overflowing inside flex rows.
export const LOG_WRAP_CLASSNAME = 'whitespace-pre-wrap min-w-0 break-words';
export const LOG_WRAP_STYLE = { overflowWrap: 'anywhere' };
// Default open/closed state of the collapsible filter block. Collapsed
// (false) on every viewport so logs are visible immediately; user toggle
// still wins after mount.
export const DEFAULT_FILTERS_EXPANDED = false;

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shouldFollowScroll, STICK_TO_BOTTOM_THRESHOLD_PX } from './logScroll';
import { useIsNarrowViewport } from '../util/viewport';
import { copyToClipboard } from '../../services/clipboard';
import {
  LOG_CATEGORIES,
  asCategorySet,
  defaultCategorySet,
  filterLogRecords,
  formatLogRecordsForCopy,
  groupLogRecords,
  timestampLabel,
} from './logCategories';

// Functional severity pill tones (kept close to the legacy console palettes
// so migrated surfaces do not change meaning).
const CATEGORY_PILL = {
  output: 'text-[#7bdb85] bg-[#7bdb85]/10 border-[#7bdb85]/30',
  tools: 'text-[#a6e3a1] bg-[#a6e3a1]/10 border-[#a6e3a1]/30',
  thinking: 'text-[#c4b5fd] bg-[#c4b5fd]/10 border-[#c4b5fd]/30',
  ci: 'text-[#ffb77f] bg-[#ffb77f]/10 border-[#ffb77f]/30',
  stage: 'text-[#9acbff] bg-[#9acbff]/10 border-[#9acbff]/30',
  debug: 'text-[#8b8b8b] bg-[#8b8b8b]/10 border-[#8b8b8b]/30',
  system: 'text-[#c2c8ca] bg-[#c2c8ca]/10 border-[#c2c8ca]/30',
  human: 'text-[#9acbff] bg-[#9acbff]/10 border-[#9acbff]/30',
  error: 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/30',
  git: 'text-[#94e2d5] bg-[#94e2d5]/10 border-[#94e2d5]/30',
  raw: 'text-[#c2c8ca] bg-[#c2c8ca]/10 border-[#c2c8ca]/30',
};

/***
 * MARK: LogRecordRow
 * @description One record in compact or full density. Thinking markers and
 *   typed details expand inline; intervention rows carry a highlight plus a
 *   screen-reader marker (color is never the only signal).
 ***/
const LogRecordRow = memo(function LogRecordRow({
  record,
  density,
  showTimestamps,
  timestampFormat,
  expanded,
  fullText,
  onToggle,
}) {
  const isIntervention = Boolean(record.isIntervention);
  const compact = density === 'compact';
  const charCount = record.meta?.charCount;
  const canExpandThinking =
    record.collapsedThinking && record.fullTextId != null && fullText != null;
  const showThinkingFull = canExpandThinking && expanded;
  const showDetail = !record.collapsedThinking && record.detail && expanded;

  return (
    <div
      className={
        compact
          ? `flex items-start gap-2 min-w-0 max-w-full leading-relaxed px-1 py-0.5 rounded ${isIntervention ? 'bg-[#ffb4ab]/10 outline outline-1 outline-[#ffb4ab]/40' : 'hover:bg-surface-container/30'}`
          : `px-2 py-1.5 rounded border-b border-border-standard/30 min-w-0 max-w-full ${isIntervention ? 'bg-[#ffb4ab]/10 border-l-2 border-l-[#ffb4ab]' : ''}`
      }
    >
      {showTimestamps && (
        <span
          className="text-[10px] text-text-muted shrink-0 select-none pt-0.5 font-mono"
          aria-label={`Logged at ${timestampLabel(record.ts, timestampFormat)}`}
        >
          {timestampLabel(record.ts, timestampFormat)}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 min-w-0 max-w-full">
          <span
            className={`px-1.5 py-px rounded border text-[9px] font-bold shrink-0 uppercase select-none font-mono ${CATEGORY_PILL[record.category] || CATEGORY_PILL.system}`}
          >
            {record.tag}
          </span>
          {record.projectName && (
            <span
              title={String(record.projectName)}
              className="px-1.5 py-px rounded border text-[9px] font-bold shrink-0 font-mono text-text-muted bg-surface-container border-border-standard select-none max-w-[10rem] truncate"
            >
              [{record.projectName}]
            </span>
          )}
          <span
            className={`${compact ? 'text-xs' : 'text-xs'} flex-1 text-on-surface leading-relaxed max-w-full ${LOG_WRAP_CLASSNAME}`}
            style={LOG_WRAP_STYLE}
          >
            {isIntervention && <span className="sr-only">Intervention: </span>}
            {record.title ? `${record.title}: ` : ''}
            {record.text}
          </span>
        </div>
        {!compact && (record.turn !== null || record.taskId || record.isRepeated) && (
          <div
            className={`mt-0.5 text-[10px] font-mono text-text-muted max-w-full ${LOG_WRAP_CLASSNAME}`}
            style={LOG_WRAP_STYLE}
          >
            {[
              record.turn !== null ? `Turn ${record.turn}` : null,
              record.taskId ? `Task ${record.taskId}` : null,
              record.isRepeated ? 'repeated' : null,
            ]
              .filter(Boolean)
              .join(' • ')}
          </div>
        )}
        {record.collapsedThinking && (
          <div className="mt-1">
            {canExpandThinking ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={`Show thinking (${charCount || 'unknown'} chars)`}
                className="text-[10px] font-mono text-secondary hover:text-primary underline cursor-pointer"
              >
                {expanded ? 'Hide thinking' : `Show thinking (${charCount || '?'} chars)`}
              </button>
            ) : null}
            {showThinkingFull && (
              <div
                className={`mt-1 pl-3 border-l-2 border-border-standard/40 text-on-surface leading-relaxed max-w-full ${LOG_WRAP_CLASSNAME}`}
                style={LOG_WRAP_STYLE}
              >
                {fullText}
              </div>
            )}
          </div>
        )}
        {!record.collapsedThinking && record.detail && (
          <div className="mt-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide full detail' : 'Show full detail'}
              className="text-[10px] font-mono text-secondary hover:text-primary underline cursor-pointer"
            >
              {expanded ? 'Hide full detail' : 'Show full detail'}
            </button>
            {showDetail && (
              <div
                className={`mt-1 pl-3 border-l-2 border-border-standard/40 text-on-surface leading-relaxed font-mono text-xs max-w-full ${LOG_WRAP_CLASSNAME}`}
                style={LOG_WRAP_STYLE}
              >
                {record.detail}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/***
 * MARK: LogViewer
 * @description Unified log viewer. See module docs for the contract.
 ***/
export function LogViewer({
  records = [],
  groups = null,
  groupMode = 'none',
  viewer,
  header = null,
  onCopy = null,
  onClear = null,
  copiedLogs = false,
  showCopyButton = true,
  scrollKey = 0,
  emptyMessage = 'No logs available.',
  footer = null,
  searchLabel = 'Search logs',
  logLabel = 'Logs',
  testId = null,
  fullTextById = null,
  // Retained for backward compatibility with older callers/tests; the
  // intervention summary strip is no longer rendered (vertical space is
  // reserved for log rows). No-op.
  showInterventionSummary = false,
}) {
  const v = viewer || {};
  void showInterventionSummary;
  const categories = useMemo(() => asCategorySet(v.categories), [v.categories]);
  const search = v.search ?? '';
  const density = v.density === 'compact' ? 'compact' : 'full';
  const showTimestamps = Boolean(v.showTimestamps);
  const timestampFormat = v.timestampFormat || 'HH:MM:SS';
  const autoScroll = v.autoScroll !== false;
  const expandedIds = v.expandedIds instanceof Set ? v.expandedIds : new Set();
  const [internalCopied, setInternalCopied] = useState(false);
  const copied = copiedLogs || internalCopied;
  // Filter-block collapse: collapsed by default on every viewport until
  // the user explicitly toggles, which then wins over resizes and
  // rotations. Local state on purpose — collapse is chrome, not a persisted
  // filter; the category/search selection itself already persists per
  // surface in `useLogViewerState`, so a preset dashboard survives reloads.
  const isNarrow = useIsNarrowViewport();
  const [manualFiltersExpanded, setManualFiltersExpanded] = useState(null);
  const filtersExpanded = manualFiltersExpanded ?? DEFAULT_FILTERS_EXPANDED;

  const containerRef = useRef(null);
  // Stick-to-bottom state: only follows the tail when the user is already
  // at/near the bottom. Updated by the container scroll listener below.
  const stickToBottomRef = useRef(true);
  // Previous scrollHeight, used to grow the scroll position incrementally
  // (by the height of the newly arrived lines) instead of jumping to the
  // absolute end.
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  // `scrollKey` lets owners trigger a follow-scroll for content outside
  // `records` (e.g. orchestrator messages/tool cards in `footer`).

  const toggleCategory = v.toggleCategory || (() => {});
  const selectAll = v.selectAll || (() => {});
  const reset = v.reset || (() => {});
  const setSearch = v.setSearch || (() => {});
  const setDensity = v.setDensity || (() => {});
  const setShowTimestamps = v.setShowTimestamps || (() => {});
  const setTimestampFormat = v.setTimestampFormat || (() => {});
  const toggleExpanded = v.toggleExpanded || (() => {});

  const filteredRecords = useMemo(
    () => filterLogRecords(records, { categories, search }),
    [records, categories, search],
  );

  const visibleGroups = useMemo(() => {
    if (Array.isArray(groups)) {
      return groups
        .map((group) => ({
          ...group,
          records: filterLogRecords(group.records, { categories, search }),
        }))
        .filter((group) => group.records.length > 0);
    }
    return groupLogRecords(filteredRecords, { mode: groupMode });
  }, [groups, filteredRecords, groupMode, categories, search]);

  const visibleRowCount = useMemo(
    () => visibleGroups.reduce((n, group) => n + group.records.length, 0),
    [visibleGroups],
  );
  // "All" reads pressed when the selection matches the density defaults with
  // no search text — independent of any stub viewer's hasActiveFilter flag.
  const allPressed = useMemo(() => {
    if (String(search).trim() !== '') return false;
    const defaults = defaultCategorySet(density);
    return categories.size === defaults.size && [...categories].every((c) => defaults.has(c));
  }, [categories, search, density]);

  const handleContainerScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    // Follow-scroll decision delegates to the pure helper. A half-empty page
    // is always considered stuck, so we never fight the user before overflow.
    if (node.scrollHeight <= node.clientHeight + 2) {
      stickToBottomRef.current = true;
    } else {
      stickToBottomRef.current =
        shouldFollowScroll({
          scrollTop: node.scrollTop,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          thresholdPx: STICK_TO_BOTTOM_THRESHOLD_PX,
        }) ||
        node.scrollHeight - (node.scrollTop + node.clientHeight) <= STICK_TO_BOTTOM_THRESHOLD_PX;
    }
  }, []);

  useEffect(() => {
    if (!autoScroll) {
      const node = containerRef.current;
      if (node) {
        prevScrollHeightRef.current = node.scrollHeight;
        prevScrollTopRef.current = node.scrollTop;
      }
      return;
    }
    const node = containerRef.current;
    if (!node) return;

    // Detect a user scroll-up even if no scroll event fired between renders.
    if (prevScrollHeightRef.current > 0) {
      if (node.scrollTop < prevScrollTopRef.current - STICK_TO_BOTTOM_THRESHOLD_PX) {
        stickToBottomRef.current = false;
      } else if (
        prevScrollTopRef.current + node.clientHeight + STICK_TO_BOTTOM_THRESHOLD_PX >=
        prevScrollHeightRef.current
      ) {
        // Was stuck at the previous append; stay stuck unless user moved.
        if (node.scrollTop >= prevScrollTopRef.current - STICK_TO_BOTTOM_THRESHOLD_PX) {
          stickToBottomRef.current = true;
        }
      }
    }

    const previousHeight = prevScrollHeightRef.current || node.scrollHeight;
    // Determine whether the user was already at/near the bottom *before* this
    // append grew the content (compare current scrollTop against the previous
    // height), so we follow even if a scroll event is late/absent, and never
    // yank a reader who scrolled up.
    const wasNearBottomBeforeGrowth =
      prevScrollHeightRef.current <= 0 ||
      node.scrollTop + node.clientHeight + STICK_TO_BOTTOM_THRESHOLD_PX >= previousHeight;
    const overflowing = node.scrollHeight > node.clientHeight + 2;
    const sticky = stickToBottomRef.current || wasNearBottomBeforeGrowth;
    const follow = overflowing && sticky;

    if (follow) {
      const delta = node.scrollHeight - (prevScrollHeightRef.current || node.scrollHeight);
      const advance = Math.max(0, delta);
      const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
      let next = node.scrollTop + advance;
      // Snap to the tail on the first follow of an already-overflowing log
      // (initial mount / follow re-enabled) when there is no measured delta.
      if (advance === 0 && node.scrollTop < maxScrollTop) next = maxScrollTop;
      next = Math.min(next, maxScrollTop);
      next = Math.max(0, next);
      // Container-local only: never `scrollIntoView` (that API scrolls every
      // scrollable ancestor, so on mobile it can push the page past the log
      // panel into the blank area below it). The clamped `scrollTop`
      // assignment above already leaves the tail visible.
      node.scrollTop = next;
    }

    prevScrollHeightRef.current = node.scrollHeight;
    prevScrollTopRef.current = node.scrollTop;
  }, [autoScroll, filteredRecords, visibleGroups, scrollKey]);

  // Keep the measured height in sync with viewport width changes (no scroll).
  useEffect(() => {
    const node = containerRef.current;
    if (node) {
      prevScrollHeightRef.current = node.scrollHeight;
      prevScrollTopRef.current = node.scrollTop;
    }
  }, [isNarrow]);

  const copyTimeoutRef = useRef(null);
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      if (onCopy) {
        await onCopy(filteredRecords);
        setInternalCopied(true);
      } else {
        // Expanded rows opt their detail into the export; everything else
        // copies summary-only so full payloads never leak unasked.
        const ok = await copyToClipboard(formatLogRecordsForCopy(filteredRecords, { expandedIds }));
        // Only confirm when the clipboard write actually succeeded.
        setInternalCopied(ok);
      }
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setInternalCopied(false), 2000);
    } catch {
      // Clipboard failures keep the viewer usable; the button simply does
      // not flip to confirmation state.
    }
  }, [onCopy, filteredRecords, expandedIds]);

  return (
    <div className="flex flex-col min-h-0 flex-1 min-w-0 w-full">
      {header}
      <div className="flex items-center gap-2 text-xs font-mono">
        <button
          type="button"
          data-testid="log-filter-toggle"
          onClick={() => setManualFiltersExpanded(!filtersExpanded)}
          aria-expanded={filtersExpanded}
          aria-controls="log-filters"
          className="px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[32px] bg-surface-container text-text-muted hover:text-on-surface border border-border-standard/50"
        >
          {filtersExpanded ? 'Hide filters' : 'Show filters'}
        </button>
        {!filtersExpanded && !allPressed && (
          <span
            data-testid="log-filter-active-badge"
            className="px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase text-[#ffb77f] bg-[#ffb77f]/10 border-[#ffb77f]/40"
          >
            Filters on
          </span>
        )}
      </div>
      {filtersExpanded && (
        <div id="log-filters" data-testid="log-filters" className="flex flex-col gap-2">
          <div
            data-testid="log-category-chips"
            className="flex flex-wrap items-center gap-1.5 text-xs font-mono"
            role="group"
            aria-label="Log categories"
          >
            <button
              type="button"
              onClick={selectAll}
              aria-pressed={allPressed}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[32px] ${
                allPressed
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-text-muted hover:text-on-surface border border-border-standard/50'
              }`}
            >
              All
            </button>
            {/* Every lane renders always-enabled (never gated on record
                counts) so a dashboard can be preset before logs arrive. */}
            {LOG_CATEGORIES.map((category) => {
              const pressed = categories.has(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  aria-pressed={pressed}
                  title={category.description}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[32px] ${
                    pressed
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container text-text-muted hover:text-on-surface border border-border-standard/50'
                  }`}
                >
                  {category.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <input
              type="search"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={searchLabel}
              className="flex-1 min-w-[8rem] bg-surface border border-border-standard rounded px-2 py-1 text-xs text-on-surface outline-none focus:border-primary"
            />
            <div className="flex items-center gap-1" role="group" aria-label="Log density">
              {['compact', 'full'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDensity(mode)}
                  aria-pressed={density === mode}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                    density === mode
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container text-text-muted hover:text-on-surface border border-border-standard/50'
                  }`}
                >
                  {mode === 'compact' ? 'Compact' : 'Full'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowTimestamps(!showTimestamps)}
              aria-pressed={showTimestamps}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                showTimestamps
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-text-muted hover:text-on-surface border border-border-standard/50'
              }`}
            >
              Timestamps
            </button>
            {showTimestamps && (
              <select
                aria-label="Timestamp format"
                value={timestampFormat}
                onChange={(e) => setTimestampFormat(e.target.value)}
                className="bg-surface border border-border-standard rounded px-1 py-1 text-[10px] text-on-surface outline-none"
              >
                <option value="HH:MM:SS">HH:MM:SS clock</option>
                <option value="HH:MM:SS.mmm">HH:MM:SS.mmm precise</option>
                <option value="ISO">ISO date-time</option>
              </select>
            )}
            {showCopyButton && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? 'Copied to clipboard' : 'Copy logs'}
                className="px-2 py-1 bg-surface-container hover:bg-surface-container-high border border-border-standard text-text-muted hover:text-on-surface rounded text-[10px] uppercase font-bold transition-colors cursor-pointer"
              >
                {copied ? 'Copied!' : 'Copy logs'}
              </button>
            )}
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear logs"
                className="px-2 py-1 bg-surface-container hover:bg-error-container text-text-muted border border-border-standard rounded text-[10px] uppercase font-bold transition-colors cursor-pointer"
              >
                Clear logs
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="px-2 py-1 text-text-muted hover:text-on-surface text-[10px] uppercase underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable log region
        tabIndex={0}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label={logLabel}
        data-testid={testId}
        onScroll={handleContainerScroll}
        className="mt-2 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar font-mono text-xs space-y-1 min-h-0 min-w-0"
      >
        {visibleGroups.map((group) => (
          <div key={group.id} className="space-y-1 min-w-0 max-w-full">
            {group.label && (
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-border-standard/30 pb-1">
                {group.label}
              </div>
            )}
            {group.records.map((record) => (
              <LogRecordRow
                key={record.id}
                record={record}
                density={density}
                showTimestamps={showTimestamps}
                timestampFormat={timestampFormat}
                expanded={expandedIds.has(record.id)}
                fullText={
                  fullTextById instanceof Map
                    ? fullTextById.get(record.fullTextId)?.text
                    : undefined
                }
                onToggle={() => toggleExpanded(record.id)}
              />
            ))}
          </div>
        ))}
        {visibleRowCount === 0 && emptyMessage !== null && (
          <div className="text-text-muted italic text-center py-8">{emptyMessage}</div>
        )}
        {footer}
      </div>
    </div>
  );
}

export * from './logScroll';
