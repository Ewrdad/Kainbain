import { useEffect, useRef, useState } from 'react';
import { searchSettings } from './projectSettingsSearch';

/***
 * MARK: SettingsSearchInput
 * @description Search box for the Project Settings tab bar: typing shows up
 *   to 8 matching settings (label + tab name), `↑`/`↓` moves the highlight,
 *   `Enter` jumps to the highlighted match, `Escape` or clicking outside
 *   closes the dropdown. Choosing a result calls `onSelect` with the index
 *   entry; the parent switches tabs and highlights the setting.
 * @example <SettingsSearchInput onSelect={(entry) => jumpTo(entry)} />
 * @param {Object} props
 * @param {Function} props.onSelect - Called with the chosen index entry.
 ***/
export function SettingsSearchInput({ onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const results = query.trim() ? searchSettings(query).slice(0, 8) : [];
  const activeEntry = results[Math.min(activeIndex, Math.max(results.length - 1, 0))] ?? null;

  // Clicking outside closes the dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open ]);

  const choose = (entry) => {
    if (!entry) return;
    setOpen(false);
    setQuery('');
    onSelect?.(entry);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      // Jump even when the dropdown was dismissed (Escape or click-outside):
      // the text still names the top result, so Enter follows it instead of
      // doing nothing. With an empty query there is no result — no-op.
      if (activeEntry) {
        event.preventDefault();
        choose(activeEntry);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="project-settings-search-listbox"
        aria-activedescendant={activeEntry ? `project-settings-search-option-${activeEntry.id}` : undefined}
        aria-label="Search settings"
        placeholder="Search settings…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          // A new query restarts navigation at the top result.
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="p-2 bg-surface-container border border-border-standard rounded-sm text-xs outline-none focus:border-primary transition-colors text-on-surface placeholder:text-text-muted w-44"
      />
      {open && results.length > 0 && (
        <ul
          id="project-settings-search-listbox"
          role="listbox"
          aria-label="Matching settings"
          className="absolute right-0 mt-1 w-64 max-h-64 overflow-y-auto custom-scrollbar bg-surface-container border border-border-standard rounded-sm shadow-lg z-10 py-1"
        >
          {results.map((entry, index) => (
            <li
              key={entry.id}
              id={`project-settings-search-option-${entry.id}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                onMouseDown={(event) => {
                  // Fires before the input's blur closes the dropdown.
                  event.preventDefault();
                  choose(entry);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer ${
                  index === activeIndex
                    ? 'bg-primary/15 text-on-surface'
                    : 'text-text-muted hover:text-on-surface'
                }`}
              >
                <span className="text-xs font-medium truncate">{entry.label}</span>
                <span className="text-[10px] uppercase tracking-wider shrink-0">
                  {entry.tabLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
