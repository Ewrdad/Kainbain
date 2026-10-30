/***
 * MARK: runnerConfigHelpers
 * @description Pure helpers for the System Settings Runner configuration
 *   screen: normalizing the operator-owned config embedded in each Runner
 *   record, splitting projects into Available/Loaded columns, validating
 *   directory edits, and labelling the job-type switches. No network, no
 *   React — fully unit-testable.
 * @example partitionProjects([{id:'a'}], ['a']) => { available: [], loaded: [{id:'a'}] }
 ***/

export const JOB_TYPE_KEYS = ['runsCi', 'runsMerges', 'runsImpromptu'];

/***
 * MARK: jobTypeLabels
 * @description Labels and hints for the three job-type switches on the
 *   Runner screen. Meanings are pinned by survey Q5: CI runs CI stages,
 *   merges runs merges plus host git actions, impromptu runs
 *   retrospective/non-task calls.
 * @example jobTypeLabels() => [{ key: 'runsCi', label: 'Runs CI', hint: '…' }, …]
 ***/
export const jobTypeLabels = () => [
  { key: 'runsCi', label: 'Runs CI', hint: 'Runs CI stages' },
  { key: 'runsMerges', label: 'Runs merges', hint: 'Runs merges and host git actions' },
  {
    key: 'runsImpromptu',
    label: 'Runs Impromptu',
    hint: 'Runs retrospective / non task calls',
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
    // eslint-disable-next-line security/detect-object-injection -- id is a project id from the project list response
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
