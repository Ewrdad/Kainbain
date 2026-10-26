import React, { useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { RetrospectiveProvider } from './useRetrospective';
import { useTaskHistories } from './useTaskHistories';
import { TaskHistoriesPanel } from './TaskHistoriesPanel';
import { QuickActionsPanel } from './QuickActionsPanel';
import { RetrospectiveChat } from './RetrospectiveChat';
import {
  DEFAULT_RETROSPECTIVE_PANE,
  RETROSPECTIVE_PANES,
  normalizeRetrospectivePane,
  retrospectiveMobileTabClass,
  retrospectivePaneClass,
} from './retrospectiveMobile';

/***
 * MARK: RetrospectivePage
 * @description Cross-task retrospective review page (`/retrospective`): the
 *   bird's-eye task histories, quick actions, and harness-backed chat close
 *   the improving feedback loop — review recent work, spot patterns, and
 *   confirm suggested tickets onto the board. Selection state is shared
 *   across all three panes via `RetrospectiveProvider`. On phones the panes
 *   collapse behind a tab strip (one visible at a time); on desktop every
 *   pane stays visible side-by-side. The page root is the vertical scroll
 *   owner (`flex-1 min-h-0 overflow-y-auto`), so stacked phone content below
 *   the fold stays reachable inside the `overflow-hidden` app shell.
 * @example <RetrospectivePage />
 ***/
export function RetrospectivePage() {
  // Document title is owned solely by App.jsx: a second useDocumentTitle
  // here fought the global hook and left "Retrospective" stuck in the tab
  // after navigating away.
  const { activeProjectId } = useKainBain();
  const histories = useTaskHistories({ projectId: activeProjectId });
  const [mobilePane, setMobilePane] = useState(DEFAULT_RETROSPECTIVE_PANE);

  const showMobilePane = (paneId) => setMobilePane(normalizeRetrospectivePane(paneId));
  const paneIdFor = (pane) => RETROSPECTIVE_PANES.find((entry) => entry.id === pane)?.panelId;
  const isPaneActive = (pane) => mobilePane === pane;

  return (
    <RetrospectiveProvider>
      {/*
        Page scroll owner: the app shell (`#main-content` in App.jsx) is a
        fixed-viewport `overflow-hidden` flex column, so this page root must
        be the vertical scroll region (`flex-1 min-h-0 overflow-y-auto`,
        matching TaskDetailPage / DocsView contract) — otherwise stacked mobile
        content below the fold is clipped with no way to reach it.
        A plain <div>, NOT a second <main>: the shell already owns the single
        top-level main landmark, and a nested main trips axe
        landmark-main-is-top-level / no-duplicate-main (WCAG 1.3.1/1.3.6).
      */}
      <div
        data-testid="retrospective-page"
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
      >
        <div className="flex flex-col gap-4 p-4 max-w-7xl mx-auto w-full">
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-bold text-on-surface">Retrospective</h1>
            <p className="text-sm text-text-muted">
              Review recent tasks, spot failure and efficiency patterns, and turn insights into new
              tickets.
            </p>
          </header>
          {/*
          Mobile pane selector: visible only below the desktop breakpoint
          (`lg:hidden`), mirroring the board's mobile stage-selector tab strip.
          Inactive panes hide on phones but restore on desktop via
          `retrospectivePaneClass`, so desktop shows all three panes no matter
          which tab a phone had open — and panes stay mounted, so tab switches
          never drop chat drafts or selections.
        */}
          <div
            role="tablist"
            aria-label="Mobile retrospective pane selector"
            data-testid="retrospective-mobile-tabs"
            className="flex lg:hidden items-center gap-2 overflow-x-auto custom-scrollbar shrink-0"
          >
            {RETROSPECTIVE_PANES.map((pane) => {
              const isSelected = mobilePane === pane.id;
              return (
                <button
                  key={pane.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={pane.panelId}
                  data-testid={`retrospective-mobile-tab-${pane.id}`}
                  onClick={() => showMobilePane(pane.id)}
                  className={retrospectiveMobileTabClass(isSelected)}
                >
                  {pane.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,2fr)_minmax(0,4fr)] gap-4 items-start">
            <div
              id={paneIdFor('histories')}
              className={retrospectivePaneClass(isPaneActive('histories'))}
            >
              <TaskHistoriesPanel
                tasks={histories.tasks}
                loading={histories.loading}
                error={histories.error}
                onRefresh={histories.refresh}
                expandedId={histories.expandedId}
                expandedTask={histories.expandedTask}
                expanding={histories.expanding}
                onToggleExpanded={histories.toggleExpanded}
              />
            </div>
            <div
              id={paneIdFor('actions')}
              className={retrospectivePaneClass(isPaneActive('actions'))}
            >
              <QuickActionsPanel tasks={histories.tasks} />
            </div>
            {/*
            Keyed per project: a project switch remounts the pane so the chat
            hook (one instance per project) loads the new project's persisted
            transcript instead of mixing conversations.
          */}
            <div id={paneIdFor('chat')} className={retrospectivePaneClass(isPaneActive('chat'))}>
              <RetrospectiveChat key={activeProjectId} tasks={histories.tasks} />
            </div>
          </div>
        </div>
      </div>
    </RetrospectiveProvider>
  );
}

export default RetrospectivePage;
