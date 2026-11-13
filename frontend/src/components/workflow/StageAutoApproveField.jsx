import { useState } from 'react';
import { InfoTooltip } from '../common/InfoTooltip';
import { SelectDropdown } from '../common/SelectDropdown';
import {
  AUTO_APPROVE_MAX_MS,
  AUTO_APPROVE_MIN_MS,
  formatAutoApproveDuration,
  parseAutoApproveDuration,
} from '../../../../shared/autoApproveDuration.js';

/***
 * MARK: StageAutoApproveField
 * @description Human-stage auto-approve timer row for the stage settings
 *   drawer: an off-by-default enable checkbox plus a hold amount + unit
 *   (minutes / hours / days / weeks). Commits integer milliseconds to
 *   `stage.autoApproveAfterMs` (undefined = off); fractional input rounds UP
 *   so the stored hold can never shorten below what was typed. Out-of-range
 *   holds (under 1 minute, over 365 days) warn inline because the stage-save
 *   boundary rejects them with a 400.
 * @example <StageAutoApproveField stageName="Legal review" value={undefined} onChange={() => {}} />
 ***/
export const StageAutoApproveField = ({ stageName, value, onChange }) => {
  const storedMs = parseAutoApproveDuration(value);
  const enabled = storedMs !== null;
  const initial = seedDraft(value);
  const [draft, setDraft] = useState(initial.amount);
  const [unit, setUnit] = useState(initial.unit);
  const [lastValue, setLastValue] = useState(value);

  // An external change (pipeline import, another editor) re-seeds the draft
  // so the row never shows a stale hold. Render-phase adjustment (React
  // re-renders immediately); our own commits resolve to the same split and
  // leave the draft untouched in practice.
  if (lastValue !== value) {
    setLastValue(value);
    const next = seedDraft(value);
    setDraft(next.amount);
    setUnit(next.unit);
  }

  const draftNumber = Number(draft);
  const draftValid = draft.trim() !== '' && Number.isFinite(draftNumber) && draftNumber > 0;
  const draftMs = draftValid ? Math.ceil(draftNumber * unitMsById(unit)) : null;
  const effectiveMs = draftMs ?? storedMs;
  const tooShort = effectiveMs !== null && effectiveMs < AUTO_APPROVE_MIN_MS;
  const tooLong = effectiveMs !== null && effectiveMs > AUTO_APPROVE_MAX_MS;
  const formatted = effectiveMs !== null ? formatAutoApproveDuration(effectiveMs) : null;

  return (
    <div className="space-y-1 pt-2 border-t border-border-standard/60">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
          Auto-approve timer
        </span>
        <InfoTooltip
          title="Human Stage Auto-Approve"
          description="Optional backup approval: tasks parked here longer than the hold auto-advance exactly as if approved. Off by default. Manual approve or reject at any time still wins and cancels the timer."
          behindTheScenes="A backend sweeper stamps a deadline when each task enters the stage and advances it once the hold has fully elapsed — never early, late under load."
          position="left"
        />
      </div>
      <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-text-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={() => {
            if (enabled) {
              onChange?.(undefined);
            } else {
              onChange?.(AUTO_APPROVE_ENABLE_DEFAULT_MS);
            }
          }}
          aria-label={`Automatically approve tasks in ${stageName} after a hold`}
          className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
        />
        <span>Auto-approve after hold</span>
      </label>
      {enabled && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="number"
              aria-label={`Auto-approve hold amount for ${stageName}`}
              min="0"
              step="any"
              value={draft}
              onChange={(e) => {
                const text = e.target.value;
                setDraft(text);
                const n = Number(text);
                if (text.trim() !== '' && Number.isFinite(n) && n > 0) {
                  onChange?.(Math.ceil(n * unitMsById(unit)));
                }
              }}
              placeholder="7"
              className="w-24 p-2 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-on-surface outline-none focus:border-primary"
            />
            <SelectDropdown
              ariaLabel={`Auto-approve hold unit for ${stageName}`}
              className="flex-1"
              size="sm"
              value={unit}
              onChange={(next) => {
                setUnit(next);
                if (draftValid) {
                  onChange?.(Math.ceil(draftNumber * unitMsById(next)));
                }
              }}
              options={AUTO_APPROVE_UNITS.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
            />
          </div>
          {!draftValid && (
            <p className="text-[10px] text-warning font-mono">
              Enter a positive number — the stored hold is unchanged.
            </p>
          )}
          {draftValid && tooShort && (
            <p className="text-[10px] text-warning font-mono">
              Shorter than the 1 minute minimum — saving this stage will be rejected.
            </p>
          )}
          {draftValid && tooLong && (
            <p className="text-[10px] text-warning font-mono">
              Longer than the 365 day maximum — saving this stage will be rejected.
            </p>
          )}
          {draftValid && !tooShort && !tooLong && formatted && (
            <p className="text-[10px] text-text-muted font-mono">
              Tasks waiting here auto-approve after {formatted}. The hold is stamped when each
              task enters this stage; changing this later never shortens a running hold.
            </p>
          )}
        </div>
      )}
      {!enabled && (
        <p className="text-[10px] text-text-muted font-mono">
          Off — tasks wait here until a person approves or rejects.
        </p>
      )}
    </div>
  );
};

const AUTO_APPROVE_UNITS = [
  { id: 'minutes', label: 'Minutes', ms: 60000 },
  { id: 'hours', label: 'Hours', ms: 3600000 },
  { id: 'days', label: 'Days', ms: 86400000 },
  { id: 'weeks', label: 'Weeks', ms: 604800000 },
];

const AUTO_APPROVE_ENABLE_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;

const unitMsById = (id) => AUTO_APPROVE_UNITS.find((entry) => entry.id === id)?.ms ?? 86400000;

const seedDraft = (v) => {
  const ms = parseAutoApproveDuration(v);
  return ms !== null ? splitHoldMs(ms) : { amount: '7', unit: 'days' };
};

const trimAmount = (n) => {
  if (!Number.isFinite(n)) return '';
  return String(Number(n.toFixed(2)));
};

// Largest unit first: prefer an exact split ("90m" -> 90 minutes, not 1.5
// hours); fall back to a 2-decimal amount in the largest unit at or below
// the hold so odd values ("30s", "1500ms") still render faithfully.
const splitHoldMs = (ms) => {
  for (let i = AUTO_APPROVE_UNITS.length - 1; i >= 0; i -= 1) {
    // eslint-disable-next-line security/detect-object-injection -- index over a fixed local array
    const entry = AUTO_APPROVE_UNITS[i];
    if (ms >= entry.ms && ms % entry.ms === 0) {
      return { amount: String(ms / entry.ms), unit: entry.id };
    }
  }
  for (let i = AUTO_APPROVE_UNITS.length - 1; i >= 0; i -= 1) {
    // eslint-disable-next-line security/detect-object-injection -- index over a fixed local array
    const entry = AUTO_APPROVE_UNITS[i];
    if (ms >= entry.ms) {
      return { amount: trimAmount(ms / entry.ms), unit: entry.id };
    }
  }
  return { amount: trimAmount(ms / 60000), unit: 'minutes' };
};
