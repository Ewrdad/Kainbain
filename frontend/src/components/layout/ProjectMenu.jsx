import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterProjects } from './projectMenuFilter';
import { scrollIntoViewRespectingMotion } from '../../a11y/reducedMotion';

/***
 * MARK: ProjectMenu
 * @description Bounded, searchable project-switcher panel extracted from
 *   `Header` (Step 1). The list region is height-capped and scrolls
 *   internally (`max-h-*` + `overflow-y-auto`) so hundreds of projects never
 *   push the count header, archived toggle, or "+ New Project" action out of
 *   reach (Step 2). A filter input narrows `visibleProjects` by
 *   case-insensitive substring via `filterProjects` (Step 3); keyboard flow
 *   (Arrow Up/Down, Enter, Home/End, Escape) is container-managed through the
 *   search input with `aria-activedescendant`, mirroring `SelectDropdown` /
 *   `MultiSelectDropdown`. Rows may carry an optional `group` string: when
 *   consecutive rows share one, a `role="group"` section header renders
 *   (same visual/ARIA pattern as `SelectDropdown`), so the future grouping
 *   ticket needs no menu restructure — no grouping logic lives here (Step 4).
 * @example <ProjectMenu projects={projects} visibleProjects={visible} activeProjectId={id} selectProject={select} onClose={close} onCreateProject={open} />
 * @param {Object} props
 * @param {Array<Object>} [props.projects=[]] - All projects (for the `X / N` count).
 * @param {Array<Object>} [props.visibleProjects] - Archived-filtered projects (defaults to `projects`).
 * @param {string} [props.activeProjectId] - Currently active project id.
 * @param {Function} props.selectProject - Called with the project id on select.
 * @param {Function} props.onClose - Called to close the menu (Escape, selection fallthrough).
 * @param {Function} props.onCreateProject - Called for the "+ New Project" action.
 * @param {Function} [props.onAdoptProject] - Called for the "+ Add Existing Project…" action.
 * @param {Array<string>} [props.hiddenProjectIds=[]] - Ids flagged hidden (archived).
 * @param {Function} [props.toggleHideProject] - Toggles a project hidden flag.
 * @param {boolean} [props.showArchived] - Whether archived projects are shown.
 * @param {Function} [props.setShowArchived] - Archived-visibility setter.
 * @param {React.RefObject} [props.triggerRef] - Header pill ref, refocused on keyboard close.
 ***/
export function ProjectMenu({
  projects = [],
  visibleProjects,
  activeProjectId,
  selectProject,
  onClose,
  onCreateProject,
  onAdoptProject,
  hiddenProjectIds = [],
  toggleHideProject,
  showArchived,
  setShowArchived,
  triggerRef,
}) {
  const list = useMemo(() => visibleProjects ?? projects ?? [], [visibleProjects, projects]);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const autoId = useId();
  const sanitizedId = `project-menu-${autoId.replace(/:/g, '')}`;
  const listboxId = `${sanitizedId}-listbox`;
  const searchId = `${sanitizedId}-search`;

  const searchRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => filterProjects(list, query), [list, query]);

  // Clamp at read time: filtering can shrink the list under a set highlight.
  const highlightedProject =
    highlightedIndex >= 0 && highlightedIndex < filtered.length
      ? filtered[highlightedIndex]
      : undefined;

  // Focus the search field on open (replaces the `autoFocus` prop, which
  // jsx-a11y/no-autofocus forbids) and bring the active project into view
  // inside the bounded list region.
  useEffect(() => {
    searchRef.current?.focus?.();
    scrollIntoViewRespectingMotion(listRef.current?.querySelector('[data-active="true"]'), {
      block: 'nearest',
    });
    // Run once per mount: the menu mounts fresh on every open.
  }, []);

  // Keep the keyboard highlight visible while arrowing through long lists.
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    scrollIntoViewRespectingMotion(
      listRef.current.querySelector(`[data-opt-index="${highlightedIndex}"]`),
      { block: 'nearest' },
    );
  }, [highlightedIndex]);

  const closeMenu = (returnFocus = false) => {
    setQuery('');
    setHighlightedIndex(-1);
    onClose?.();
    if (returnFocus) triggerRef?.current?.focus?.();
  };

  const handleSelect = (projectId) => {
    setQuery('');
    setHighlightedIndex(-1);
    selectProject?.(projectId);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev + 1;
        return next < filtered.length ? next : prev;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (filtered.length > 0) setHighlightedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (filtered.length > 0) setHighlightedIndex(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedProject) handleSelect(highlightedProject.id);
    }
  };

  let lastGroup = null;

  return (
    <div
      id="project-menu"
      role="dialog"
      aria-label="Projects"
      className="absolute left-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] bg-surface-container border border-border-standard shadow-2xl z-50 rounded-sm overflow-hidden animate-in fade-in zoom-in duration-150"
    >
      <div className="p-1 space-y-0.5">
        <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-text-muted flex justify-between items-center">
          <span>Active Projects</span>
          <span className="font-mono text-[9px]">
            {filtered.length} / {(projects ?? []).length}
          </span>
        </div>

        <div className="px-1 pb-1">
          <input
            ref={searchRef}
            id={searchId}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={
              highlightedProject ? `${sanitizedId}-opt-${highlightedIndex}` : undefined
            }
            aria-label="Search projects"
            placeholder="Search projects…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleSearchKeyDown}
            className="w-full px-2.5 py-1.5 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface placeholder:text-text-muted outline-none focus-visible:border-primary"
          />
        </div>

        {/* Keyboard flow is container-managed: the search input owns
            arrows/Enter/Home/End/Escape via handleSearchKeyDown and options
            stay unfocusable (APG listbox pattern, mirroring SelectDropdown);
            hover/click are pointer parity only. */}
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Projects"
          data-testid="project-menu-list"
          className="max-h-[min(50vh,20rem)] overflow-y-auto custom-scrollbar space-y-0.5"
        >
          {list.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted italic">No projects yet.</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted italic">
              No projects match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            filtered.map((p, idx) => {
              const isHidden = hiddenProjectIds.includes(p.id);
              const isActive = activeProjectId === p.id;
              const isHighlighted = idx === highlightedIndex;
              // Group headers are decorative: they are NOT entries in the
              // filtered option list, so keyboard indices only ever match
              // project rows (same pattern as SelectDropdown).
              const showGroupHeader = Boolean(p.group) && p.group !== lastGroup;
              lastGroup = p.group ?? lastGroup;

              return (
                <React.Fragment key={p.id}>
                  {showGroupHeader && (
                    <div
                      role="group"
                      aria-label={p.group}
                      className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted border-b border-border-standard/40 select-none"
                    >
                      {p.group}
                    </div>
                  )}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- container-managed keyboard flow (highlight + Enter in search input); hover/click are pointer parity only */}
                  <div
                    id={`${sanitizedId}-opt-${idx}`}
                    role="option"
                    data-opt-index={idx}
                    aria-selected={isActive}
                    data-active={isActive || undefined}
                    data-selected={isActive}
                    onClick={() => handleSelect(p.id)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex items-center justify-between px-2 py-1 min-h-[44px] rounded-sm text-xs transition-colors group cursor-pointer ${
                      isActive
                        ? 'bg-primary text-on-primary font-bold'
                        : isHighlighted
                          ? 'bg-primary/20 text-primary font-medium'
                          : isHidden
                            ? 'opacity-60 hover:opacity-100 hover:bg-surface-container-high text-text-muted'
                            : 'text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="flex-1 text-left py-1 min-w-0 flex flex-col justify-center">
                      <span className="flex items-center gap-1.5 truncate">
                        <span
                          className="inline-block w-3 h-3 rounded-full ring-1 ring-on-surface/20 shrink-0"
                          style={{ backgroundColor: p.accentColor || '#7bdb85' }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{p.name}</span>
                        {isHidden && (
                          <span
                            className={`text-[8px] px-1 py-0.2 rounded font-mono uppercase ${
                              isActive
                                ? 'bg-black/30 text-on-primary'
                                : 'bg-surface-deep text-text-muted'
                            }`}
                          >
                            hidden
                          </span>
                        )}
                      </span>
                      {p.cwd && (
                        <span
                          className={`text-[10px] font-mono truncate pl-4.5 block ${
                            isActive ? 'text-on-primary/80' : 'text-text-muted'
                          }`}
                          title={p.cwd}
                        >
                          {p.cwd}
                        </span>
                      )}
                    </span>

                    <span className="flex items-center gap-1 shrink-0">
                      {toggleHideProject && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHideProject(p.id);
                          }}
                          title={isHidden ? 'Unhide project' : 'Hide project from list'}
                          aria-label={isHidden ? `Unhide ${p.name}` : `Hide ${p.name}`}
                          className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-1 rounded text-xs transition-opacity cursor-pointer ${
                            isActive
                              ? 'text-on-primary/80 hover:text-on-primary'
                              : // WCAG 2.4.7: keyboard focus reveals the control
                                // (hover-only visibility would strand tab users
                                // on an invisible target).
                                'text-text-muted hover:text-on-surface opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                          }`}
                        >
                          <span>{isHidden ? '👁️' : '🚫'}</span>
                        </button>
                      )}
                      {isActive && <span className="font-bold text-xs ml-1">✓</span>}
                    </span>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="h-px bg-border-standard my-1" role="separator" />

        {/* Show / Hide Archived Toggle (#29) */}
        <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-text-muted bg-surface-deep/40 rounded-sm">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(showArchived)}
              onChange={(e) => setShowArchived?.(e.target.checked)}
              className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
            />
            <span>Show Archived ({hiddenProjectIds.length})</span>
          </label>
        </div>

        <div className="h-px bg-border-standard my-1" role="separator" />

        <button
          type="button"
          onClick={() => onCreateProject?.()}
          className="w-full text-left px-3 py-2 min-h-[44px] text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-on-primary rounded-sm transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>+ New Project</span>
        </button>
        <button
          type="button"
          onClick={() => onAdoptProject?.()}
          className="w-full text-left px-3 py-2 min-h-[44px] text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-on-primary rounded-sm transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>+ Add Existing Project…</span>
        </button>
      </div>
    </div>
  );
}
