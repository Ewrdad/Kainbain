import React, { useState } from 'react';
import { getStageType } from '../stageTypes';

/***
 * MARK: StageVisibilityToggle
 * @description Collapsible checkbox panel hiding/showing whole stage types on
 *   the retrospective page (e.g. hide long-running `human` approvals to watch
 *   how `ci` durations grow). Controlled component: the panel owns the hidden
 *   set (persisted + URL-synced); this only renders the toggles. Renders
 *   nothing when no stage types have durations yet.
 * @example <StageVisibilityToggle types={['agent', 'ci']} hiddenTypes={hidden} onToggle={fn} onShowAll={fn} />
 * @param {Object} props
 * @param {Array<string>} [props.types] - Canonical type names to list.
 * @param {Set<string>} [props.hiddenTypes] - Currently hidden types.
 * @param {Function} [props.onToggle] - Called with the type when its box flips.
 * @param {Function} [props.onShowAll] - Called by the "Show all" reset button.
 ***/
export function StageVisibilityToggle({
  types = [],
  hiddenTypes = new Set(),
  onToggle,
  onShowAll,
}) {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(types) || types.length === 0) return null;

  const hidden = hiddenTypes instanceof Set ? hiddenTypes : new Set(hiddenTypes || []);
  const shownCount = types.filter((type) => !hidden.has(type)).length;

  return (
    <div data-testid="stage-visibility-toggle" className="text-xs">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="stage-visibility-options"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="px-3 py-2 lg:px-2 lg:py-1 min-h-[44px] lg:min-h-0 bg-surface-deep border border-border-standard rounded-sm text-text-muted hover:text-on-surface cursor-pointer"
      >
        Stage types ({shownCount} of {types.length} shown)
      </button>
      {open && (
        <div
          id="stage-visibility-options"
          role="group"
          aria-label="Stage types to show"
          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 bg-surface-deep border border-border-standard rounded-sm"
        >
          {types.map((type) => {
            const label = getStageType(type).label;
            return (
              <label
                key={type}
                className="flex items-center gap-1.5 py-1.5 lg:py-0 min-h-[44px] lg:min-h-0 text-text-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  aria-label={`Show ${label} stages`}
                  checked={!hidden.has(type)}
                  onChange={() => onToggle?.(type)}
                  className="size-5 lg:size-4 accent-secondary cursor-pointer"
                />
                {label}
              </label>
            );
          })}
          {shownCount < types.length && (
            <button
              type="button"
              onClick={() => onShowAll?.()}
              className="ml-auto px-2 py-2 lg:px-0 lg:py-0 min-h-[44px] lg:min-h-0 font-mono text-secondary hover:underline cursor-pointer"
            >
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default StageVisibilityToggle;
