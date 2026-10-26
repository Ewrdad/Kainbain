import { useState } from 'react';

import { MarkdownViewer } from '../../common/MarkdownViewer';
import { formatModelRef } from '../../../services/formatModelRef';
import { formatTaskTitleFirstLine } from '../../tasks/taskFormatters';
import { isAutomatedStage } from '../../stageTypes';

/***
 * MARK: formatDuration
 * @description Formats elapsed seconds into human-readable mm:ss format.
 * @param {number} totalSeconds
 * @returns {string}
 ***/
function formatDuration(totalSeconds) {
  if (Number.isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/***
 * MARK: ActiveTaskPromptWidget
 * @description Deep debug inspector for the executing (or latest) task: full prompt payload,
 * raw vs markdown view, token/char metrics, copy helper, elapsed stopwatch, and stage reports.
 * For a harness without model selection (`modelSelection: "none"` — the harness
 * manages its own model) the Model pill and the Provider/Source line are hidden
 * and only the Harness pill is shown; a missing `modelSelection` means `"list"`.
 * For fully scripted stages (`ci`/`deploy`/`merge` — bash/git only, no model
 * ever runs) the Harness pill, Model pill, and Provider/Source line are all
 * hidden and an `Automated — no model` pill is shown instead. The backend
 * `isAutomatedStage` flag wins when present; the local stage-type predicate
 * covers older backends. Unknown stage types stay fail-visible (pills shown).
 * Alias runs show a separate `alias: <name>` pill (after Type, before
 * Harness) next to the picked Harness/Model; unknown/deleted/blank aliases
 * show `alias: <name> (unresolved)` with the fallback Harness/Model.
 ***/
export function ActiveTaskPromptWidget({
  activeTask = {},
  engineState = {},
  isRunning = false,
  activeTaskElapsed = 0,
}) {
  const [promptViewMode, setPromptViewMode] = useState('raw'); // 'raw' | 'markdown'
  const [isCopied, setIsCopied] = useState(false);

  const isCheckpoint =
    engineState?.status === 'checkpoint' || engineState?.status === 'waiting_human';
  const promptText = activeTask?.promptPending
    ? ''
    : activeTask?.dispatchedPrompt || activeTask?.prompt || '';
  const model = formatModelRef(activeTask?.modelDetails?.key || activeTask?.model);
  const harness = activeTask?.harness || model.harness || 'Unknown';
  const provider = activeTask?.modelDetails?.provider || model.provider;
  const modelSelection = activeTask?.modelSelection || 'list';
  const stageType =
    activeTask?.stageType || activeTask?.currentStageType || engineState?.activeStageType;
  // Scripted stages run no model: the backend flag is authoritative when
  // present; the local predicate covers older backends without the flag.
  const isScripted =
    typeof activeTask?.isAutomatedStage === 'boolean'
      ? activeTask.isAutomatedStage
      : isAutomatedStage(stageType);
  const showHarness = !isScripted;
  const showModel = !isScripted && modelSelection !== 'none';
  // The alias behind the run (resolved) or the unresolvable ref (missing);
  // both hide on scripted stages and stay absent on old payloads.
  const aliasName = activeTask?.alias?.name || null;
  const aliasMissing = !aliasName ? activeTask?.aliasMissing || null : null;
  const showAlias = !isScripted && (aliasName || aliasMissing);
  const aliasTitle =
    aliasName && typeof activeTask?.alias?.targetIndex === 'number'
      ? `alias ${aliasName}, target ${activeTask.alias.targetIndex + 1}`
      : undefined;

  // Live status indicator styling for the header dot.
  const statusDotClass = (() => {
    if (isRunning) return 'bg-emerald-400 animate-ping';
    if (isCheckpoint) return 'bg-amber-400';
    return 'bg-slate-400';
  })();

  const handleCopyPrompt = () => {
    if (promptText && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(promptText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Render the prompt body (raw vs markdown) or an empty-state panel.
  const renderPromptBody = () => {
    if (!promptText) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 font-mono text-xs">
          <span className="text-3xl mb-2 opacity-40">📝</span>
          <p className="font-bold text-slate-300">No Prompt Payload Active</p>
          <p className="text-[11px] mt-1 text-slate-400">
            The curated prompt will appear after dispatch. Task goals are not prompt payloads.
          </p>
        </div>
      );
    }
    if (promptViewMode === 'raw') {
      return (
        <pre className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-text break-words">
          {promptText}
        </pre>
      );
    }
    return (
      <div className="prose prose-invert prose-sm max-w-none select-text">
        <MarkdownViewer
          content={promptText}
          projectId={engineState?.activeProjectId || null}
          taskId={activeTask?.id || null}
        />
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#070a12] overflow-hidden">
      {/* Active Task Info Card */}
      <div className="px-3.5 py-2.5 bg-[#0e1424] border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${statusDotClass}`} />
            <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-emerald-400">
              {isRunning ? 'EXECUTING TASK' : 'ACTIVE / LAST EXECUTED'}
            </span>
          </div>

          {/* Live Stage Stopwatch */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 rounded font-mono text-xs font-bold text-emerald-300 border border-slate-800">
            <span>⏱️</span>
            <span>{formatDuration(activeTaskElapsed)}</span>
          </div>
        </div>

        {/* Task Title */}
        <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
          {formatTaskTitleFirstLine(
            activeTask?.title || activeTask?.goal || '',
            'No task currently active',
          )}
        </h4>

        {/* Stage & Model Pills */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700">
            Stage:{' '}
            <strong className="text-emerald-300">
              {activeTask?.stageName ||
                activeTask?.currentStageName ||
                engineState?.activeStageName ||
                'Unknown'}
            </strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700">
            Type:{' '}
            <strong className="text-cyan-300">
              {activeTask?.stageType ||
                activeTask?.currentStageType ||
                engineState?.activeStageType ||
                'Unknown'}
            </strong>
          </span>
          {showAlias && (
            <span
              className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700"
              title={aliasTitle}
            >
              alias:{' '}
              <strong className="text-amber-300">
                {aliasName || `${aliasMissing} (unresolved)`}
              </strong>
            </span>
          )}
          {showHarness && (
            <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700">
              Harness: <strong className="text-cyan-300">{harness}</strong>
            </span>
          )}
          {isScripted && (
            <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700">
              <strong className="text-emerald-300">Automated — no model</strong>
            </span>
          )}
          {showModel && (
            <span
              className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700 break-all"
              title={activeTask?.model || 'Model unavailable'}
            >
              Model: <strong className="text-purple-300">{model.label}</strong>
            </span>
          )}
        </div>
        {(showModel || activeTask?.stageId) && (
          <div className="mt-1 text-[10px] font-mono text-slate-400 break-all">
            {showModel && (
              <>
                Provider: {provider || 'Unknown'} · Source:{' '}
                {activeTask?.modelDetails?.source || 'unknown'}
              </>
            )}
            {showModel && activeTask?.stageId && ' · '}
            {activeTask?.stageId && <>Stage ID: {activeTask.stageId}</>}
          </div>
        )}
        {activeTask?.goal && (
          <details className="mt-1 text-xs text-slate-300">
            <summary className="cursor-pointer">Full task</summary>
            <pre className="whitespace-pre-wrap break-words max-h-40 overflow-auto">
              {activeTask.goal}
            </pre>
          </details>
        )}
      </div>

      {/* Prompt Toolbar */}
      <div className="px-3 py-1.5 bg-[#0b0f1a] border-b border-slate-800/80 flex items-center justify-between shrink-0 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            Curated Prompt Payload
          </span>
          <span className="text-[10px] text-slate-400 font-normal">
            ({promptText.length} chars)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPromptViewMode(promptViewMode === 'raw' ? 'markdown' : 'raw')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 transition-colors cursor-pointer"
            title="Toggle Raw vs Markdown View"
          >
            {promptViewMode === 'raw' ? '👁️ Markdown View' : '📄 Raw Monospace'}
          </button>

          <button
            type="button"
            onClick={handleCopyPrompt}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
            title="Copy Full Prompt"
          >
            <span>{isCopied ? '✓ Copied' : '📋 Copy'}</span>
          </button>
        </div>
      </div>

      {/* Prompt Body */}
      <div
        data-testid="active-prompt-viewer"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable widget body (WCAG 2.1.1)
        tabIndex={0}
        role="group"
        aria-label="Active task prompt"
        className="flex-1 p-3.5 overflow-y-auto custom-scrollbar bg-[#05070d]"
      >
        {renderPromptBody()}
      </div>

      {/* Reports Strip */}
      {activeTask?.reports && activeTask.reports.length > 0 && (
        <div className="p-2 bg-[#0e1424] border-t border-slate-800 shrink-0 text-xs font-mono flex items-center justify-between">
          <span className="text-slate-400 text-[10px]">
            Reports Generated: {activeTask.reports.length}
          </span>
          <span className="text-emerald-400 text-[10px]">
            Latest: {activeTask.reports.at(-1)?.stageName || 'Report'}
          </span>
        </div>
      )}
    </div>
  );
}

export default ActiveTaskPromptWidget;
