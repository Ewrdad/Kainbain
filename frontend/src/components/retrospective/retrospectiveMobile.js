/***
 * MARK: retrospectiveMobile
 * @description Mobile layout helpers for the retrospective page: the pane
 *   registry behind the mobile tab strip plus the pure helpers that map pane
 *   state to responsive Tailwind classes. Pure data and strings — no React,
 *   no context — so the tab strip and the page shell can never drift apart.
 * @example retrospectivePaneClass(false) => 'hidden lg:block min-w-0'
 ***/

/***
 * MARK: RETROSPECTIVE_MOBILE_BREAKPOINT
 * @description Tailwind breakpoint where the three panes sit side-by-side.
 *   The page grid goes three-column at `lg:`, so the tab strip mirrors that
 *   exact breakpoint: tabs appear whenever the panes would otherwise stack.
 * @example RETROSPECTIVE_MOBILE_BREAKPOINT => 'lg'
 ***/
export const RETROSPECTIVE_MOBILE_BREAKPOINT = 'lg';

/***
 * MARK: RETROSPECTIVE_PANES
 * @description The three page panes in mobile tab order: the bird's-eye
 *   histories list, the quick actions, and the harness-backed chat.
 * @example RETROSPECTIVE_PANES[0].id => 'histories'
 ***/
export const RETROSPECTIVE_PANES = [
  { id: 'histories', label: 'Histories', panelId: 'retrospective-panel-histories' },
  { id: 'actions', label: 'Actions', panelId: 'retrospective-panel-actions' },
  { id: 'chat', label: 'Chat', panelId: 'retrospective-panel-chat' },
];

/***
 * MARK: DEFAULT_RETROSPECTIVE_PANE
 * @description Pane shown first on phones: the histories list, the page's
 *   primary content and the source of every selection.
 * @example DEFAULT_RETROSPECTIVE_PANE => 'histories'
 ***/
export const DEFAULT_RETROSPECTIVE_PANE = 'histories';

/***
 * MARK: isRetrospectivePaneId
 * @description True only for a registered pane id. Guards tab state against
 *   stale or hand-written values (deep links, persisted UI state).
 * @example isRetrospectivePaneId('chat') => true
 * @param {*} value - Candidate pane id.
 * @returns {boolean}
 ***/
export function isRetrospectivePaneId(value) {
  return RETROSPECTIVE_PANES.some((pane) => pane.id === value);
}

/***
 * MARK: normalizeRetrospectivePane
 * @description Coerces any value to a registered pane id, falling back to the
 *   default pane for unknown, empty, or missing values.
 * @example normalizeRetrospectivePane('nope') => 'histories'
 * @param {*} value - Candidate pane id.
 * @returns {string} A registered pane id.
 ***/
export function normalizeRetrospectivePane(value) {
  return isRetrospectivePaneId(value) ? value : DEFAULT_RETROSPECTIVE_PANE;
}

/***
 * MARK: retrospectivePaneClass
 * @description Responsive wrapper class for one page pane. The active pane
 *   shows at every viewport; an inactive pane hides on phones (`hidden`) but
 *   restores on desktop (`lg:block`), so the desktop three-column layout is
 *   byte-identical no matter which tab a phone had open. Panes stay mounted
 *   while hidden — tab switches never drop chat drafts or selections.
 * @example retrospectivePaneClass(false) => 'hidden lg:block min-w-0'
 * @param {boolean} isActive - Whether this pane's tab is selected.
 * @returns {string} Tailwind classes for the pane wrapper.
 ***/
export function retrospectivePaneClass(isActive) {
  return isActive ? 'min-w-0' : 'hidden lg:block min-w-0';
}

/***
 * MARK: retrospectiveMobileTabClass
 * @description Pill classes for one mobile tab: the shared 44px touch target
 *   and label typography in both states, primary fill when selected and a
 *   quiet bordered pill otherwise. Mirrors the sizing of the board's mobile
 *   stage-selector pills so thumbs get one consistent target everywhere.
 * @example retrospectiveMobileTabClass(true) => 'px-3.5 py-2 ... bg-primary ...'
 * @param {boolean} isSelected - Whether this tab's pane is active.
 * @returns {string} Tailwind classes for the tab button.
 ***/
export function retrospectiveMobileTabClass(isSelected) {
  const base =
    'px-3.5 py-2 rounded text-xs font-label-caps uppercase tracking-wider flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer min-h-[44px] shrink-0';
  return isSelected
    ? `${base} bg-primary text-on-primary font-bold shadow-md`
    : `${base} bg-surface-deep text-text-muted hover:text-on-surface hover:bg-surface-container-high border border-border-standard`;
}
