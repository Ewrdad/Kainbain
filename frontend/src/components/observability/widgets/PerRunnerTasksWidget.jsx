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

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/***
 * MARK: runnerFreshness
 * @description Heartbeat freshness for the status dot: a Runner heartbeats
 *   every 15s, so anything seen within 60s counts as live. Unknown stays
 *   unknown (grey) rather than alarming.
 * @example runnerFreshness(new Date().toISOString(), Date.now()) => 'live'
 ***/
export const runnerFreshness = (lastSeenAt, nowMs) => {
  const seen = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(seen)) return 'unknown';
  return nowMs - seen <= 60000 ? 'live' : 'stale';
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
 *   the same fleet picture.
 * @example const { assignments, registry } = useRunnerMonitor({ pollMs: 5000 });
 ***/
export const useRunnerMonitor = ({ pollMs = 5000 } = {}) => {
  const [monitor, setMonitor] = useState(null);
  const [runners, setRunners] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timer = null;
    const load = async () => {
      try {
        const [m, list] = await Promise.all([
          api.getRunnerMonitor().catch(() => null),
          api.getRunners().catch(() => null),
        ]);
        if (!mounted) return;
        if (m) setMonitor(m);
        if (Array.isArray(list)) setRunners(list);
      } catch {
        // Best-effort: stale cards stay until the next poll succeeds.
      }
    };
    void load();
    timer = setInterval(() => void load(), pollMs);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [pollMs]);

  return useMemo(() => {
    const assignments = Array.isArray(monitor?.liveAssignments)
      ? monitor.liveAssignments.filter((a) => a && a.runnerId)
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
    // eslint-disable-next-line security/detect-non-literal-regexp -- runnerId is escapeRegExp-quoted above
    return new RegExp(`^\\[runner\\s+${escapeRegExp(runnerId)}\\]`, 'i').test(e.text);
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
 *   Runner to one row with an expandable tail.
 * @example <PerRunnerTasksWidget tasks={tasks} compact={false} />
 ***/
export function PerRunnerTasksWidget({ tasks = [], stages = [], compact = false, pollMs = 5000 }) {
  const { assignments, registry } = useRunnerMonitor({ pollMs });
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
        {cards.map(({ assignment: a, task }) => (
          <PerRunnerCompactRow
            key={`${a.runnerId}:${a.executionId || a.taskId}`}
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
      {cards.map(({ assignment: a, task, record }) => (
        <PerRunnerCard
          key={`${a.runnerId}:${a.executionId || a.taskId}`}
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
      <summary className="flex items-center gap-2 cursor-pointer list-none">
        <span
          className={`inline-block w-2 h-2 rounded-full ${FRESHNESS_DOT[runnerFreshness(a.lastSeenAt, nowMs)]}`}
          aria-hidden="true"
        />
        <strong className="text-slate-100">{a.runnerId}</strong>
        <span className="truncate">{String(a.taskId).slice(0, 8)}</span>
        <span className="text-slate-400 truncate">{stageName(a.stageId)}</span>
        {serving?.harness && (
          <span
            data-testid={`per-runner-compact-harness-${a.runnerId}`}
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700"
          >
            {serving.harness}
          </span>
        )}
        {serving?.model && (
          <span
            data-testid={`per-runner-compact-model-${a.runnerId}`}
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700 truncate"
            title={serving.model}
          >
            {serving.model}
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
          {String(a.taskId).slice(0, 8)}
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
        <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
          epoch {a.epoch ?? '?'}
        </span>
        {serving?.harness && (
          <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
            Harness: <strong className="text-slate-200">{serving.harness}</strong>
          </span>
        )}
        {serving?.model && (
          <span
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700 truncate"
            title={serving.model}
          >
            Model: <strong className="text-slate-200">{serving.model}</strong>
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
      {!prompt ? (
        <p
          className="text-[11px] font-mono text-slate-400"
          data-testid={`per-runner-prompt-empty-${assignment?.runnerId}`}
        >
          Prompt not reported yet — appears once the Runner starts the stage.
        </p>
      ) : viewMode === 'raw' ? (
        <pre
          data-testid={`per-runner-prompt-${assignment?.runnerId}`}
          className="font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-60 overflow-y-auto select-text"
        >
          {prompt}
        </pre>
      ) : (
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
      )}
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
