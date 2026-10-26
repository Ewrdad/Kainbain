import { useState } from 'react';

import { useKainBain } from '../context/KainBainContext';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { GlossaryTerm } from './common/GlossaryTerm';

const GUIDE_SECTIONS = [
  {
    id: 'architecture',
    label: '🏗️ System Architecture',
    title: 'How KainBain Works Behind the Scenes',
  },
  {
    id: 'stages',
    label: '🎛️ Stages & Pipeline',
    title: 'Workflow Pipeline & Stage Execution Types',
  },
  { id: 'agent', label: '🤖 Agent & Sandboxing', title: 'Autonomous Agent Execution & Tool Calls' },
  {
    id: 'transport',
    label: '⏯️ Transport & Health',
    title: 'Now Playing Controls & Engine Health',
  },
  { id: 'tokens', label: '📝 Context Tokens', title: 'Dynamic Prompt Curation & Template Tokens' },
  { id: 'deploy', label: '🚀 Self-Deployment', title: 'Self-Deployment & Auto-Rollback Gate' },
  { id: 'activity', label: '📡 Activity Stream', title: 'Live Activity Logs & Severity Legend' },
];

/***
 * MARK: SystemGuideModal
 * @description Comprehensive interactive transparency and architecture guide popup.
 * Educates users on the end-to-end orchestration lifecycle, background agent subprocesses,
 * disk persistence, transport controls, and auto-rollback mechanics.
 * @example <SystemGuideModal />
 ***/
export function SystemGuideModal() {
  const { isSystemGuideOpen, setIsSystemGuideOpen, activeProject, setView } = useKainBain();
  const [activeSection, setActiveSection] = useState('architecture');

  // Entering docs IS a navigation: the setView facade routes to the
  // canonical `/docs` path (DocsView normalises to the first article).
  const openDocs = () => {
    setIsSystemGuideOpen(false);
    setView('docs');
  };

  if (!isSystemGuideOpen) return null;

  return (
    <Modal
      onClose={() => setIsSystemGuideOpen(false)}
      labelledBy="system-guide-title"
      dialogClassName="w-full max-w-4xl max-h-[90vh] bg-surface-container-low border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 text-on-surface"
    >
      {/* Modal Header */}
      <header className="px-6 py-4 border-b border-border-standard bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-primary text-xl select-none" aria-hidden="true">
            📖
          </span>
          <div>
            <h2
              id="system-guide-title"
              className="text-sm font-bold uppercase tracking-wider text-on-surface font-headline-md flex items-center gap-2"
            >
              <span>KainBain System Transparency & User Guide</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-mono font-bold">
                v2.0
              </span>
            </h2>
            <p className="text-[11px] font-mono text-text-muted mt-0.5">
              Comprehensive explanation of system architecture, stage execution, and background
              engine operations.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSystemGuideOpen(false)}
          className="p-1.5 min-h-[44px] min-w-[44px] hover:bg-surface-container-high rounded-sm text-text-muted hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Close system guide"
        >
          <Icon name="close" />
        </button>
      </header>

      {/* Guide Category Tabs */}
      <nav
        aria-label="System guide topics"
        className="flex items-center gap-1 px-6 py-2 bg-surface-container border-b border-border-standard overflow-x-auto custom-scrollbar shrink-0 select-none text-xs font-mono"
      >
        {GUIDE_SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id)}
            className={`px-3 py-1.5 rounded-sm whitespace-nowrap font-bold uppercase transition-colors cursor-pointer ${
              activeSection === sec.id
                ? 'bg-primary text-on-primary shadow-sm font-bold'
                : 'text-text-muted hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {sec.label}
          </button>
        ))}
      </nav>

      {/* Guide Content Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-surface-deep text-xs font-sans leading-relaxed">
        {/* 1. SYSTEM ARCHITECTURE */}
        {activeSection === 'architecture' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-text-high font-headline-sm flex items-center gap-2 mb-1">
                <span className="text-primary">🏗️</span>
                <span>System Architecture & Component Overview</span>
              </h3>
              <p className="text-text-muted">
                KainBain is an autonomous AI task orchestrator built as a thin, resilient
                architecture composed of Fastify backend services, React frontend cockpit, and the
                PI Agent SDK.
              </p>
            </div>

            {/* Visual Architecture Diagram */}
            <div className="p-4 rounded-md bg-surface-container border border-border-standard space-y-3 font-mono text-[11px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                System Workflow Data Flow:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-surface-deep border border-border-standard rounded">
                  <div className="text-primary font-bold text-sm mb-1">1. Task Submission</div>
                  <div className="text-[10px] text-text-muted">
                    User inputs goal → Context Engine curates prompt with prior stage outputs
                  </div>
                </div>
                <div className="p-3 bg-surface-deep border border-primary/40 rounded shadow-xs">
                  <div className="text-primary font-bold text-sm mb-1">2. Stage Execution</div>
                  <div className="text-[10px] text-text-muted">
                    Autonomous AI worker executes tools OR CI runs tests OR Human reviews checkpoint
                  </div>
                </div>
                <div className="p-3 bg-surface-deep border border-border-standard rounded">
                  <div className="text-secondary font-bold text-sm mb-1">3. Durable Reports</div>
                  <div className="text-[10px] text-text-muted">
                    Markdown generated in <code>docs/tasks/</code> → State disk-persisted in{' '}
                    <code>~/.kainbain/</code>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>Fastify Backend (:3100)</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  Provides REST endpoints and WebSocket live streaming (<code>/ws</code>). Manages
                  persistent domain stores: <code>TaskStore</code>, <code>ProjectStore</code>,{' '}
                  <code>SessionStore</code>, and <code>DeployManager</code>.
                </p>
              </div>

              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-1.5">
                  <span>💾</span>
                  <span>Disk Persistence & Isolation</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  Sessions and tasks are fully isolated per project in{' '}
                  <code>~/.kainbain/projects/</code>. If the system restarts, state is safely
                  preserved and interrupted tasks can be resumed immediately.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. STAGES & PIPELINE */}
        {activeSection === 'stages' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-text-high font-headline-sm flex items-center gap-2 mb-1">
                <span className="text-primary">🎛️</span>
                <span>Workflow Pipeline & Stage Types</span>
              </h3>
              <p className="text-text-muted">
                Each workflow pipeline consists of an ordered sequence of stages. Tasks move
                sequentially from left to right as each stage completes successfully.
              </p>
            </div>

            <div className="space-y-4">
              {/* Agent Stage */}
              <div className="p-4 rounded bg-surface-container border-l-4 border-primary border-t border-r border-b border-border-standard space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-primary font-mono uppercase flex items-center gap-1.5">
                    <span>🤖</span> 1. AGENT Stage (Autonomous AI Worker)
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 uppercase font-bold">
                    Autonomous
                  </span>
                </div>
                <p className="text-text-muted">
                  Spawns the AI agent with the stage&apos;s system prompt and selected{' '}
                  <GlossaryTerm
                    term="LLM"
                    expansion="Large Language Model"
                    definition="An AI model trained on text that generates one word at a time."
                  />{' '}
                  model. The agent reads repository files, makes changes, creates discrete reports,
                  and advances to the next stage upon successful completion.
                </p>
              </div>

              {/* Human Checkpoint */}
              <div className="p-4 rounded bg-surface-container border-l-4 border-[#9acbff] border-t border-r border-b border-border-standard space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#9acbff] font-mono uppercase flex items-center gap-1.5">
                    <span>👤</span> 2. HUMAN Stage (Review & Approval Gate)
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#9acbff]/10 text-[#9acbff] border border-[#9acbff]/30 uppercase font-bold">
                    Manual Review
                  </span>
                </div>
                <p className="text-text-muted">
                  Halts pipeline execution and alerts the user. The human reviewer can inspect
                  generated artifacts and either:
                </p>
                <ul className="list-disc list-inside text-[11px] text-text-muted space-y-1 pl-2">
                  <li>
                    <strong className="text-on-surface">Approve:</strong> Advances task to the next
                    stage immediately — or marks it complete when the checkpoint is the last stage.
                  </li>
                  <li>
                    <strong className="text-on-surface">Reject:</strong> Opens feedback dialog to
                    provide corrective guidance, then routes task to the configured fallback stage
                    for a retry attempt.
                  </li>
                </ul>
              </div>

              {/* CI Stage */}
              <div className="p-4 rounded bg-surface-container border-l-4 border-[#ffb77f] border-t border-r border-b border-border-standard space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#ffb77f] font-mono uppercase flex items-center gap-1.5">
                    <span>⚡</span> 3. CI Stage (Automated Bash Command / Test Runner)
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#ffb77f]/10 text-[#ffb77f] border border-[#ffb77f]/30 uppercase font-bold">
                    Deterministic
                  </span>
                </div>
                <p className="text-text-muted">
                  Executes a bash script or test runner (e.g. <code>npm test</code>,{' '}
                  <code>npm run lint</code>). Exit code <code>0</code> advances the task; non-zero
                  fails the stage or triggers automatic fallback.
                </p>
              </div>

              {/* Paused & Fallbacks */}
              <div className="p-4 rounded bg-surface-container border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-1.5">
                  <span>⏸️</span>
                  <span>Stage Pauses & Fallback Routing Rules</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  Any stage can have <strong>Pause Stage</strong> enabled. When enabled, incoming
                  tasks will pause upon arrival and wait for manual dispatch. Fallback routes
                  dictate where a rejected or failed task is routed: <code>previous</code> stage,{' '}
                  <code>start</code> of pipeline, <code>abort</code>, or a custom designated stage.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 3. AGENT & SANDBOXING */}
        {activeSection === 'agent' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-text-high font-headline-sm flex items-center gap-2 mb-1">
                <span className="text-primary">🤖</span>
                <span>Agent Execution, Tool Calls & Artifact Persistence</span>
              </h3>
              <p className="text-text-muted">
                How the AI coding agent interacts with project source code, executes shell commands,
                and structures its outputs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-1.5">
                  <span>🛠️</span>
                  <span>Sandboxed Tool Invocations</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  The agent uses specialized tools (read files, write changes, execute terminal
                  commands) scoped strictly to the project's root directory. Every tool execution is
                  streamed in real time to the Live Activity Console.
                </p>
              </div>

              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-1.5">
                  <span>📄</span>
                  <span>Discrete Markdown Reports</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  Each stage produces a timestamped Markdown document in{' '}
                  <code>docs/tasks/&lt;taskId&gt;/&lt;stage&gt;-&lt;timestamp&gt;.md</code>. These
                  reports serve as durable audit trails and inputs to downstream stages.
                </p>
              </div>

              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-1.5">
                  <span>🧭</span>
                  <span>Real-Time Interventions (Steer & Follow-up)</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  While the agent is actively executing, you can inject real-time guidance using{' '}
                  <strong>Steer</strong> to guide its reasoning on the fly, or queue subsequent
                  instructions using <strong>Follow-up</strong>.
                </p>
              </div>

              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-1.5">
                  <span>📝</span>
                  <span>Notes Integration</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  Curated docs ship inside the repo under <code>docs/</code>, so every
                  Runner and every fresh clone reads the same knowledge base. Per-project
                  task storage links out to your central notes workspace; an optional
                  mirror of curated docs back to a central store is roadmap, not
                  default — the repo copy is the source.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4. TRANSPORT & HEALTH */}
        {activeSection === 'transport' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-text-high font-headline-sm flex items-center gap-2 mb-1">
                <span className="text-primary">⏯️</span>
                <span>Now Playing Transport Controls & Subsystem Health</span>
              </h3>
              <p className="text-text-muted">
                The persistent bottom bar displays live engine status, progress counters, subsystem
                traffic lights, and redesigned transport buttons.
              </p>
            </div>

            {/* Transport Controls Table */}
            <div className="border border-border-standard rounded bg-surface-container overflow-hidden">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-surface-container-high border-b border-border-standard text-[10px] uppercase font-bold text-text-muted">
                  <tr>
                    <th className="p-2.5">Control</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Behavior Behind the Scenes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-standard/50">
                  <tr>
                    <td className="p-2.5 font-bold text-secondary">◀ Look Back</td>
                    <td className="p-2.5 text-[10px] uppercase text-text-muted font-bold">
                      View Only
                    </td>
                    <td className="p-2.5 text-text-muted">
                      Scrolls Kanban board focus to previous stage column without mutating any
                      active task.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-primary">🎯 Jump to Active</td>
                    <td className="p-2.5 text-[10px] uppercase text-text-muted font-bold">
                      View Only
                    </td>
                    <td className="p-2.5 text-text-muted">
                      Resets viewport focus directly to the currently running stage column.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-primary">⏯ Play / Pause Engine</td>
                    <td className="p-2.5 text-[10px] uppercase text-primary font-bold">
                      Scheduler Toggle
                    </td>
                    <td className="p-2.5 text-text-muted">
                      Starts or pauses the global background task scheduler loop.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-[#ffb77f]">⏩ Skip Stage</td>
                    <td className="p-2.5 text-[10px] uppercase text-amber-400 font-bold">
                      Mutation (Confirm)
                    </td>
                    <td className="p-2.5 text-text-muted">
                      Prompts confirmation to immediately advance the active task past the current
                      stage.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-secondary">▶ Look Forward</td>
                    <td className="p-2.5 text-[10px] uppercase text-text-muted font-bold">
                      View Only
                    </td>
                    <td className="p-2.5 text-text-muted">
                      Scrolls Kanban board focus to next stage column without mutating any active
                      task.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Health Traffic Lights */}
            <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
              <div className="font-bold text-on-surface flex items-center gap-2">
                <span>🚦</span>
                <span>Subsystem Health Traffic Lights Explained</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-[11px] font-mono">
                <div className="p-2 bg-surface-deep rounded border border-border-standard">
                  <div className="text-[#7bdb85] font-bold">
                    1.{' '}
                    <GlossaryTerm
                      term="LiteLLM"
                      definition="The proxy that routes model requests and reports catalog reachability."
                    />
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    Queries proxy latency & model catalog reachability.
                  </div>
                </div>
                <div className="p-2 bg-surface-deep rounded border border-border-standard">
                  <div className="text-[#7bdb85] font-bold">2. Host Device</div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    Monitors server{' '}
                    <GlossaryTerm
                      term="RAM"
                      expansion="Random-Access Memory"
                      definition="The server's short-term working memory."
                    />{' '}
                    usage and 1/5/15m load average.
                  </div>
                </div>
                <div className="p-2 bg-surface-deep rounded border border-border-standard">
                  <div className="text-[#7bdb85] font-bold">3. Ollama Cloud</div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    Verifies cloud inference provider connectivity.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. CONTEXT TOKENS */}
        {activeSection === 'tokens' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-text-high font-headline-sm flex items-center gap-2 mb-1">
                <span className="text-primary">📝</span>
                <span>Dynamic Context Tokens & Prompt Curation</span>
              </h3>
              <p className="text-text-muted">
                The Prompt Curation Engine resolves dynamic template tokens into real file paths,
                prior reports, and project metadata before sending prompts to the agent. The same
                tokens also work in CI stage commands — they are interpolated when the command
                starts, and scripts can read the same values from KAINBAIN_* environment variables.
              </p>
            </div>

            <div className="border border-border-standard rounded bg-surface-container overflow-hidden">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-surface-container-high border-b border-border-standard text-[10px] uppercase font-bold text-text-muted">
                  <tr>
                    <th className="p-2.5">Token</th>
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5">Resolved Value Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-standard/50">
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{project}}`}</td>
                    <td className="p-2.5 text-text-muted">Name of the active project</td>
                    <td className="p-2.5 text-on-surface">{activeProject?.name || 'KainBain'}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{projectRoot}}`}</td>
                    <td className="p-2.5 text-text-muted">
                      Absolute path to repository working directory
                    </td>
                    <td className="p-2.5 text-on-surface font-mono">
                      {activeProject?.cwd || '/home/server/projects/kainbain'}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{taskDocs}}`}</td>
                    <td className="p-2.5 text-text-muted">Dedicated docs folder for this task</td>
                    <td className="p-2.5 text-on-surface font-mono">
                      {activeProject?.cwd
                        ? `${activeProject.cwd}/docs/tasks/<taskId>/`
                        : './docs/tasks/<taskId>/'}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{previousReports}}`}</td>
                    <td className="p-2.5 text-text-muted">
                      Full file paths of all prior stage reports
                    </td>
                    <td className="p-2.5 text-on-surface font-mono">./docs/tasks/.../01-spec.md</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{latestReportPath}}`}</td>
                    <td className="p-2.5 text-text-muted">
                      Path to the immediately preceding stage report
                    </td>
                    <td className="p-2.5 text-on-surface font-mono">./docs/tasks/.../02-plan.md</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{taskGoal}}`}</td>
                    <td className="p-2.5 text-text-muted">The task goal or requirement title</td>
                    <td className="p-2.5 text-on-surface">"Add helper tooltips & popups"</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{projectRepo}}`}</td>
                    <td className="p-2.5 text-text-muted">Git repository URL</td>
                    <td className="p-2.5 text-on-surface font-mono">
                      {activeProject?.gitUrl ||
                        activeProject?.gitRepo ||
                        '(no remote configured)'}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-primary font-bold">{`{{latestReportPath:<slug>}}`}</td>
                    <td className="p-2.5 text-text-muted">
                      Path of the most recent report from one stage (replace &lt;slug&gt; with the
                      stage slug) — ideal for CI gates such as test -f
                      &quot;{'{{latestReportPath:plan}}'}&quot;
                    </td>
                    <td className="p-2.5 text-on-surface font-mono">./docs/tasks/.../02-plan.md</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="border border-border-standard rounded bg-surface-container p-3 font-mono text-[11px] text-text-muted">
              <p className="font-bold text-on-surface mb-1">CI stage keywords</p>
              <p>
                CI and deploy commands support the same tokens (interpolated when the command
                starts; unknown tokens stay literal). Quote tokens in shell commands and prefer
                the KAINBAIN_* environment variables (KAINBAIN_TASK_DOCS, KAINBAIN_PROJECT_ROOT,
                KAINBAIN_TASK_ID, KAINBAIN_STAGE_NAME, KAINBAIN_LATEST_REPORT, …) for values with
                spaces. Example gate: test -f &quot;{'{{taskDocs}}'}plan-*.md&quot; || {'{ echo "missing plan report"; exit 1; }'}
              </p>
            </div>
          </div>
        )}

        {/* 6. SELF-DEPLOYMENT */}
        {activeSection === 'deploy' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-text-high font-headline-sm flex items-center gap-2 mb-1">
                <span className="text-primary">🚀</span>
                <span>Self-Deployment & Auto-Rollback Architecture</span>
              </h3>
              <p className="text-text-muted">
                KainBain develops and deploys itself safely. A deploy restarts the very service
                running the app, hardened with locks, snapshots, and health-check gates.
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-2">
                  <span>🔒</span>
                  <span>1. Concurrency Lock & Directory Swap</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  Deploys acquire an exclusive <code>flock</code> lock in{' '}
                  <code>~/.kainbain/deploy/</code> to prevent races. The running build is
                  snapshotted to <code>~/apps/kainbain.prev</code> before swapping in the new
                  version.
                </p>
              </div>

              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-2">
                  <span>🏷️</span>
                  <span>2. Autoincrementing Build Numbers (#B&lt;num&gt;)</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  Each deploy consumes an atomic persisted counter and stamps it into{' '}
                  <code>build.json</code> with git commit and deploy timestamp, shown in the header
                  badge.
                </p>
              </div>

              <div className="p-4 bg-surface-container rounded border border-border-standard space-y-2">
                <div className="font-bold text-on-surface flex items-center gap-2">
                  <span>🛡️</span>
                  <span>3. Post-Restart Health-Check Gate & Auto-Rollback</span>
                </div>
                <p className="text-text-muted text-[11px]">
                  After restarting the systemd unit (
                  <code>systemctl --user restart kainbain.service</code>), the script polls{' '}
                  <code>/status</code>. If the new build fails to come up healthy, it{' '}
                  <strong>auto-rolls back</strong> to <code>.prev</code> atomically, ensuring zero
                  downtime.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 7. ACTIVITY STREAM */}
        {activeSection === 'activity' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-text-high font-headline-sm flex items-center gap-2 mb-1">
                <span className="text-primary">📡</span>
                <span>Live Activity Stream & Severity Legend</span>
              </h3>
              <p className="text-text-muted">
                The Live Activity Console merges WebSocket events in real time. Logs are categorized
                by severity tags for fast troubleshooting.
              </p>
            </div>

            <div className="border border-border-standard rounded bg-surface-container overflow-hidden">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-surface-container-high border-b border-border-standard text-[10px] uppercase font-bold text-text-muted">
                  <tr>
                    <th className="p-2.5">Tag</th>
                    <th className="p-2.5">Severity</th>
                    <th className="p-2.5">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-standard/50">
                  <tr>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.2 rounded border text-[9px] font-bold text-primary bg-primary/10 border-primary/30">
                        [AGENT]
                      </span>
                    </td>
                    <td className="p-2.5 text-on-surface">Agent Reasoning</td>
                    <td className="p-2.5 text-text-muted">
                      Model thoughts, plans, and conversational assistant output.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.2 rounded border text-[9px] font-bold text-[#a6e3a1] bg-[#a6e3a1]/10 border-[#a6e3a1]/30">
                        [TOOL]
                      </span>
                    </td>
                    <td className="p-2.5 text-on-surface">Tool Call</td>
                    <td className="p-2.5 text-text-muted">
                      Tool dispatching (e.g. read_file, write_to_file, run_command).
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.2 rounded border text-[9px] font-bold text-[#94e2d5] bg-[#94e2d5]/10 border-[#94e2d5]/30">
                        [RESULT]
                      </span>
                    </td>
                    <td className="p-2.5 text-on-surface">Execution Result</td>
                    <td className="p-2.5 text-text-muted">
                      Data and exit codes returned by executed tools.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.2 rounded border text-[9px] font-bold text-[#9acbff] bg-[#9acbff]/10 border-[#9acbff]/30">
                        [HUMAN]
                      </span>
                    </td>
                    <td className="p-2.5 text-on-surface">Human Action</td>
                    <td className="p-2.5 text-text-muted">
                      Human reviews, approvals, and rejection feedback events.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.2 rounded border text-[9px] font-bold text-[#ffb77f] bg-[#ffb77f]/10 border-[#ffb77f]/30">
                        [CI/CMD]
                      </span>
                    </td>
                    <td className="p-2.5 text-on-surface">CI / Shell Command</td>
                    <td className="p-2.5 text-text-muted">
                      Verification scripts and test runner output.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.2 rounded border text-[9px] font-bold text-[#c2c8ca] bg-[#c2c8ca]/10 border-[#c2c8ca]/30">
                        [INFO]
                      </span>
                    </td>
                    <td className="p-2.5 text-on-surface">System Info</td>
                    <td className="p-2.5 text-text-muted">
                      Orchestrator lifecycle, queue dispatching, and state snapshots.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.2 rounded border text-[9px] font-bold text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/30">
                        [ERROR]
                      </span>
                    </td>
                    <td className="p-2.5 text-error font-bold">Failure / Timeout</td>
                    <td className="p-2.5 text-text-muted">
                      Execution exceptions, non-zero exit codes, and test failures.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Footer */}
      <footer className="px-6 py-3.5 border-t border-border-standard bg-surface flex items-center justify-between shrink-0">
        <div className="text-[10px] font-mono text-text-muted flex items-center gap-2">
          <span>
            💡 Press{' '}
            <kbd className="px-1.5 py-0.5 bg-surface-container rounded border border-border-standard font-bold text-primary">
              G
            </kbd>{' '}
            anytime to open this guide
          </span>
          <button
            type="button"
            onClick={openDocs}
            className="underline underline-offset-2 text-primary hover:brightness-110 transition-all cursor-pointer"
          >
            Read more in Docs →
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsSystemGuideOpen(false)}
          className="px-5 py-2 min-h-[44px] bg-primary text-on-primary font-bold uppercase tracking-wider rounded-sm hover:brightness-110 active:scale-95 transition-all text-xs cursor-pointer flex items-center justify-center font-mono"
        >
          Got it
        </button>
      </footer>
    </Modal>
  );
}

export default SystemGuideModal;
