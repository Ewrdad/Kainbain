import { normalizeStageTags } from "../../shared/stageTags.js";
import { DEFAULT_DEPLOY_COMMAND, isDeployCommand, isHostCommand } from "./deployCommands.js";

/***
 * MARK: DEFAULT_STAGES
 * @description The default workflow pipeline for a new project.
 * Each stage carries an authoritative `type` discriminator:
 *   - 'agent'  -> automated execution by the AI (Bot/script stage)
 *   - 'human'  -> manual checkpoint requiring human approval/review
 *   - 'ci'     -> automated bash verification command (a deploy is a ci
 *                 stage whose command runs the deploy script)
 *   - 'merge'  -> git operations only (integrate the task branch into main)
 * The `failback` field describes where a task is routed if the stage fails.
 * A value of 'any' means the operator may route the task to any other stage.
 ***/
export const DEFAULT_STAGES = [
	{
		id: "1",
		name: "Idea",
		type: "agent",
		prompt: "Generate creative ideas.",
		paused: false,
		failback: "start",
	},
	{
		id: "2",
		name: "Technical Elab",
		type: "agent",
		prompt: "Elaborate on technical specs.",
		paused: false,
		failback: "previous",
	},
	{
		id: "3",
		name: "Plan",
		type: "agent",
		prompt: "Create a detailed plan.",
		paused: false,
		failback: "previous",
	},
	{
		id: "4",
		name: "Review Plan",
		type: "human",
		prompt: "Human review of the plan.",
		paused: false,
		failback: "previous",
	},
	{
		id: "5",
		name: "In Progress",
		type: "agent",
		prompt: "Executing the task.",
		paused: false,
		failback: "previous",
	},
	{
		id: "6",
		name: "Deploy",
		type: "ci",
		command: DEFAULT_DEPLOY_COMMAND,
		paused: false,
		failback: "previous",
	},
];

/***
 * MARK: normalizeStageType
 * @description Normalizes stage types to the authoritative types ('agent', 'human', 'ci', 'merge').
 * Legacy types are mapped: 'review' -> 'human', 'script' -> 'ci',
 * 'deploy' -> 'ci' (the deploy pipeline stage type was removed — a stage
 * whose command runs the deploy script is an ordinary ci stage with no
 * special runtime), 'custom'/other -> 'agent'.
 * @example normalizeStageType('review') => 'human'
 * @example normalizeStageType('deploy') => 'ci'
 * @param {string} [type]
 * @returns {'agent'|'human'|'ci'|'merge'}
 ***/
export function normalizeStageType(type) {
	if (!type || typeof type !== "string") return "agent";
	const lower = type.trim().toLowerCase();
	if (lower === "human" || lower === "review") return "human";
	if (lower === "ci" || lower === "script" || lower === "deploy") return "ci";
	if (lower === "merge") return "merge";
	if (lower === "agent") return "agent";
	return "agent";
}

/***
 * MARK: normalizeStageSkills
 * @description Normalizes a stage's optional `skills` attachment list. Unknown fields
 *   on each attachment pass through untouched (non-declarative tolerance); only the
 *   authoritative fields are coerced: `name` (trimmed), `mode` ('direct'|'option'),
 *   and `config` (plain object). Entries without a usable name are dropped.
 *   Returns `undefined` when `skills` is absent so legacy stages are untouched.
 * @example normalizeStageSkills([{ name: 'a', mode: 'OPTION', config: { x: 1 }, extra: true }])
 *   => [{ name: 'a', mode: 'option', config: { x: 1 }, extra: true }]
 * @param {Array|undefined} [skills]
 * @returns {Array<Object>|undefined}
 ***/
export function normalizeStageSkills(skills) {
	if (skills === undefined || skills === null) return undefined;
	if (!Array.isArray(skills)) return [];
	return skills
		.filter(
			(s) =>
				s && typeof s === "object" && typeof s.name === "string" && s.name.trim(),
		)
		.map((s) => {
			const normalized = { ...s, name: s.name.trim() };
			if (s.mode !== undefined) {
				normalized.mode =
					typeof s.mode === "string" && s.mode.trim().toLowerCase() === "option"
						? "option"
						: "direct";
			}
			if (s.config !== undefined) {
				normalized.config =
					s.config && typeof s.config === "object" && !Array.isArray(s.config)
						? s.config
						: {};
			}
			return normalized;
		});
}

/***
 * MARK: normalizeStage
 * @description Normalizes a single stage object ensuring stage type is strictly 'agent', 'human', or 'ci'.
 *   The optional per-stage `harness` override (blank/absent means "inherit the
 *   project harness") is trimmed; a blank or non-string value clears it
 *   (undefined) so persistence drops the key. The id itself is NOT validated
 *   here: an unknown harness warns visibly at session time and degrades to the
 *   project harness (see resolveHarnessForProject).
 *   CI stages additionally carry an optional `runOnBranch` mode ('task'
 *   default | 'primary' | 'custom', legacy 'main' maps to 'primary') and a
 *   `customBranch` name (trimmed; blank clears it). Legacy spellings
 *   `executionBranch`/`customExecutionBranch` are migrated to the canonical
 *   names and dropped so storage converges on the first save.
 * @example normalizeStage({ id: '1', name: 'Test', type: 'script' }) => { id: '1', name: 'Test', type: 'ci' }
 * @example normalizeStage({ id: '1', harness: '  custom  ' }).harness => 'custom'
 * @param {Object} stage
 * @returns {Object}
 ***/
export function normalizeStage(stage) {
	if (!stage || typeof stage !== "object") return stage;
	// The removed `deploy` type folds into `ci` with no special runtime: a
	// legacy deploy stage keeps whatever command it carried (or no command,
	// like any other command-less ci stage) and runs as ordinary CI. The
	// default deploy command is never stamped — an explicit command is the
	// only thing that makes a stage run the deploy script.
	const normalized = {
		...stage,
		type: normalizeStageType(stage.type),
	};
	// Optional per-stage skills (additive): normalise only when present so legacy
	// stage objects round-trip byte-identically.
	if (stage.skills !== undefined) {
		const skills = normalizeStageSkills(stage.skills);
		if (skills !== undefined) normalized.skills = skills;
		else delete normalized.skills;
	}
	// Optional per-stage tags (additive): normalise only when present so legacy
	// stage objects round-trip byte-identically.
	if (stage.tags !== undefined) {
		const tags = normalizeStageTags(stage.tags);
		if (tags !== undefined) normalized.tags = tags;
		else delete normalized.tags;
	}
	// Optional per-stage harness override (additive): same explicit-choice-only
	// rule as project.harness — blank clears it (undefined).
	if (stage.harness !== undefined) {
		normalized.harness =
			typeof stage.harness === "string" && stage.harness.trim()
				? stage.harness.trim()
				: undefined;
	}
	// Optional per-stage CI branch execution mode (additive):
	// 'task' (default, absent) | 'primary' (project default branch) | 'custom'.
	// The 'main' value and the executionBranch/customExecutionBranch key names
	// are legacy spellings from the same feature's first iteration — mapped
	// here so hand-edited or in-flight configs converge on the canonical
	// fields (the legacy keys are dropped, never re-saved).
	const RUN_ON_BRANCH = new Set(["task", "primary", "custom"]);
	const rawRunOnBranch =
		stage.runOnBranch !== undefined ? stage.runOnBranch : stage.executionBranch;
	if (rawRunOnBranch !== undefined) {
		const v =
			typeof rawRunOnBranch === "string" ? rawRunOnBranch.trim().toLowerCase() : "";
		const mapped = v === "main" ? "primary" : v;
		normalized.runOnBranch = RUN_ON_BRANCH.has(mapped) ? mapped : "task";
	}
	const rawCustomBranch =
		stage.customBranch !== undefined ? stage.customBranch : stage.customExecutionBranch;
	if (rawCustomBranch !== undefined) {
		normalized.customBranch =
			typeof rawCustomBranch === "string" && rawCustomBranch.trim()
				? rawCustomBranch.trim()
				: undefined;
	}
	delete normalized.executionBranch;
	delete normalized.customExecutionBranch;
	// Host commands (deploy/publish/redeploy scripts) run only on the backend
	// in the primary checkout, never on a Runner (DA9). Stamp the generic
	// hostOnly flag here, where command-text heuristics already live, so the
	// generic pipeline branches only on this boolean.
	const stageCommand =
		typeof normalized.command === "string" && normalized.command.trim()
			? normalized.command
			: typeof normalized.script === "string"
				? normalized.script
				: "";
	if ((normalized.type === "ci" || normalized.type === "script") && isHostCommand(stageCommand)) {
		normalized.hostOnly = true;
	} else if (normalized.hostOnly !== true) {
		delete normalized.hostOnly;
	}
	return normalized;
}

/***
 * MARK: migrateMergeDeployStages
 * @description Migrates composite "Merge and deploy" stages — a merge stage
 *   that carries a command — into a git-only merge stage plus a dedicated
 *   command CI stage inserted immediately after it, in the same list and
 *   order. The merge stage only performs git operations now, so the command
 *   moves to its own ordinary ci stage: git failures and command failures
 *   can never mix again. The inserted stage keeps the recorded command
 *   verbatim (including a deploy-script command, which runs as ordinary CI
 *   with normal failback) and fails back to the merge stage ("previous").
 *
 *   Idempotent: a merge stage without a command is left untouched, and the
 *   inserted deploy stage reuses the deterministic id `<mergeId>-deploy`, so
 *   re-running the migration (every project load/save normalizes again)
 *   never duplicates it. A non-deploy post-merge command is dropped from the
 *   merge stage without an inserted stage (deprecated: see DEPRECATIONS.md).
 * @example migrateMergeDeployStages([{ id: 'm', type: 'merge', command: './deploy.sh --prod' }])
 *   => [{ id: 'm', type: 'merge' }, { id: 'm-deploy', type: 'ci', command: './deploy.sh --prod' }]
 * @param {Array<Object>} [stages] - Already type-normalized stages.
 * @returns {Array<Object>} The migrated stage list (same order + inserted deploy stages).
 ***/
export function migrateMergeDeployStages(stages) {
	if (!Array.isArray(stages)) return [];
	const existingIds = new Set(
		stages.filter((s) => s && typeof s === "object").map((s) => String(s.id)),
	);
	const out = [];
	for (const stage of stages) {
		const isMergeStage =
			stage &&
			typeof stage === "object" &&
			String(stage.type || "").toLowerCase() === "merge";
		const command =
			isMergeStage &&
			((typeof stage.command === "string" && stage.command.trim()) ||
				(typeof stage.script === "string" && stage.script.trim()))
				? stage.command || stage.script
				: "";
		if (!isMergeStage || !command) {
			out.push(stage);
			continue;
		}
		// Strip the command: a merge stage is git-only and ignores commands.
		const mergeStage = { ...stage };
		delete mergeStage.command;
		delete mergeStage.script;
		// A name that advertised the composite ("Merge and deploy") must
		// not lie about the now git-only stage.
		const name = String(mergeStage.name || "");
		if (/merge/i.test(name) && /deploy/i.test(name)) {
			mergeStage.name = "Merge";
		}
		out.push(mergeStage);
		if (!isDeployCommand(command)) continue; // dropped, deprecated
		const deployStageId = `${String(mergeStage.id || "merge")}-deploy`;
		if (existingIds.has(deployStageId)) continue; // already migrated
		out.push({
			id: deployStageId,
			name: "Deploy",
			type: "ci",
			command,
			hostOnly: true,
			paused: false,
			failback: "previous",
		});
	}
	return out;
}

/***
 * MARK: normalizeStages
 * @description Normalizes an array of stage objects ensuring legacy types
 *   are migrated, then migrates composite merge-and-command stages into a
 *   git-only merge stage plus a dedicated command CI stage (see
 *   migrateMergeDeployStages).
 * @example normalizeStages([{ type: 'review' }]) => [{ type: 'human' }]
 * @example normalizeStages([{ type: 'merge', command: './deploy.sh --prod' }]).length => 2
 * @param {Array<Object>} [stages]
 * @returns {Array<Object>}
 ***/
export function normalizeStages(stages) {
	if (!Array.isArray(stages)) return [];
	return migrateMergeDeployStages(stages.map(normalizeStage));
}
