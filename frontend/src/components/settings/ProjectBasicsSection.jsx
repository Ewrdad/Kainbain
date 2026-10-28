import { ModelSelector } from '../common/ModelSelector';

const ACCENT_PRESETS = [
  { label: 'Emerald (Default)', value: '#7bdb85' },
  { label: 'Sky Blue', value: '#38bdf8' },
  { label: 'Violet', value: '#a78bfa' },
  { label: 'Amber', value: '#fb923c' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Teal', value: '#2dd4bf' },
];

/***
 * MARK: ProjectBasicsSection
 * @description Project Details block of the project settings form: project
 *   name, the wired AI harness + default-model control, the custom-harness
 *   command line, the accent theme picker, and the hide/archive toggle.
 *   Pure presentational section — all state lives in `ProjectSettingsForm`.
 * @example <ProjectBasicsSection projectName="My App" setProjectName={setName} models={[]} labeledHarnesses={[]} defaultModel="" onDefaultModelChange={fn} effectiveHarnessId="pi" handleHarnessChange={fn} refreshing={false} refresh={fn} isHarnessDisabled={false} isCustomHarness={false} harnessCommand="" onHarnessCommandChange={fn} showDefaultModelMismatch={false} onClearDefaultModel={fn} onDismissMismatch={fn} defaultModelForMismatch="" effectiveHarnessLabel="pi" showHarnessGuidance={false} guidanceHints={[]} accentColor="#7bdb85" handleAccentChange={fn} validationError="" hiddenProjectIds={[]} projectId="p1" toggleHideProject={fn} />
 * @param {Object} props
 * @param {string} props.projectName - Draft project name.
 * @param {Function} props.setProjectName - Name setter.
 * @param {Array} props.models - Flat model catalogue for the picker.
 * @param {Array} props.labeledHarnesses - Harness entries with default labelling.
 * @param {string} props.defaultModel - Draft default model reference.
 * @param {Function} props.onDefaultModelChange - Model change handler.
 * @param {string} props.effectiveHarnessId - Resolved harness id.
 * @param {Function} props.handleHarnessChange - Harness change handler.
 * @param {boolean} props.refreshing - Model discovery refresh in flight.
 * @param {Function} props.refresh - Re-run model discovery.
 * @param {boolean} props.isHarnessDisabled - Whether the harness control is disabled.
 * @param {boolean} props.isCustomHarness - Whether the custom harness is effective.
 * @param {string} props.harnessCommand - Draft custom harness command line.
 * @param {Function} props.onHarnessCommandChange - Command change handler.
 * @param {boolean} props.showDefaultModelMismatch - Whether to show the mismatch banner.
 * @param {Function} props.onClearDefaultModel - Clears the default model draft.
 * @param {Function} props.onDismissMismatch - Dismisses the mismatch banner.
 * @param {string} props.defaultModelForMismatch - Model shown in the mismatch banner.
 * @param {string} props.effectiveHarnessLabel - Harness shown in the mismatch banner.
 * @param {boolean} props.showHarnessGuidance - Whether to show the zero-harness guidance.
 * @param {Array} props.guidanceHints - Per-harness setup hints.
 * @param {string} props.accentColor - Draft accent colour.
 * @param {Function} props.handleAccentChange - Accent change handler.
 * @param {string} props.validationError - Form-level validation message.
 * @param {Array} props.hiddenProjectIds - Archived project ids.
 * @param {string} props.projectId - Active project identifier.
 * @param {Function} props.toggleHideProject - Hide/archive toggle.
 ***/
export function ProjectBasicsSection({
  projectName,
  setProjectName,
  models,
  labeledHarnesses,
  defaultModel,
  onDefaultModelChange,
  effectiveHarnessId,
  handleHarnessChange,
  refreshing,
  refresh,
  isHarnessDisabled,
  isCustomHarness,
  harnessCommand,
  onHarnessCommandChange,
  showDefaultModelMismatch,
  onClearDefaultModel,
  onDismissMismatch,
  defaultModelForMismatch,
  effectiveHarnessLabel,
  showHarnessGuidance,
  guidanceHints,
  accentColor,
  handleAccentChange,
  validationError,
  hiddenProjectIds,
  projectId,
  toggleHideProject,
}) {
  return (
    <div className="space-y-4 max-w-2xl">
      <h3 className="text-sm font-bold uppercase tracking-wide text-text-high flex items-center gap-2">
        <span className="text-primary">📋</span> Project Details
      </h3>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-name-input"
          className="text-xs font-bold uppercase text-text-muted tracking-wider"
        >
          Project Name
        </label>
        <input
          id="project-name-input"
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-sm outline-none focus:border-primary transition-colors font-medium text-on-surface"
          placeholder="Project name..."
        />
      </div>

      {/* Agent harness + default model (one wired control: the harness
          scopes the model catalogue — dropdown, free-text, or hidden) */}
      <div className="flex flex-col gap-2">
        <ModelSelector
          id="project-default-model-select"
          ariaLabel="Default AI Model"
          harnessSelectId="project-harness-select"
          harnessAriaLabel="AI Harness"
          models={models}
          harnesses={labeledHarnesses}
          value={defaultModel}
          onChange={onDefaultModelChange}
          harnessId={effectiveHarnessId}
          onHarnessChange={handleHarnessChange}
          onRefresh={refresh}
          refreshing={refreshing}
          isHarnessDisabled={isHarnessDisabled}
          harnessLabelNode={
            <label
              htmlFor="project-harness-select"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              AI Harness
            </label>
          }
          modelLabelNode={
            <label
              htmlFor="project-default-model-select"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Default AI Model
            </label>
          }
          reasoningLabelNode={
            <label
              htmlFor="project-default-model-select-reasoning"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Reasoning
            </label>
          }
        />
        <p className="text-[10px] text-text-muted">
          Engine that runs agent stages for this project; it scopes the model catalogue.
          The default model is used across all workflow agent stages unless explicitly
          overridden. Harnesses with adjustable reasoning (pi, antigravity, mock) show
          a Reasoning dropdown under the model — Default (no level) stores the bare
          model reference. &quot;Custom command&quot; runs any CLI agent
          (e.g. <code className="font-mono text-primary">claude -p</code>) with the curated stage
          prompt appended as the final argument.
        </p>
        {showDefaultModelMismatch && (
          <div
            data-testid="default-model-mismatch-warning"
            className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-sm flex flex-col gap-2"
          >
            <p className="text-[11px] text-on-surface">
              <span className="font-bold">⚠ Model mismatch:</span>{' '}
              <code className="font-mono text-primary">{defaultModelForMismatch}</code> is not
              in the <span className="font-semibold">{effectiveHarnessLabel}</span> catalogue —
              stages without an override will fall back at dispatch. The stored value
              is kept until you change it.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="default-model-mismatch-clear"
                onClick={onClearDefaultModel}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-sm bg-surface-container-high text-on-surface border border-border-standard hover:border-primary transition-colors"
              >
                Pick a model for this harness
              </button>
              <button
                type="button"
                data-testid="default-model-mismatch-keep"
                onClick={onDismissMismatch}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-sm bg-transparent text-text-muted border border-border-standard hover:text-on-surface transition-colors"
              >
                Keep and warn
              </button>
            </div>
          </div>
        )}
        {showHarnessGuidance && (
          <div
            data-testid="harness-guidance-panel"
            className="p-3 bg-surface-container border border-border-standard rounded-sm flex flex-col gap-2"
          >
            <p className="text-xs font-bold text-on-surface">
              No AI harnesses detected on this host
            </p>
            <p className="text-[11px] text-text-muted">
              Install a harness CLI or configure its credentials, then Refresh —
              or evaluate the workflow with the zero-credential mock harness (no
              AI runs there; output is synthetic).
            </p>
            {guidanceHints.length > 0 && (
              <ul className="flex flex-col gap-1">
                {guidanceHints.map((h) => (
                  <li key={h.id} className="text-[11px] text-text-muted">
                    <span className="font-semibold text-on-surface">
                      {h.label || h.id}:
                    </span>{' '}
                    {h.hint}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <button
                type="button"
                onClick={() => handleHarnessChange('mock')}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-sm bg-surface-container-high text-on-surface border border-border-standard hover:border-primary transition-colors"
              >
                Use mock harness for evaluation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Custom harness extras (only for the custom harness) */}
      {isCustomHarness && (
        <>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-harness-command-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Custom Harness Command
            </label>
            <input
              id="project-harness-command-input"
              type="text"
              value={harnessCommand}
              onChange={(e) => {
                onHarnessCommandChange(e.target.value);
              }}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-sm outline-none focus:border-primary transition-colors font-mono text-on-surface"
              placeholder="claude -p"
            />
            <p className="text-[10px] text-text-muted">
              Runs without a shell; the curated stage prompt is appended as the final quoted
              argument, so <code className="font-mono text-primary">claude -p</code> becomes{' '}
              <code className="font-mono text-primary">claude -p &quot;&lt;prompt&gt;&quot;</code>.
              Flags and quoted arguments are supported — bake model selection into the command
              itself (e.g. <code className="font-mono text-primary">claude --model sonnet -p</code>);
              shell operators (|, ;, &amp;, &gt;) are not — use a wrapper script for those.
            </p>
          </div>
          {validationError && (
            <p role="alert" className="text-[11px] font-bold text-red-500">
              {validationError}
            </p>
          )}
        </>
      )}

      {/* Accent Color Theme Selector */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-accent-color-input"
          className="text-xs font-bold uppercase text-text-muted tracking-wider"
        >
          Accent Theme Color
        </label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                onClick={() => handleAccentChange(preset.value)}
                className={`w-7 h-7 rounded-sm transition-transform cursor-pointer border ${
                  accentColor.toLowerCase() === preset.value.toLowerCase()
                    ? 'scale-110 border-on-surface shadow-md ring-2 ring-primary/50'
                    : 'border-border-standard hover:scale-105 opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: preset.value }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 ml-2">
            <input
              id="project-accent-color-picker"
              type="color"
              value={accentColor}
              onChange={(e) => handleAccentChange(e.target.value)}
              className="w-7 h-7 p-0 border border-border-standard rounded-sm cursor-pointer bg-transparent"
              title="Custom color picker"
              aria-label="Custom color picker"
            />
            <input
              id="project-accent-color-input"
              aria-label="Accent Theme Color Hex"
              type="text"
              value={accentColor}
              onChange={(e) => handleAccentChange(e.target.value)}
              className="p-1.5 w-24 bg-surface-container border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary uppercase"
              placeholder="#7bdb85"
            />
          </div>
        </div>
        <p className="text-[10px] text-text-muted">
          Custom brand accent color applied to workspace headers, borders, and active highlights.
        </p>
      </div>

      {/* Hide / Archive Project Toggle (#29) */}
      <div className="flex items-center justify-between p-3 bg-surface-container border border-border-standard rounded-sm">
        <div>
          <span className="text-xs font-bold uppercase text-text-high block">
            Hide Project from Active List
          </span>
          <span className="text-[10px] text-text-muted">
            Hides this project from top selector dropdown unless &quot;Show Archived&quot; is
            enabled.
          </span>
        </div>
        <button
          id="project-visibility-toggle"
          type="button"
          onClick={() => toggleHideProject?.(projectId)}
          className={`px-3 py-1.5 rounded-sm text-xs font-bold uppercase cursor-pointer transition-colors ${
            hiddenProjectIds.includes(projectId)
              ? 'bg-primary text-on-primary font-bold'
              : 'bg-surface-deep border border-border-standard text-text-muted hover:text-on-surface'
          }`}
        >
          {hiddenProjectIds.includes(projectId) ? 'Hidden (Archived)' : 'Visible'}
        </button>
      </div>
    </div>
  );
}
