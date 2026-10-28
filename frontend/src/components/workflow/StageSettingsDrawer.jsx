import { InfoTooltip } from '../common/InfoTooltip';
import { SelectDropdown } from '../common/SelectDropdown';
import { StageTypeConfig } from './StageTypeConfig';
import { StageTagEditor } from './StageTagEditor';
import { availableStageTags, normalizeStageTags } from '../../../../shared/stageTags.js';

/***
 * MARK: StageSettingsDrawer
 * @description In-column full-height expandable stage settings drawer
 *   extracted from WorkflowCanvas (#9, #10, #11, #42): toggle button, drawer
 *   shell (header, name, description, type selector), per-type fields via
 *   `StageTypeConfig`, pause/fallback section and footer (delete + done).
 * @example <StageSettingsDrawer stage={stage} stages={stages} isSettingsExpanded={open} ... />
 ***/
export function StageSettingsDrawer({
  stage,
  stages,
  isSettingsExpanded,
  onToggleSettings,
  onCloseSettings,
  onSaveAndClose,
  onUpdateStage,
  onTypeChange,
  activeProjectId,
  saveStages,
  pendingStageAction,
  removeStageAndSave,
  typeConfigProps,
}) {
  return (
    <div className="border-t border-border-standard bg-surface-container/60 shrink-0">
      <button
        type="button"
        onClick={onToggleSettings}
        aria-expanded={isSettingsExpanded}
        aria-label={`Configure stage ${stage.name}`}
        className={`w-full py-2 px-3 text-[10px] font-label-caps uppercase tracking-wider flex items-center justify-between transition-colors cursor-pointer select-none ${
          isSettingsExpanded
            ? 'bg-ochre/20 text-[#ffe0b2] font-bold border-b border-ochre/30'
            : 'text-text-muted hover:text-[#ffe0b2] hover:bg-surface-container'
        }`}
      >
        <span className="flex items-center gap-1.5 font-bold">
          <span>⚙️</span>
          <span>Stage Settings</span>
        </span>
        <span className="text-[9px] font-mono font-bold">
          {isSettingsExpanded ? '▼ CLOSE' : '▲ EDIT'}
        </span>
      </button>

      {isSettingsExpanded && (
        <div className="absolute inset-0 z-20 flex flex-col bg-surface-deep border rounded-sm overflow-hidden h-full animate-in fade-in duration-200">
          {/* Full-Height Drawer Header */}
          <header className="p-3 bg-surface-container border-b border-border-standard flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-ochre">⚙️</span>
              <span className="font-label-caps text-xs font-bold uppercase tracking-wider text-on-surface truncate">
                Configure {stage.name}
              </span>
            </div>
            <button
              type="button"
              onClick={onCloseSettings}
              aria-label={`Close settings for ${stage.name}`}
              className="p-1 min-w-[44px] min-h-[44px] text-text-muted hover:text-on-surface hover:bg-surface-container-high rounded transition-colors cursor-pointer"
            >
              ✕
            </button>
          </header>

          {/* Full-Height Drawer Body */}
          <div className="flex-1 p-3 space-y-4 overflow-y-auto custom-scrollbar">
            {/* Stage Name */}
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                Stage Name
              </span>
              <input
                type="text"
                aria-label={`Stage name for ${stage.name}`}
                value={stage.name}
                onChange={(e) => {
                  onUpdateStage?.(stage.id, { name: e.target.value });
                }}
                className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface outline-none focus:border-primary"
              />
            </div>

            {/* Stage Description */}
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                Description / Sublabel
              </span>
              <input
                type="text"
                aria-label={`Description for ${stage.name}`}
                value={stage.description || ''}
                onChange={(e) => {
                  onUpdateStage?.(stage.id, { description: e.target.value });
                }}
                placeholder="Stage purpose"
                className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-[11px] text-on-surface outline-none focus:border-primary"
              />
            </div>
            {/* Stage Tags — chip editor; tags filter the board (see the
                toolbar tag filter) and round-trip through the backend. */}
            <StageTagEditor
              value={Array.isArray(stage.tags) ? stage.tags : []}
              availableTags={availableStageTags(stages)}
              stageName={stage.name}
              onChange={(tags) => {
                onUpdateStage?.(stage.id, { tags: normalizeStageTags(tags) ?? [] });
              }}
            />
            <p className="text-[10px] text-text-muted font-mono">
              Tags let you filter the board down to a subset of stages (e.g. split a long pipeline
              between PO and Dev views).
            </p>

            {/* Stage Type Selector */}
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                Stage Type
              </span>
              <SelectDropdown
                ariaLabel={`Stage type for ${stage.name}`}
                className="block w-full"
                value={stage.type || 'agent'}
                onChange={(val) => {
                  onUpdateStage?.(stage.id, { type: val });
                  onTypeChange?.(stage.id, val);
                }}
                size="sm"
                options={[
                  { value: 'agent', label: 'AGENT (Autonomous AI Worker)' },
                  { value: 'human', label: 'HUMAN (Manual Review Checkpoint)' },
                  { value: 'ci', label: 'CI (Automated Bash Command / Test / Deploy)' },
                  { value: 'merge', label: 'MERGE (Merge Task Branch to Main)' },
                ]}
              />
            </div>

            <StageTypeConfig stage={stage} onUpdateStage={onUpdateStage} {...typeConfigProps} />

            {/* Pause Stage & Custom Fallback Selector (#10, #11) */}
            <div className="space-y-3 pt-2 border-t border-border-standard/60">
              {/* Pause Stage Toggle (#11) */}
              <div className="space-y-1">
                <label
                  title="When enabled, incoming tasks will pause at this stage and require manual start"
                  className="flex items-center gap-2 text-[10px] font-bold uppercase text-text-muted cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={stage.paused || false}
                    onChange={(e) => {
                      onUpdateStage?.(stage.id, { paused: e.target.checked });
                    }}
                    title="When enabled, incoming tasks will pause at this stage and require manual start"
                    className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                  />
                  <span>Pause Stage</span>
                </label>
                <p className="text-[10px] text-text-muted font-mono pl-5">
                  When enabled, incoming tasks will pause at this stage and require manual start.
                </p>
              </div>

              {/* Custom Fallback Stage Selector (#10) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
                    Fallback Stage:
                  </span>
                  <InfoTooltip
                    title="Fallback Recovery Route"
                    description="Designates where a task is moved if human review rejects or automated verification fails."
                    behindTheScenes="Scheduler redirects task to target stage with attached rejection feedback notes"
                    position="left"
                  />
                </div>
                <SelectDropdown
                  ariaLabel={`Fallback stage for ${stage.name}`}
                  className="block w-full"
                  value={stage.fallback || stage.failback || 'previous'}
                  onChange={(val) => {
                    onUpdateStage?.(stage.id, {
                      fallback: val,
                      failback: val,
                    });
                  }}
                  size="sm"
                  options={[
                    {
                      group: 'Routing Rules',
                      value: 'previous',
                      label: 'Previous Stage',
                    },
                    {
                      group: 'Routing Rules',
                      value: 'start',
                      label: 'Start of Pipeline',
                    },
                    { group: 'Routing Rules', value: 'any', label: 'Any Stage' },
                    { group: 'Routing Rules', value: 'abort', label: 'Abort Job' },
                    ...stages.map((s, idx) => ({
                      group: 'Target Stage',
                      value: s.id,
                      label: `${idx + 1}. ${s.name}`,
                    })),
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Full-Height Drawer Footer */}
          <footer className="p-3 bg-surface-container border-t border-border-standard flex items-center justify-between shrink-0">
            <button
              type="button"
              disabled={pendingStageAction !== null}
              onClick={() => {
                if (
                  typeof window !== 'undefined' &&
                  window.confirm(`Delete stage "${stage.name}"?`)
                ) {
                  removeStageAndSave(stage.id).catch(() => {
                    // saveStages surfaces persistence failures via its logger.
                  });
                }
              }}
              aria-label={`Delete stage ${stage.name}`}
              className="px-2.5 py-1 text-[10px] font-bold uppercase text-error hover:bg-error/10 border border-error/30 rounded transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1"
            >
              {pendingStageAction === `delete-stage-${stage.id}` ? (
                <>
                  <span className="inline-block w-2 h-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                'Delete Stage'
              )}
            </button>

            <button
              type="button"
              onClick={onSaveAndClose}
              aria-label={`Save and close settings for ${stage.name}`}
              className="px-4 py-1.5 bg-primary text-on-primary text-[10px] font-bold uppercase rounded hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Done
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
