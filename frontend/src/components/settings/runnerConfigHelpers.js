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
 * MARK: DESIRED_VERSION_LATEST
 * @description Sentinel for the per-runner version setting meaning "track
 *   the newest release" (the default for every runner). Any other value is
 *   an exact pinned product version the runner should run instead.
 * @example DESIRED_VERSION_LATEST => 'latest'
 ***/
export const DESIRED_VERSION_LATEST = 'latest';

/***
 * MARK: normalizeDesiredVersion
 * @description Lenient read-side normalization for the per-runner version
 *   setting: null/undefined/blank/`latest` (any case) read as `latest`;
 *   anything else trims to its string form (the backend canonicalizes and
 *   strictly validates on PATCH, so the UI never has to parse versions).
 * @example normalizeDesiredVersion(null) => 'latest'
 * @example normalizeDesiredVersion(' 1.2.3 ') => '1.2.3'
 * @param {*} [value='latest'] - Stored setting.
 * @returns {string} `latest` or the trimmed pin.
 ***/
export const normalizeDesiredVersion = (value = 'latest') => {
  if (value === null || value === undefined) return DESIRED_VERSION_LATEST;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === DESIRED_VERSION_LATEST) return DESIRED_VERSION_LATEST;
  return trimmed;
};

/***
 * MARK: resolveDesiredVersion
 * @description Effective per-runner version setting for one public Runner
 *   record: the top-level `desiredVersion` the backend exposes (falling
 *   back to the raw operatorConfig copy, then `latest` for old backends).
 * @example resolveDesiredVersion({ desiredVersion: '1.2.3' }) => '1.2.3'
 * @param {Object} [runner={}] - Runner record.
 * @returns {string} `latest` or an exact version.
 ***/
export const resolveDesiredVersion = (runner = {}) =>
  normalizeDesiredVersion(
    runner?.desiredVersion ?? runner?.operatorConfig?.desiredVersion ?? runner?.update?.desiredVersion ?? 'latest',
  );

/***
 * MARK: versionTuple
 * @description Numeric `major.minor.patch` tuple for one version string
 *   (tolerates a `v` prefix, partial input, and build/prerelease suffixes),
 *   or null when it carries no readable numbers. The UI cannot depend on
 *   semver (no such frontend dependency), so comparison stays numeric and
 *   conservative: unparseable versions never rank as newer or older.
 * @example versionTuple('v1.2.3') => [1, 2, 3]
 * @param {*} [version] - Version value.
 * @returns {number[]|null} Numeric triple, or null.
 ***/
const versionTuple = (version) => {
  if (typeof version !== 'string') return null;
  const trimmed = version.trim().replace(/^v/i, '');
  // Mirror the backend's sha-like rejection exactly: a bare 7+ hex run
  // (a commit hash, or an all-digit build stamp like `20261117`) is never
  // a version — otherwise `20261117` would parse as version 20261117.0.0
  // here while the backend rejects it, and the two would drift apart.
  if (/^[0-9a-f]{7,40}$/i.test(trimmed)) return null;
  const core = trimmed.split('-')[0].split('+')[0];
  if (!core) return null;
  const parts = core.split('.');
  if (parts.length === 0 || parts.length > 3) return null;
  const nums = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    nums.push(Number(part));
  }
  while (nums.length < 3) nums.push(0);
  return nums;
};

/***
 * MARK: compareRunnerVersions
 * @description Numeric comparison for two product versions: -1 when `a`
 *   is older, 0 when equal, 1 when newer, null when either side is
 *   unreadable (callers treat null as "cannot prove a difference", never
 *   as newer — warnings stay quiet instead of scaring on junk).
 * @example compareRunnerVersions('0.1.0', '0.2.0') => -1
 * @param {*} a - First version.
 * @param {*} b - Second version.
 * @returns {number|null} Comparison, or null.
 ***/
export const compareRunnerVersions = (a, b) => {
  const pa = versionTuple(a);
  const pb = versionTuple(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
};

/***
 * MARK: canonicalRunnerVersion
 * @description Canonical `major.minor.patch` form of a version string, or
 *   null when the value is not a readable version. A bare commit hash
 *   (`f8044e37`), `latest`, `dev`, or prose never canonicalizes, so it can
 *   never be compared against, or displayed as, a release version. A
 *   version-tagged build (`1.0.0-28aac94`) canonicalizes to its dotted core
 *   (`1.0.0`) — the tag suffix is build metadata, not part of the version,
 *   so a hash never gets compared to a build tag as if they were the same
 *   kind of thing.
 * @example canonicalRunnerVersion('v1.2.3') => '1.2.3'
 * @example canonicalRunnerVersion('1.0.0-28aac94') => '1.0.0'
 * @example canonicalRunnerVersion('f8044e37') => null
 * @param {*} [version] - Version value.
 * @returns {string|null} Canonical version, or null when unreadable.
 ***/
export const canonicalRunnerVersion = (version) => {
  const tuple = versionTuple(version);
  return tuple ? tuple.join('.') : null;
};

/***
 * MARK: resolveVersionTarget
 * @description Version an Update installs for one runner: the exact pin
 *   when the runner is pinned, else the fleet recommended version (or
 *   null when the backend names none — the Update button then points at
 *   "latest" behaviour without a number). Both sides are canonicalized
 *   first, so a version-tagged recommended value (`1.0.0-28aac94`) shows
 *   as the release `1.0.0` and a hash never shows as a target.
 * @example resolveVersionTarget({ desiredVersion: '1.2.3', recommendedVersion: '2.0.0' }) => '1.2.3'
 * @example resolveVersionTarget({ desiredVersion: 'latest', recommendedVersion: '1.0.0-28aac94' }) => '1.0.0'
 * @param {Object} [runner={}] - Runner record.
 * @returns {string|null} Target version, or null.
 ***/
export const resolveVersionTarget = (runner = {}) => {
  const desired = resolveDesiredVersion(runner);
  if (desired !== DESIRED_VERSION_LATEST) return canonicalRunnerVersion(desired) ?? desired;
  const recommended = runner?.recommendedVersion;
  if (typeof recommended !== 'string' || !recommended.trim()) return null;
  return canonicalRunnerVersion(recommended) ?? recommended.trim();
};

/***
 * MARK: versionSelectorOptions
 * @description Dropdown model for the per-runner version selector: the
 *   `latest` option plus every known release, newest first, each labelled
 *   with `(latest)` / `(running)` flags so the newest release is visibly
 *   the latest. Every candidate is canonicalized first (`v0.2.0`,
 *   `0.2.0-abc1234`, and `0.2.0` are ONE option `0.2.0`), and only real
 *   versions become options — a runner that reports a build hash as its
 *   version never lands in the dropdown as a phantom version. Flags compare
 *   canonical versions, never raw strings, so the newest release is always
 *   the flagged row no matter which spelling reported it. The
 *   `selectedValue` is the stored setting when it is still selectable
 *   (`latest` or a listed version), else `latest`, so the closed select
 *   never shows a value it cannot render.
 * @example versionSelectorOptions({ availableVersions: ['0.2.0', '0.1.0'], recommendedVersion: '0.2.0', runnerVersion: '0.1.0', desiredVersion: 'latest' }).options[0].label => '0.2.0 (latest)'
 * @example versionSelectorOptions({ availableVersions: ['1.0.0'], recommendedVersion: '1.0.0-28aac94', runnerVersion: '0.1.0' }).options[0] => { value: '1.0.0', label: '1.0.0 (latest)' }
 * @param {Object} [runner={}] - Runner record.
 * @returns {{latestVersion: string|null, selectedValue: string, options: Array<{value: string, label: string}>}} Selector model.
 ***/
export const versionSelectorOptions = (runner = {}) => {
  const desired = resolveDesiredVersion(runner);
  const running = canonicalRunnerVersion(describeRunnerVersion(runner));
  const rawRecommended = typeof runner?.recommendedVersion === 'string' ? runner.recommendedVersion : null;
  const recommended = canonicalRunnerVersion(rawRecommended);
  const pool = [
    ...(Array.isArray(runner?.availableVersions) ? runner.availableVersions : []),
    ...(rawRecommended ? [rawRecommended] : []),
    ...(describeRunnerVersion(runner) ? [describeRunnerVersion(runner)] : []),
    ...(desired !== DESIRED_VERSION_LATEST ? [desired] : []),
  ];
  // One option per canonical version, newest first; junk (hashes, prose)
  // drops out here so it can never render as a phantom release.
  const versionsByKey = new Map();
  for (const raw of pool) {
    const canonical = canonicalRunnerVersion(raw);
    if (canonical && !versionsByKey.has(canonical)) versionsByKey.set(canonical, canonical);
  }
  const versions = [...versionsByKey.keys()].sort((a, b) => compareRunnerVersions(b, a) ?? 0);
  // "Latest" resolves to the newest known release: the fleet recommended
  // version when it is known, else the newest entry in the list.
  let latestVersion = null;
  for (const candidate of [recommended, ...versions]) {
    if (!candidate) continue;
    if (!latestVersion || compareRunnerVersions(candidate, latestVersion) === 1) latestVersion = candidate;
  }
  const options = versions.map((version) => {
    const flags = [];
    if (latestVersion && compareRunnerVersions(version, latestVersion) === 0) flags.push('latest');
    if (running && compareRunnerVersions(version, running) === 0) flags.push('running');
    return { value: version, label: flags.length > 0 ? `${version} (${flags.join(', ')})` : version };
  });
  const desiredCanonical = desired === DESIRED_VERSION_LATEST ? null : canonicalRunnerVersion(desired);
  const pinnedOption = desiredCanonical
    ? options.find((o) => compareRunnerVersions(o.value, desiredCanonical) === 0) ?? null
    : null;
  const selectedValue =
    desired === DESIRED_VERSION_LATEST ? DESIRED_VERSION_LATEST : pinnedOption ? pinnedOption.value : DESIRED_VERSION_LATEST;
  return { latestVersion, selectedValue, options };
};

/***
 * MARK: versionWarningForRunner
 * @description Version-mismatch warning for one runner row, or null when
 *   there is nothing to say. Fires whenever the running version differs
 *   from the runner's own setting (fixed pin or `latest`), per survey q4:
 *   red when a newer version exists than the one running (scare them into
 *   updating, survey q6), softer otherwise (e.g. pinned to an older
 *   release the channel will never downgrade to). Below the fleet minimum
 *   is always red and names the floor distinctly from "update available".
 *   The running version is canonicalized first: a runner that reports a
 *   build hash (or any unreadable string) as its version reads as UNKNOWN,
 *   never as a mismatch — a hash is never compared against a version or a
 *   build tag. All compared/displayed versions are canonical, so a
 *   version-tagged recommended value shows as its release, not its tag.
 * @example versionWarningForRunner({ runnerVersion: '0.1.0', desiredVersion: 'latest', recommendedVersion: '0.2.0' }) => { kind: 'newer-available', tier: 'red', … }
 * @example versionWarningForRunner({ runnerVersion: 'f8044e37', desiredVersion: '0.1.0' }) => null
 * @param {Object} [runner={}] - Runner record.
 * @returns {{kind: string, tier: string, desired: string, running: string, target: string|null, message: string}|null} Warning, or null.
 ***/
export const versionWarningForRunner = (runner = {}) => {
  const running = canonicalRunnerVersion(describeRunnerVersion(runner));
  if (!running) return null;
  const desired = resolveDesiredVersion(runner);
  const recommended = canonicalRunnerVersion(
    typeof runner?.recommendedVersion === 'string' ? runner.recommendedVersion : null,
  );
  const minimum = canonicalRunnerVersion(
    typeof runner?.minimumVersion === 'string' ? runner.minimumVersion : null,
  );
  const known = [
    ...(desired !== DESIRED_VERSION_LATEST ? [canonicalRunnerVersion(desired)] : []),
    ...(recommended ? [recommended] : []),
    ...(minimum ? [minimum] : []),
    ...(Array.isArray(runner?.availableVersions)
      ? runner.availableVersions.map((v) => canonicalRunnerVersion(v))
      : []),
  ].filter((v) => v !== null);
  const newerExists = known.some((v) => compareRunnerVersions(running, v) === -1);
  if (desired !== DESIRED_VERSION_LATEST) {
    const order = compareRunnerVersions(running, desired);
    // The dispatch floor outranks the pin: a runner under the minimum is
    // refused work whatever it is set to, so below-minimum is always red —
    // even when the pin already matches the running version.
    if (runner?.belowMinimum === true) {
      // Only a pin NEWER than running that also clears the floor makes
      // Update useful; anything else needs a re-pick first (the Update
      // button disables itself with the same reasoning).
      const pinClearsFloor = order === -1 && (!minimum || compareRunnerVersions(desired, minimum) !== -1);
      if (pinClearsFloor) {
        return {
          kind: 'below-minimum',
          tier: 'red',
          desired,
          running,
          target: desired,
          message: `This Runner runs ${running}, below the fleet minimum${minimum ? ` ${minimum}` : ''} — Update now to install ${desired}.`,
        };
      }
      return {
        kind: 'below-minimum',
        tier: 'red',
        desired,
        running,
        target: recommended,
        message: `This Runner runs ${running}, below the fleet minimum${minimum ? ` ${minimum}` : ''}, and its pinned version ${desired} cannot clear it — pick Latest or a version at or above the minimum, then Update.`,
      };
    }
    if (order === 0) return null;
    if (order === null) {
      return {
        kind: 'mismatch',
        tier: 'soft',
        desired,
        running,
        target: desired,
        message: `This Runner runs ${running} but is set to "${desired}", which is not a readable version — pick a listed version or Latest from the selector.`,
      };
    }
    if (order === 1) {
      // Running newer than the pin: the channel never downgrades, so the
      // fix is always a re-pick — red only because something even newer
      // exists (survey q6), soft otherwise. The Update button stays
      // disabled either way, so neither message promises it installs.
      if (newerExists) {
        const newerLabel = recommended ?? 'a newer release';
        return {
          kind: 'newer-available',
          tier: 'red',
          desired,
          running,
          target: recommended,
          message: `This Runner runs ${running} but is set to older version ${desired}, and ${newerLabel} is available — pick Latest or a newer version, then Update.`,
        };
      }
      return {
        kind: 'mismatch',
        tier: 'soft',
        desired,
        running,
        target: desired,
        message: `This Runner runs ${running} but is set to older version ${desired}. The Runner never downgrades — pick a newer version or Latest to update.`,
      };
    }
    // The pin is newer than running, so it is itself proof a newer version
    // exists — always red, and Update installs exactly this pin.
    return {
      kind: 'newer-available',
      tier: 'red',
      desired,
      running,
      target: desired,
      message: `This Runner runs ${running} but is set to version ${desired}. Update now to install ${desired}.`,
    };
  }
  // The dispatch floor outranks the setting here too: refused work whatever
  // the knob state, so below-minimum is always red — even with no
  // recommended version to trail.
  if (runner?.belowMinimum === true) {
    return {
      kind: 'below-minimum',
      tier: 'red',
      desired,
      running,
      target: recommended,
      message: `This Runner runs ${running}, below the fleet minimum${minimum ? ` ${minimum}` : ''} — update it past the minimum before it can take work.`,
    };
  }
  if (!recommended || compareRunnerVersions(running, recommended) !== -1) return null;
  return {
    kind: 'newer-available',
    tier: 'red',
    desired,
    running,
    target: recommended,
    message: `This Runner runs ${running} but ${recommended} is available. Update now — the Runner updates when idle.`,
  };
};

/***
 * MARK: pinBlocksUpdateReason
 * @description Why the manual Update button must stay disabled for a pinned
 *   runner whose pin cannot usefully install, or null when Update may
 *   proceed: a pin older than running (the channel never downgrades), or a
 *   pin below the fleet minimum (installing it would strand — or keep —
 *   the runner under the dispatch floor). Latest runners never block here
 *   (their target always moves forward). Mirrors the below-minimum branch
 *   of `versionWarningForRunner`, which names the same re-pick.
 * @example pinBlocksUpdateReason({ runnerVersion: '0.2.0', desiredVersion: '0.1.0' }) => 'Version 0.1.0 is older …'
 * @param {Object} [runner={}] - Runner record.
 * @returns {string|null} Disabled reason, or null.
 ***/
export const pinBlocksUpdateReason = (runner = {}) => {
  const desired = resolveDesiredVersion(runner);
  if (desired === DESIRED_VERSION_LATEST) return null;
  // Canonicalized: an unreadable running version (e.g. a build hash) can
  // never prove the pin is a downgrade, so it never blocks the button.
  const running = canonicalRunnerVersion(describeRunnerVersion(runner));
  const minimum = canonicalRunnerVersion(
    typeof runner?.minimumVersion === 'string' ? runner.minimumVersion : null,
  );
  if (running && compareRunnerVersions(desired, running) === -1) {
    return `Version ${desired} is older than the running ${running} — the Runner never downgrades. Pick a newer version or Latest first.`;
  }
  if (minimum && compareRunnerVersions(desired, minimum) === -1) {
    return `Version ${desired} is below the fleet minimum ${minimum} — pick Latest or a version at or above ${minimum} first.`;
  }
  return null;
};

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
    // Per-runner version setting: 'latest' (default, auto-updates when
    // idle) or one exact release (manual Update only). Lenient on read
    // (old records predate the field) — PATCH validation is strict.
    desiredVersion: normalizeDesiredVersion(source.desiredVersion ?? 'latest'),
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

/***
 * MARK: effectiveDirectories
 * @description Effective master/worktree folders reported by a Runner.
 * @example effectiveDirectories({ facts: { directories: { masterDir: '/m', worktreeDir: '/w' } } }) => { masterDir: '/m', worktreeDir: '/w' }
 ***/
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
    return { masterDir: `${workRoot}/mirrors`, worktreeDir: workRoot };
  }
  return { masterDir: '', worktreeDir: '' };
};

/***
 * MARK: effectiveDirectoryValue
 * @description Value shown for a directory field: operator override if set,
 *   else the Runner's effective folder.
 * @example effectiveDirectoryValue({ facts: { workRoot: '/srv' } }, 'masterDir') => '/srv'
 ***/
export const effectiveDirectoryValue = (runner = {}, field) => {
  const cfg = defaultRunnerConfig(runner).directories[field];
  if (cfg) return cfg;
  const eff = effectiveDirectories(runner)[field];
  return eff || '';
};

/***
 * MARK: displayDirectories
 * @description Directory field display values plus default flags.
 * @example displayDirectories({}) => { masterDir: { value: '', isDefault: true }, worktreeDir: { value: '', isDefault: true } }
 ***/
export const displayDirectories = (runner = {}) => {
  const cfg = defaultRunnerConfig(runner).directories;
  const eff = effectiveDirectories(runner);
  return {
    masterDir: { value: cfg.masterDir || eff.masterDir, isDefault: !cfg.masterDir, isUnknown: !cfg.masterDir && !eff.masterDir },
    worktreeDir: { value: cfg.worktreeDir || eff.worktreeDir, isDefault: !cfg.worktreeDir, isUnknown: !cfg.worktreeDir && !eff.worktreeDir },
  };
};

/***
 * MARK: modelUnion
 * @description Union of advertised and effective model ids.
 * @example modelUnion({ capabilities: { models: ['m1'] } }) => ['m1']
 ***/
export const modelUnion = (runner = {}) => {
  const adv = advertisedModels(runner);
  const eff = effectiveModels(runner);
  const set = new Set([...adv, ...eff]);
  return [...set].sort();
};

/***
 * MARK: discoveryStatusSummary
 * @description Summarizes the Runner's per-harness auto-detect status
 *   (`capabilities.discoveryStatus`, falling back to the raw facts copy)
 *   for the Models block: stable per-harness counts plus the first leg
 *   warning. Null when the Runner/backend predates discovery status, so
 *   old records render exactly as before.
 * @example discoveryStatusSummary({ capabilities: { discoveryStatus: { pi: { ok: true, count: 2 } } } }) => { counts: 'pi:2', warning: null }
 * @param {Object} [runner={}] - Runner record.
 * @returns {{counts: string, warning: string|null}|null} Summary, or null when unknown.
 ***/
export const discoveryStatusSummary = (runner = {}) => {
  const status = runner?.capabilities?.discoveryStatus ?? runner?.facts?.discoveryStatus;
  if (!status || typeof status !== 'object' || Array.isArray(status)) return null;
  const ids = Object.keys(status).sort();
  if (ids.length === 0) return null;
  const counts = ids
    .map((id) => {
      const slice = status[id];
      const rawCount = slice && typeof slice.count === 'number' ? slice.count : 0;
      const count = Number.isFinite(rawCount) && rawCount >= 0 ? Math.floor(rawCount) : 0;
      return `${id}:${count}`;
    })
    .join(', ');
  const warned = ids.find((id) => {
    const slice = status[id];
    return Boolean(slice && typeof slice === 'object' && (slice.ok === false || (slice.error && typeof slice.error === 'object')));
  });
  let warning = null;
  if (warned) {
    const err = status[warned]?.error;
    const code = err && typeof err.code === 'string' && err.code ? err.code : 'discovery failed';
    const msg = err && typeof err.message === 'string' && err.message ? err.message.slice(0, 200) : '';
    warning = msg ? `${warned}: ${code} — ${msg}` : `${warned}: ${code}`;
  }
  return { counts, warning };
};

/***
 * MARK: modelSourceSummary
 * @description Summarizes WHERE one Runner's advertised model list comes
 *   from (`capabilities.modelSource`, falling back to the raw facts copy):
 *   `pinned` (operator pin only), `pinned+discovered` (pin unioned with
 *   auto-detected ids — the current runner default), `discovered`
 *   (auto-detect fills in), or `unpinned` (nothing advertised) — plus the
 *   newest per-harness scan time across `discoveryStatus` slices. Null
 *   when the Runner/backend predates both signals, so old records render
 *   exactly as before.
 * @example modelSourceSummary({ capabilities: { modelSource: 'pinned' } }) => { source: 'pinned', scannedAtMs: null }
 * @param {Object} [runner={}] - Runner record.
 * @returns {{source: string|null, scannedAtMs: number|null}|null} Summary, or null when unknown.
 ***/
export const modelSourceSummary = (runner = {}) => {
  const raw = runner?.capabilities?.modelSource ?? runner?.facts?.modelSource;
  const source =
    raw === 'pinned' || raw === 'pinned+discovered' || raw === 'discovered' || raw === 'unpinned'
      ? raw
      : null;
  const status = runner?.capabilities?.discoveryStatus ?? runner?.facts?.discoveryStatus;
  let scannedAtMs = null;
  if (status && typeof status === 'object' && !Array.isArray(status)) {
    for (const slice of Object.values(status)) {
      const at = slice && typeof slice.atMs === 'number' && Number.isFinite(slice.atMs) && slice.atMs >= 0
        ? slice.atMs
        : null;
      if (at !== null && (scannedAtMs === null || at > scannedAtMs)) scannedAtMs = at;
    }
  }
  if (!source && scannedAtMs === null) return null;
  return { source, scannedAtMs };
};

/***
 * MARK: modelTogglePatch
 * @description Patch value for toggled model ids; `null` when matching advertised.
 * @example modelTogglePatch({ capabilities: { models: ['m1'] } }, ['m1']) => null
 ***/
export const modelTogglePatch = (runner = {}, nextIds = []) => {
  const advertised = advertisedModels(runner);
  const sortedNext = [...nextIds].sort();
  const sortedAdv = [...advertised].sort();
  const isAdvertised = sortedNext.length === sortedAdv.length && sortedNext.every((v, i) => v === sortedAdv[i]);
  return isAdvertised ? null : [...nextIds];
};

/***
 * MARK: runnerCommands
 * @description Normalized `commands` block from a public Runner record,
 *   with a safe fallback when an older backend omitted it.
 * @example runnerCommands({ commands: { supported: ['requestUpdate'] } }) => ...
 ***/
export const runnerCommands = (runner = {}) => {
  const block = runner?.commands;
  if (block && typeof block === 'object') {
    return {
      pending: Array.isArray(block.pending) ? block.pending : [],
      results: (block.results && typeof block.results === 'object' && !Array.isArray(block.results)) ? block.results : {},
      supported: Array.isArray(block.supported) ? block.supported : [],
    };
  }
  // Older backends: fall back to facts.commands when present.
  const factsSupported = Array.isArray(runner?.facts?.commands) ? runner.facts.commands : [];
  return { pending: [], results: {}, supported: factsSupported };
};
/***
 * MARK: supportedRunnerCommands
 * @description Supported backend-to-Runner command ids for one public Runner
 *   record (convenience over `runnerCommands`).
 * @example supportedRunnerCommands({ commands: { supported: ['requestUpdate'] } }) => ['requestUpdate']
 ***/
export const supportedRunnerCommands = (runner = {}) => runnerCommands(runner).supported;

/***
 * MARK: canRequestCommand
 * @description Whether a named backend-to-Runner command can be requested
 *   for one public Runner record.
 * @example canRequestCommand({ commands: { supported: ['requestUpdate'] } }, 'requestUpdate') => true
 ***/
export const canRequestCommand = (runner = {}, command) => supportedRunnerCommands(runner).includes(command);

/***
 * MARK: canRequestUpdate
 * @description Whether an idle-only update can be requested from this page:
 *   the Runner advertises `requestUpdate` support, so the queued command
 *   will actually run. An update-available badge alone is not enough — an
 *   old Runner that cannot act on the command needs a manual update, and
 *   the UI says so instead of offering a dead button (R1).
 * @example canRequestUpdate({ commands: { supported: ['requestUpdate'] } }) => true
 ***/
export const canRequestUpdate = (runner = {}) => canRequestCommand(runner, 'requestUpdate');

/***
 * MARK: canRequestRediscovery
 * @description Whether model re-detection can be requested: the Runner
 *   advertises `requestModelRediscovery` support.
 * @example canRequestRediscovery({ commands: { supported: ['requestModelRediscovery'] } }) => true
 ***/
export const canRequestRediscovery = (runner = {}) => canRequestCommand(runner, 'requestModelRediscovery');

/***
 * MARK: canRequestRestart
 * @description Whether a reboot-on-current-version can be requested: the
 *   Runner advertises `requestRestart` support, so the queued command
 *   will actually run. Old Runners need a manual update instead, and the
 *   UI says so instead of offering a dead button (R1).
 * @example canRequestRestart({ commands: { supported: ['requestRestart'] } }) => true
 ***/
export const canRequestRestart = (runner = {}) => canRequestCommand(runner, 'requestRestart');


/***
 * MARK: stalenessLabel
 * @description Human-readable age label for a Runner's last heartbeat.
 * @example stalenessLabel({ lastSeenAt: '2024-01-01T00:00:00Z' }, Date.parse('2024-01-01T00:01:30Z')) => '2m ago'
 ***/
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

/***
 * MARK: runnerStatusLabel
 * @description Status label for a Runner row.
 * @example runnerStatusLabel({ status: 'active', paused: false }) => 'active'
 ***/
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

/***
 * MARK: validateSingleDirectory
 * @description Validates a single directory path value.
 * @example validateSingleDirectory('') => 'Enter a directory path.'
 ***/
export const validateSingleDirectory = (value) => {
  if (typeof value !== 'string' || !value.trim()) return 'Enter a directory path.';
  if (value.trim().length > 1024) return 'Must be at most 1024 characters.';
  return null;
};

/***
 * MARK: mergeRunnerRecord
 * @description Merges one refreshed Runner record into the roster kept in
 *   state. Records without a usable Runner id are ignored (the roster is
 *   returned unchanged) so a malformed refresh can never wipe the screen.
 *   A non-array roster falls back to a single-row roster when the incoming
 *   record is usable, otherwise it is returned as-is.
 * @example mergeRunnerRecord({ previousRunners: [{ runnerId: 'a' }], incomingRecord: { runnerId: 'a', status: 'active' } }) => [{ runnerId: 'a', status: 'active' }]
 * @param {Object} options - Labelled inputs.
 * @param {Object[]} [options.previousRunners=[]] - Current roster rows.
 * @param {Object} [options.incomingRecord=null] - Refreshed Runner record.
 * @returns {Object[]|*} Next roster, or the previous value when there is nothing safe to merge.
 ***/
export const mergeRunnerRecord = ({ previousRunners = [], incomingRecord = null } = {}) => {
  if (!incomingRecord || typeof incomingRecord.runnerId !== 'string' || !incomingRecord.runnerId) {
    return previousRunners;
  }
  if (!Array.isArray(previousRunners)) {
    return [incomingRecord];
  }
  let matched = false;
  const next = previousRunners.map((row) => {
    if (row && row.runnerId === incomingRecord.runnerId) {
      matched = true;
      return { ...row, ...incomingRecord };
    }
    return row;
  });
  return matched ? next : [...next, incomingRecord];
};

/***
 * MARK: dropDraftFor
 * @description Removes one Runner's draft entry (name or directory edits)
 *   after a successful save or a reload. Unknown ids and non-object draft
 *   maps are returned unchanged (or as an empty map) so a typo can never
 *   clear another Runner's edits.
 * @example dropDraftFor({ drafts: { a: 'x' }, runnerId: 'a' }) => ({})
 * @param {Object} options - Labelled inputs.
 * @param {Object} [options.drafts={}] - Current draft map.
 * @param {string} [options.runnerId=''] - Runner id whose draft is done.
 * @returns {Object} Next draft map.
 ***/
export const dropDraftFor = ({ drafts = {}, runnerId = '' } = {}) => {
  const source = drafts && typeof drafts === 'object' && !Array.isArray(drafts) ? drafts : {};
  if (typeof runnerId !== 'string' || !runnerId || !(runnerId in source)) return { ...source };
  const next = { ...source };
  delete next[runnerId];
  return next;
};

/***
 * MARK: buildDirectoryDraft
 * @description Merges one directory field edit over the in-progress draft
 *   (or the displayed fallback values for the first keystroke), so typing
 *   in Master then Worktree quickly can never clobber the other field.
 *   Unknown field names return the previous draft unchanged.
 * @example buildDirectoryDraft({ previousDraft: null, fallbackDirs: { masterDir: '/m', worktreeDir: '/w' }, field: 'masterDir', value: '/n' }) => ({ masterDir: '/n', worktreeDir: '/w' })
 * @param {Object} options - Labelled inputs.
 * @param {Object|null} [options.previousDraft=null] - Current draft for this Runner, if any.
 * @param {Object} [options.fallbackDirs={}] - Displayed values used for the first keystroke.
 * @param {string} options.field - Directory field being edited (`masterDir` or `worktreeDir`).
 * @param {string} [options.value=''] - New field value.
 * @returns {Object} Next draft for this Runner.
 ***/
export const buildDirectoryDraft = ({ previousDraft = null, fallbackDirs = {}, field, value = '' } = {}) => {
  const base =
    previousDraft && typeof previousDraft === 'object'
      ? previousDraft
      : {
          masterDir: typeof fallbackDirs?.masterDir === 'string' ? fallbackDirs.masterDir : '',
          worktreeDir: typeof fallbackDirs?.worktreeDir === 'string' ? fallbackDirs.worktreeDir : '',
        };
  if (field !== 'masterDir' && field !== 'worktreeDir') return { ...base };
  return { ...base, [field]: typeof value === 'string' ? value : '' };
};

/***
 * MARK: normalizeModelId
 * @description Cleans one hand-typed model id for the allowlist: trims it
 *   and rejects blanks, non-strings, and ids over 256 characters. Returns
 *   null when there is nothing safe to add, so callers can skip the
 *   network call entirely.
 * @example normalizeModelId({ value: '  m1  ' }) => 'm1'
 * @param {Object} options - Labelled inputs.
 * @param {*} [options.value=''] - Raw typed value.
 * @returns {string|null} Clean model id, or null when unusable.
 ***/
export const normalizeModelId = ({ value = '' } = {}) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return null;
  return trimmed;
};

/***
 * MARK: filterVisibleRunners
 * @description Narrows the visible roster by a free-text query matching
 *   the Runner id, display name, or status (case-insensitive). A blank
 *   query returns the visible list unchanged.
 * @example filterVisibleRunners({ runners: [{ runnerId: 'a' }], query: 'A' }) => [{ runnerId: 'a' }]
 * @param {Object} options - Labelled inputs.
 * @param {Object[]} [options.runners=[]] - Visible Runner records.
 * @param {string} [options.query=''] - Raw filter text.
 * @returns {Object[]} Matching Runner records.
 ***/
export const filterVisibleRunners = ({ runners = [], query = '' } = {}) => {
  const list = Array.isArray(runners) ? runners : [];
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return list;
  return list.filter((runner) => {
    if (!runner || typeof runner !== 'object') return false;
    return (
      String(runner.runnerId || '').toLowerCase().includes(q) ||
      String(runnerDisplayName(runner) || '').toLowerCase().includes(q) ||
      String(runner.status || '').toLowerCase().includes(q)
    );
  });
};

/***
 * MARK: runnerVersionsBlock
 * @description Versions block for one Runner record: the sanitized
 *   `capabilities.versions`, falling back to the raw `facts.versions`
 *   copy (same fallback order as the discovery-status summary). Null
 *   when neither is an object.
 * @example runnerVersionsBlock({ facts: { versions: { runner: '0.1.0' } } }) => { runner: '0.1.0' }
 * @param {Object} [runner={}] - Runner record.
 * @returns {Object|null} Versions block, or null.
 ***/
const runnerVersionsBlock = (runner = {}) => {
  const versions = runner?.capabilities?.versions ?? runner?.facts?.versions;
  return versions && typeof versions === 'object' && !Array.isArray(versions) ? versions : null;
};

/***
 * MARK: describeRunnerBuild
 * @description Build identity for one roster row: the commit sha the
 *   Runner was built (or booted) from, short sha, bundle time, dirty
 *   flag, dev-checkout flag, stale-code flag, and boot time. Null when
 *   the Runner reports no sha (old Runners predate build identity) —
 *   callers render "unknown" and never warn on a null build.
 * @example describeRunnerBuild({ facts: { versions: { build: { sha: 'abc1234', source: 'package' } } } }) => { sha: 'abc1234', shortSha: 'abc1234', … }
 * @param {Object} [runner={}] - Runner record.
 * @returns {Object|null} Build summary, or null when unknown.
 ***/
export const describeRunnerBuild = (runner = {}) => {
  const versions = runnerVersionsBlock(runner);
  const raw = versions?.build;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sha = typeof raw.sha === 'string' && raw.sha.trim() ? raw.sha.trim() : null;
  if (!sha) return null;
  const bootedAtMs = versions.bootedAtMs;
  return {
    sha,
    shortSha: sha.slice(0, 7),
    builtAt: typeof raw.builtAt === 'string' && raw.builtAt.trim() ? raw.builtAt.trim() : null,
    dirty: raw.dirty === true,
    isDev: raw.source === 'checkout',
    codeChangedSinceBoot: versions.codeChangedSinceBoot === true,
    bootedAtMs:
      typeof bootedAtMs === 'number' && Number.isFinite(bootedAtMs) && bootedAtMs >= 0
        ? bootedAtMs
        : null,
  };
};

/***
 * MARK: extractBuildSha
 * @description Pulls the commit sha out of a build identity string: a
 *   whole-string hex sha (`fbcf8442…`) or the trailing hex segment of a
 *   version-tagged build (`1.0.0-28aac94` → `28aac94`, the shape prod
 *   stamps into `/status` `build.commit` from the image tag). Needs at
 *   least 7 hex chars (git short-sha length); anything else — `unknown`,
 *   `dev`, `latest`, prose — returns null so callers treat the identity as
 *   unknown instead of comparing a hash against a non-hash.
 * @example extractBuildSha('1.0.0-28aac94') => '28aac94'
 * @example extractBuildSha('fbcf8442ee031e2edbc9f0b30195afa410296cf3') => 'fbcf8442ee031e2edbc9f0b30195afa410296cf3'
 * @param {*} [value] - Build identity string (sha, image tag, or junk).
 * @returns {string|null} Lowercased hex sha, or null when none is present.
 ***/
export const extractBuildSha = (value) => {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return null;
  const whole = /^[0-9a-f]{7,40}$/.exec(cleaned);
  if (whole) return whole[0];
  const trailing = /(?:^|[^0-9a-f])([0-9a-f]{7,40})$/.exec(cleaned);
  return trailing ? trailing[1] : null;
};

/***
 * MARK: runnerShasMatch
 * @description Whether two build identities name the same commit: the shas
 *   are extracted first (`extractBuildSha`), so a version-tagged backend
 *   build (`1.0.0-28aac94`) compares sha-to-sha instead of hash-to-tag.
 *   Match means exact or either side a prefix of the other (short vs full
 *   sha). When either side yields no sha the result is false — but callers
 *   must check `extractBuildSha` themselves first, because false here also
 *   means "unknown", and unknown must never render as a mismatch.
 * @example runnerShasMatch('abc1234def', '1.0.0-abc1234') => true
 * @param {string|null} [runnerSha=null] - Runner build identity.
 * @param {string|null} [backendSha=null] - Backend build identity.
 * @returns {boolean} True when both carry a sha and they name one commit.
 ***/
const runnerShasMatch = (runnerSha = null, backendSha = null) => {
  const a = extractBuildSha(runnerSha);
  const b = extractBuildSha(backendSha);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
};

/***
 * MARK: runnerBuildWarning
 * @description Stale-code warning for one Runner record, or null when
 *   there is nothing to say. Warns when the Runner's own code changed
 *   after boot, or when its build sha provably differs from the backend's
 *   commit sha — both sides are normalized through `extractBuildSha` first,
 *   so a version-tagged backend build (`1.0.0-28aac94`) compares sha-to-sha
 *   and is never mistaken for a hash. Stays silent for dev checkouts
 *   (build info still shows), for builds or backend identities that carry
 *   no sha (unknown must not read as a mismatch), and for matching shas.
 *   Advisory only: the caller renders the message and never disables
 *   anything (warn, never block).
 * @example runnerBuildWarning({ facts: { versions: { build: { sha: 'aaa1111' }, codeChangedSinceBoot: true } } }, 'bbb2222') => { kind: 'code-changed', message: '…' }
 * @param {Object} [runner={}] - Runner record.
 * @param {string|null} [backendSha=null] - Backend build identity (`GET /status` → `build.commit`: a sha or a version-tagged build like `1.0.0-28aac94`).
 * @returns {{kind: string, message: string}|null} Warning, or null.
 ***/
export const runnerBuildWarning = (runner = {}, backendSha = null) => {
  const versions = runnerVersionsBlock(runner);
  if (!versions || typeof versions !== 'object') return null;
  const build = describeRunnerBuild(runner);
  if (build?.isDev) return null;
  // An explicit true is provable staleness on its own: old Runners never
  // send the flag at all, so no sha comparison is needed for this branch.
  if (versions.codeChangedSinceBoot === true) {
    return {
      kind: 'code-changed',
      message:
        "This runner's code changed after it started — restart or update it so it runs the current code.",
    };
  }
  const runnerSha = build ? extractBuildSha(build.sha) : null;
  const backend = extractBuildSha(backendSha);
  if (!runnerSha || !backend) return null;
  if (runnerShasMatch(runnerSha, backend)) return null;
  return {
    kind: 'sha-mismatch',
    message: `This runner was built from commit ${runnerSha.slice(0, 7)} but the backend runs commit ${backend.slice(0, 7)} — restart or update it so they match.`,
  };
};
