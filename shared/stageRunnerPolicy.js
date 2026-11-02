/***
 * MARK: stageRunnerPolicy
 * @description Shared per-stage Runner allow/block list: the stage-side
 *   mirror of the Runner-side `operatorConfig` (a stage names which Runners
 *   may take it, instead of a Runner naming which work it serves). A policy
 *   is `{ mode: 'allow' | 'block', runners: [<runnerId>, ...] }` and is
 *   entirely optional — absent, malformed, or empty always means
 *   unrestricted, so legacy stages and unconfigured Runners keep working.
 *   Matching is by exact `runnerId` (trimmed, case kept): unknown or
 *   renamed Runner ids stay in the list and simply never match, so a rename
 *   can never silently open a compliance gate. The verdict helper is the
 *   single enforcement point — dispatch scan, direct claim, and integration
 *   lease routes all ask it, the same discipline as
 *   `operatorConfigVerdict`.
 ***/

/***
 * MARK: STAGE_RUNNER_POLICY_MODES
 * @description The two policy modes a stage runnerPolicy accepts: 'allow'
 *   (only the listed Runners may take the stage) and 'block' (every Runner
 *   except the listed ones may take it).
 * @example STAGE_RUNNER_POLICY_MODES.includes('allow') => true
 ***/
export const STAGE_RUNNER_POLICY_MODES = ["allow", "block"];

/***
 * MARK: normalizeStageRunnerPolicy
 * @description Normalizes a raw stage runnerPolicy into `{ mode, runners }`
 *   or `undefined` when the stage is unrestricted. Trims the mode
 *   (case-insensitive) and every Runner id, drops non-string and blank
 *   entries, and dedupes while keeping the first occurrence order. Absent,
 *   malformed, unknown-mode, or empty-after-cleaning input all normalize to
 *   `undefined` (fail open, never strand tasks on a mis-edit); unknown
 *   Runner ids are kept, never pruned, so a renamed Runner shows as stale
 *   in the UI instead of silently opening the gate.
 * @example normalizeStageRunnerPolicy({ mode: 'Allow', runners: [' r1 ', 'r1', 7] }) => { mode: 'allow', runners: ['r1'] }
 * @example normalizeStageRunnerPolicy(undefined) => undefined
 * @param {any} raw - Raw `stage.runnerPolicy` value.
 * @returns {{mode: string, runners: Array<string>}|undefined} Normalized policy, or undefined when unrestricted.
 ***/
export const normalizeStageRunnerPolicy = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const mode = typeof raw.mode === "string" ? raw.mode.trim().toLowerCase() : "";
  if (mode !== "allow" && mode !== "block") return undefined;
  if (!Array.isArray(raw.runners)) return undefined;
  const runners = [];
  const seen = new Set();
  for (const entry of raw.runners) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    runners.push(id);
  }
  if (runners.length === 0) return undefined;
  return { mode, runners };
};

/***
 * MARK: stageRunnerPolicyVerdict
 * @description Decides whether one Runner may take work from one stage
 *   under the stage's runnerPolicy. Accepts either the policy object itself
 *   or a stage carrying it as `.runnerPolicy` (the dispatch scan passes the
 *   requirement's attached policy, the claim routes pass the stage).
 *   Unrestricted stages allow every Runner; allow-mode refuses unlisted
 *   Runners with `RUNNER_NOT_ALLOWED`, block-mode refuses listed Runners
 *   with `RUNNER_BLOCKED`. Malformed input fails open to `MATCH` (legacy
 *   stages predate the field) and never throws, because this runs on hot
 *   claim paths.
 * @example stageRunnerPolicyVerdict({ mode: 'allow', runners: ['onsite-1'] }, 'cloud-2') => { ok: false, reason: 'RUNNER_NOT_ALLOWED' }
 * @example stageRunnerPolicyVerdict({ id: 's1' }, 'any-runner') => { ok: true, reason: 'MATCH' }
 * @param {Object|undefined} [stageOrPolicy] - Policy object or stage carrying `.runnerPolicy`.
 * @param {string} [runnerId] - Candidate Runner id.
 * @returns {Object} `{ ok, reason }` — reason is `MATCH` when allowed.
 ***/
export const stageRunnerPolicyVerdict = (stageOrPolicy, runnerId) => {
  const candidate =
    stageOrPolicy && typeof stageOrPolicy === "object" && !Array.isArray(stageOrPolicy)
      ? (stageOrPolicy.runnerPolicy !== undefined ? stageOrPolicy.runnerPolicy : stageOrPolicy)
      : undefined;
  const policy = normalizeStageRunnerPolicy(candidate);
  if (!policy) return { ok: true, reason: "MATCH" };
  if (typeof runnerId !== "string" || !runnerId.trim()) return { ok: true, reason: "MATCH" };
  const listed = policy.runners.includes(runnerId.trim());
  if (policy.mode === "allow") {
    return listed
      ? { ok: true, reason: "MATCH" }
      : { ok: false, reason: "RUNNER_NOT_ALLOWED" };
  }
  return listed
    ? { ok: false, reason: "RUNNER_BLOCKED" }
    : { ok: true, reason: "MATCH" };
};

/***
 * MARK: collectInvalidStageRunnerPolicies
 * @description Save-time validation for stage runnerPolicy shapes: returns
 *   one problem per stage whose policy is present but malformed — a
 *   non-object policy, an unknown mode, or a non-array runners list. The
 *   stage create/update routes refuse such saves with 400 so a typo can
 *   never silently save as unrestricted (normalization alone would fail
 *   open). Unknown Runner ids are never flagged: a policy naming a deleted
 *   or renamed Runner stays closed and shows as stale in the UI.
 * @example collectInvalidStageRunnerPolicies([{ id: 's1', runnerPolicy: { mode: 'only', runners: [] } }]) => [{ index: 0, stageId: 's1', problem: 'UNKNOWN_MODE', mode: 'only' }]
 * @example collectInvalidStageRunnerPolicies([{ id: 's1' }]) => []
 * @param {Array|undefined} [stages] - Raw stages from a save payload.
 * @returns {Array<Object>} Problems as `{ index, stageId, problem, mode }` (empty when every policy saves cleanly).
 ***/
export const collectInvalidStageRunnerPolicies = (stages) => {
  if (!Array.isArray(stages)) return [];
  const problems = [];
  stages.forEach((stage, index) => {
    const raw = stage && typeof stage === "object" ? stage.runnerPolicy : undefined;
    if (raw === undefined || raw === null) return;
    const stageId = stage && typeof stage === "object" && stage.id !== undefined ? stage.id : null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      problems.push({ index, stageId, problem: "POLICY_NOT_OBJECT", mode: null });
      return;
    }
    const mode = typeof raw.mode === "string" ? raw.mode.trim().toLowerCase() : "";
    if (mode !== "allow" && mode !== "block") {
      problems.push({
        index,
        stageId,
        problem: "UNKNOWN_MODE",
        mode: typeof raw.mode === "string" ? raw.mode : null,
      });
      return;
    }
    if (!Array.isArray(raw.runners)) {
      problems.push({ index, stageId, problem: "RUNNERS_NOT_ARRAY", mode });
    }
  });
  return problems;
};
