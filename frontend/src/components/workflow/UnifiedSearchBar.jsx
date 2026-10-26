import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  parseSearchQuery,
  buildSearchQuery,
  extractTagTokenAtCursor,
  extractSystemTokenAtCursor,
  isTagToken,
} from './searchQueryParser';
import {
  buildDisplayText,
  dedupeTagLabels,
  draftTokenSpan,
  getTagLabel,
  isCommittableDraft,
  normalizeSearchValue,
  normalizeTagOptions,
  scheduleAfterPaint,
} from './unifiedSearchBarUtils';
import {
  SYSTEM_FILTERS,
  getSystemFilter,
  isSystemFilterDraftToken,
  isSystemFilterToken,
} from './systemFilters';

/***
 * MARK: UnifiedSearchBar
 ***/

const TAG_FILTER_MODES = [
  { id: 'any', label: 'Any' },
  { id: 'all', label: 'All' },
];

function SearchTagChip({ tag, prefix = '#', onRemove }) {
  let safeTag = '';
  if (typeof tag === 'string') safeTag = tag;
  else if (tag != null) safeTag = String(tag);
  if (!safeTag) return null;
  const handleRemove = () => {
    if (typeof onRemove === 'function') onRemove(safeTag);
  };
  const isSystem = prefix === '!';
  const chipClass = isSystem
    ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
    : 'bg-primary/10 text-primary border-primary/30';
  const ariaLabel = isSystem ? `Remove filter ${safeTag}` : `Remove tag ${safeTag}`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 border rounded text-[11px] font-mono shrink-0 max-w-[90px] sm:max-w-[140px] ${chipClass}`}
    >
      <span className="truncate">
        {prefix}
        {safeTag}
      </span>
      <button
        type="button"
        onClick={handleRemove}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' ||
            event.key === ' ' ||
            event.key === 'Backspace' ||
            event.key === 'Delete'
          ) {
            event.preventDefault();
            handleRemove();
          }
        }}
        aria-label={ariaLabel}
        className="inline-flex items-center justify-center min-w-[20px] min-h-[20px] px-1 text-text-muted hover:text-error cursor-pointer shrink-0"
      >
        ×
      </button>
    </span>
  );
}

function TagFilterModeToggle({ mode, onModeChange }) {
  const safeMode = typeof mode === 'string' ? mode : 'any';
  const handleChange = (entryId) => {
    if (typeof onModeChange === 'function') onModeChange(entryId);
  };
  return (
    <div className="hidden md:flex bg-surface-container rounded-sm border border-border-standard p-0.5 shrink-0">
      {TAG_FILTER_MODES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => handleChange(entry.id)}
          aria-pressed={safeMode === entry.id}
          aria-label={`Match ${entry.id} selected tag${entry.id === 'all' ? 's' : ''}`}
          title={
            entry.id === 'any'
              ? 'Show stages matching at least one selected tag'
              : 'Show only stages matching every selected tag'
          }
          className={`px-2 py-1 text-[10px] font-bold uppercase rounded-sm transition-colors cursor-pointer ${
            safeMode === entry.id
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-text-muted hover:text-on-surface'
          }`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

export function UnifiedSearchBar({
  value = '',
  onChange,
  tagOptions = [],
  tagFilterMode = 'any',
  onTagFilterModeChange,
  placeholder = 'Search tasks, #tags, or !filters…',
}) {
  const query = normalizeSearchValue(value);
  const safeTagOptions = normalizeTagOptions(tagOptions);

  const [cursorPosition, setCursorPosition] = useState(null);
  const [isClosed, setIsClosed] = useState(false);
  const [draft, setDraft] = useState('');
  const [trailingGap, setTrailingGap] = useState(false);

  const listboxId = useId();

  const parsed = useMemo(() => parseSearchQuery(query), [query]);
  const tags = parsed.tags;
  const systemFilters = parsed.systemFilters;
  const text = parsed.text;
  const hasTags = tags.length > 0 || systemFilters.length > 0;
  const committedTagNames = useMemo(
    () => new Set(tags.map((t) => String(t).toLowerCase())),
    [tags],
  );
  const committedSystemNames = useMemo(
    () => new Set(systemFilters.map((t) => String(t).toLowerCase())),
    [systemFilters],
  );
  const display = buildDisplayText(text, draft, trailingGap);

  const [syncedValue, setSyncedValue] = useState(query);
  const [lastEmitted, setLastEmitted] = useState(query);
  if (syncedValue !== query) {
    setSyncedValue(query);
    if (query !== lastEmitted) {
      setLastEmitted(query);
      const next = parseSearchQuery(query);
      if (!next.text && next.tags.length === 0 && next.systemFilters.length === 0) {
        setDraft('');
        setTrailingGap(false);
        setCursorPosition(null);
        setIsClosed(false);
      }
    }
  }

  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const knownTagNames = useMemo(() => {
    const names = new Set();
    for (const opt of safeTagOptions) {
      const label = getTagLabel(opt);
      if (label) names.add(label.toLowerCase());
    }
    return names;
  }, [safeTagOptions]);

  const canonicalTagName = (name) => {
    const wanted = String(name || '').trim();
    if (!wanted) return '';
    for (const opt of safeTagOptions) {
      const label = getTagLabel(opt);
      if (label && label.toLowerCase() === wanted.toLowerCase()) return label;
    }
    return wanted;
  };

  const canonicalSystemFilterName = (name) => {
    const wanted = String(name || '')
      .trim()
      .replace(/^!+/, '');
    const entry = getSystemFilter(wanted);
    return entry ? entry.id : wanted;
  };

  const draftToken = useMemo(() => {
    const tagToken = extractTagTokenAtCursor(display, cursorPosition);
    if (tagToken) return tagToken;
    return extractSystemTokenAtCursor(display, cursorPosition);
  }, [display, cursorPosition]);

  const suggestions = useMemo(() => {
    if (draftToken === null) return [];
    const prefix = draftToken.charAt(0);
    const partial = draftToken.slice(1).toLowerCase();
    if (prefix === '#') {
      const selected = new Set(tags.map((t) => t.toLowerCase()));
      return dedupeTagLabels(safeTagOptions.map((opt) => getTagLabel(opt)))
        .filter((label) => !selected.has(label.toLowerCase()))
        .filter((label) => (partial ? label.toLowerCase().includes(partial) : true));
    }
    if (prefix === '!') {
      const selected = new Set(systemFilters.map((t) => t.toLowerCase()));
      const labels = SYSTEM_FILTERS.map((f) => f.id);
      return dedupeTagLabels(labels)
        .filter((label) => !selected.has(label.toLowerCase()))
        .filter((label) => (partial ? label.toLowerCase().includes(partial) : true));
    }
    return [];
  }, [safeTagOptions, draftToken, tags, systemFilters]);

  const [highlight, setHighlight] = useState({ token: null, index: 0 });
  const highlightedIndex = highlight.token === draftToken ? highlight.index : 0;

  const isDropdownOpen = !isClosed && draftToken !== null && suggestions.length > 0;
  const safeHighlightedIndex = suggestions.length === 0 ? 0 : highlightedIndex % suggestions.length;
  const setHighlightedIndex = (updater) => {
    setHighlight((prev) => {
      const base = prev.token === draftToken ? prev.index : 0;
      const next = typeof updater === 'function' ? updater(base) : updater;
      return { token: draftToken, index: next };
    });
  };

  useEffect(() => {
    if (!isDropdownOpen) return undefined;
    const handleOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsClosed(true);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isDropdownOpen]);

  const emitRaw = (raw) => {
    setLastEmitted(raw);
    if (typeof onChange === 'function') onChange(raw);
  };

  const focusEnd = (pos) => {
    scheduleAfterPaint(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const maxLen =
          typeof inputRef.current.value === 'string' ? inputRef.current.value.length : 0;
        const targetPos = typeof pos === 'number' ? Math.max(0, Math.min(pos, maxLen)) : maxLen;
        try {
          inputRef.current.setSelectionRange(targetPos, targetPos);
        } catch {}
        setCursorPosition(targetPos);
      }
    });
  };

  const commitTag = (tagName) => {
    const canonical = canonicalTagName(tagName);
    if (!canonical) return;
    const triggerFreeText = text
      .split(/\s+/)
      .filter((tok) => tok && tok !== '#' && tok !== '!')
      .join(' ');
    emitRaw(buildSearchQuery(triggerFreeText, [...tags, canonical], systemFilters));
    setDraft('');
    setTrailingGap(false);
    setIsClosed(true);
    focusEnd(triggerFreeText.length);
  };

  const commitSystemFilter = (id) => {
    const canonical = canonicalSystemFilterName(id);
    if (!getSystemFilter(canonical)) return;
    const triggerFreeText = text
      .split(/\s+/)
      .filter((tok) => tok && tok !== '#' && tok !== '!')
      .join(' ');
    emitRaw(buildSearchQuery(triggerFreeText, tags, [...systemFilters, canonical]));
    setDraft('');
    setTrailingGap(false);
    setIsClosed(true);
    focusEnd(triggerFreeText.length);
  };

  const caretForEvent = (event) => {
    const target = event.target;
    if (
      typeof document !== 'undefined' &&
      document.activeElement === target &&
      target &&
      typeof target.selectionStart === 'number'
    ) {
      return target.selectionStart;
    }
    return cursorPosition;
  };

  const handleChange = (event) => {
    const next = event.target.value;
    const caret = caretForEvent(event);
    const span = draftTokenSpan(next, caret);
    const terminated = /\s$/.test(next);

    const tagTokens = [];
    const systemTokens = [];
    const textToks = [];
    const tokenRe = /\S+/g;
    let match;
    while ((match = tokenRe.exec(next)) !== null) {
      const tok = match[0];
      const inDraft =
        span !== null && match.index < span.end && span.start < match.index + tok.length;
      if (inDraft) continue;
      if (isTagToken(tok)) tagTokens.push(tok);
      else if (isSystemFilterToken(tok)) systemTokens.push(tok);
      else textToks.push(tok);
    }

    let newDraft = span ? span.token : '';
    const commits = [...tagTokens, ...systemTokens];
    if (newDraft && isTagToken(newDraft) && committedTagNames.has(newDraft.slice(1).toLowerCase()))
      newDraft = '';
    if (
      newDraft &&
      newDraft.startsWith('!') &&
      committedSystemNames.has(newDraft.slice(1).toLowerCase())
    )
      newDraft = '';
    // also swallow draft echo for known committed; unknown stays draft.

    if (caret === null && !terminated && commits.length > 0) {
      const last = commits.at(-1);
      if (last && (isTagToken(last) || isSystemFilterToken(last))) {
        const lowerLast = last.slice(1).toLowerCase();
        const isKnownTag = knownTagNames.has(lowerLast) || committedTagNames.has(lowerLast);
        const isKnownSys =
          Boolean(getSystemFilter(lowerLast)) || committedSystemNames.has(lowerLast);
        if (isTagToken(last) && !isKnownTag && !committedTagNames.has(lowerLast)) {
          newDraft = last;
          tagTokens.pop();
        } else if (last.startsWith('!') && !isKnownSys && !committedSystemNames.has(lowerLast)) {
          // keep unknown ! as text, not system chip
        }
      }
    }

    const newText = textToks.join(' ');
    const commitsTagsToApply = tagTokens.filter(
      (tok) => !committedTagNames.has(tok.slice(1).toLowerCase()),
    );
    const commitsSysToApply = systemTokens.filter(
      (tok) => !committedSystemNames.has(tok.slice(1).toLowerCase()),
    );
    const raw = buildSearchQuery(
      newText,
      [...tags, ...commitsTagsToApply.map((tok) => canonicalTagName(tok.slice(1)))],
      [
        ...systemFilters,
        ...commitsSysToApply.map((tok) => canonicalSystemFilterName(tok.slice(1))),
      ],
    );
    setDraft(newDraft);
    setTrailingGap(terminated && commits.length === 0 && !newDraft && newText.length > 0);
    if (typeof caret === 'number') setCursorPosition(caret);
    setIsClosed(false);
    if (raw !== query) emitRaw(raw);
  };

  const removeTag = (tag) => {
    if (tag == null) return;
    const nextTags = tags.filter((t) => String(t).toLowerCase() !== String(tag).toLowerCase());
    emitRaw(buildSearchQuery(text, nextTags, systemFilters));
  };

  const removeSystemFilter = (id) => {
    if (id == null) return;
    const nextFilters = systemFilters.filter(
      (t) => String(t).toLowerCase() !== String(id).toLowerCase(),
    );
    emitRaw(buildSearchQuery(text, tags, nextFilters));
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsClosed(true);
      return;
    }
    if (event.key === 'Backspace') {
      const field = event.target.value;
      if ((field === '' || field == null) && (tags.length > 0 || systemFilters.length > 0)) {
        event.preventDefault();
        if (systemFilters.length > 0) removeSystemFilter(systemFilters.at(-1));
        else removeTag(tags.at(-1));
      }
      return;
    }
    if (event.key === 'Enter' && isDropdownOpen && suggestions.length > 0) {
      const option = suggestions.at(safeHighlightedIndex);
      if (option) {
        event.preventDefault();
        if (draftToken && draftToken.startsWith('!')) commitSystemFilter(option);
        else commitTag(option);
        return;
      }
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const caret = caretForEvent(event);
      const span = draftTokenSpan(display, caret);
      const token = span ? span.token : null;
      if (token && isCommittableDraft(token)) {
        event.preventDefault();
        commitTag(token.slice(1));
      } else if (token && token.startsWith('!') && isSystemFilterDraftToken(token)) {
        event.preventDefault();
        commitSystemFilter(token.slice(1));
      }
      return;
    }
    if (!isDropdownOpen || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    }
  };

  const removeTagAndFocus = (tag) => {
    removeTag(tag);
    if (inputRef.current) inputRef.current.focus();
  };
  const removeSystemAndFocus = (id) => {
    removeSystemFilter(id);
    if (inputRef.current) inputRef.current.focus();
  };

  const syncCursor = () => {
    if (inputRef.current) {
      const pos = inputRef.current.selectionStart;
      setCursorPosition(typeof pos === 'number' ? pos : display.length);
    }
  };

  return (
    <div
      ref={containerRef}
      data-testid="unified-search-bar"
      className="relative flex flex-wrap items-center gap-1.5 min-w-0 w-full"
    >
      <div className="flex items-center gap-1 min-w-0 w-full lg:w-auto lg:flex-1 bg-surface-container border border-border-standard rounded-sm px-2 py-0.5 sm:py-1.5 focus-within:border-primary overflow-hidden">
        {(tags.length > 0 || systemFilters.length > 0) && (
          <div
            data-testid="unified-search-chips"
            className="flex items-center gap-1 min-w-0 shrink overflow-x-auto scroll-smooth custom-scrollbar"
          >
            <div className="flex items-center gap-1 flex-nowrap">
              {tags.map((tag) => (
                <SearchTagChip
                  key={`tag-${String(tag ?? '').toLowerCase()}`}
                  tag={tag}
                  prefix="#"
                  onRemove={removeTagAndFocus}
                />
              ))}
              {systemFilters.map((filter) => (
                <SearchTagChip
                  key={`sys-${String(filter ?? '').toLowerCase()}`}
                  tag={filter}
                  prefix="!"
                  onRemove={removeSystemAndFocus}
                />
              ))}
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isDropdownOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isDropdownOpen && suggestions.length > 0
              ? `${listboxId}-option-${safeHighlightedIndex}`
              : undefined
          }
          aria-label="Search tasks"
          placeholder={tags.length === 0 && systemFilters.length === 0 ? placeholder : ''}
          value={display}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={() => {
            setIsClosed(false);
            syncCursor();
          }}
          onKeyUp={syncCursor}
          onSelect={syncCursor}
          className={`${
            hasTags ? 'w-[100px] sm:w-auto flex-none sm:flex-1 sm:min-w-[80px]' : 'min-w-0 flex-1'
          } bg-transparent border-0 outline-none text-base sm:text-xs text-on-surface placeholder-text-muted font-mono py-0.5 sm:py-1 leading-tight`}
        />
        {query || draft ? (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              setTrailingGap(false);
              setIsClosed(true);
              emitRaw('');
            }}
            aria-label="Clear search"
            className="inline-flex items-center justify-center min-w-[28px] min-h-[28px] text-text-muted hover:text-on-surface text-xs cursor-pointer shrink-0"
          >
            ✕
          </button>
        ) : null}
      </div>

      {isDropdownOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 w-full max-h-56 overflow-y-auto bg-surface-deep border border-border-standard rounded-sm shadow-2xl z-50"
        >
          {suggestions.map((option, idx) => {
            const prefix = draftToken && draftToken.startsWith('!') ? '!' : '#';
            return (
              <button
                key={option.toLowerCase()}
                id={`${listboxId}-option-${idx}`}
                type="button"
                role="option"
                aria-selected={idx === safeHighlightedIndex}
                onClick={() => {
                  if (prefix === '!') commitSystemFilter(option);
                  else commitTag(option);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full text-left px-3 py-2.5 sm:py-2 text-xs font-mono min-h-[44px] sm:min-h-0 cursor-pointer ${
                  idx === safeHighlightedIndex
                    ? 'bg-primary/20 text-primary'
                    : 'text-on-surface hover:bg-surface-container'
                }`}
              >
                {prefix}
                {option}
              </button>
            );
          })}
        </div>
      )}

      {hasTags && typeof onTagFilterModeChange === 'function' && (
        <TagFilterModeToggle mode={tagFilterMode} onModeChange={onTagFilterModeChange} />
      )}
    </div>
  );
}

export default UnifiedSearchBar;
