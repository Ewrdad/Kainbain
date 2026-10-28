import { useEffect, useId, useMemo, useRef, useState } from 'react';

/***
 * MARK: defaultMultiSelectFilter
 * @description Default substring filter for `MultiSelectDropdown`: matches
 *   the query against the option label, secondary text, and value.
 *   Callers with richer matching (e.g. kb-number normalization) pass their
 *   own `filterOptions` instead.
 * @example defaultMultiSelectFilter([{value:'a',label:'Build API'}], 'build') => [{value:'a',label:'Build API'}]
 * @param {Array<Object>} [options=[]] - Full option list.
 * @param {string} [query] - Raw user query.
 * @returns {Array<Object>} Matching options (all when the query is blank).
 ***/
export function defaultMultiSelectFilter(options = [], query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return options || [];
  return (options || []).filter((opt) => {
    const haystack =
      `${opt?.label || ''} ${opt?.secondary || ''} ${opt?.value || ''}`.toLowerCase();
    return haystack.includes(q);
  });
}

/***
 * MARK: MultiSelectDropdown
 * @description Generic tags-style multi-select dropdown: a collapsed trigger
 *   button (`N selected` / placeholder) opens a popover with a search field
 *   and a `listbox` of toggleable options. Selection renders as removable
 *   chips. No external dependency; styling reuses existing Tailwind tokens.
 * @param {Object} props
 * @param {Array<Object>} [props.options=[]] - Options `{ value, label, secondary?, disabled? }`.
 * @param {Array<string>} [props.selected=[]] - Selected values (as strings).
 * @param {Function} props.onChange - Called with the next selected array on toggle/remove.
 * @param {Function} [props.filterOptions] - `(options, query) => filtered` custom search; defaults to substring match.
 * @param {Function} [props.onSearch] - Notified with the raw query on each keystroke.
 * @param {string} [props.placeholder='Select...'] - Trigger text when nothing is selected.
 * @param {string} [props.searchPlaceholder='Search...'] - Search input placeholder.
 * @param {boolean} [props.disabled=false] - Disables trigger, search, and chip removal.
 * @param {string} [props.emptyText='No options'] - Shown when there are no options at all.
 * @param {string} [props.noResultsText='No matches found'] - Shown when the query filters out every option.
 * @param {boolean} [props.showChips=true] - Whether to render selected chips. Callers that render their own selection list pass false.
 * @param {string} [props.ariaLabel] - Accessible label for trigger and listbox.
 * @example <MultiSelectDropdown options={opts} selected={sel} onChange={setSel} ariaLabel="Prerequisite tasks" />
 ***/
export function MultiSelectDropdown({
  options = [],
  selected = [],
  onChange,
  filterOptions = defaultMultiSelectFilter,
  onSearch,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  disabled = false,
  emptyText = 'No options',
  noResultsText = 'No matches found',
  showChips = true,
  ariaLabel,
  'aria-label': ariaLabelProp,
}) {
  const autoId = useId();
  const sanitizedId = `multiselect-${autoId.replace(/:/g, '')}`;
  const listboxId = `${sanitizedId}-listbox`;
  const searchId = `${sanitizedId}-search`;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);

  const label = ariaLabel || ariaLabelProp || 'Multi-select';

  const selectedStrings = useMemo(() => (selected || []).map(String), [selected]);

  const selectedOptions = useMemo(() => {
    const byValue = new Map((options || []).map((opt) => [String(opt.value), opt]));
    return selectedStrings.map((value) => byValue.get(value)).filter(Boolean);
  }, [options, selectedStrings]);

  const visibleOptions = useMemo(
    () => filterOptions(options || [], query),
    [options, query, filterOptions],
  );

  // Clamp at read time instead of syncing in an effect: filtering can shrink
  // the list while a highlight index is set.
  const highlightedOption =
    highlightedIndex >= 0 && highlightedIndex < visibleOptions.length
      ? visibleOptions[highlightedIndex]
      : undefined;

  // Click outside closes the popover
  useEffect(() => {
    if (!isOpen) return undefined;
    // Focus the search field on open (replaces the `autoFocus` prop, which
    // jsx-a11y/no-autofocus forbids): keyboard users type-to-filter immediately.
    searchRef.current?.focus?.();
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const openDropdown = () => {
    if (disabled) return;
    setHighlightedIndex(-1);
    setIsOpen(true);
  };

  const closeDropdown = (returnFocus = false) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const toggleDropdown = () => {
    if (isOpen) closeDropdown();
    else openDropdown();
  };

  const toggleValue = (rawValue) => {
    const value = String(rawValue);
    const next = selectedStrings.includes(value)
      ? selectedStrings.filter((entry) => entry !== value)
      : [...selectedStrings, value];
    onChange?.(next);
  };

  const removeValue = (rawValue) => {
    const value = String(rawValue);
    onChange?.(selectedStrings.filter((entry) => entry !== value));
  };

  const handleQueryChange = (e) => {
    const next = e.target.value;
    setQuery(next);
    setHighlightedIndex(-1);
    onSearch?.(next);
  };

  const toggleHighlighted = () => {
    if (highlightedOption && !highlightedOption.disabled) {
      toggleValue(highlightedOption.value);
    }
  };

  const handlePopoverKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const start = Math.min(prev, visibleOptions.length - 1);
        let next = start + 1;
        while (next < visibleOptions.length && visibleOptions[next]?.disabled) next += 1;
        return next < visibleOptions.length ? next : start;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const start = prev >= visibleOptions.length ? visibleOptions.length - 1 : prev;
        let next = start - 1;
        while (next >= 0 && visibleOptions[next]?.disabled) next -= 1;
        return next >= 0 ? next : start;
      });
    } else if (
      (e.key === 'Enter' || e.key === ' ') &&
      document.activeElement === searchRef.current
    ) {
      // Let Space type in the search box; only Enter toggles the highlight.
      if (e.key === 'Enter') {
        e.preventDefault();
        toggleHighlighted();
      }
    }
  };

  const triggerText =
    selectedStrings.length === 0 ? placeholder : `${selectedStrings.length} selected`;

  return (
    <div ref={containerRef} className="relative" data-testid="multiselect-dropdown">
      {showChips && selectedOptions.length > 0 && (
        <ul aria-label={`${label} selected`} className="flex flex-wrap gap-1 mb-1.5">
          {selectedOptions.map((opt) => (
            <li
              key={String(opt.value)}
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-surface-container-high border border-border-standard rounded text-[11px] font-mono text-on-surface"
            >
              <span className="truncate max-w-[160px]">{opt.label}</span>
              <button
                type="button"
                onClick={() => removeValue(opt.value)}
                disabled={disabled}
                aria-label={`Remove ${opt.label}`}
                className="px-1 text-text-muted hover:text-error disabled:opacity-40 cursor-pointer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={toggleDropdown}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-[11px] font-mono text-on-surface cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed outline-none select-none"
      >
        <span className="truncate">{triggerText}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-surface-deep/95 backdrop-blur-md border border-border-standard rounded-sm shadow-2xl">
          <div className="p-1.5 border-b border-border-standard/40">
            <input
              ref={searchRef}
              id={searchId}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handlePopoverKeyDown}
              placeholder={searchPlaceholder}
              aria-label={`${label} search`}
              disabled={disabled}
              className="w-full px-2 py-1.5 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-on-surface placeholder:text-text-muted outline-none focus-visible:border-primary"
            />
          </div>
          {/* Keyboard flow is container-managed (search input owns arrows/Enter
              via handlePopoverKeyDown; options stay unfocused while highlight
              tracks highlightedIndex), mirroring SelectDropdown. */}
          {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- container-managed keyboard flow, see above */}
          <div
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            onKeyDown={handlePopoverKeyDown}
            className="max-h-[240px] overflow-y-auto custom-scrollbar py-1"
          >
            {(options || []).length === 0 ? (
              <p className="px-3 py-2 text-[11px] font-mono text-text-muted italic">{emptyText}</p>
            ) : visibleOptions.length === 0 ? (
              <p className="px-3 py-2 text-[11px] font-mono text-text-muted italic">
                {noResultsText}
              </p>
            ) : (
              visibleOptions.map((opt, idx) => {
                const value = String(opt.value);
                const isSelected = selectedStrings.includes(value);
                const isHighlighted = idx === highlightedIndex;
                return (
                  /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- container-managed keyboard flow (highlight + Enter in search input); hover/click are pointer parity only */
                  <div
                    key={value || idx}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={Boolean(opt.disabled)}
                    aria-label={String(opt.label)}
                    data-selected={isSelected}
                    onClick={() => {
                      if (!opt.disabled) toggleValue(value);
                    }}
                    onMouseEnter={() => {
                      if (!opt.disabled) setHighlightedIndex(idx);
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 min-h-[44px] text-[11px] font-mono cursor-pointer select-none ${
                      opt.disabled
                        ? 'opacity-30 cursor-not-allowed text-text-muted'
                        : isHighlighted
                          ? 'bg-primary/20 text-primary font-medium'
                          : isSelected
                            ? 'bg-surface-container-high text-on-surface font-semibold'
                            : 'text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex items-center justify-center w-3.5 h-3.5 shrink-0 border rounded-sm text-[10px] leading-none ${
                        isSelected
                          ? 'bg-primary border-primary text-on-primary'
                          : 'border-border-standard text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="truncate flex-1">{opt.label}</span>
                    {opt.secondary && (
                      <span className="shrink-0 text-[10px] text-text-muted">{opt.secondary}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
