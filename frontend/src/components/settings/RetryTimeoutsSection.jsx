import { RetryNumberField } from './RetryNumberField';

/***
 * MARK: RetryTimeoutsSection
 * @description Retry & Timeouts block of the project settings form:
 *   per-project iteration and timeout budgets. A set value overrides the
 *   global default for this project only; a per-stage override still wins
 *   over both. Blank means "follow the global default". Pure presentational
 *   section — all state lives in `ProjectSettingsForm`.
 * @example <RetryTimeoutsSection maxAutoIterations="" setMaxAutoIterations={fn} maxTransientRetries="" setMaxTransientRetries={fn} autoIterationEnabled="default" setAutoIterationEnabled={fn} agentTimeoutMs="" setAgentTimeoutMs={fn} ciTimeoutMs="" setCiTimeoutMs={fn} mergeTimeoutMs="" setMergeTimeoutMs={fn} retryErrors={{}} validationError="" />
 * @param {Object} props
 * @param {string} props.maxAutoIterations - Draft max auto-iterations ('' = unset).
 * @param {Function} props.setMaxAutoIterations - Draft setter.
 * @param {string} props.maxTransientRetries - Draft max transient retries ('' = unset).
 * @param {Function} props.setMaxTransientRetries - Draft setter.
 * @param {string} props.autoIterationEnabled - Tri-state switch ('default'|'enabled'|'disabled').
 * @param {Function} props.setAutoIterationEnabled - Switch setter.
 * @param {string} props.agentTimeoutMs - Draft agent timeout in minutes ('' = unset).
 * @param {Function} props.setAgentTimeoutMs - Draft setter.
 * @param {string} props.ciTimeoutMs - Draft CI timeout in minutes ('' = unset).
 * @param {Function} props.setCiTimeoutMs - Draft setter.
 * @param {string} props.mergeTimeoutMs - Draft merge timeout in minutes ('' = unset).
 * @param {Function} props.setMergeTimeoutMs - Draft setter.
 * @param {Object} props.retryErrors - Per-field validation errors.
 * @param {string} props.validationError - Form-level validation message.
 ***/
export function RetryTimeoutsSection({
  maxAutoIterations,
  setMaxAutoIterations,
  maxTransientRetries,
  setMaxTransientRetries,
  autoIterationEnabled,
  setAutoIterationEnabled,
  agentTimeoutMs,
  setAgentTimeoutMs,
  ciTimeoutMs,
  setCiTimeoutMs,
  mergeTimeoutMs,
  setMergeTimeoutMs,
  retryErrors,
  validationError,
}) {
  return (
    <div className="border-t border-border-standard pt-8">
      <h3 className="text-sm font-bold uppercase tracking-wide text-text-high mb-4 flex items-center gap-2">
        <span className="text-primary">🔁</span> Retry & Timeouts
      </h3>
      <div className="space-y-4 max-w-2xl">
        <p className="text-[11px] text-text-muted leading-relaxed">
          How many times this project&apos;s tasks may fail back and re-run before parking
          as failed, and how long each stage type may run. Counts of 0 disable that loop;
          blank fields follow the global default. A manual stage retry restarts every
          budget below from zero.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RetryNumberField
            id="project-retry-max-auto-iterations"
            label="Max auto-iterations"
            value={maxAutoIterations}
            onChange={setMaxAutoIterations}
            error={retryErrors.maxAutoIterations}
            help="Failback-and-retry cycles before a task parks as failed. 0 disables auto-iteration for this project."
          />
          <RetryNumberField
            id="project-retry-max-transient-retries"
            label="Max transient retries"
            value={maxTransientRetries}
            onChange={setMaxTransientRetries}
            error={retryErrors.maxTransientRetries}
            help="Same-stage retries for timeouts and infrastructure errors before parking. 0 disables transient retries."
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="project-retry-auto-iteration"
            className="text-xs font-bold uppercase text-text-muted tracking-wider"
          >
            Automatic iteration
          </label>
          <select
            id="project-retry-auto-iteration"
            value={autoIterationEnabled}
            onChange={(e) => setAutoIterationEnabled(e.target.value)}
            className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs outline-none focus:border-primary transition-colors text-on-surface"
          >
            <option value="default">Follow global default</option>
            <option value="enabled">Enabled for this project</option>
            <option value="disabled">Disabled for this project</option>
          </select>
          <p className="text-[10px] text-text-muted">
            Whether failed stages route back and re-run automatically.{' '}
            <span className="font-semibold">
              {autoIterationEnabled === 'default'
                ? 'Source: global default.'
                : 'Source: project override.'}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RetryNumberField
            id="project-retry-agent-timeout"
            label="Agent stage timeout (minutes)"
            value={agentTimeoutMs}
            onChange={setAgentTimeoutMs}
            error={retryErrors.agentTimeoutMs}
            help="Wall-clock ceiling for agent and review stages, in minutes."
            step="0.5"
          />
          <RetryNumberField
            id="project-retry-ci-timeout"
            label="CI stage timeout (minutes)"
            value={ciTimeoutMs}
            onChange={setCiTimeoutMs}
            error={retryErrors.ciTimeoutMs}
            help="Wall-clock ceiling for CI and script stages, in minutes — including stages that run the deploy script."
            step="0.5"
          />
          <RetryNumberField
            id="project-retry-merge-timeout"
            label="Merge stage timeout (minutes)"
            value={mergeTimeoutMs}
            onChange={setMergeTimeoutMs}
            error={retryErrors.mergeTimeoutMs}
            help="Wall-clock ceiling for merge stages, in minutes."
            step="0.5"
          />
        </div>
        {validationError && validationError.startsWith('Retry & Timeouts:') && (
          <p role="alert" className="text-[11px] font-bold text-red-500">
            {validationError}
          </p>
        )}
      </div>
    </div>
  );
}
