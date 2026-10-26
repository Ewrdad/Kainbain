import React, { useEffect, useRef, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { Icon } from '../Icon';
import { BrandMark } from '../BrandMark';
import { Modal } from '../Modal';
import { BuildBadge } from './BuildBadge';
import { InfoTooltip } from '../common/InfoTooltip';
import { GoToAppLink } from '../common/GoToAppLink';
import { TabNavigator } from './TabNavigator';
import { ProjectMenu } from './ProjectMenu';
import { MonitorPopoutButton } from './MonitorPopoutButton';
import { MOBILE_TOOLBAR_COLLAPSE_EVENT } from '../workflow/hooks/useMobileToolbarCollapse';
import { requestCompactMonitorView } from '../observability/monitorCompact';
import { openSystemSettings } from '../settings/openSystemSettings';

/***
 * MARK: SystemMenu
 * @description Consolidated "System" dropdown that groups the secondary utility
 * actions (System Guide, UI Customize, Keyboard Shortcuts) behind a single
 * trigger. Reduces header clutter while preserving every action.
 * @example <SystemMenu />
 ***/
/***
 * MARK: getSystemMenuItems
 * @description Unit-testable System Menu item definitions. Docs lives here
 *   (platform scope) so the primary tab bar stays project-scoped. The
 *   System Settings entry opens the dedicated `/system-settings` screen in a
 *   new window (same-tab fallback when the popout is blocked or the viewport
 *   is phone-narrow) rather than a popup dialog — see `openSystemSettings`.
 * @example getSystemMenuItems({ setView, ... })[0].key => 'docs'
 ***/
export function getSystemMenuItems({
  setIsOpen,
  setIsSystemGuideOpen,
  setIsCustomizationModalOpen,
  setIsShortcutsModalOpen,
  setView,
} = {}) {
  const close = () => setIsOpen?.(false);
  // Entering docs IS a navigation: the setView facade routes to the
  // canonical `/docs` path (DocsView normalises to the first article).
  const openDocsView = () => {
    close();
    setView?.('docs');
  };
  return [
    {
      key: 'docs',
      icon: '📚',
      label: 'Docs',
      desc: 'Platform guides — not project-specific',
      shortcut: 'D',
      onClick: openDocsView,
    },
    {
      key: 'compact-monitor',
      icon: '📡',
      label: 'Compact Monitor',
      desc: 'Logs-only monitor — slim stage header + live console',
      shortcut: 'R-click 📡',
      onClick: () => {
        close();
        requestCompactMonitorView();
        setView?.('observability');
      },
    },
    {
      key: 'guide',
      icon: '📖',
      label: 'System Guide',
      desc: 'How KainBain works behind the scenes',
      shortcut: 'G',
      onClick: () => {
        close();
        setIsSystemGuideOpen?.(true);
      },
    },
    {
      key: 'customize',
      icon: '🎨',
      label: 'Customize UI',
      desc: 'Themes, fonts, density, sound, layout',
      shortcut: '^K',
      onClick: () => {
        close();
        setIsCustomizationModalOpen?.(true);
      },
    },
    {
      key: 'system-settings',
      icon: '⚙️',
      label: 'System Settings',
      desc: 'Harness, model, engine and run options (opens in new window)',
      shortcut: 'S',
      onClick: () => {
        close();
        openSystemSettings({ setView });
      },
    },
    {
      key: 'shortcuts',
      icon: '⌨️',
      label: 'Keyboard Shortcuts',
      desc: 'View all hotkeys for fast navigation',
      shortcut: '?',
      onClick: () => {
        close();
        setIsShortcutsModalOpen?.(true);
      },
    },
  ];
}

function SystemMenu() {
  const {
    setIsSystemGuideOpen,
    setIsCustomizationModalOpen,
    setIsShortcutsModalOpen,
    setView,
    uiPreferences,
  } = useKainBain();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  const focusItem = (index) => {
    const count = itemRefs.current.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    itemRefs.current[next]?.focus?.();
  };

  // APG menu-button keyboard contract (WCAG 2.1.1): arrows/Home/End move
  // between menuitems, Escape closes and returns focus to the trigger.
  const handleMenuKeyDown = (e) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(current - 1 < 0 ? itemRefs.current.length - 1 : current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(itemRefs.current.length - 1);
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    // Initial focus lands on the first menuitem so arrow-key users can act
    // immediately; pointer users are unaffected.
    focusItem(0);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus?.();
      }
    };
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isOpen]);

  const items = getSystemMenuItems({
    setIsOpen,
    setIsSystemGuideOpen,
    setIsCustomizationModalOpen,
    setIsShortcutsModalOpen,
    setView,
  });

  return (
    <div className="relative" ref={menuRef}>
      <InfoTooltip
        title="System Menu"
        description="Guide, docs, compact monitor, UI customization, system settings, and keyboard shortcuts in one place."
        shortcut="G • D • C • S • ?"
        position="bottom-left"
      >
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label="System Menu"
          className="p-2 min-h-[44px] min-w-[44px] rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
        >
          <Icon name="menu" />
        </button>
      </InfoTooltip>

      {isOpen && (
        <div
          role="menu"
          aria-label="System"
          className="absolute right-0 top-full mt-1.5 w-64 bg-surface-container border border-border-standard shadow-2xl z-50 rounded-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-text-muted border-b border-border-standard">
            System
          </div>
          <div className="p-1 space-y-0.5">
            {items.map((item, index) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={item.onClick}
                onKeyDown={handleMenuKeyDown}
                className="w-full text-left px-3 py-2 min-h-[44px] rounded-sm transition-colors flex items-center gap-2.5 cursor-pointer group hover:bg-surface-container-high"
              >
                <span className="text-base shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-on-surface group-hover:text-primary">
                    {item.label}
                  </span>
                  <span className="block text-[10px] text-text-muted truncate">{item.desc}</span>
                </span>
                {uiPreferences?.showKeyboardHints && (
                  <span className="text-[9px] px-1 py-0.2 bg-surface-deep text-text-muted rounded border border-border-standard font-mono shrink-0">
                    {item.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/***
 * MARK: Header
 * @description Single consolidated top application header conforming to DESIGN_SPEC.md.
 * Integrates brand, project selector pill, primary tab navigation,
 * Git-remote quick-link, build indicator, popout monitor button, and system menu.
 * @example <Header />
 ***/
export function Header() {
  const {
    projects: projectsFromContext,
    visibleProjects: visibleProjectsFromContext,
    activeProjectId,
    selectProject,
    createProject,
    registerProject,
    isProjectDropdownOpen,
    setIsProjectDropdownOpen,
    hiddenProjectIds = [],
    toggleHideProject,
    showArchived,
    setShowArchived,
    setView,
    updateProjectInState,
  } = useKainBain();

  // Fail safe: a malformed context value (null, non-array) renders the header
  // with no projects rather than crashing the whole top bar. Project lookup
  // additionally tolerates null entries inside the list.
  const projects = Array.isArray(projectsFromContext) ? projectsFromContext : [];
  const visibleProjects = Array.isArray(visibleProjectsFromContext)
    ? visibleProjectsFromContext
    : projects;
  const hiddenProjectIdsSafe = Array.isArray(hiddenProjectIds) ? hiddenProjectIds : [];

  const activeProject = projects.find((p) => p != null && p.id === activeProjectId);
  const projectMenuRef = useRef(null);
  const projectTriggerRef = useRef(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [isRegisteringProject, setIsRegisteringProject] = useState(false);
  const [adoptPath, setAdoptPath] = useState('');
  const [adoptName, setAdoptName] = useState('');
  const [adoptKainbainDir, setAdoptKainbainDir] = useState('');
  const [adoptError, setAdoptError] = useState('');

  // MARK: toolbar-collapse sync (task 34793321)
  // Phones only: when the board's secondary toolbar row auto-collapses on
  // scroll-down, this tab row folds away too so the search input + stage
  // tabs keep maximum vertical room. Keyboard focus into the folded row
  // re-expands it (WCAG 2.1.1); desktop widths ignore the event entirely.
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  useEffect(() => {
    const onToolbarCollapse = (event) => {
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setIsToolbarCollapsed(false);
        return;
      }
      setIsToolbarCollapsed(event?.detail?.collapsed === true);
    };
    const onResize = () => {
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setIsToolbarCollapsed(false);
      }
    };
    window.addEventListener(MOBILE_TOOLBAR_COLLAPSE_EVENT, onToolbarCollapse);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener(MOBILE_TOOLBAR_COLLAPSE_EVENT, onToolbarCollapse);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  const handleHeaderFocusExpand = () => setIsToolbarCollapsed(false);

  useEffect(() => {
    if (!isProjectDropdownOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsProjectDropdownOpen(false);
    };
    const onClickOutside = (e) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isProjectDropdownOpen, setIsProjectDropdownOpen]);

  /***
   * MARK: handleCreateProjectSubmit
   * @description Handles form submission for creating a new project.
   * @example handleCreateProjectSubmit(event)
   * @param {React.FormEvent} e
   ***/
  const handleCreateProjectSubmit = async (e) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    await createProject(newProjName.trim());
    setNewProjName('');
    setIsCreatingProject(false);
    setIsProjectDropdownOpen(false);
  };

  /***
   * MARK: closeAdoptProjectModal
   * @description Closes the "Add Existing Project" dialog and clears its error.
   * @example closeAdoptProjectModal()
   ***/
  const closeAdoptProjectModal = () => {
    setIsRegisteringProject(false);
    setAdoptError('');
  };

  /***
   * MARK: handleAdoptProjectSubmit
   * @description Handles form submission for adopting an existing project
   *   directory: POSTs `/projects/register` through the context action, then
   *   closes the dialog. A rejected registration surfaces the server message
   *   inline instead of throwing out of the form.
   * @example handleAdoptProjectSubmit(event)
   * @param {React.FormEvent} e
   ***/
  const handleAdoptProjectSubmit = async (e) => {
    e.preventDefault();
    const path = adoptPath.trim();
    if (!path) return;
    if (typeof registerProject !== 'function') return;
    setAdoptError('');
    try {
      await registerProject({
        path,
        // JSON.stringify drops undefined keys, so an omitted name / state
        // folder never reaches the API (which would reject a blank string).
        name: adoptName.trim() || undefined,
        kainbainDirName: adoptKainbainDir.trim() || undefined,
      });
      setAdoptPath('');
      setAdoptName('');
      setAdoptKainbainDir('');
      setIsRegisteringProject(false);
      setIsProjectDropdownOpen(false);
    } catch (err) {
      setAdoptError(err?.message || 'Failed to register the project directory.');
    }
  };

  // String-safe: a malformed project record (numeric repoUrl/gitUrl) must hide
  // the remote link, never throw inside render and take down the top bar.
  const repoUrlText =
    typeof activeProject?.repoUrl === 'string' && activeProject.repoUrl.trim() !== ''
      ? activeProject.repoUrl
      : '';
  const gitUrlText = typeof activeProject?.gitUrl === 'string' ? activeProject.gitUrl : '';
  const hasUpstreamRepo = Boolean(
    activeProject?.hasUpstreamRepo ||
    repoUrlText ||
    (gitUrlText.includes('://') && activeProject.hasUpstreamRepo !== false),
  );
  // The app link (~180px labeled) is the widest optional control: when it is
  // present the xl row reserves room for it by deferring the PROJECT label,
  // the wide project name, and the passive build badge to 2xl (task 66ad153f
  // guard: the full row needs ~1333px, which 1280 cannot hold).
  const hasAppLink = Boolean(activeProject?.appStatus?.url);
  // Web view of the configured remote, or null when none is configured —
  // the link is hidden then, never pointed at a fabricated host.
  const gitRemoteUrl =
    repoUrlText || (gitUrlText.startsWith('http') ? gitUrlText.replace(/\.git$/, '') : null);
  // Open a same-origin hash route in a popout window. The target is a hardcoded
  // internal route (never user input), so it is safe to open directly.
  const openPopout = () => {
    const target = '#/observability';
    if (typeof target === 'string' && target.startsWith('#/')) {
      // pi-lens-ignore: no-open-redirect-js
      window.open(
        target,
        'kainbain_monitor',
        'width=1600,height=1000,menubar=no,toolbar=no,location=no',
      );
    }
  };

  // Right-click entry to the compact logs-only monitor: same-tab
  // navigation, no popout. The dashboard picks up the request on mount.
  const openCompactMonitor = () => {
    requestCompactMonitorView();
    setView?.('observability');
  };

  return (
    <>
      {/***
       * MARK: header two-region contract (task 66ad153f)
       * @description The header is a flexible region plus a pinned region that
       *   can never overlap: the flexible regions carry only width-bounded
       *   content (truncating pill) or scroll internally (Row B), while the
       *   pinned controls stay shrink-0. Below sm the bar stacks into Row A
       *   (brand + project + pinned controls) and Row B (tab strip + app
       *   link, horizontally scrollable); at sm and above it is the original
       *   single 64px row. Label reveals wait for xl so the 640-1279px band
       *   fits (the expanded row needs ~1061px, which even lg cannot hold).
       ***/}
      <header
        className="border-b border-border-standard bg-surface flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-1 px-2 sm:px-6 pb-1 sm:pb-0 sm:h-16 sticky top-0 z-40"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Row A on mobile, left cluster on desktop. Children are
            width-bounded (fixed brand mark, truncating project pill), so this
            region can shrink without spilling — and it must not clip
            overflow, because it owns the open project dropdown. */}
        <div className="order-1 flex min-w-0 flex-1 sm:flex-none items-center gap-1 sm:gap-4 mt-1 sm:mt-0 min-h-[48px] sm:min-h-0">
          {/* Brand Logo & Title (#22) */}
          <InfoTooltip
            title="KainBain Orchestrator"
            description="Autonomous multi-stage AI task pipeline orchestrator with human quality gates."
            behindTheScenes="Runs on Fastify backend (:3100) with PI Agent SDK and per-project isolated SQLite/JSON persistence in ~/.kainbain/"
            shortcut="1 (Canvas) • G (Guide)"
            position="bottom-right"
          >
            <div className="flex items-center gap-2 shrink-0 cursor-pointer">
              <BrandMark className="w-7 h-7 shrink-0" />
              {/* Wordmark hidden on mobile to free header space — the brand mark
                  alone identifies the app; the KAINBAIN wordmark appears once
                  horizontal space allows. */}
              <h1 className="hidden xl:inline font-headline-md text-sm font-bold text-primary tracking-tight truncate">
                KAINBAIN
              </h1>
            </div>
          </InfoTooltip>

          <div className="h-6 w-px bg-border-standard mx-1 hidden xl:block" aria-hidden="true" />

          {/* Project Selector (Pill format per mockup with Hide/Show Archived #29) */}
          <div className="relative" ref={projectMenuRef}>
            <button
              type="button"
              ref={projectTriggerRef}
              onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
              aria-haspopup="dialog"
              aria-expanded={isProjectDropdownOpen}
              aria-controls="project-menu"
              aria-label={`Project: ${activeProject?.name || 'Project Alpha'}`}
              className="flex items-center gap-1 sm:gap-2 bg-surface-container-highest px-1.5 sm:px-3 py-1.5 min-h-[44px] rounded cursor-pointer border border-border-standard hover:border-primary transition-colors text-left"
            >
              <span
                className={`uppercase font-label-caps text-[9px] text-on-surface-variant hidden ${
                  hasAppLink ? '2xl:inline 2xl:text-label-caps' : 'xl:inline xl:text-label-caps'
                }`}
              >
                Project
              </span>
              <span
                className={`font-headline-sm text-headline-sm text-on-surface font-medium text-xs truncate max-w-[64px] ${
                  hasAppLink ? 'xl:max-w-[96px] 2xl:max-w-[160px]' : 'lg:max-w-[160px]'
                }`}
              >
                {activeProject?.name || 'Project Alpha'}
              </span>
              <span
                className={`material-symbols-outlined text-on-surface text-base transition-transform ${
                  isProjectDropdownOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>

            {isProjectDropdownOpen && (
              <ProjectMenu
                projects={projects}
                visibleProjects={visibleProjects}
                activeProjectId={activeProjectId}
                selectProject={selectProject}
                onClose={() => setIsProjectDropdownOpen(false)}
                onCreateProject={() => {
                  setIsCreatingProject(true);
                  setIsProjectDropdownOpen(false);
                }}
                onAdoptProject={() => {
                  setAdoptError('');
                  setIsRegisteringProject(true);
                  setIsProjectDropdownOpen(false);
                }}
                hiddenProjectIds={hiddenProjectIdsSafe}
                toggleHideProject={toggleHideProject}
                showArchived={showArchived}
                setShowArchived={setShowArchived}
                triggerRef={projectTriggerRef}
              />
            )}
          </div>
        </div>

        {/* Row B on mobile, middle strip on desktop: tab navigation plus the
            secondary quick-links. Scrolls internally below sm (reachable, not
            buried); overflow-visible on desktop so InfoTooltip popovers are
            never clipped. DOM order is unchanged (brand → project → tabs →
            app link → monitor → menu) so keyboard tab order stays logical.
            Task 34793321: folds away on phones while the board toolbar is
            collapsed (search + stage tabs stay pinned); every collapse
            visual is `max-md:` scoped so desktop can never hide this row. */}
        <div
          data-testid="header-tab-row"
          onFocusCapture={isToolbarCollapsed ? handleHeaderFocusExpand : undefined}
          aria-hidden={isToolbarCollapsed}
          className={`order-3 sm:order-2 flex w-full sm:w-auto sm:flex-1 min-w-0 items-center gap-1 sm:gap-2 overflow-x-auto sm:overflow-visible custom-scrollbar transition-all duration-200 motion-reduce:transition-none ${
            isToolbarCollapsed
              ? 'max-md:max-h-0 max-md:opacity-0 max-md:overflow-hidden max-md:py-0 max-md:pointer-events-none max-md:border-0'
              : ''
          }`}
        >
          {/* Consolidated Tab Navigator (#20, #12, #15) */}
          <div className="flex items-center shrink-0">
            <TabNavigator />
          </div>

          {/* Git remote link button (#24, #32)
              Icon-only from md (the label waits for xl, where the full row
              fits); hidden on phones, where the strip holds tabs + app link.
              Hidden entirely when no remote is configured. */}
          {hasUpstreamRepo && gitRemoteUrl && (
            <InfoTooltip
              title="Git Remote"
              className="hidden md:block shrink-0"
              description="Opens the project's configured git remote for inspecting branches, commits, and diffs."
              behindTheScenes="Reads the repoUrl/gitUrl returned by the API"
              position="bottom"
            >
              <a
                href={gitRemoteUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open git remote"
                className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] rounded-sm bg-surface-container hover:bg-surface-container-high border border-border-standard text-text-muted hover:text-on-surface transition-colors text-xs font-mono cursor-pointer"
              >
                <span className="shrink-0">🐙</span>
                <span className="font-label-caps text-[10px] uppercase tracking-wider hidden xl:inline">
                  Git remote
                </span>
              </a>
            </InfoTooltip>
          )}

          {/* Go to App link — compact pill, rendered only when the project
              has a stored app link. Icon-only below xl, labeled at xl and
              above (matching TabNavigator); it lives in scrollable Row B on
              phones so it is always reachable, never buried. */}
          <GoToAppLink
            projectId={activeProjectId}
            appStatus={activeProject?.appStatus}
            variant="header"
            onHealthChange={(fresh) =>
              updateProjectInState?.({ id: activeProjectId, appStatus: fresh })
            }
          />
        </div>

        {/* Right Header Controls — pinned: always fully visible, never
            shrunk. Sits on Row A beside brand + project on mobile. */}
        <div className="order-2 sm:order-3 ml-auto sm:ml-0 flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Live build number badge (passive indicator #23) — wide-desktop
              furniture only. With an app link present it waits for 2xl: the
              full row needs ~1333px (task 66ad153f guard). */}
          <div className={hasAppLink ? 'hidden 2xl:block' : 'hidden xl:block'}>
            <BuildBadge />
          </div>

          {/* Open Observability Display on Second Monitor (Popout #12).
              Desktop: popout on left-click, compact logs-only monitor on
              right-click (same tab). Mobile: a visible 📡 button opens the
              compact monitor directly (phones have no second monitor). */}
          <MonitorPopoutButton onOpenPopout={openPopout} onOpenCompact={openCompactMonitor} />

          {/* Consolidated System Menu (Guide, Customize, Shortcuts) */}
          <SystemMenu />
        </div>
      </header>

      {/* New Project Modal */}
      {isCreatingProject && (
        <Modal
          onClose={() => setIsCreatingProject(false)}
          labelledBy="new-project-title"
          dialogClassName="w-full max-w-md bg-surface border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        >
          <header className="p-6 border-b border-border-standard bg-surface-container flex items-center justify-between">
            <h2
              id="new-project-title"
              className="text-lg font-bold text-on-surface tracking-tight flex items-center gap-2"
            >
              <span className="text-primary">✨</span> Create New Project
            </h2>
            <button
              type="button"
              onClick={() => setIsCreatingProject(false)}
              className="p-1 min-w-[44px] min-h-[44px] hover:bg-surface-container-high rounded text-text-muted hover:text-on-surface cursor-pointer"
              aria-label="Close modal"
            >
              <Icon name="close" />
            </button>
          </header>

          <form onSubmit={handleCreateProjectSubmit} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="new-project-name-input"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                Project Name
              </label>
              <input
                id="new-project-name-input"
                type="text"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- form appears from the user's explicit new-project action
                autoFocus
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="e.g. KainBain V2, Backend Microservice..."
                className="w-full p-2.5 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors font-medium"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border-standard">
              <button
                type="button"
                onClick={() => setIsCreatingProject(false)}
                className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newProjName.trim()}
                className="px-6 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                Create Project
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Existing Project (adopt) Modal */}
      {isRegisteringProject && (
        <Modal
          onClose={closeAdoptProjectModal}
          labelledBy="adopt-project-title"
          dialogClassName="w-full max-w-md bg-surface border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        >
          <header className="p-6 border-b border-border-standard bg-surface-container flex items-center justify-between">
            <h2
              id="adopt-project-title"
              className="text-lg font-bold text-on-surface tracking-tight flex items-center gap-2"
            >
              <span className="text-primary">📂</span> Add Existing Project
            </h2>
            <button
              type="button"
              onClick={closeAdoptProjectModal}
              className="p-1 min-w-[44px] min-h-[44px] hover:bg-surface-container-high rounded text-text-muted hover:text-on-surface cursor-pointer"
              aria-label="Close modal"
            >
              <Icon name="close" />
            </button>
          </header>

          <form onSubmit={handleAdoptProjectSubmit} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="adopt-project-path-input"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                Project Directory
              </label>
              <input
                id="adopt-project-path-input"
                type="text"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- form appears from the user's explicit adopt action
                autoFocus
                required
                value={adoptPath}
                onChange={(e) => {
                  setAdoptPath(e.target.value);
                  setAdoptError('');
                }}
                placeholder="/home/me/repos/my-existing-repo"
                className="w-full p-2.5 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors font-mono"
              />
              <p className="text-[10px] text-text-muted mt-2">
                Absolute path to an existing repository. KainBain initialises its state folder
                there and never moves or deletes your files.
              </p>
            </div>

            <div>
              <label
                htmlFor="adopt-project-name-input"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                Display Name (optional)
              </label>
              <input
                id="adopt-project-name-input"
                type="text"
                value={adoptName}
                onChange={(e) => setAdoptName(e.target.value)}
                placeholder="Defaults to the directory name"
                className="w-full p-2.5 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="adopt-project-kainbain-input"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                KainBain Folder Name (optional)
              </label>
              <input
                id="adopt-project-kainbain-input"
                type="text"
                value={adoptKainbainDir}
                onChange={(e) => setAdoptKainbainDir(e.target.value)}
                placeholder=".kainbain"
                className="w-full p-2.5 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface outline-none focus:border-primary transition-colors font-mono"
              />
            </div>

            {adoptError && (
              <p role="alert" className="text-xs text-error">
                {adoptError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border-standard">
              <button
                type="button"
                onClick={closeAdoptProjectModal}
                className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!adoptPath.trim()}
                className="px-6 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                Add Project
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
