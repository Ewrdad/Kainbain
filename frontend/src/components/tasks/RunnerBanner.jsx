/***
 * MARK: RunnerBanner
 * @description Compact "a Runner holds this task" banner for the task
 *   detail page. Renders only when the task payload carries a live claim
 *   (`task.claim`, attached by GET /tasks/:id from the backend claim
 *   fence); otherwise renders nothing. A held task is actively executing
 *   on that Runner, so the banner names it instead of leaving an agent
 *   stage looking idle.
 * @param {Object} [props]
 * @param {Object|null} [props.claim] - `{ runnerId, epoch }` or null.
 * @param {string} [props.stageName] - Current stage display name.
 * @example <RunnerBanner claim={{ runnerId: 'local-pi', epoch: 3 }} stageName="Plan" />
 ***/
export function RunnerBanner({ claim, stageName }) {
  if (!claim || typeof claim.runnerId !== 'string' || !claim.runnerId) return null;
  return (
    <div
      className="p-4 bg-primary/10 border border-primary/40 rounded-sm space-y-2 shadow-sm"
      data-testid="runner-banner"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono truncate">
            Runner {claim.runnerId} working{stageName ? ` · ${stageName}` : ''}
          </span>
        </div>
        <span className="text-[10px] uppercase font-mono text-text-muted shrink-0">
          live assignment
        </span>
      </div>
      <p className="text-xs text-on-surface leading-relaxed">
        This task is claimed and executing off-process. It leaves this state when the
        Runner reports back — no action needed.
      </p>
    </div>
  );
}
