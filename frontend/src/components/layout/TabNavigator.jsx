import React from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { InfoTooltip } from '../common/InfoTooltip';

/***
 * MARK: TabNavigator
 * @description Compact primary navigation for the orchestrator cockpit.
 * Switches between master Orchestrator Kanban workspace, Files & Repo, and Settings views.
 * @example <TabNavigator />
 ***/
const TABS = [
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    icon: '🎛️',
    keyHint: '1',
    desc: 'Master Kanban board pipeline with in-column stage settings, drag-and-drop, and live activity stream.',
    behindTheScenes:
      'Tracks active tasks across stages, auto-executes AI workers, and manages human review gates.',
  },
  {
    id: 'explorer',
    label: 'Files & Repo',
    icon: '📁',
    keyHint: '2',
    desc: 'Sandboxed file and document explorer with Markdown and code preview.',
    behindTheScenes: 'Reads project filesystem and links to notes and the git remote.',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    keyHint: '3',
    desc: 'Project configuration, named workflow manager, and skills customization.',
    behindTheScenes:
      'Persists configurations to ~/.kainbain/ and manages automated health-gated deploys.',
  },
  {
    id: 'retrospective',
    label: 'Retrospective',
    icon: '🔍',
    keyHint: 'R',
    desc: 'Cross-task retrospective: review recent task histories, spot failure and efficiency patterns, and turn insights into new tickets.',
    behindTheScenes:
      'Reads duration-enriched task summaries and runs stateless chat turns through the harness registry.',
  },
];

export { TABS };

export function TabNavigator() {
  const { view, setView } = useKainBain();
  const isOrchestratorActive = view === 'orchestrator' || view === 'tasks';

  return (
    <nav
      className="flex items-center gap-0.5 sm:gap-1 shrink-0 min-w-0"
      aria-label="Primary navigation"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === 'orchestrator' ? isOrchestratorActive : view === tab.id;

        return (
          <InfoTooltip
            key={tab.id}
            title={`${tab.label} Workspace`}
            description={tab.desc}
            behindTheScenes={tab.behindTheScenes}
            shortcut={tab.keyHint}
            position="bottom"
          >
            <button
              type="button"
              onClick={() => setView?.(tab.id)}
              className={`px-1.5 lg:px-3 py-1.5 min-h-[44px] min-w-[44px] justify-center text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-1 lg:gap-1.5 cursor-pointer select-none whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-on-primary font-bold shadow-sm'
                  : 'text-text-muted hover:text-on-surface hover:bg-surface-container-high'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span aria-hidden="true" className="text-xs">
                {tab.icon}
              </span>
              {/* Labels wait for xl: the labeled strip needs ~1061px, so the
                  icon-only strip holds everything below 1280 (task 66ad153f). */}
              <span className="hidden xl:inline">{tab.label}</span>
            </button>
          </InfoTooltip>
        );
      })}
    </nav>
  );
}

export default TabNavigator;
