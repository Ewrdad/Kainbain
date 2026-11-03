import { useEffect, useMemo, useState } from 'react';

import { api } from '../../../services/api';
import { MarkdownViewer } from '../../common/MarkdownViewer';
import { formatTaskTitleFirstLine } from '../../tasks/taskFormatters';

/***
 * MARK: formatRunnerElapsed
 * @description mm:ss elapsed from an ISO start timestamp against now.
 *   Missing/unparseable starts render as an em dash — never invented.
 * @example formatRunnerElapsed('2026-10-27T12:00:00.000Z', Date.parse('2026-10-27T12:01:30.000Z')) => '01:30'
 ***/
export const formatRunnerElapsed = (startedAt, nowMs) => {
  const start = Date.parse(startedAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(nowMs) || nowMs < start) return '—';
  const totalSeconds = Math.floor((nowMs - start) / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/***
 * MARK: runnerFreshness
 * @description Heartbeat freshness for the status dot: a Runner heartbeats
 *   every 15s, so anything seen within 60s counts as live. Unknown stays
 *   unknown (grey) rather than alarming — including when the clock reading
 *   itself is unusable, which must never paint an amber stale dot.
 * @example runnerFreshness(new Date().toISOString(), Date.now()) => 'live'
 * @example runnerFreshness(new Date().toISOString(), NaN) => 'unknown'
 ***/
export const runnerFreshness = (lastSeenAt, nowMs) => {
  const seen = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(seen) || !Number.isFinite(nowMs)) return 'unknown';
  return nowMs - seen <= 60000 ? 'live' : 'stale';
};

/***
 * MARK: formatShortRunnerTaskId
 * @description Short task identity for one Runner row or card: the first 8
 *   characters of the task id. A missing or blank id renders as an ellipsis
 *   so a half-shaped assignment can never print `undefine` or `null` into
 *   the fleet view.
 * @example formatShortRunnerTaskId('abcdef12-3456') => 'abcdef12'
 * @example formatShortRunnerTaskId(null) => '…'
 ***/
export const formatShortRunnerTaskId = (taskId) => {
  if (taskId == null) return '…';
  const text = String(taskId).trim();
  return text ? text.slice(0, 8) : '…';
};

const FRESHNESS_DOT = {
  live: 'bg-emerald-400 animate-pulse',
  stale: 'bg-amber-400',
  unknown: 'bg-slate-500',
};

/***
 * MARK: useRunnerMonitor
 * @description Polls the Runner fleet monitor (`GET /runners/monitor`) plus
 *   the registry list (`GET /runners`) for harness capabilities. Shared by
 *   the desktop per-runner widget and the compact mobile rows so both show
 *   the same fleet picture. Pass `enabled: false` when the caller injects
 *   `assignmentsOverride`/`registryOverride` (the mobile header's single
 *   poller) so one tick issues exactly one fleet read. An unusable `pollMs`
 *   (zero, negative, or non-numeric) falls back to the 5s default so the
 *   hook can never busy-loop the fleet endpoints. Missing endpoint methods
 *   and rejected reads never throw: before the first successful read they
 *   land as empty fleet state (hosts keep their legacy fallback signal on
 *   old backends and outages), and afterwards the last-known fleet picture
 *   stays until the next poll succeeds instead of flapping to empty.
 * @example const { assignments, registry } = useRunnerMonitor({ pollMs: 5000 });
 ***/
export const useRunnerMonitor = ({ pollMs = 5000, enabled = true } = {}) => {
  const [monitor, setMonitor] = useState(null);
  const [runners, setRunners] = useState(null);
  // A zero or non-numeric interval would busy-loop the fleet endpoints
  // (`setInterval` treats NaN as 0), so unusable values fall back to the
  // default cadence and the fleet keeps updating instead of hammering.
  const safePollMs = Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 5000;

  useEffect(() => {
    if (!enabled) return undefined;
    let mounted = true;
    let timer = null;
    const load = async () => {
      try {
        // The fleet endpoints may not exist on older backends or in hosts
        // that mock only part of the api surface: a missing method reads as
        // empty instead of throwing, so the failure stays a quiet empty
        // fleet (legacy fallback visible) rather than a thrown TypeError.
        const monitorRead =
          typeof api.getRunnerMonitor === 'function'
            ? api.getRunnerMonitor().catch(() => null)
            : Promise.resolve(null);
        const registryRead =
          typeof api.getRunners === 'function'
            ? api.getRunners().catch(() => null)
            : Promise.resolve(null);
        const [m, list] = await Promise.all([monitorRead, registryRead]);
        if (!mounted) return;
        if (m) setMonitor(m);
        if (Array.isArray(list)) setRunners(list);
      } catch {
        // Best-effort: stale cards stay until the next poll succeeds.
      }
    };
    void load();
    timer = setInterval(() => void load(), safePollMs);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [safePollMs, enabled]);

  return useMemo(() => {
    // Text-or-numeric Runner ids only: an object id would crash the row that
    // renders it, so malformed assignments are ignored (fail-safe) instead.
    const assignments = Array.isArray(monitor?.liveAssignments)
      ? monitor.liveAssignments.filter(
          (a) => a && a.runnerId && (typeof a.runnerId === 'string' || typeof a.runnerId === 'number'),
        )
      : [];
    const registry = new Map(
      (Array.isArray(runners) ? runners : [])
        .filter((r) => r && r.runnerId)
        .map((r) => [r.runnerId, r]),
    );
    return { assignments, registry, scheduler: monitor?.scheduler || null };
  }, [monitor, runners]);
};

const taskTitle = (task) => {
  const title = formatTaskTitleFirstLine(task?.title || task?.goal || '', '');
  return (typeof title === 'string' && title.trim()) || '(untitled task)';
};

const runnerLogTail = (task, runnerId, limit = 6) => {
  const entries = Array.isArray(task?.logEntries) ? task.logEntries : [];
  const mine = entries.filter((e) => {
    if (!e) return false;
    if (e.meta?.runnerId) return e.meta.runnerId === runnerId;
    if (typeof e.text !== 'string') return false;
    // Prefix match (case-insensitive) replaces dynamic RegExp to avoid
    // ReDoS; the id is taken only as a literal prefix token here.
    const needle = `[runner ${runnerId}]`.toLowerCase();
    return e.text.toLowerCase().startsWith(needle);
  });
  return mine.slice(-limit);
};

/***
 * MARK: PerRunnerTasksWidget
 * @description Replaces the single engine-owner active-task card with one
 *   card per live Runner assignment: which Runner runs which task, on what
 *   stage, and for how long. Full variant (desktop default) shows the task
 *   goal, stage/epoch pills, harness capabilities, freshness, and a runner
 *   log tail. Compact variant (crowded screens, mobile) collapses each
 *   Runner to one row with an expandable tail. `assignmentsOverride` /
 *   `registryOverride` inject already-polled fleet state (the mobile
 *   header's single poller) and skip this widget's own poll while set —
 *   the same override approach `NowPlayingBar` uses — so existing callers
 *   keep working with zero edits. Assignments without a text-or-numeric
 *   Runner id are ignored, so a half-shaped fleet payload can never crash
 *   a row. Compact rows truncate long runner, stage, harness, and model
 *   text on one line (full text in tooltips) so crowded phone screens
 *   never scroll sideways.
 * @example <PerRunnerTasksWidget tasks={tasks} compact={false} />
 ***/
export function PerRunnerTasksWidget({
  tasks = [],
  stages = [],
  compact = false,
  pollMs = 5000,
  assignmentsOverride,
  registryOverride,
}) {
  const skipPoll = assignmentsOverride !== undefined || registryOverride !== undefined;
  const polled = useRunnerMonitor({ pollMs, enabled: !skipPoll });
  const rawAssignments = Array.isArray(assignmentsOverride)
    ? assignmentsOverride
    : polled.assignments;
  // Same text-or-numeric Runner-id gate as the hook above: overrides are
  // caller-built, so a malformed id is ignored (fail-safe) here as well.
  const assignments = (Array.isArray(rawAssignments) ? rawAssignments : []).filter(
    (a) => a && a.runnerId && (typeof a.runnerId === 'string' || typeof a.runnerId === 'number'),
  );
  let registry = polled.registry;
  if (registryOverride instanceof Map) {
    registry = registryOverride;
  } else if (Array.isArray(registryOverride)) {
    registry = new Map(
      registryOverride.filter((r) => r && r.runnerId).map((r) => [r.runnerId, r]),
    );
  }
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (assignments.length === 0) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [assignments.length]);

  const taskById = useMemo(() => {
    const map = new Map();
    for (const t of Array.isArray(tasks) ? tasks : []) {
      if (t && t.id != null) map.set(String(t.id), t);
    }
    return map;
  }, [tasks]);

  const stageById = useMemo(() => {
    const map = new Map();
    for (const s of Array.isArray(stages) ? stages : []) {
      if (s && s.id != null) map.set(String(s.id), s);
    }
    return map;
  }, [stages]);

  const stageName = (stageId) => {
    if (stageId == null || stageId === '') return '…';
    const stage = stageById.get(String(stageId));
    const name = stage?.name || stage?.title;
    return (typeof name === 'string' && name.trim()) || String(stageId);
  };

  const cards = assignments.map((a) => ({
    assignment: a,
    task: taskById.get(String(a.taskId)) || null,
    record: registry.get(a.runnerId) || null,
  }));

  if (cards.length === 0) {
    return (
      <section
        aria-label="Runner tasks"
        data-testid="per-runner-tasks"
        className="h-full flex flex-col"
      >
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 font-mono text-xs">
          <span className="text-3xl mb-2 opacity-40">💤</span>
          <p className="font-bold text-slate-300">Fleet idle — no live Runner assignments</p>
          <p className="text-[11px] mt-1">
            Deferred agent stages appear here when a Runner claims them.
          </p>
        </div>
      </section>
    );
  }

  if (compact) {
    return (
      <section
        aria-label="Runner tasks"
        data-testid="per-runner-tasks"
        className="flex flex-col gap-1"
      >
        {cards.map(({ assignment: a, task }, index) => (
          <PerRunnerCompactRow
            key={`${a.runnerId}:${a.executionId || a.taskId || index}`}
            assignment={a}
            task={task}
            nowMs={nowMs}
            stageName={stageName}
          />
        ))}
      </section>
    );
  }

  return (
    <section
      aria-label="Runner tasks"
      data-testid="per-runner-tasks"
      className="h-full flex flex-col gap-2 overflow-y-auto"
    >
      {cards.map(({ assignment: a, task, record }, index) => (
        <PerRunnerCard
          key={`${a.runnerId}:${a.executionId || a.taskId || index}`}
          assignment={a}
          task={task}
          record={record}
          nowMs={nowMs}
          stageName={stageName}
        />
      ))}
    </section>
  );
}

const PerRunnerCompactRow = ({ assignment: a, task, nowMs, stageName }) => {
  const serving = a?.serving && typeof a.serving === 'object' ? a.serving : null;
  return (
    <details
      data-testid={`per-runner-row-${a.runnerId}`}
      className="px-2 py-1 bg-slate-800/60 border border-slate-700/60 rounded-sm text-[11px] font-mono text-slate-300"
    >
      <summary className="flex items-center gap-2 min-w-0 cursor-pointer list-none">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${FRESHNESS_DOT[runnerFreshness(a.lastSeenAt, nowMs)]}`}
          aria-hidden="true"
        />
        <strong className="text-slate-100 truncate min-w-0" title={a.runnerId}>
          {a.runnerId}
        </strong>
        <span className="truncate min-w-0">{formatShortRunnerTaskId(a.taskId)}</span>
        <span className="text-slate-400 truncate min-w-0" title={stageName(a.stageId)}>
          {stageName(a.stageId)}
        </span>
        {/* Serving fields cross the fleet API boundary untyped: String()
            keeps a malformed object from crashing the row (React cannot
            render an object child). */}
        {serving?.harness && (
          <span
            data-testid={`per-runner-compact-harness-${a.runnerId}`}
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700 truncate min-w-0"
            title={String(serving.harness)}
          >
            {String(serving.harness)}
          </span>
        )}
        {serving?.model && (
          <span
            data-testid={`per-runner-compact-model-${a.runnerId}`}
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700 truncate min-w-0"
            title={String(serving.model)}
          >
            {String(serving.model)}
          </span>
        )}
        <span
          className="ml-auto text-emerald-300 shrink-0"
          data-testid={`per-runner-elapsed-${a.runnerId}`}
        >
          {formatRunnerElapsed(a.startedAt, nowMs)}
        </span>
      </summary>
      <RunnerLogTail task={task} runnerId={a.runnerId} />
    </details>
  );
};

const PerRunnerCard = ({ assignment: a, task, record, nowMs, stageName }) => {
  const harnesses = Array.isArray(record?.capabilities?.harnesses)
    ? record.capabilities.harnesses.map((h) => h?.id || h).filter(Boolean)
    : [];
  const serving = a.serving && typeof a.serving === 'object' ? a.serving : null;
  const tail = runnerLogTail(task, a.runnerId);
  return (
    <article
      data-testid={`per-runner-card-${a.runnerId}`}
      className="px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-sm"
    >
      <div className="flex items-center gap-2 text-xs font-mono">
        <span
          className={`inline-block w-2 h-2 rounded-full ${FRESHNESS_DOT[runnerFreshness(a.lastSeenAt, nowMs)]}`}
          title={a.lastSeenAt ? `Last heartbeat ${a.lastSeenAt}` : 'No heartbeat seen yet'}
          aria-hidden="true"
        />
        <strong className="text-slate-100 uppercase tracking-wider">Runner {a.runnerId}</strong>
        <span className="text-slate-400">· executing task</span>
        <span className="text-cyan-300" data-testid={`per-runner-task-${a.runnerId}`}>
          {formatShortRunnerTaskId(a.taskId)}
        </span>
        <span
          className="ml-auto text-emerald-300 font-bold"
          data-testid={`per-runner-elapsed-${a.runnerId}`}
          title={a.startedAt ? `Claimed ${a.startedAt}` : 'Claim time unknown'}
        >
          {formatRunnerElapsed(a.startedAt, nowMs)}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-200 truncate" title={task?.goal || task?.title || ''}>
        {task ? taskTitle(task) : 'Task details unavailable'}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-400">
        <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
          Stage: <strong className="text-slate-200">{stageName(a.stageId)}</strong>
        </span>
        {/* Epoch and serving fields cross the fleet API boundary untyped:
            String() keeps a malformed object from crashing the card. */}
        <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
          epoch {String(a.epoch ?? '?')}
        </span>
        {serving?.harness && (
          <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
            Harness: <strong className="text-slate-200">{String(serving.harness)}</strong>
          </span>
        )}
        {serving?.model && (
          <span
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700 truncate"
            title={String(serving.model)}
          >
            Model: <strong className="text-slate-200">{String(serving.model)}</strong>
          </span>
        )}
        {harnesses.length > 0 && (
          <span className="truncate" title="Harnesses this Runner can serve">
            {harnesses.join(' · ')}
          </span>
        )}
      </div>
      <RunnerPromptPayload assignment={a} taskId={task?.id} />
      {tail.length > 0 && (
        <div className="mt-1.5 border-t border-slate-700/60 pt-1.5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-1">
            Runner log tail
          </p>
          <pre
            data-testid={`per-runner-tail-${a.runnerId}`}
            className="font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto select-text"
          >
            {tail.map((e) => e.text).join('\n')}
          </pre>
        </div>
      )}
    </article>
  );
};

/***
 * MARK: RunnerPromptPayload
 * @description With-prompt variant body: the exact stage prompt the Runner
 *   reported at assignment start, rendered with the same raw/markdown
 *   viewer chrome as the engine prompt inspector. Compact rows stay
 *   prompt-free. Empty until the `prompted` progress event lands.
 * @example <RunnerPromptPayload assignment={assignment} taskId="t1" />
 ***/
export const RunnerPromptPayload = ({ assignment, taskId }) => {
  const [viewMode, setViewMode] = useState('raw');
  const [isCopied, setIsCopied] = useState(false);
  const prompt = typeof assignment?.prompt === 'string' ? assignment.prompt : '';

  const handleCopy = () => {
    if (prompt && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(prompt);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  let promptBody = null;
  if (!prompt) {
    promptBody = (
      <p
        className="text-[11px] font-mono text-slate-400"
        data-testid={`per-runner-prompt-empty-${assignment?.runnerId}`}
      >
        Prompt not reported yet — appears once the Runner starts the stage.
      </p>
    );
  } else if (viewMode === 'raw') {
    promptBody = (
      <pre
        data-testid={`per-runner-prompt-${assignment?.runnerId}`}
        className="font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-60 overflow-y-auto select-text"
      >
        {prompt}
      </pre>
    );
  } else {
    promptBody = (
      <div
        className="prose prose-invert prose-sm max-w-none select-text"
        data-testid={`per-runner-prompt-${assignment?.runnerId}`}
      >
        <MarkdownViewer
          content={prompt}
          projectId={assignment?.projectId || null}
          taskId={taskId || null}
        />
      </div>
    );
  }

  return (
    <div className="mt-1.5 border-t border-slate-700/60 pt-1.5">
      <div
        className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-1"
        data-testid={`per-runner-prompt-toolbar-${assignment?.runnerId}`}
      >
        <span>Stage prompt</span>
        {prompt && (
          <>
            <span className="text-slate-400">{prompt.length} chars</span>
            <span className="ml-auto flex items-center gap-1 normal-case">
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                aria-pressed={viewMode === 'raw'}
                className={`px-1.5 py-0.5 rounded border ${viewMode === 'raw' ? 'bg-slate-700 text-slate-100 border-slate-500' : 'bg-transparent text-slate-400 border-slate-700'} cursor-pointer`}
              >
                Raw
              </button>
              <button
                type="button"
                onClick={() => setViewMode('markdown')}
                aria-pressed={viewMode === 'markdown'}
                className={`px-1.5 py-0.5 rounded border ${viewMode === 'markdown' ? 'bg-slate-700 text-slate-100 border-slate-500' : 'bg-transparent text-slate-400 border-slate-700'} cursor-pointer`}
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="px-1.5 py-0.5 rounded border bg-transparent text-slate-400 border-slate-700 cursor-pointer"
              >
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </span>
          </>
        )}
      </div>
      {promptBody}
    </div>
  );
};

const RunnerLogTail = ({ task, runnerId }) => {
  const tail = runnerLogTail(task, runnerId);
  if (tail.length === 0) {
    return <p className="mt-1 text-[11px] font-mono text-slate-400">No runner frames yet.</p>;
  }
  return (
    <pre
      data-testid={`per-runner-tail-${runnerId}`}
      className="mt-1 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto select-text"
    >
      {tail.map((e) => e.text).join('\n')}
    </pre>
  );
};
