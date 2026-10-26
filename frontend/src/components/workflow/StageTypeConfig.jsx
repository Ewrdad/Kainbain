import { useState } from 'react';
import { msToMinutes, minutesToMs } from '../../utils/timeoutUnits';
import { InfoTooltip } from '../common/InfoTooltip';
import { ModelSelector } from '../common/ModelSelector';
import { StageSkillsPanel } from './StageSkillsPanel';
import { STAGE_KEYWORD_TOKENS } from './stageTokens';
import { SelectDropdown } from '../common/SelectDropdown';

/***
 * MARK: TimeoutMinutesField
 * @description One stage-timeout row in minutes: label, number input, and the
 *   default hint. The stored value stays in milliseconds — display converts
 *   via msToMinutes and edits persist via minutesToMs, which never returns
 *   NaN (unparseable mid-typing input clears the override instead of
 *   corrupting the stored stage). Shared by all four timed stage types so
 *   step, min, and styling cannot drift between them.
 * @param {Object} props
 * @param {string} props.stageName - Stage name (wires the aria-label).
 * @param {string} props.ariaLabel - Full input aria-label (the merge row uses its own).
 * @param {string|number} props.timeoutMs - Stored timeout in milliseconds ('' = unset).
 * @param {Function} props.onCommit - Commit handler receiving whole milliseconds or ''.
 * @param {string} props.tooltipTitle - InfoTooltip title.
 * @param {string} props.tooltipDescription - InfoTooltip description.
 * @param {string} props.placeholder - Input placeholder (names the default).
 * @param {string} props.defaultHint - Helper line under the input.
 * @example <TimeoutMinutesField stageName="Deploy" timeoutMs={300000} onCommit={(ms) => ...} ... />
 ***/
export function TimeoutMinutesField({
  stageName,
  ariaLabel,
  timeoutMs,
  onCommit,
  tooltipTitle,
  tooltipDescription,
  placeholder,
  defaultHint,
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
          Timeout (min)
        </span>
        <InfoTooltip title={tooltipTitle} description={tooltipDescription} position="left" />
      </div>
      <input
        type="number"
        aria-label={ariaLabel || `Timeout in minutes for ${stageName}`}
        min="0"
        step="0.5"
        value={msToMinutes(timeoutMs)}
        onChange={(e) => {
          onCommit(minutesToMs(e.target.value));
        }}
        placeholder={placeholder}
        className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-on-surface outline-none focus:border-primary"
      />
      <p className="text-[10px] text-text-muted font-mono">{defaultHint}</p>
    </div>
  );
}

/***
 * MARK: KeywordTokenChips
 * @description Shared keyword token picker chips: one button per
 *   `{{...}}` token that copies the token and inserts it into the
 *   stage text. The agent prompt editor inserts into `stage.prompt`;
 *   the CI command editor inserts into `stage.command`/`stage.script`.
 *   Values always resolve server-side at execution time.
 * @example <KeywordTokenChips heading="Dynamic Prompt Tokens" tokens={STAGE_KEYWORD_TOKENS} ... />
 ***/
function KeywordTokenChips({ heading, tooltip, tokens, copiedToken, onInsert }) {
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-text-muted font-mono">
          {heading}
          {tooltip}
        </span>
        <span className="text-[8px] font-mono text-text-muted">
          Click token to insert/copy
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tokens.map((kw) => (
          <InfoTooltip
            key={kw.token}
            title={`Token: ${kw.token}`}
            description={kw.hint}
            behindTheScenes="Interpolated dynamically at execution time by the Prompt Curation Engine"
            position="top"
          >
            <button
              type="button"
              onClick={() => onInsert(kw.token)}
              aria-label={`Insert keyword ${kw.token}`}
              className="px-1.5 py-0.5 rounded bg-surface border border-border-standard hover:border-primary hover:bg-surface-container-high text-[9px] font-mono text-on-surface transition-colors cursor-pointer flex items-center gap-1 select-none"
            >
              <span className="text-primary">{kw.token}</span>
              <span className="text-text-muted">{kw.label}</span>
              {copiedToken === kw.token && (
                <span className="text-primary font-bold">✓</span>
              )}
            </button>
          </InfoTooltip>
        ))}
      </div>
    </div>
  );
}

/***
 * MARK: StageTypeConfig
 * @description Per-stage-type settings fields extracted from the WorkflowCanvas
 *   settings drawer: agent (prompt + tokens + skills + model + timeout),
 *   human (review criteria), ci (command + timeout; a stage whose command
 *   runs the deploy script is an ordinary ci stage), merge (git operations
 *   + timeout).
 *   All edits dispatch through `onUpdateStage`; the token-chip copied state
 *   is the only local state.
 * @example <StageTypeConfig stage={stage} onUpdateStage={handleUpdateStage} ... />
 ***/
export function StageTypeConfig({
  stage,
  onUpdateStage,
  skills,
  skillsLoading,
  skillsError,
  fetchSkills,
  getSkillByName,
  activeProjectId,
  availableModels,
  availableHarnesses,
  modelsRefreshing,
  refreshModels,
  projectHarnessId,
  projectHarnessLabel,
  isHarnessDisabled,
}) {
  const [copiedStageKeyword, setCopiedStageKeyword] = useState(null);

  return (
    <>
      {/* Stage Type Specific Configuration */}
      {stage.type === 'agent' && (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                System Prompt
              </span>
              <InfoTooltip
                title="Agent System Prompt"
                description="Stage prompt guiding the AI worker. Supports dynamic template tokens like {{project}}, {{taskDocs}}, and {{previousReports}}."
                behindTheScenes="Interpolated at execution time by the Prompt Curation Engine"
                position="left"
              />
            </div>
            <textarea
              rows={4}
              aria-label={`System prompt for ${stage.name}`}
              value={stage.prompt || ''}
              onChange={(e) => {
                onUpdateStage?.(stage.id, { prompt: e.target.value });
              }}
              placeholder="Instructions for the agent in this stage..."
              className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-on-surface outline-none focus:border-primary resize-y leading-relaxed"
            />
            {/* Dynamic Keyword Token Picker Chips (#35) */}
            <KeywordTokenChips
              heading="Dynamic Prompt Tokens"
              tokens={STAGE_KEYWORD_TOKENS}
              copiedToken={copiedStageKeyword}
              onInsert={(token) => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(token).catch(() => {});
                }
                setCopiedStageKeyword(token);
                setTimeout(() => setCopiedStageKeyword(null), 2000);
                const current = stage.prompt || '';
                const updated = current ? `${current} ${token}` : token;
                onUpdateStage?.(stage.id, { prompt: updated });
              }}
            />
          </div>
          {/* Per-stage skills (direct injection / option manifest) */}
          <StageSkillsPanel
            stage={stage}
            skills={skills}
            skillsLoading={skillsLoading}
            skillsError={skillsError}
            fetchSkills={fetchSkills}
            getSkillByName={getSkillByName}
            activeProjectId={activeProjectId}
            onChange={(updates) => onUpdateStage?.(stage.id, updates)}
          />
          <div className="space-y-1">
            <ModelSelector
              models={availableModels}
              harnesses={availableHarnesses}
              value={stage.model}
              onChange={(val) => {
                onUpdateStage?.(stage.id, { model: val });
              }}
              size="sm"
              ariaLabel={`Model for ${stage.name}`}
              harnessAriaLabel={`Harness for ${stage.name}`}
              harnessId={stage.harness || ''}
              onHarnessChange={(val) => {
                // Persist the override; picking the project
                // harness stores '' (inherit) so the stage
                // keeps following project changes.
                onUpdateStage?.(stage.id, {
                  harness: val === projectHarnessId ? '' : val,
                });
              }}
              harnessAllowEmpty
              harnessEmptyLabel={`Inherit project default (${projectHarnessLabel})`}
              fallbackHarnessId={projectHarnessId}
              onRefresh={refreshModels}
              refreshing={modelsRefreshing}
              isHarnessDisabled={isHarnessDisabled}
              allowEmpty
              className="block w-full"
              harnessLabelNode={
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                    Harness
                  </span>
                  <InfoTooltip
                    title="Stage Harness Override"
                    description="Run this stage on a different harness than the project default (e.g. antigravity for visual debugging). Empty inherits the project harness."
                    position="left"
                  />
                </div>
              }
              modelLabelNode={
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                    Model Selection
                  </span>
                  <InfoTooltip
                    title="Stage LLM Model Override"
                    description="Select a specific LLM model for this stage, or inherit project default. Runs on the stage harness when set, else the project's harness."
                    behindTheScenes="Routes calls via LiteLLM proxy to Claude, GPT, or local Ollama models"
                    position="left"
                  />
                </div>
              }
              reasoningLabelNode={
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                    Reasoning
                  </span>
                  <InfoTooltip
                    title="Stage Reasoning Level"
                    description="Reasoning effort for this stage's model on reasoning-capable harnesses (pi, antigravity, mock). Default (no level) stores the bare model reference."
                    position="left"
                  />
                </div>
              }
            />
          </div>
          <TimeoutMinutesField
            stageName={stage.name}
            timeoutMs={stage.timeout}
            onCommit={(timeout) => onUpdateStage?.(stage.id, { timeout })}
            tooltipTitle="Agent Stage Timeout"
            tooltipDescription="Maximum wall-clock execution time for this agent stage before auto-terminating. Default: 30 min."
            placeholder="30 (Default: 30 min)"
            defaultHint="Default: 30 min if empty."
          />
        </>
      )}

      {stage.type === 'human' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
              Review Criteria / Checklist
            </span>
            <InfoTooltip
              title="Human Review Gate"
              description="Criteria displayed to human reviewers when approving or rejecting artifacts."
              position="left"
            />
          </div>
          <textarea
            rows={4}
            aria-label={`Review criteria for ${stage.name}`}
            value={stage.prompt || stage.criteria || ''}
            onChange={(e) => {
              onUpdateStage?.(stage.id, {
                prompt: e.target.value,
                criteria: e.target.value,
              });
            }}
            placeholder="Review checklist or acceptance criteria..."
            className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-on-surface outline-none focus:border-secondary resize-y leading-relaxed"
          />
        </div>
      )}

      {stage.type === 'ci' && (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                Verification Script / Bash Command
              </span>
              <InfoTooltip
                title="Deterministic CI Verification"
                description="Bash command executed automatically. Exit code 0 advances task; non-zero fails or routes to fallback."
                behindTheScenes="Spawned as subprocess in project CWD with process timeout gate"
                position="left"
              />
            </div>
            <textarea
              rows={4}
              aria-label={`Verification script bash command for ${stage.name}`}
              value={stage.command || stage.script || ''}
              onChange={(e) => {
                onUpdateStage?.(stage.id, {
                  command: e.target.value,
                  script: e.target.value,
                });
              }}
              placeholder={`# Automated verification script\nnpm run test:unit\nnpm run lint`}
              className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-on-surface outline-none focus:border-primary resize-y leading-relaxed"
            />
            <div className="text-[10px] text-text-muted space-y-0.5 font-mono pt-1">
              <p>💡 Tip: Multiple commands can be chained with && or written line-by-line.</p>
              <p>Exit code 0 advances task; non-zero fails or triggers fallback.</p>
            </div>
            {/* Command Keyword Token Picker Chips: same tokens as the agent
                prompt editor, interpolated when the command starts. */}
            <KeywordTokenChips
              heading="Command Keyword Tokens (interpolated at runtime)"
              tooltip={
                <InfoTooltip
                  title="Command Keyword Tokens"
                  description="Tokens like {{taskDocs}} resolve to live file paths when the command starts — e.g. test -f &quot;{{taskDocs}}plan.md&quot; to check a plan stage wrote its report. Quote tokens in shell commands; scripts can also read the same values from KAINBAIN_* environment variables. Unknown tokens stay literal."
                  behindTheScenes="Interpolated when the command starts by the CI stage runner"
                  position="top"
                />
              }
              tokens={STAGE_KEYWORD_TOKENS}
              copiedToken={copiedStageKeyword}
              onInsert={(token) => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(token).catch(() => {});
                }
                setCopiedStageKeyword(token);
                setTimeout(() => setCopiedStageKeyword(null), 2000);
                const current = stage.command || stage.script || '';
                const updated = current ? `${current} ${token}` : token;
                onUpdateStage?.(stage.id, { command: updated, script: updated });
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                Run on branch
              </span>
              <InfoTooltip
                title="CI Run-on Branch"
                description="Which branch the verification command runs against. Task branch (the task's isolated worktree) preserves today's behaviour; Primary runs on the project's default branch (main/master/dev) so you can verify a merge; Custom runs on a named branch."
                position="left"
              />
            </div>
            <SelectDropdown
              ariaLabel={`Run-on branch for ${stage.name}`}
              className="block w-full"
              size="sm"
              value={stage.runOnBranch || 'task'}
              onChange={(val) => {
                onUpdateStage?.(stage.id, {
                  runOnBranch: val,
                  // Drop the stale custom name when leaving custom mode so a
                  // saved stage never carries a branch that no longer applies.
                  ...(val === 'custom' ? {} : { customBranch: undefined }),
                });
              }}
              options={[
                { value: 'task', label: 'TASK BRANCH (default — current behaviour)' },
                { value: 'primary', label: 'PRIMARY BRANCH (project default: main/master/dev)' },
                { value: 'custom', label: 'CUSTOM BRANCH…' },
              ]}
            />
            {stage.runOnBranch === 'custom' && (
              <div className="space-y-1 pt-1">
                <input
                  type="text"
                  aria-label={`Custom branch for ${stage.name}`}
                  value={stage.customBranch || ''}
                  onChange={(e) => {
                    onUpdateStage?.(stage.id, {
                      customBranch: e.target.value,
                    });
                  }}
                  placeholder="e.g. release/next"
                  className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-on-surface outline-none focus:border-primary"
                />
                <p className="text-[10px] text-text-muted font-mono">
                  Branch must already exist locally. Validation runs at execution time.
                </p>
              </div>
            )}
          </div>
          <TimeoutMinutesField
            stageName={stage.name}
            timeoutMs={stage.timeout}
            onCommit={(timeout) => onUpdateStage?.(stage.id, { timeout })}
            tooltipTitle="CI Stage Timeout"
            tooltipDescription="Maximum wall-clock execution time for this CI verification command before timing out. Default: 1 min."
            placeholder="1 (Default: 1 min)"
            defaultHint="Default: 1 min if empty."
          />
        </>
      )}

      {stage.type === 'merge' && (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                Merge Stage (Git Operations Only)
              </span>
              <InfoTooltip
                title="Merge Stage"
                description="Integrates the task branch into the default main branch, auto-commits, records the review baseline, and pushes. Never runs a command — add a CI stage with the deploy command right after it to deploy."
                behindTheScenes="Verifies the tree is clean, checks out main, merges (conflicts abort and fail the stage), then pushes main when a remote exists."
                position="left"
              />
            </div>
            <div className="text-[10px] text-text-muted space-y-0.5 font-mono pt-1">
              <p>
                Merge conflicts fail the stage with a clear message and trigger failback (no
                half-merged tree is kept).
              </p>
              <p>
                To deploy after the merge, add a CI stage with the deploy command (e.g.
                ./deploy.sh --prod) directly after this stage.
              </p>
              <p className="text-warning">
                Merge stages require <strong>Task Branches</strong> (project settings): without
                per-task branches there is nothing to merge — the stage fails with a clear message.
              </p>
            </div>
          </div>
          <TimeoutMinutesField
            stageName={stage.name}
            ariaLabel={`Merge timeout in minutes for ${stage.name}`}
            timeoutMs={stage.timeout}
            onCommit={(timeout) => onUpdateStage?.(stage.id, { timeout })}
            tooltipTitle="Merge Stage Timeout"
            tooltipDescription="Maximum wall-clock execution time for the git merge operations. Default: 5 min."
            placeholder="5 (Default: 5 min)"
            defaultHint="Default: 5 min if empty."
          />
        </>
      )}
    </>
  );
}
