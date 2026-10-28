import React, { useState } from 'react';

import { COL_SPAN_OPTIONS, HEIGHT_OPTIONS } from './widgetRegistry';

/***
 * MARK: WidgetContainer
 * @description Card container for an observability widget.
 * In Edit Mode: provides controls to move (rearrange), resize (change colSpan / height), and remove/hide the widget.
 * In View Mode: provides a clean, distraction-free display suitable for a monitor.
 ***/
export function WidgetContainer({
  id,
  instanceId,
  title,
  titleOverride,
  shortTitle,
  icon,
  colSpan = 6,
  height = 'normal',
  isEditMode = false,
  onMoveUp,
  onMoveDown,
  onResizeWidth,
  onResizeHeight,
  onToggleVisibility,
  canMoveUp = false,
  canMoveDown = false,
  badge,
  actions,
  children,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // The instance id keys the DOM and the accessibility labels so two copies of
  // the same widget type stay independently targetable (`widget-queue-2`,
  // "Move Queue Order (queue-2) up"). A per-instance title from the config seam
  // distinguishes copies visually without renaming the catalog entry.
  const widgetKey = instanceId || id;
  const displayTitle = titleOverride || title || shortTitle || widgetKey;
  const instanceSuffix = instanceId && id && instanceId !== id ? ` (${instanceId})` : '';

  // Coerce sizes to the registry's valid options first: the layout validator
  // already guarantees this, but the container is reusable — an out-of-range
  // value must render a sane default, never a blank select with broken grid.
  const safeColSpan = COL_SPAN_OPTIONS.some((option) => option.value === colSpan) ? colSpan : 6;
  const safeHeight = HEIGHT_OPTIONS.some((option) => option.value === height) ? height : 'normal';

  // Map colSpan to Tailwind grid classes
  const colSpanClass =
    safeColSpan === 12
      ? 'col-span-12'
      : safeColSpan === 8
        ? 'col-span-12 lg:col-span-8'
        : safeColSpan === 6
          ? 'col-span-12 lg:col-span-6'
          : safeColSpan === 4
            ? 'col-span-12 md:col-span-6 lg:col-span-4'
            : safeColSpan === 3
              ? 'col-span-12 sm:col-span-6 lg:col-span-3'
              : 'col-span-12 lg:col-span-6';

  // Map height setting to min-height / max-height classes
  const heightConfig = HEIGHT_OPTIONS.find((h) => h.value === safeHeight) || HEIGHT_OPTIONS[1];
  const heightClass = isCollapsed ? 'h-auto' : heightConfig.class;

  return (
    <div
      data-testid={`widget-${widgetKey}`}
      className={`${colSpanClass} flex flex-col rounded-lg border transition-all overflow-hidden ${
        isEditMode
          ? 'border-dashed border-emerald-500/60 bg-[#0d1322]/90 shadow-lg ring-1 ring-emerald-500/30'
          : 'border-slate-800 bg-[#0a0e1a]/95 shadow-md hover:border-slate-700/80'
      }`}
    >
      {/* Widget Header Toolbar */}
      <div className="px-3.5 py-2.5 bg-[#0e1424] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none">
        {/* Title + Icon + Live Badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">{icon || '📊'}</span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono truncate">
            {displayTitle}
          </h3>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          {/* Custom widget-specific action buttons */}
          {actions}

          {/* Edit Mode Customization Controls */}
          {isEditMode && (
            <div className="flex items-center gap-1 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700/80 text-[10px]">
              {/* Move Reorder Buttons */}
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                title="Move Widget Left / Up"
                aria-label={`Move ${displayTitle}${instanceSuffix} up`}
                className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                ◀
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                title="Move Widget Right / Down"
                aria-label={`Move ${displayTitle}${instanceSuffix} down`}
                className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                ▶
              </button>

              <span className="w-px h-3 bg-slate-700 mx-0.5" />

              {/* Width Selector Dropdown */}
              <select
                value={safeColSpan}
                onChange={(e) => onResizeWidth?.(Number(e.target.value))}
                aria-label={`Resize width for ${displayTitle}${instanceSuffix}`}
                title="Resize Widget Width"
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-1 py-0.2 text-[10px] outline-none cursor-pointer"
              >
                {COL_SPAN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === 12
                      ? '100%'
                      : opt.value === 8
                        ? '66%'
                        : opt.value === 6
                          ? '50%'
                          : opt.value === 4
                            ? '33%'
                            : '25%'}
                  </option>
                ))}
              </select>

              {/* Height Selector Dropdown */}
              <select
                value={safeHeight}
                onChange={(e) => onResizeHeight?.(e.target.value)}
                aria-label={`Resize height for ${displayTitle}${instanceSuffix}`}
                title="Resize Widget Height"
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-1 py-0.2 text-[10px] outline-none cursor-pointer"
              >
                <option value="compact">S</option>
                <option value="normal">M</option>
                <option value="tall">L</option>
                <option value="full">Auto</option>
              </select>

              <span className="w-px h-3 bg-slate-700 mx-0.5" />

              {/* Remove / Hide Widget */}
              <button
                type="button"
                onClick={onToggleVisibility}
                title="Hide / Remove this widget"
                aria-label={`Hide ${displayTitle}${instanceSuffix}`}
                className="px-1 py-0.5 rounded hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand Widget' : 'Collapse Widget'}
            aria-label={
              isCollapsed
                ? `Expand ${displayTitle}${instanceSuffix}`
                : `Collapse ${displayTitle}${instanceSuffix}`
            }
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-[10px]"
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Widget Body */}
      {!isCollapsed && (
        <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${heightClass}`}>
          {children}
        </div>
      )}
    </div>
  );
}

export default WidgetContainer;
