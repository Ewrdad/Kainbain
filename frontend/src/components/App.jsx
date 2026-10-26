import React, { useEffect } from 'react';
import { HashRouter } from 'react-router';

import { KainBainProvider, KainBainRouteBridge, useKainBain } from '../context/KainBainContext';
import { ChatTurnProvider } from './retrospective/ChatTurnProvider';
import { AppRoutes } from '../routes';
import { Header } from './layout/Header';
import { PromptReviewModal } from './PromptReviewModal';
import { FeedbackDialog } from './FeedbackDialog';
import { UiPreferencesModal } from './settings/UiPreferencesModal';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { SystemGuideModal } from './SystemGuideModal';
import { openSystemSettings } from './settings/openSystemSettings';
import { Notifications } from './common/Notifications';
import { ErrorBoundary } from './common/ErrorBoundary';
import { CircuitBreakerBanner } from './common/CircuitBreakerBanner';
import { shouldShowGlobalHeader } from './util/headerVisibility';
import { titleForView, useDocumentTitle } from '../a11y/useDocumentTitle';
import { RouteAnnouncer } from '../a11y/Announce';

/***
 * MARK: App
 * @description The main entry point component for the KainBain frontend.
 * Wraps the app in the KainBainProvider, handles global keyboard navigation,
 * and renders the active view, modals, and unified notification toast layer.
 * @example <App />
 ***/
function App() {
  const {
    view,
    setView,
    activeProjectId,
    activeProject,
    computeRunning,
    selectedTask,
    toggleCompute,
    uiPreferences,
    setIsCustomizationModalOpen,
    setIsShortcutsModalOpen,
    setIsSystemGuideOpen,
  } = useKainBain();

  // WCAG 2.4.2 Page Titled: the single document-title owner — every SPA
  // view exposes a distinct `[Running|Paused] Kainbain - <project> - <page>`
  // title. Views must not set document.title themselves (a second owner
  // fights this hook on mount/unmount and leaves stale titles behind).
  useDocumentTitle(
    titleForView(view, {
      taskKey: selectedTask?.id,
      computeRunning,
      projectName: activeProject?.name,
    }),
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (uiPreferences?.enableKeyboardShortcuts === false) return undefined;

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing inside an input, textarea, or select
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        document.activeElement?.isContentEditable;

      // Ctrl+K / Cmd+K always opens customization
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCustomizationModalOpen((prev) => !prev);
        return;
      }

      if (isInput) return;

      // Only treat bare single-key presses as shortcuts. If any modifier
      // (Ctrl/Cmd/Alt) is held, let the browser handle it so we never collide
      // with common shortcuts like Ctrl+C (copy), Ctrl+V (paste), Ctrl+P
      // (print), Ctrl+N (new window), or Ctrl+1/2/3 (browser tab switching).
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (hasModifier) return;

      if (e.key === '1') {
        e.preventDefault();
        setView('orchestrator');
      } else if (e.key === '2') {
        e.preventDefault();
        setView('explorer');
      } else if (e.key === '3') {
        e.preventDefault();
        setView('settings');
      } else if (e.key === '4' || e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setView('observability');
      } else if (e.key === '5' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setView('docs');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setView('retrospective');
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setIsCustomizationModalOpen(true);
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setIsSystemGuideOpen(true);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        openSystemSettings({ setView });
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsModalOpen(true);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (activeProjectId) toggleCompute(activeProjectId);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setView('orchestrator');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    uiPreferences?.enableKeyboardShortcuts,
    setView,
    activeProjectId,
    toggleCompute,
    setIsCustomizationModalOpen,
    setIsShortcutsModalOpen,
    setIsSystemGuideOpen,
  ]);

  // Skip link moves focus programmatically WITHOUT touching the URL: the
  // router owns the hash, so a `#main-content` fragment would otherwise
  // become an unknown route. Behaviour (focus main, keyboard operable) stays.
  const handleSkipLink = (e) => {
    e.preventDefault();
    if (typeof document !== 'undefined') {
      document.querySelector('#main-content')?.focus?.();
    }
  };

  return (
    <div className="h-screen h-[100dvh] max-h-[100dvh] overflow-hidden bg-background text-on-background font-sans selection:bg-primary selection:text-on-primary flex flex-col">
      {/* Skip link for keyboard users to bypass repeated navigation (WCAG 2.4.1) */}
      <a
        href="#main-content"
        onClick={handleSkipLink}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-sm focus:font-bold focus:uppercase focus:text-xs"
      >
        Skip to main content
      </a>
      {shouldShowGlobalHeader(view) && <Header />}
      <CircuitBreakerBanner />
      {/* WCAG 4.1.3: announce HashRouter view changes (no load event fires). */}
      <RouteAnnouncer view={view} taskKey={selectedTask?.id} />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        <ErrorBoundary name={boundaryNameForView(view)}>
          <AppRoutes />
        </ErrorBoundary>
      </main>
      <ErrorBoundary name="Modals">
        <PromptReviewModal />
        <FeedbackDialog />
        <UiPreferencesModal />
        <KeyboardShortcutsModal />
        <SystemGuideModal />
      </ErrorBoundary>
      <Notifications />
    </div>
  );
}

/***
 * MARK: boundaryNameForView
 * @description Stable ErrorBoundary display name for the active view.
 * @param {string} view
 * @returns {string}
 ***/
function boundaryNameForView(view) {
  if (view === 'settings') return 'Settings';
  if (view === 'system-settings') return 'SystemSettings';
  if (view === 'explorer') return 'Explorer';
  if (view === 'observability') return 'Observability';
  if (view === 'docs') return 'Docs';
  if (view === 'task-review') return 'TaskReview';
  if (view === 'task-survey') return 'TaskSurvey';
  if (view === 'task-detail' || view === 'task') return 'TaskDetail';
  return 'Orchestrator';
}

/***
 * MARK: AppRoot
 * @description Provides the hash router + context and renders the app.
 *   HashRouter-first: the app deep-links via `#/...` and needs no server
 *   rewrites; canonical paths are full-URL shaped so a later BrowserRouter
 *   swap only changes this shell. The bridge syncs router <> view state.
 *   ChatTurnProvider sits above the route table (inside the context it
 *   reads) so in-flight chat turns survive route navigation.
 * @example <AppRoot />
 ***/
export default function AppRoot() {
  return (
    <HashRouter>
      <KainBainProvider>
        <KainBainRouteBridge />
        <ChatTurnProvider>
          <App />
        </ChatTurnProvider>
      </KainBainProvider>
    </HashRouter>
  );
}
