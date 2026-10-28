import { useState, useId } from 'react';
import {
  STAGE_TAG_MAX_COUNT,
  STAGE_TAG_MAX_LENGTH,
  normalizeStageTag,
  normalizeStageTags,
  stageTagKey,
} from '../../../../shared/stageTags.js';
import { STAGE_TAG_CHIP_CLASS } from './stageTokens';

/***
 * MARK: StageTagEditor
 * @description Tag chip editor for stage configuration. Allows adding,
 *   removing, and suggesting tags with keyboard navigation and length/count limits.
 * @param {Object} props
 * @param {Array<string>} [props.value=[]] - Currently assigned tags.
 * @param {Function} props.onChange - Called with updated array of tags.
 * @param {Array<string>} [props.availableTags=[]] - Existing pipeline tags for quick suggestions.
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.stageName]
 ***/
export function StageTagEditor({
  value = [],
  onChange,
  availableTags = [],
  disabled = false,
  stageName = '',
}) {
  const [inputValue, setInputValue] = useState('');
  const [hint, setHint] = useState('');
  const inputId = useId();

  const tags = Array.isArray(value) ? value : [];
  const atMaxCount = tags.length >= STAGE_TAG_MAX_COUNT;

  const addTag = (rawTag) => {
    if (disabled) return;
    if (atMaxCount) {
      setHint(`Maximum of ${STAGE_TAG_MAX_COUNT} tags reached.`);
      return;
    }
    const normalized = normalizeStageTag(rawTag);
    if (!normalized) {
      if (typeof rawTag === 'string' && rawTag.includes(',')) {
        setHint('Tags cannot contain commas.');
      } else if (typeof rawTag === 'string' && rawTag.trim().length > STAGE_TAG_MAX_LENGTH) {
        setHint(`Tags must be ${STAGE_TAG_MAX_LENGTH} characters or fewer.`);
      }
      return;
    }
    const key = stageTagKey(normalized);
    if (tags.some((t) => stageTagKey(t) === key)) {
      setHint(`Tag "${normalized}" is already added.`);
      return;
    }
    setHint('');
    setInputValue('');
    const next = normalizeStageTags([...tags, normalized]);
    onChange?.(next || []);
  };

  const removeTag = (indexToRemove) => {
    if (disabled) return;
    setHint('');
    const next = tags.filter((_, idx) => idx !== indexToRemove);
    onChange?.(next);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  };

  const unselectedSuggestions = (availableTags || []).filter(
    (cand) => !tags.some((t) => stageTagKey(t) === stageTagKey(cand)),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-[9px] font-bold uppercase text-text-muted tracking-wider block"
        >
          Tags ({tags.length}/{STAGE_TAG_MAX_COUNT})
        </label>
        {hint && (
          <span role="alert" className="text-[10px] text-amber-400 font-mono">
            {hint}
          </span>
        )}
      </div>

      {/* Chips Container — the `role="list"` wrapper only exists while tags
          are present (an empty list would violate aria-required-children) and
          never wraps the text input (a list may only contain listitems). */}
      <div className="flex flex-wrap gap-1.5 min-h-[32px] p-1.5 bg-surface-container border border-border-standard rounded-sm items-center">
        {tags.length > 0 && (
          <div
            role="list"
            aria-label={`Tags for ${stageName || 'stage'}`}
            className="flex flex-wrap gap-1.5 items-center"
          >
            {tags.map((tag, idx) => (
              <span
                key={`${stageTagKey(tag)}-${idx}`}
                role="listitem"
                className={`${STAGE_TAG_CHIP_CLASS} group`}
              >
                <span>{tag}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeTag(idx)}
                    aria-label={`Remove tag ${tag}`}
                    className="text-text-muted hover:text-red-400 font-bold ml-0.5 cursor-pointer leading-none px-0.5"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {!disabled && !atMaxCount && (
          <input
            id={inputId}
            type="text"
            aria-label={`Add tag for ${stageName || 'stage'}`}
            placeholder={tags.length === 0 ? 'e.g. PO, Dev (press Enter)' : 'Add tag…'}
            value={inputValue}
            onChange={(e) => {
              setHint('');
              setInputValue(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (inputValue.trim()) {
                addTag(inputValue);
              }
            }}
            className="flex-1 min-w-[100px] bg-transparent text-[11px] text-on-surface outline-none placeholder:text-text-muted/60 px-1 py-0.5 font-mono"
          />
        )}
      </div>

      {/* Suggestions if any are available in pipeline */}
      {!disabled && unselectedSuggestions.length > 0 && !atMaxCount && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-text-muted">
          <span className="text-[9px] uppercase font-bold tracking-wider">Suggestions:</span>
          {unselectedSuggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => addTag(sug)}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-surface-container-high hover:bg-surface-container-highest border border-border-standard text-text-muted hover:text-on-surface transition-colors cursor-pointer"
            >
              +{sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
