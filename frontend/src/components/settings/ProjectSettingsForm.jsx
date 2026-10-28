import { useState, useRef, useCallback, useEffect } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { FALLBACK_MODELS } from '../stageTypes';
import { resolveStoredModelValidity } from '../common/ModelSelector';
import { ModelAliasesSection, validateAliasList } from './ModelAliasesSection';
import { accentTokens } from '../../theme/accentTokens';
import { ALIAS_HARNESS_ID, findAliasUsages } from '../../../../shared/modelAliases.js';
import { msToMinutes } from '../../utils/timeoutUnits';
import { parseRetrySettings } from './projectSettingsValidation';
import { ProjectBasicsSection } from './ProjectBasicsSection';
import { RetryTimeoutsSection } from './RetryTimeoutsSection';
import { PathsAndReposSection } from './PathsAndReposSection';

/***
 * MARK: ProjectSettingsForm
 * @description Keyed form that initializes its state from the active project.
 * Manages project name, agent harness + default model (one wired control: the
 * harness scopes the model catalogue — list dropdown, empty state, or
 * hidden — per the harness's `modelSelection`), the custom harness's
 * free-text command line (model flags bake into the command itself),
 * accent color theme, working directory, notes directory,
 * Git remote URL, and the per-project retry/timeout overrides.
 * The form stays mounted across the project-related tabs (project, aliases,
 * files) so edits survive tab switches — the `section` prop only selects
 * which blocks render. Dirty state is reported through `onDirtyChange` so
 * the tab bar can warn before leaving with unsaved edits.
 * @param {Object} props
 * @param {Object} props.project - The current project object.
 * @param {string} props.projectId - Active project identifier.
 * @param {Function} props.onProjectUpdated - Callback when project is updated.
 * @param {string} [props.section] - Visible tab ('project'|'aliases'|'files').
 * @param {Function} [props.onDirtyChange] - Called with true/false as edits are made or saved.
 * @example <ProjectSettingsForm project={project} projectId="p1" onProjectUpdated={select} section="aliases" onDirtyChange={setDirty} />
 ***/
export function ProjectSettingsForm({ project, projectId, onProjectUpdated, section = 'project', onDirtyChange }) {
  // Fail-safe: an unknown section id renders the project tab instead of a
  // blank page.
  const activeFormSection = ['project', 'aliases', 'files'].includes(section)
    ? section
    : 'project';
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
  const [notesDir, setNotesDir] = useState(
    project?.notesDir || project?.notesPath || '',
  );
  const [docsDirName, setDocsDirName] = useState(project?.docsDirName || '');
  const [kainbainDirName, setKainbainDirName] = useState(project?.kainbainDirName || '');
  const [centralizedDocs, setCentralizedDocs] = useState(
    project?.centralizedDocs !== false,
  );
  const [gitRepo, setGitRepo] = useState(
    project?.gitRepo || project?.gitUrl || '',
  );
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
  const retryDraft = (stored) =>
    stored === undefined || stored === null ? '' : String(stored);
  const retryDraftMinutes = (storedMs) => {
    const minutes = msToMinutes(storedMs);
    return minutes === '' ? '' : String(minutes);
  };
  const retrySwitch = (stored) => {
    if (stored === true) return 'enabled';
    if (stored === false) return 'disabled';
    return 'default';
  };
  const [maxAutoIterations, setMaxAutoIterations] = useState(
    retryDraft(project?.maxAutoIterations),
  );
  const [maxTransientRetries, setMaxTransientRetries] = useState(
    retryDraft(project?.maxTransientRetries),
  );
  const [autoIterationEnabled, setAutoIterationEnabled] = useState(
    retrySwitch(project?.autoIterationEnabled),
  );
  const [agentTimeoutMs, setAgentTimeoutMs] = useState(
    retryDraftMinutes(project?.agentTimeoutMs),
  );
  const [ciTimeoutMs, setCiTimeoutMs] = useState(retryDraftMinutes(project?.ciTimeoutMs));
  const [mergeTimeoutMs, setMergeTimeoutMs] = useState(
    retryDraftMinutes(project?.mergeTimeoutMs),
  );
  const [retryErrors, setRetryErrors] = useState({});
  // Unsaved-edits tracking: any draft change flips the ref; a successful
  // save or a project switch clears it. The post-render effect below reports
  // the current value through `onDirtyChange` so the tab bar can warn before
  // leaving with unsaved edits. (A ref — not state — so marking dirty never
  // re-renders on its own; the setter call that follows already does.)
  // Declared BEFORE the branch-sync block below so the reset effect further
  // down can observe the project identity the fields were synced from.
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);
  // Wraps a draft setter so the edit also marks the form dirty.
  const touch = useCallback(
    (setter) => (value) => {
      markDirty();
      setter(value);
    },
    [markDirty],
  );
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
      h?.available === true &&
      h.id !== 'mock' &&
      h.id !== 'custom' &&
      h.id !== ALIAS_HARNESS_ID,
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
    (h) =>
      h?.hint &&
      h.id !== 'mock' &&
      h.id !== 'custom' &&
      h.id !== ALIAS_HARNESS_ID,
  );
  // Track whether the user has edited the default model so a late-arriving
  // project object (projects list still fetching when the form mounts) can
  // fill in the stored value WITHOUT clobbering an in-progress edit.
  const defaultModelTouchedRef = useRef(false);

  // Sync the default model from the project once it loads. Without this, a
  // form mounted before the project fetch resolved keeps its empty initial
  // state and a subsequent Save overwrites the stored model selection.
  useEffect(() => {
    if (!project?.defaultModel || defaultModelTouchedRef.current) return;
    setDefaultModel(project.defaultModel);
  }, [project?.id, project?.defaultModel]);

  // Tracks which project identity the dirty flag was last reset for. A new
  // project means freshly synced fields, so the flag clears. All ref access
  // stays inside effects (never during render).
  const cleanProjectIdRef = useRef(project?.id ?? null);
  // Reports the current dirty flag after every render (ref mutations don't
  // re-run dep-keyed effects, and every mutation rides a state update that
  // re-renders, so the dep-less effect is what observes them). The parent
  // setState with an unchanged value bails out, so this never loops.
  useEffect(() => {
    if ((cleanProjectIdRef.current ?? null) !== (project?.id ?? null)) {
      cleanProjectIdRef.current = project?.id ?? null;
      dirtyRef.current = false;
    }
    onDirtyChange?.(dirtyRef.current);
  });

  /***
   * MARK: handleHarnessChange
   * @description Single harness-change handler: the selection scopes the model
   *   catalogue (ModelSelector is controlled on the same state). Leaving
   *   custom clears the command line.
   ***/
  const handleHarnessChange = (nextHarnessId) => {
    markDirty();
    setHarness(nextHarnessId);
    setValidationError('');
    if (nextHarnessId !== 'custom') {
      setHarnessCommand('');
    }
  };

  const handleAccentChange = (newColor) => {
    markDirty();
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
      setValidationError('Set a command line (e.g. claude -p) — the custom harness has nothing to run without one.');
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
      const saveOpts = project?.updatedAt
        ? { expectedUpdatedAt: project.updatedAt }
        : {};
      const savePayload = {
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
      };
      // Only edited alias tables are sent (see above) — assign explicitly
      // instead of a conditional empty spread so the payload's field set is
      // obvious.
      if (modelAliasesTouched) {
        savePayload.modelAliases = modelAliases;
      }
      const updated = await api.updateProject(
        projectId,
        savePayload,
        saveOpts,
      );
      // Refresh the in-memory project so the applied accent/name survives
      // view/tab switches without a full re-fetch.
      updateProjectInState?.(updated);
      // Keep the alias draft aligned with server truth after a successful
      // save: a save that omitted the key may still have received newer
      // aliases (saved from another browser between this page's load and
      // its save), and the next edit must start from those. Resetting
      // `modelAliasesTouched` makes the NEXT untouched save omit the key
      // again, so two browsers editing different fields cannot clobber
      // each other's alias table.
      setModelAliases(
        Array.isArray(updated?.modelAliases)
          ? updated.modelAliases
          : modelAliases,
      );
      setModelAliasesTouched(false);
      onProjectUpdated(projectId);
      dirtyRef.current = false;
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
      {activeFormSection === 'project' && (
        <>
          <ProjectBasicsSection
            projectName={projectName}
            setProjectName={touch(setProjectName)}
            models={models}
            labeledHarnesses={labeledHarnesses}
            defaultModel={defaultModel}
            onDefaultModelChange={(val) => {
              defaultModelTouchedRef.current = true;
              markDirty();
              setDefaultModel(val);
            }}
            effectiveHarnessId={effectiveHarnessId}
            handleHarnessChange={handleHarnessChange}
            refreshing={refreshing}
            refresh={refresh}
            isHarnessDisabled={isHarnessDisabled}
            isCustomHarness={isCustomHarness}
            harnessCommand={harnessCommand}
            onHarnessCommandChange={(val) => {
              markDirty();
              setHarnessCommand(val);
              setValidationError('');
            }}
            showDefaultModelMismatch={showDefaultModelMismatch}
            onClearDefaultModel={() => {
              defaultModelTouchedRef.current = true;
              markDirty();
              setDefaultModel('');
            }}
            onDismissMismatch={() => setDismissedMismatch(mismatchSignature)}
            defaultModelForMismatch={defaultModel}
            effectiveHarnessLabel={effectiveHarnessId}
            showHarnessGuidance={showHarnessGuidance}
            guidanceHints={guidanceHints}
            accentColor={accentColor}
            handleAccentChange={handleAccentChange}
            validationError={validationError}
            hiddenProjectIds={hiddenProjectIds}
            projectId={projectId}
            toggleHideProject={toggleHideProject}
          />
          <RetryTimeoutsSection
            maxAutoIterations={maxAutoIterations}
            setMaxAutoIterations={touch(setMaxAutoIterations)}
            maxTransientRetries={maxTransientRetries}
            setMaxTransientRetries={touch(setMaxTransientRetries)}
            autoIterationEnabled={autoIterationEnabled}
            setAutoIterationEnabled={touch(setAutoIterationEnabled)}
            agentTimeoutMs={agentTimeoutMs}
            setAgentTimeoutMs={touch(setAgentTimeoutMs)}
            ciTimeoutMs={ciTimeoutMs}
            setCiTimeoutMs={touch(setCiTimeoutMs)}
            mergeTimeoutMs={mergeTimeoutMs}
            setMergeTimeoutMs={touch(setMergeTimeoutMs)}
            retryErrors={retryErrors}
            validationError={validationError}
          />
        </>
      )}

      {activeFormSection === 'aliases' && (
        <div id="model-aliases-section" className="border-t border-border-standard pt-8 scroll-mt-4">
          <ModelAliasesSection
            aliases={modelAliases}
            onChange={(next) => {
              setModelAliasesTouched(true);
              markDirty();
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
      )}

      {activeFormSection === 'files' && (
        <PathsAndReposSection
          cwd={cwd}
          setCwd={touch(setCwd)}
          notesDir={notesDir}
          setNotesDir={touch(setNotesDir)}
          docsDirName={docsDirName}
          setDocsDirName={touch(setDocsDirName)}
          kainbainDirName={kainbainDirName}
          setKainbainDirName={touch(setKainbainDirName)}
          centralizedDocs={centralizedDocs}
          setCentralizedDocs={touch(setCentralizedDocs)}
          gitRepo={gitRepo}
          setGitRepo={touch(setGitRepo)}
          useBranches={useBranches}
          setUseBranches={touch(setUseBranches)}
          preserveReviewDiff={preserveReviewDiff}
          setPreserveReviewDiff={touch(setPreserveReviewDiff)}
          resetReviewBaseline={resetReviewBaseline}
          setResetReviewBaseline={touch(setResetReviewBaseline)}
          clearValidationError={() => setValidationError('')}
          project={project}
          projectId={projectId}
          updateProjectInState={updateProjectInState}
        />
      )}

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
          <ul
            data-testid="save-warnings-panel"
            className="flex flex-col gap-1 max-w-2xl"
          >
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
