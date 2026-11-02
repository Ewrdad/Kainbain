/***
 * MARK: runnerConfigHelpers
 * @description Pure helpers for the System Settings Runner configuration
 *   screen: normalizing the operator-owned config embedded in each Runner
 *   record, splitting projects into Available/Loaded columns, validating
 *   directory edits, labelling the job-type switches, dispatching lifecycle
 *   actions by name, and reading display fields off raw records. No React;
 *   only `runRunnerAction` touches the network (through the injected Runner
 *   api object) — everything else is fully unit-testable without mocks.
 * @example partitionProjects([{id:'a'}], ['a']) => { available: [], loaded: [{id:'a'}] }
 ***/

export const JOB_TYPE_KEYS = ['runsCi', 'runsMerges', 'runsImpromptu'];

/***
 * MARK: jobTypeLabels
 * @description Labels and hints for the three job-type switches on the
 *   Runner screen. Meanings are pinned by survey Q5: CI runs CI stages,
 *   merges runs merges plus host git actions. Impromptu names
 *   retrospective/non-task calls but stays a recorded preference —
 *   dispatch does not filter live steers on it yet (withholding them
 *   would strand steers with no embedded fallback).
 * @example jobTypeLabels() => [{ key: 'runsCi', label: 'Runs CI', hint: '…' }, …]
 ***/
export const jobTypeLabels = () => [
  { key: 'runsCi', label: 'Runs CI', hint: 'Runs CI stages' },
  { key: 'runsMerges', label: 'Runs merges', hint: 'Runs merges and host git actions' },
  {
    key: 'runsImpromptu',
    label: 'Runs Impromptu',
    hint: 'Recorded preference for retrospective / non-task calls — live follow-up steers still ride the owning Runner heartbeat',
  },
];

/***
 * MARK: defaultRunnerConfig
 * @description Normalizes the operator-owned config for one Runner record
 *   (older backends may omit `operatorConfig` entirely). Nulls keep their
 *   backend meaning: no display name (fall back to the Runner id), all
 *   advertised tools, and all projects loaded.
 * @example defaultRunnerConfig({}) => { displayName: null, jobTypes: { runsCi: true, … }, … }
 * @param {Object} [runner={}] - Runner record, possibly with `operatorConfig`.
 * @returns {Object} Normalized operator configuration.
 ***/
export const defaultRunnerConfig = (runner = {}) => {
  const raw = runner && typeof runner === 'object' ? runner.operatorConfig : null;
  const source = raw && typeof raw === 'object' ? raw : {};
  const jobTypes = { runsCi: true, runsMerges: true, runsImpromptu: true };
  if (source.jobTypes && typeof source.jobTypes === 'object') {
    for (const key of JOB_TYPE_KEYS) {
      if (typeof source.jobTypes[key] === 'boolean') jobTypes[key] = source.jobTypes[key];
    }
  }
  const directories = { masterDir: '', worktreeDir: '' };
  if (source.directories && typeof source.directories === 'object') {
    for (const key of ['masterDir', 'worktreeDir']) {
      if (typeof source.directories[key] === 'string') directories[key] = source.directories[key];
    }
  }
  return {
    displayName: typeof source.displayName === 'string' ? source.displayName : null,
    availableTools: Array.isArray(source.availableTools)
      ? source.availableTools.filter((t) => typeof t === 'string')
      : null,
    availableModels: Array.isArray(source.availableModels)
      ? source.availableModels.filter((m) => typeof m === 'string')
      : null,
    jobTypes,
    directories,
    projectScope: Array.isArray(source.projectScope)
      ? source.projectScope.filter((p) => typeof p === 'string')
      : null,
  };
};

/***
 * MARK: runnerDisplayName
 * @description Operator-facing Runner name: the configured display name,
 *   falling back to the stable Runner id.
 * @example runnerDisplayName({ runnerId: 'r1', operatorConfig: null }) => 'r1'
 * @param {Object} [runner={}] - Runner record.
 * @returns {string} Display name.
 ***/
export const runnerDisplayName = (runner = {}) =>
  defaultRunnerConfig(runner).displayName || runner?.runnerId || '';

/***
 * MARK: visibleRunners
 * @description Roster rows shown on the System Settings › Runners screen:
 *   every registration except `revoked` ones, which are hidden completely
 *   (no row, no detail panel, no selection). `denied` join requests stay
 *   visible so the operator can still approve that recovery path; unknown
 *   future statuses stay visible too (fail-open) so a new backend status
 *   never silently vanishes from the UI. Frontend-only: `GET /runners`
 *   keeps returning every record for audit/support.
 * @example visibleRunners([{ runnerId: 'a', status: 'revoked' }, { runnerId: 'b', status: 'active' }]) => [{ runnerId: 'b', status: 'active' }]
 * @param {Object[]} [runners=[]] - Raw Runner records from `GET /runners`.
 * @returns {Object[]} Listable Runner records.
 ***/
export const visibleRunners = (runners = []) =>
  (Array.isArray(runners) ? runners : []).filter((r) => r?.status !== 'revoked');

/***
 * MARK: resolveSelectedId
 * @description Picks the selected Runner id after a roster load: keeps the
 *   previous id when it is a string still present in the visible roster,
 *   otherwise falls back to the first visible record carrying a usable
 *   Runner id, otherwise null (empty roster, or a roster of malformed
 *   records). Applied on every load so revoking the selected Runner moves
 *   selection instead of leaving the detail panel pointed at a hidden
 *   record. Records without an id are skipped rather than selected: an
 *   id-less record can render no detail panel, so selecting it would only
 *   strand the screen on a blank right column.
 * @example resolveSelectedId([{ runnerId: 'b' }], 'a') => 'b'
 * @param {Object[]} [visible=[]] - Visible Runner records.
 * @param {string|null} [prevId=null] - Previously selected Runner id.
 * @returns {string|null} Selected Runner id.
 ***/
export const resolveSelectedId = (visible = [], prevId = null) => {
  const list = Array.isArray(visible) ? visible : [];
  if (typeof prevId === 'string' && prevId && list.some((r) => r?.runnerId === prevId)) {
    return prevId;
  }
  const fallback = list.find((r) => typeof r?.runnerId === 'string' && r.runnerId);
  return fallback?.runnerId ?? null;
};

/***
 * MARK: runRunnerAction
 * @description Sends one named lifecycle action to its own Runner endpoint
 *   (`approve`, `deny`, `pause`, `resume`, `revoke`). Unknown action names
 *   return null and call nothing — in particular they never fall through
 *   to revoke, so a typo or a stale caller cannot destroy a Runner by
 *   accident. The caller treats a null return as "nothing was changed"
 *   and shows that plainly instead of reloading the roster.
 * @example runRunnerAction({ runnerApi: api, runnerId: 'r1', action: 'pause' }) => Promise
 * @param {Object} options - Labelled inputs.
 * @param {Object} options.runnerApi - Runner endpoints (`approveRunner`, …).
 * @param {string} options.runnerId - Target Runner id.
 * @param {string} options.action - Action name.
 * @returns {Promise|null} The in-flight endpoint call, or null when refused.
 ***/
export const runRunnerAction = ({ runnerApi, runnerId, action } = {}) => {
  if (action === 'approve') return runnerApi.approveRunner(runnerId);
  if (action === 'deny') return runnerApi.denyRunner(runnerId);
  if (action === 'pause') return runnerApi.pauseRunner(runnerId);
  if (action === 'resume') return runnerApi.resumeRunner(runnerId);
  if (action === 'revoke') return runnerApi.revokeRunner(runnerId);
  return null;
};

/***
 * MARK: describeRunnerVersion
 * @description Version text for one roster row: the top-level `runnerVersion`
 *   when present, else the nested `facts.versions.runner` copy older
 *   backends embed, else null (no badge). Wrong-typed values read as
 *   missing rather than rendering "v42" or crashing on a null `facts`.
 * @example describeRunnerVersion({ runnerVersion: '0.3.0' }) => '0.3.0'
 * @param {Object} [runner={}] - Runner record.
 * @returns {string|null} Version label, or null when unknown.
 ***/
export const describeRunnerVersion = (runner = {}) => {
  if (typeof runner?.runnerVersion === 'string' && runner.runnerVersion) {
    return runner.runnerVersion;
  }
  const nested = runner?.facts?.versions?.runner;
  return typeof nested === 'string' && nested ? nested : null;
};

/***
 * MARK: advertisedToolIds
 * @description Harness/tool ids the Runner advertised in its capabilities.
 * @example advertisedToolIds({ capabilities: { harnesses: [{ id: 'pi' }] } }) => ['pi']
 * @param {Object} [runner={}] - Runner record.
 * @returns {string[]} Advertised ids (empty when unknown).
 ***/
export const advertisedToolIds = (runner = {}) => {
  const list = runner?.capabilities?.harnesses;
  if (!Array.isArray(list)) return [];
  return list
    .map((h) => (typeof h === 'string' ? h : h?.id))
    .filter((id) => typeof id === 'string' && id);
};

/***
 * MARK: effectiveTools
 * @description Tool ids enabled for the Runner: the operator subset when
 *   set, otherwise every advertised id.
 * @example effectiveTools({ capabilities: { harnesses: [{ id: 'pi' }] } }) => ['pi']
 * @param {Object} [runner={}] - Runner record.
 * @returns {string[]} Effective tool ids.
 ***/
export const effectiveTools = (runner = {}) => {
  const configured = defaultRunnerConfig(runner).availableTools;
  return Array.isArray(configured) ? configured : advertisedToolIds(runner);
};

/***
 * MARK: advertisedModels
 * @description Model ids the Runner advertised in its capabilities.
 * @example advertisedModels({ capabilities: { models: ['m1'] } }) => ['m1']
 * @param {Object} [runner={}] - Runner record.
 * @returns {string[]} Advertised ids (empty when unknown).
 ***/
export const advertisedModels = (runner = {}) => {
  const list = runner?.capabilities?.models;
  if (!Array.isArray(list)) return [];
  return list.filter((id) => typeof id === 'string' && id);
};

/***
 * MARK: effectiveModels
 * @description Model ids enabled for the Runner: the operator allowlist
 *   when set (it replaces the advertised list so an under-reporting
 *   Runner can serve declared models), otherwise every advertised id.
 * @example effectiveModels({ capabilities: { models: ['m1'] } }) => ['m1']
 * @param {Object} [runner={}] - Runner record.
 * @returns {string[]} Effective model ids.
 ***/
export const effectiveModels = (runner = {}) => {
  const configured = defaultRunnerConfig(runner).availableModels;
  return Array.isArray(configured) ? configured : advertisedModels(runner);
};

/***
 * MARK: parseModelsInput
 * @description Parses the Models editor text into a patch value:
 *   comma-separated ids, trimmed, deduped, blanks dropped.
 * @example parseModelsInput('a, b,, a') => ['a', 'b']
 * @param {string} [text=''] - Raw editor text.
 * @returns {string[]} Model ids.
 ***/
export const parseModelsInput = (text = '') =>
  [...new Set(
    String(text ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  )];

export const effectiveDirectories = (runner = {}) => {
  const f = runner?.facts?.directories;
  if (f && typeof f === 'object') {
    return {
      masterDir: typeof f.masterDir === 'string' ? f.masterDir : '',
      worktreeDir: typeof f.worktreeDir === 'string' ? f.worktreeDir : '',
    };
  }
  const workRoot = runner?.facts?.workRoot;
  if (typeof workRoot === 'string' && workRoot) {
    return { masterDir: workRoot, worktreeDir: `${workRoot}/kb-trees` };
  }
  return { masterDir: '', worktreeDir: '' };
};

export const effectiveDirectoryValue = (runner = {}, field) => {
  const cfg = defaultRunnerConfig(runner).directories[field];
  if (cfg) return cfg;
  const eff = effectiveDirectories(runner)[field];
  return eff || '';
};

export const displayDirectories = (runner = {}) => {
  const cfg = defaultRunnerConfig(runner).directories;
  const eff = effectiveDirectories(runner);
  return {
    masterDir: { value: cfg.masterDir || eff.masterDir, isDefault: !cfg.masterDir },
    worktreeDir: { value: cfg.worktreeDir || eff.worktreeDir, isDefault: !cfg.worktreeDir },
  };
};

export const modelUnion = (runner = {}) => {
  const adv = advertisedModels(runner);
  const eff = effectiveModels(runner);
  const set = new Set([...adv, ...eff]);
  return [...set].sort();
};

export const modelTogglePatch = (runner = {}, nextIds = []) => {
  const advertised = advertisedModels(runner);
  const sortedNext = [...nextIds].sort();
  const sortedAdv = [...advertised].sort();
  const isAdvertised = sortedNext.length === sortedAdv.length && sortedNext.every((v, i) => v === sortedAdv[i]);
  return isAdvertised ? null : [...nextIds];
};

export const canRequestUpdate = (runner = {}) => Boolean(runner?.updateAvailable);

export const canRediscoverModels = (runner = {}) => {
  if (!runner || typeof runner !== 'object') return false;
  const ids = advertisedToolIds(runner);
  return ids.includes('muse') || advertisedModels(runner).length > 0 || true;
};

export const stalenessLabel = (runner = {}, nowMs = Date.now()) => {
  if (!runner?.lastSeenAt) return null;
  const seen = Date.parse(runner.lastSeenAt);
  if (!Number.isFinite(seen)) return null;
  const age = nowMs - seen;
  if (age < 60000) return 'just now';
  const mins = Math.round(age / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
};

export const runnerStatusLabel = (runner = {}) => {
  if (runner.status === 'pending') return 'Needs setup';
  if (runner.status === 'active' && runner.paused) return 'Paused';
  if (runner.status === 'active' && runner.belowMinimum) return 'Needs update';
  return runner.status || 'unknown';
};

/***
 * MARK: loadedProjectIds
 * @description Project ids in the Loaded column: the operator override when
 *   set, else the Runner-reported scope, else every known project (a null
 *   scope serves all projects).
 * @example loadedProjectIds({ projectScope: ['a'] }, [{ id: 'a' }, { id: 'b' }]) => ['a']
 * @param {Object} [runner={}] - Runner record.
 * @param {Object[]} [allProjects=[]] - All known projects (`{ id }`).
 * @returns {string[]} Loaded project ids.
 ***/
export const loadedProjectIds = (runner = {}, allProjects = []) => {
  const override = defaultRunnerConfig(runner).projectScope;
  if (Array.isArray(override)) return [...override];
  if (Array.isArray(runner?.projectScope) && runner.projectScope.length > 0) {
    return runner.projectScope.filter((p) => typeof p === 'string');
  }
  return (Array.isArray(allProjects) ? allProjects : [])
    .map((p) => p?.id)
    .filter((id) => typeof id === 'string');
};

/***
 * MARK: partitionProjects
 * @description Splits all projects into Available vs Loaded columns for the
 *   project picker. Unknown loaded ids (deleted projects) are dropped.
 * @example partitionProjects([{ id: 'a' }], ['a']) => { available: [], loaded: [{ id: 'a' }] }
 * @param {Object[]} [allProjects=[]] - All known projects (`{ id }`).
 * @param {string[]} [loadedIds=[]] - Loaded project ids.
 * @returns {{available: Object[], loaded: Object[]}} Column contents.
 ***/
export const partitionProjects = (allProjects = [], loadedIds = []) => {
  const ids = new Set(Array.isArray(loadedIds) ? loadedIds : []);
  const loaded = [];
  const available = [];
  for (const project of Array.isArray(allProjects) ? allProjects : []) {
    if (!project || typeof project.id !== 'string') continue;

    if (ids.has(project.id)) loaded.push(project);
    else available.push(project);
  }
  return { available, loaded };
};

/***
 * MARK: withProjectLoaded
 * @description Pure load move: returns the loaded id set with one project
 *   added (idempotent).
 * @example withProjectLoaded(['a'], 'b') => ['a', 'b']
 * @param {string[]} [loadedIds=[]] - Current loaded ids.
 * @param {string} projectId - Project id to load.
 * @returns {string[]} Next loaded ids.
 ***/
export const withProjectLoaded = (loadedIds = [], projectId) => {
  const next = [...(Array.isArray(loadedIds) ? loadedIds : [])];
  if (typeof projectId === 'string' && !next.includes(projectId)) next.push(projectId);
  return next;
};

/***
 * MARK: withProjectUnloaded
 * @description Pure unload move: returns the loaded id set with one project
 *   removed.
 * @example withProjectUnloaded(['a', 'b'], 'a') => ['b']
 * @param {string[]} [loadedIds=[]] - Current loaded ids.
 * @param {string} projectId - Project id to unload.
 * @returns {string[]} Next loaded ids.
 ***/
export const withProjectUnloaded = (loadedIds = [], projectId) =>
  (Array.isArray(loadedIds) ? loadedIds : []).filter((id) => id !== projectId);

/***
 * MARK: scopePatchForLoaded
 * @description Builds the `projectScope` patch for a loaded set: null when
 *   every known project is loaded (serves-all), otherwise the id list.
 * @example scopePatchForLoaded(['a'], [{ id: 'a' }, { id: 'b' }]) => ['a']
 * @param {string[]} [loadedIds=[]] - Loaded project ids.
 * @param {Object[]} [allProjects=[]] - All known projects (`{ id }`).
 * @returns {string[]|null} Patch value.
 ***/
export const scopePatchForLoaded = (loadedIds = [], allProjects = []) => {
  const loaded = new Set(Array.isArray(loadedIds) ? loadedIds : []);
  const all = (Array.isArray(allProjects) ? allProjects : [])
    .map((p) => p?.id)
    .filter((id) => typeof id === 'string');
  if (all.length > 0 && all.every((id) => loaded.has(id))) return null;
  return [...loaded];
};

/***
 * MARK: validateDirectories
 * @description Validates the Master/Worktree directory edits before save.
 *   Both fields are required and must be non-empty; values are never
 *   executed, only stored.
 * @example validateDirectories({ masterDir: '/srv/kb', worktreeDir: '' }) => { ok: false, errors: { worktreeDir: '…' } }
 * @param {Object} [directories={}] - Draft `{ masterDir, worktreeDir }`.
 * @returns {{ok: boolean, errors: Object}} Validation outcome.
 ***/
export const validateDirectories = (directories = {}) => {
  const errors = {};
  for (const key of ['masterDir', 'worktreeDir']) {
    const value = directories?.[key];
    if (typeof value !== 'string' || !value.trim()) {
      // eslint-disable-next-line security/detect-object-injection -- key is a fixed directory field name
      errors[key] = 'Enter a directory path.';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
};

export const validateSingleDirectory = (value) => {
  if (typeof value !== 'string' || !value.trim()) return 'Enter a directory path.';
  if (value.trim().length > 1024) return 'Must be at most 1024 characters.';
  return null;
};
