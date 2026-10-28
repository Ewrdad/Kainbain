const ACCENT_PRESETS = [
  { label: 'Emerald (Default)', value: '#7bdb85' },
  { label: 'Sky Blue', value: '#38bdf8' },
  { label: 'Violet', value: '#a78bfa' },
  { label: 'Amber', value: '#fb923c' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Teal', value: '#2dd4bf' },
];

import React, { useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { FALLBACK_MODELS } from '../stageTypes';
import { AppLinkSection } from './AppLinkSection';
import { ModelSelector, resolveStoredModelValidity } from '../common/ModelSelector';
import { ModelAliasesSection, validateAliasList } from './ModelAliasesSection';
import { accentTokens } from '../../theme/accentTokens';
import { ALIAS_HARNESS_ID, findAliasUsages } from '../../../../shared/modelAliases.js';
import { msToMinutes } from '../../utils/timeoutUnits';
import { RetryNumberField } from './RetryNumberField';
import { parseRetrySettings } from './projectSettingsValidation';

/***
 * MARK: ProjectSettingsForm
 * @description Keyed form that initializes its state from the active project.
 * Manages project name, agent harness + default model (one wired control: the
 * harness scopes the model catalogue — list dropdown, empty state, or
 * hidden — per the harness's `modelSelection`), the custom harness's
 * free-text command line (model flags bake into the command itself),
 * accent color theme, working directory, notes directory,
 * Git remote URL, and the per-project retry/timeout overrides.
 * @param {Object} props
 * @param {Object} props.project - The current project object.
 * @param {string} props.projectId - Active project identifier.
 * @param {Function} props.onProjectUpdated - Callback when project is updated.
 ***/
export function ProjectSettingsForm({ project, projectId, onProjectUpdated }) {
  const {
    notifySuccess,
    notifyError,
    hiddenProjectIds = [],
    toggleHideProject,
    updateProjectInState,
    isHarnessDisabled,
  } = useKainBain();
  const [projectName, setProjectName] = useState(project?.name || '');
  const [defaultModel, setDefaultModel] = useState(project?.defaultModel || '');
  // Agent harness selection: '' means "follow the configured default" (the
  // backend resolves config.defaultHarness → "pi"). This single state drives
  // BOTH the harness dropdown and the model catalogue (ModelSelector is
  // controlled below), so the picked model always belongs to the picked
  // harness. Selecting "custom" additionally needs a free-text command line
  // (project.harnessCommand) — model flags bake into the command itself.
  const [harness, setHarness] = useState(project?.harness || '');
  const [harnessCommand, setHarnessCommand] = useState(project?.harnessCommand || '');
  // Per-project model aliases (table state lives here so the save payload
  // carries it; the section edits through setModelAliases).
  const [modelAliases, setModelAliases] = useState(
    Array.isArray(project?.modelAliases) ? project.modelAliases : [],
  );
  const [modelAliasesTouched, setModelAliasesTouched] = useState(false);
  const [accentColor, setAccentColor] = useState(project?.accentColor || '#7bdb85');
  const [cwd, setCwd] = useState(project?.cwd || '');
  // D13: no host default baked in — '' (unset) lets the server resolve the
  // configured notes root (or report notes-missing loudly) instead of
  // persisting one operator's path into every fresh project.
  const [notesDir, setNotesDir] = useState(project?.notesDir || project?.notesPath || '');
  const [docsDirName, setDocsDirName] = useState(project?.docsDirName || '');
  const [kainbainDirName, setKainbainDirName] = useState(project?.kainbainDirName || '');
  const [centralizedDocs, setCentralizedDocs] = useState(project?.centralizedDocs !== false);
  const [gitRepo, setGitRepo] = useState(project?.gitRepo || project?.gitUrl || '');
  // Per-task branch support (kb/<taskId> branches + merge-to-main stage).
  // Opt-in: defaults off so existing single-branch projects are unaffected.
  const [useBranches, setUseBranches] = useState(project?.useBranches === true);
  // Preserved PR-review diff across merge + deploy (opt-in, default off) and
  // the per-merge baseline reset (default on: each merge pass re-scopes the
  // review to that pass's change; off keeps a cumulative view instead).
  const [preserveReviewDiff, setPreserveReviewDiff] = useState(
    project?.preserveReviewDiffAfterMerge === true,
  );
  const [resetReviewBaseline, setResetReviewBaseline] = useState(
    project?.resetReviewBaselineOnMerge !== false,
  );
  // Retry & timeout overrides: raw string drafts ('' = unset = follow the
  // global default), so blanking a field reads clearly and partial input
  // stays editable while typing. Timeout drafts are entered in minutes but
  // stored in milliseconds, so they convert through the shared helper; the
  // auto-iteration switch is tri-state: 'default' (follow global),
  // 'enabled', or 'disabled'.
  const retryDraft = (stored) => (stored === undefined || stored === null ? '' : String(stored));
  const retryDraftMinutes = (storedMs) => {
    const minutes = msToMinutes(storedMs);
    return minutes === '' ? '' : String(minutes);
  };
  const retrySwitch = (stored) =>
    stored === true ? 'enabled' : stored === false ? 'disabled' : 'default';
  const [maxAutoIterations, setMaxAutoIterations] = useState(
    retryDraft(project?.maxAutoIterations),
  );
  const [maxTransientRetries, setMaxTransientRetries] = useState(
    retryDraft(project?.maxTransientRetries),
  );
  const [autoIterationEnabled, setAutoIterationEnabled] = useState(
    retrySwitch(project?.autoIterationEnabled),
  );
  const [agentTimeoutMs, setAgentTimeoutMs] = useState(retryDraftMinutes(project?.agentTimeoutMs));
  const [ciTimeoutMs, setCiTimeoutMs] = useState(retryDraftMinutes(project?.ciTimeoutMs));
  const [mergeTimeoutMs, setMergeTimeoutMs] = useState(retryDraftMinutes(project?.mergeTimeoutMs));
  const [retryErrors, setRetryErrors] = useState({});
  // Sync form state once the project object loads WITHOUT an effect
  // (react-hooks/set-state-in-effect): adjust state during render when the
  // project identity changes — the documented React alternative to
  // sync-effects. Covers the form mounting before the project fetch resolves.
  // EVERY persisted field must be listed here: anything left on its
  // mount-time placeholder is sent back on Save and clobbers the stored
  // value (seen in prod: name '' + cwd set to the projects root, which
  // orphaned project.json and broke all branch operations).
  const [branchSyncProjectId, setBranchSyncProjectId] = useState(project?.id);
  if ((project?.id ?? null) !== (branchSyncProjectId ?? null)) {
    setBranchSyncProjectId(project?.id ?? null);
    setProjectName(project?.name || '');
    setCwd(project?.cwd || '');
    setNotesDir(project?.notesDir || project?.notesPath || '');
    setDocsDirName(project?.docsDirName || '');
    setKainbainDirName(project?.kainbainDirName || '');
    setCentralizedDocs(project?.centralizedDocs !== false);
    setGitRepo(project?.gitRepo || project?.gitUrl || '');
    setAccentColor(project?.accentColor || '#7bdb85');
    setUseBranches(project?.useBranches === true);
    setPreserveReviewDiff(project?.preserveReviewDiffAfterMerge === true);
    setResetReviewBaseline(project?.resetReviewBaselineOnMerge !== false);
    setHarness(project?.harness || '');
    setHarnessCommand(project?.harnessCommand || '');
    setMaxAutoIterations(retryDraft(project?.maxAutoIterations));
    setMaxTransientRetries(retryDraft(project?.maxTransientRetries));
    setAutoIterationEnabled(retrySwitch(project?.autoIterationEnabled));
    setAgentTimeoutMs(retryDraftMinutes(project?.agentTimeoutMs));
    setCiTimeoutMs(retryDraftMinutes(project?.ciTimeoutMs));
    setMergeTimeoutMs(retryDraftMinutes(project?.mergeTimeoutMs));
    setRetryErrors({});
    if (!modelAliasesTouched) {
      setModelAliases(Array.isArray(project?.modelAliases) ? project.modelAliases : []);
    }
  }
  // Shared model catalogue (flat models + per-harness view) with the app-wide
  // fallback semantics; ProjectSettings keeps its own curated fallback list.
  // The per-harness view carries each harness's `modelSelection` mode, so the
  // single harness control below always renders the matching model UI.
  // `refresh` re-runs discovery past both caches (empty-state escape hatch).
  const { models, harnesses, refreshing, refresh } = useModelCatalog(FALLBACK_MODELS, {
    // Live draft state (not the persisted project prop): rows added or edited
    // in the Model Aliases section below appear in this page's own picker
    // before saving. Invalid rows are dropped by normalization, so the picker
    // previews exactly what saving will offer.
    aliases: modelAliases,
  });
  const [saveState, setSaveState] = useState('idle');
  const [validationError, setValidationError] = useState('');
  // Soft combination warnings returned by the last save (the save succeeded;
  // these name catalog-miss pairings to fix in a follow-up edit).
  const [saveWarnings, setSaveWarnings] = useState([]);
  // Dismissed harness↔default-model mismatch signature (`harness::model`):
  // "Keep" silences the banner until either half changes. Never persisted —
  // the stored value is never rewritten by this UI.
  const [dismissedMismatch, setDismissedMismatch] = useState('');

  // The harness the backend actually resolves for unset projects (the entry
  // flagged isDefault by /compute/models, falling back to "pi"). Selecting it
  // in the dropdown saves '' so the project keeps following the configured
  // default instead of pinning the id.
  const defaultHarnessId = harnesses.find((h) => h.isDefault)?.id || 'pi';
  // The effective harness (explicit choice, or the server default): drives
  // the model catalogue AND the custom-harness extras below.
  const effectiveHarnessId = harness || defaultHarnessId;
  const isCustomHarness = effectiveHarnessId === 'custom';
  // Suffix the default harness label so follow-the-default reads clearly.
  const labeledHarnesses = harnesses.map((h) => ({
    ...h,
    label: h.isDefault ? `${h.label || h.id} (default)` : h.label || h.id,
  }));
  // Zero-harness guidance: when the backend reports availability for its
  // entries and NO real harness is runnable (mock/custom/alias excluded —
  // mock is synthetic, custom needs a command the user has not provided),
  // the form offers a guidance panel with a one-click mock opt-in. Never
  // shown for older backends (no availability fields = cannot judge).
  const availabilityKnown = harnesses.some((h) => h?.available !== undefined);
  const runnableRealHarnesses = harnesses.filter(
    (h) =>
      h?.available === true && h.id !== 'mock' && h.id !== 'custom' && h.id !== ALIAS_HARNESS_ID,
  );
  const showHarnessGuidance = availabilityKnown && runnableRealHarnesses.length === 0;
  // Harness↔default-model mismatch: the stored default no longer resolves in
  // the effective harness's catalogue (typically right after a harness
  // change). Non-blocking, dismissible per combination — and never
  // auto-rewritten (an empty catalogue judges nothing while loading).
  const effectiveHarnessEntry = harnesses.find((h) => h?.id === effectiveHarnessId);
  const effectiveHarnessModels = Array.isArray(effectiveHarnessEntry?.models)
    ? effectiveHarnessEntry.models
    : [];
  const defaultModelValidity = resolveStoredModelValidity(effectiveHarnessModels, defaultModel);
  const mismatchSignature = `${effectiveHarnessId}::${defaultModel}`;
  const showDefaultModelMismatch =
    defaultModelValidity.status === 'unknown' &&
    (effectiveHarnessEntry?.modelSelection || 'list') === 'list' &&
    effectiveHarnessModels.length > 0 &&
    dismissedMismatch !== mismatchSignature;
  const guidanceHints = harnesses.filter(
    (h) => h?.hint && h.id !== 'mock' && h.id !== 'custom' && h.id !== ALIAS_HARNESS_ID,
  );
  // Track whether the user has edited the default model so a late-arriving
  // project object (projects list still fetching when the form mounts) can
  // fill in the stored value WITHOUT clobbering an in-progress edit.
  const defaultModelTouchedRef = React.useRef(false);

  // Sync the default model from the project once it loads. Without this, a
  // form mounted before the project fetch resolved keeps its empty initial
  // state and a subsequent Save overwrites the stored model selection.
  React.useEffect(() => {
    if (!project?.defaultModel || defaultModelTouchedRef.current) return;
    setDefaultModel(project.defaultModel);
  }, [project?.id, project?.defaultModel]);

  /***
   * MARK: handleHarnessChange
   * @description Single harness-change handler: the selection scopes the model
   *   catalogue (ModelSelector is controlled on the same state). Leaving
   *   custom clears the command line.
   ***/
  const handleHarnessChange = (nextHarnessId) => {
    setHarness(nextHarnessId);
    setValidationError('');
    if (nextHarnessId !== 'custom') {
      setHarnessCommand('');
    }
  };

  const handleAccentChange = (newColor) => {
    // Keep the raw text in state so the hex input stays editable while typing;
    // the accentTokens helper normalises internally (accepts 3/6-digit hex,
    // falls back to the default on garbage), so the DOM vars and the saved
    // value are always valid CSS colours (Phase 5.2).
    setAccentColor(newColor);
    if (typeof document !== 'undefined' && document.documentElement && newColor) {
      const tokens = accentTokens(newColor);
      const root = document.documentElement;
      root.style.setProperty('--accent', tokens.triplet);
      root.style.setProperty('--accent-on', tokens.accentOn);
      root.style.setProperty('--accent-glow', tokens.glow);
      root.style.setProperty('--accent-hex', tokens.hex);
    }
  };

  const saveButtonLabel = () => {
    if (saveState === 'saving') return 'Saving...';
    if (saveState === 'saved') return 'Saved ✓';
    if (saveState === 'error') return 'Error — Retry';
    return 'Save Configuration';
  };

  const handleSave = async () => {
    // Guard: if the project object has not loaded yet, every field still holds
    // its mount-time placeholder and saving would overwrite real settings with
    // stale literals.
    if (!project?.id) {
      setSaveState('error');
      notifyError?.('Project is still loading — try again in a moment', 'Not Loaded Yet');
      return;
    }
    // Guard: identity fields must never be saved blank or pointed at the
    // projects root — a stale form state here orphaned a project's real
    // project.json in prod and broke every branch operation for it.
    if (!projectName.trim()) {
      setValidationError('Project name must not be blank.');
      setSaveState('error');
      notifyError?.('Project name must not be blank', 'Invalid Name');
      return;
    }
    if (!cwd.trim()) {
      setValidationError('Working directory must not be blank.');
      setSaveState('error');
      notifyError?.('Working directory must not be blank', 'Invalid Directory');
      return;
    }
    // D13 residual, classified: the default projects root is a fast-path
    // duplicate of the server-side guard (projectStore refuses the
    // configured root authoritatively). The literal only ever matches the
    // default install; on a custom PROJECTS_ROOT it matches nothing real,
    // so the check is conservative everywhere and the server stays the
    // authority. Kept (not plumbed to server config) because this exact
    // refusal saved a prod incident (orphaned project.json).
    if (cwd.trim().replace(/\/+$/, '') === '/home/server/projects') {
      setValidationError(
        'Working directory must be the project\u2019s own directory, not the projects root.',
      );
      setSaveState('error');
      notifyError?.(
        'Working directory must be the project\u2019s own directory',
        'Invalid Directory',
      );
      return;
    }
    // Guard: the custom harness cannot run without a command line — refuse to
    // save instead of persisting a project whose stages fail at runtime.
    if (isCustomHarness && !harnessCommand.trim()) {
      setValidationError(
        'Set a command line (e.g. claude -p) — the custom harness has nothing to run without one.',
      );
      setSaveState('error');
      notifyError?.('Custom harness needs a command line', 'Missing Command');
      return;
    }
    // Guard: docsDirName validation (1-64 chars of [A-Za-z0-9._-], no slashes, not reserved)
    const trimmedDocsName = docsDirName.trim();
    const trimmedKainbainName = kainbainDirName.trim();
    if (trimmedDocsName) {
      // Mirror the server's isValidDocsDirName reserved set (see
      // api/docsPath.js) plus the effective KainBain folder name, so the form
      // never green-lights a name the API will reject with a 400.
      const DOCS_DIR_RESERVED = [
        '.',
        '..',
        '.kainbain',
        '.git',
        'node_modules',
        trimmedKainbainName.toLowerCase(),
      ].filter(Boolean);
      const DOCS_DIR_PATTERN = /^[A-Za-z0-9._-]+$/;
      if (
        trimmedDocsName.length > 64 ||
        !DOCS_DIR_PATTERN.test(trimmedDocsName) ||
        DOCS_DIR_RESERVED.includes(trimmedDocsName.toLowerCase())
      ) {
        setValidationError(
          'Documentation folder name must be 1-64 characters (letters, numbers, ".", "_" or "-") and cannot be reserved or collide with the KainBain folder.',
        );
        setSaveState('error');
        notifyError?.(
          'Documentation folder name must be 1-64 valid characters',
          'Invalid Docs Folder Name',
        );
        return;
      }
    }
    // Guard: kainbainDirName validation (1-64 chars of [A-Za-z0-9._-], no slashes, not reserved, cannot match docs dir)
    if (trimmedKainbainName) {
      // Mirror the server's isValidKainbainDirName reserved set (see
      // api/kainbainDir.js): default internals, the literal `docs` name, and
      // the effective docs folder — so the form matches the API's 400s.
      const KAINBAIN_DIR_RESERVED = [
        '.',
        '..',
        '.git',
        'node_modules',
        'docs',
        trimmedDocsName.toLowerCase(),
      ].filter(Boolean);
      const KAINBAIN_DIR_PATTERN = /^[A-Za-z0-9._-]+$/;
      if (
        trimmedKainbainName.length > 64 ||
        !KAINBAIN_DIR_PATTERN.test(trimmedKainbainName) ||
        KAINBAIN_DIR_RESERVED.includes(trimmedKainbainName.toLowerCase())
      ) {
        setValidationError(
          'KainBain folder name must be 1-64 characters (letters, numbers, ".", "_" or "-") and cannot be reserved or collide with the docs folder.',
        );
        setSaveState('error');
        notifyError?.(
          'KainBain folder name must be 1-64 valid characters',
          'Invalid KainBain Folder Name',
        );
        return;
      }
    }
    // Alias table validation: refuse to save while a row is invalid (the
    // section shows the same per-row errors inline).
    const aliasErrors = validateAliasList(modelAliases, harnesses);
    if (aliasErrors.length > 0) {
      setValidationError(`Model Aliases: ${aliasErrors[0].message}`);
      setSaveState('error');
      notifyError?.(aliasErrors[0].message, 'Invalid Alias');
      return;
    }
    // Retry & timeout validation: blank follows the global default (saved
    // as null = clear); counts must be whole numbers >= 0 (0 disables),
    // timeouts are entered in minutes (decimals allowed, above 0). The
    // section shows per-field errors inline.
    const { errors: retryFieldErrors, payload: retryPayload } = parseRetrySettings({
      maxAutoIterations,
      maxTransientRetries,
      autoIterationEnabled,
      agentTimeoutMs,
      ciTimeoutMs,
      mergeTimeoutMs,
    });
    if (Object.keys(retryFieldErrors).length > 0) {
      const firstMessage = Object.values(retryFieldErrors)[0];
      setRetryErrors(retryFieldErrors);
      setValidationError(`Retry & Timeouts: ${firstMessage}`);
      setSaveState('error');
      notifyError?.(firstMessage, 'Invalid Retry Setting');
      return;
    }
    setRetryErrors({});
    setValidationError('');
    setSaveWarnings([]);
    setSaveState('saving');
    try {
      if (typeof document !== 'undefined' && document.documentElement && accentColor) {
        const tokens = accentTokens(accentColor);
        const root = document.documentElement;
        root.style.setProperty('--accent', tokens.triplet);
        root.style.setProperty('--accent-on', tokens.accentOn);
        root.style.setProperty('--accent-glow', tokens.glow);
        root.style.setProperty('--accent-hex', tokens.hex);
      }
      // Optimistic concurrency: a rival save from another tab/browser
      // surfaces HTTP 409 instead of silently clobbering this page's
      // fields (or vice versa).
      const saveOpts = project?.updatedAt ? { expectedUpdatedAt: project.updatedAt } : {};
      const updated = await api.updateProject(
        projectId,
        {
          name: projectName,
          cwd,
          notesDir,
          notesPath: notesDir,
          gitRepo,
          gitUrl: gitRepo,
          useBranches,
          preserveReviewDiffAfterMerge: preserveReviewDiff,
          resetReviewBaselineOnMerge: resetReviewBaseline,
          defaultModel,
          // Retry & timeout overrides (numbers when set, null when blank =
          // follow the global default). Sent on every save like the other
          // scalar fields; optimistic concurrency (409) guards rival saves.
          ...retryPayload,
          // Dirty-field save: the alias table is full-replaced whenever the
          // key is present, so a page whose snapshot predates another
          // browser's alias save must NOT send its stale list. Only an
          // edited table (including clearing it to []) carries the key.
          ...(modelAliasesTouched ? { modelAliases } : {}),
          // Docs linkage: custom folder name (blank clears to default 'docs')
          // and centralized docs opt-out toggle.
          docsDirName: trimmedDocsName || '',
          kainbainDirName: trimmedKainbainName || '',
          centralizedDocs,
          accentColor: accentTokens(accentColor).hex,
          // Harness choice: selecting the server's default harness saves as ''
          // so the project keeps following the configured default (the backend
          // normalizes '' → undefined). "custom" additionally carries the
          // command line (model flags bake into it); other harnesses clear it.
          harness: harness === defaultHarnessId ? '' : harness,
          harnessCommand: isCustomHarness ? harnessCommand : '',
        },
        saveOpts,
      );
      // Refresh the in-memory project so the applied accent/name survives
      // view/tab switches without a full re-fetch.
      updateProjectInState?.(updated);
      // Keep an untouched alias draft tracking the server truth: a save
      // that omitted the key may still have received newer aliases (saved
      // from another browser between this page's load and its save), and
      // the next edit must start from those — not from the stale snapshot.
      if (!modelAliasesTouched) {
        setModelAliases(Array.isArray(updated?.modelAliases) ? updated.modelAliases : []);
      }
      onProjectUpdated(projectId);
      setSaveState('saved');
      // Soft combination warnings ride the save response (the save
      // succeeded): surface them inline so the mismatch is visible where
      // the pairing is edited.
      setSaveWarnings(Array.isArray(updated?.warnings) ? updated.warnings : []);
      notifySuccess?.('Project configuration saved successfully', 'Configuration Saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (e) {
      logger.error('Failed to save settings', e);
      setSaveState('error');
      // A 409 means another tab/browser saved newer settings (possibly new
      // aliases) after this page loaded — reloading first is the fix, not
      // retrying the same stale payload.
      if (e?.status === 409) {
        setValidationError(
          'Settings changed in another tab or browser — reload the page and re-apply your edits, then save again.',
        );
        notifyError?.(
          'Settings changed in another tab or browser — reload and try again',
          'Save Conflict',
        );
        return;
      }
      notifyError?.('Failed to save project configuration', 'Save Error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Project Details Section */}
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
            onChange={(val) => {
              defaultModelTouchedRef.current = true;
              setDefaultModel(val);
            }}
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
            Engine that runs agent stages for this project; it scopes the model catalogue. The
            default model is used across all workflow agent stages unless explicitly overridden.
            Harnesses with adjustable reasoning (pi, antigravity, mock) show a Reasoning dropdown
            under the model — Default (no level) stores the bare model reference. &quot;Custom
            command&quot; runs any CLI agent (e.g.{' '}
            <code className="font-mono text-primary">claude -p</code>) with the curated stage prompt
            appended as the final argument.
          </p>
          {showDefaultModelMismatch && (
            <div
              data-testid="default-model-mismatch-warning"
              className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-sm flex flex-col gap-2"
            >
              <p className="text-[11px] text-on-surface">
                <span className="font-bold">⚠ Model mismatch:</span>{' '}
                <code className="font-mono text-primary">{defaultModel}</code> is not in the{' '}
                <span className="font-semibold">{effectiveHarnessId}</span> catalogue — stages
                without an override will fall back at dispatch. The stored value is kept until you
                change it.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="default-model-mismatch-clear"
                  onClick={() => {
                    defaultModelTouchedRef.current = true;
                    setDefaultModel('');
                  }}
                  className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-sm bg-surface-container-high text-on-surface border border-border-standard hover:border-primary transition-colors"
                >
                  Pick a model for this harness
                </button>
                <button
                  type="button"
                  data-testid="default-model-mismatch-keep"
                  onClick={() => setDismissedMismatch(mismatchSignature)}
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
                Install a harness CLI or configure its credentials, then Refresh — or evaluate the
                workflow with the zero-credential mock harness (no AI runs there; output is
                synthetic).
              </p>
              {guidanceHints.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {guidanceHints.map((h) => (
                    <li key={h.id} className="text-[11px] text-text-muted">
                      <span className="font-semibold text-on-surface">{h.label || h.id}:</span>{' '}
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
                  setHarnessCommand(e.target.value);
                  setValidationError('');
                }}
                className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-sm outline-none focus:border-primary transition-colors font-mono text-on-surface"
                placeholder="claude -p"
              />
              <p className="text-[10px] text-text-muted">
                Runs without a shell; the curated stage prompt is appended as the final quoted
                argument, so <code className="font-mono text-primary">claude -p</code> becomes{' '}
                <code className="font-mono text-primary">claude -p &quot;&lt;prompt&gt;&quot;</code>
                . Flags and quoted arguments are supported — bake model selection into the command
                itself (e.g.{' '}
                <code className="font-mono text-primary">claude --model sonnet -p</code>); shell
                operators (|, ;, &amp;, &gt;) are not — use a wrapper script for those.
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

      {/* Model Aliases (own section, below the default model) */}
      <div className="border-t border-border-standard pt-8">
        <ModelAliasesSection
          aliases={modelAliases}
          onChange={(next) => {
            setModelAliasesTouched(true);
            setModelAliases(next);
            setValidationError('');
          }}
          harnesses={harnesses}
          usagesForName={(name) => findAliasUsages({ ...project, modelAliases }, name)}
          projectId={projectId}
        />
        {validationError && validationError.startsWith('Model Aliases:') && (
          <p role="alert" className="text-[11px] font-bold text-red-500 mt-2 max-w-2xl">
            {validationError}
          </p>
        )}
      </div>

      {/* Application Link & Health (own section: applies immediately, not via Save) */}
      <div className="border-t border-border-standard pt-8">
        <AppLinkSection
          key={`applink-${projectId}`}
          project={project}
          projectId={projectId}
          onChanged={(updated) => updateProjectInState?.(updated)}
        />
      </div>

      {/* Multi-Location Paths & Repositories */}
      <div className="border-t border-border-standard pt-8">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-high mb-4 flex items-center gap-2">
          <span className="text-primary">📂</span> Multi-Location Paths & Repositories
        </h3>
        <div className="space-y-4 max-w-2xl">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-cwd-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Working Directory (Root)
            </label>
            <input
              id="project-cwd-input"
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder="/path/to/projects/YourProject"
            />
            <p className="text-[10px] text-text-muted">
              Project source code directory (a direct child of the configured projects root)
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-notes-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Notes Space Symlink Directory
            </label>
            <input
              id="project-notes-input"
              type="text"
              value={notesDir}
              onChange={(e) => setNotesDir(e.target.value)}
              disabled={!centralizedDocs}
              className={`p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface ${
                !centralizedDocs ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              placeholder="/path/to/notes/YourProject"
            />
            <p className="text-[10px] text-text-muted">
              Knowledge store symlinked to{' '}
              <code className="font-mono text-primary">
                &lt;projectRoot&gt;/{docsDirName.trim() || 'docs'}
              </code>
            </p>
          </div>

          {/* Documentation Folder Name & Centralized Docs Opt-out */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-docs-dir-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Documentation Folder Name
            </label>
            <input
              id="project-docs-dir-input"
              type="text"
              value={docsDirName}
              onChange={(e) => {
                setDocsDirName(e.target.value);
                setValidationError('');
              }}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder="docs"
            />
            <p className="text-[10px] text-text-muted">
              Folder in the project root used for task storage and docs (default:{' '}
              <code className="font-mono text-primary">docs</code>). Change to e.g.{' '}
              <code className="font-mono text-primary">kainbain-docs</code> if this project already
              uses a <code className="font-mono text-primary">docs/</code> directory.
            </p>
          </div>

          {/* KainBain State Folder Name */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-kainbain-dir-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              KainBain Folder Name
            </label>
            <input
              id="project-kainbain-dir-input"
              type="text"
              value={kainbainDirName}
              onChange={(e) => {
                setKainbainDirName(e.target.value);
                setValidationError('');
              }}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder=".kainbain"
            />
            <p className="text-[10px] text-text-muted">
              Folder in the project root used for KainBain internal state, sessions, and worktrees
              (default: <code className="font-mono text-primary">.kainbain</code>). Changing this
              writes the new config and removes the old one, but never moves existing state — move{' '}
              <code className="font-mono text-primary">sessions/</code>,{' '}
              <code className="font-mono text-primary">worktrees/</code> and{' '}
              <code className="font-mono text-primary">quarantine/</code> across by hand, or stop
              the API, rename the folder on disk, and restart.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-centralized-docs-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-centralized-docs-input"
                type="checkbox"
                checked={centralizedDocs}
                onChange={(e) => setCentralizedDocs(e.target.checked)}
                className="w-4 h-4 rounded border-border-standard text-primary focus:ring-primary focus:ring-offset-surface bg-surface-container"
              />
              Link to Centralised Documentation
            </label>
            <p className="text-[10px] text-text-muted pl-6">
              When checked, symlinks the docs folder to the central notes space. Uncheck to opt out
              and store docs strictly in a local directory without symlinks.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-git-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Git Repository URL
            </label>
            <input
              id="project-git-input"
              type="text"
              value={gitRepo}
              onChange={(e) => setGitRepo(e.target.value)}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder="https://git.example.com/team/repo.git"
            />
            <p className="text-[10px] text-text-muted">
              Origin remote for automated branch sync, git checkpoints, and pushes
            </p>
          </div>

          {/* Per-task branch support (opt-in): kb/<taskId> branches + merge stage */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-use-branches-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-use-branches-input"
                type="checkbox"
                checked={useBranches}
                onChange={(e) => setUseBranches(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
              />
              Use Task Branches (kb/&lt;taskId&gt; per-task branches)
            </label>
            <p className="text-[10px] text-text-muted">
              When enabled, each task creates and works on its own git branch ({'kb/<taskId>'}); add
              a <strong>Merge</strong> stage to your pipeline to integrate it into main (add a
              <strong>Deploy</strong> CI stage with the deploy command after it to deploy). Branch
              changes are refused on a dirty working tree; merge conflicts fail the stage with a
              clear message and standard failback. Human review stages gain an MR-style{' '}
              <strong>PR review</strong> view with per-line commenting; without task branches there
              is nothing to review and merge stages fail with a clear message.
            </p>
          </div>

          {/* Preserved PR-review diff (opt-in): keeps the merged change visible
              after merge + deploy instead of an empty diff */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-preserve-review-diff-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-preserve-review-diff-input"
                type="checkbox"
                checked={preserveReviewDiff}
                onChange={(e) => setPreserveReviewDiff(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
              />
              Preserve PR Review Diff After Merge
            </label>
            <p className="text-[10px] text-text-muted">
              When enabled, the final human review still shows the merged change after the task
              branch is merged and deployed (normally that diff goes empty). For rapid iteration:
              merge, deploy, then review what actually shipped.
            </p>
          </div>

          {/* Baseline reset per merge (default on): re-scopes the preserved
              review to the latest pass after a fail-back */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-reset-review-baseline-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-reset-review-baseline-input"
                type="checkbox"
                checked={resetReviewBaseline}
                onChange={(e) => setResetReviewBaseline(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
              />
              Reset Review Baseline On Each Merge
            </label>
            <p className="text-[10px] text-text-muted">
              When enabled, every merge + deploy pass starts a fresh review baseline, so after a
              fail-back the review shows only the code changed in response to the failure. Turn it
              off to keep a cumulative view of every pass since the first merge instead.
            </p>
          </div>
        </div>
      </div>

      {/* Retry & Timeouts: per-project iteration and timeout budgets.
          A set value overrides the global default for this project only; a
          per-stage override still wins over both. Blank means "follow the
          global default". Hitting retry on a failed stage restarts these
          budgets from zero, so the next attempt gets a genuinely fresh loop. */}
      <div className="border-t border-border-standard pt-8">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-high mb-4 flex items-center gap-2">
          <span className="text-primary">🔁</span> Retry & Timeouts
        </h3>
        <div className="space-y-4 max-w-2xl">
          <p className="text-[11px] text-text-muted leading-relaxed">
            How many times this project&apos;s tasks may fail back and re-run before parking as
            failed, and how long each stage type may run. Counts of 0 disable that loop; blank
            fields follow the global default. A manual stage retry restarts every budget below from
            zero.
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

      <div className="flex justify-end gap-4 pt-8 border-t border-border-standard">
        <div role="status" aria-live="polite" className="sr-only">
          {saveState === 'saving' && 'Saving configuration'}
          {saveState === 'saved' && 'Configuration saved'}
          {saveState === 'error' && 'Error saving configuration'}
        </div>
        {/* Save-level errors with no other inline home (e.g. a 409 save
            conflict): the custom-harness, alias, and retry errors already
            render beside their fields, so this only covers the rest. */}
        {saveState === 'error' &&
          validationError &&
          !isCustomHarness &&
          !validationError.startsWith('Model Aliases:') &&
          !validationError.startsWith('Retry & Timeouts:') && (
            <p role="alert" className="text-[11px] font-bold text-red-500">
              {validationError}
            </p>
          )}
        {/* Soft combination warnings from the last save (the save succeeded;
            these name catalog-miss pairings to fix in a follow-up edit). */}
        {saveWarnings.length > 0 && (
          <ul data-testid="save-warnings-panel" className="flex flex-col gap-1 max-w-2xl">
            {saveWarnings.map((warning, index) => (
              <li
                key={`${index}-${warning}`}
                className="text-[11px] text-amber-600 dark:text-amber-400"
              >
                ⚠ {warning}
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-primary text-on-primary rounded-sm text-xs font-bold uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
        >
          {saveButtonLabel()}
        </button>
      </div>
    </div>
  );
}
