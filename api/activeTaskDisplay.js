// Role: live monitor projection — current model/harness/stage display for observability.
// See also taskDurationSummary.js (persisted duration evidence, not live display).
import { parseModelKey, normalizeModelRef } from "../shared/modelKeys.js";
import { isAutomatedStage, findStageByIdOrName } from "./flow/stagePolicy.js";
import {
	getHarnessByName,
	harnessModelSelection,
	hasHarness,
} from "./agent/harnessRegistry.js";

/***
 * MARK: readSessionValue
 * @description Reads a harness capability without letting a disposed session break monitoring.
 * Legacy properties are used only when the accessor is absent or fails; null from
 * a working accessor is authoritative (for example a genuinely unknown model).
 ***/
async function readSessionValue(session, accessor, property) {
	try {
		if (typeof session?.[accessor] === "function") {
			return await session[accessor]();
		}
	} catch {
		// A session may be disposed while an observability request is in flight.
	}
	try {
		return session?.[property] ?? null;
	} catch {
		return null;
	}
}

/***
 * MARK: readActiveSessionDisplay
 * @description Reads model and conversation through the harness contract, independently.
 * @example const { model, messages } = await readActiveSessionDisplay(session);
 ***/
export async function readActiveSessionDisplay(session) {
	const [model, messages] = await Promise.all([
		readSessionValue(session, "getActiveModel", "model"),
		readSessionValue(session, "getMessages", "messages"),
	]);
	return { model, messages: Array.isArray(messages) ? messages : [] };
}

/***
 * MARK: sessionModelRef
 * @description Renders an observed model as a reference string: contract model objects as `provider::id`, session key fields, or a plain string ref.
 ***/
function sessionModelRef(sessionModel) {
	if (typeof sessionModel === "string") return sessionModel;
	if (sessionModel?.provider && sessionModel?.id)
		return `${sessionModel.provider}::${sessionModel.id}`;
	return sessionModel?.key || sessionModel?.id || null;
}

/***
 * MARK: resolveModelSelection
 * @description Normalizes a harness instance (or selection string) to the
 *   monitor payload vocabulary: `"none"` when the harness manages its own
 *   model, `"list"` otherwise. Delegates to `harnessModelSelection`.
 ***/
function resolveModelSelection(harnessOrSelection) {
	return harnessModelSelection(harnessOrSelection);
}

/***
 * MARK: resolveMonitorTarget
 * @description THE single seam that decides which harness/model halves the
 *   monitor shows for one active task. Rule: a live session's actuals always
 *   win over the peek preview; the peeked alias-rotation preview shows only
 *   when idle/queued (no live session). The peeked rotation slot can belong
 *   to a different weighted target than dispatch served, so mixing the live
 *   harness with the peeked model would show an impossible combination
 *   (e.g. muse + a Gemini key) — the live halves suppress the preview
 *   halves instead, and the peeked `targetIndex` is omitted when the peeked
 *   harness disagrees with the live harness (the peeked slot is not the
 *   running slot). The alias identity itself rides along untouched.
 * @example resolveMonitorTarget({ session, displayTarget, resolvedHarness, stage, project }).harnessName => "muse"
 * @param {Object} [opts]
 * @param {Object|null} [opts.session] - The live harness session (null when idle/queued).
 * @param {Object|null} [opts.displayTarget] - The peeked display target from `resolveDisplayTarget` (null for legacy doubles).
 * @param {Object|null} [opts.resolvedHarness] - The `{ name, harness }` display-harness resolution (peek path + legacy fallbacks).
 * @param {Object} [opts.stage] - The stage entity.
 * @param {Object} [opts.project] - The project entity.
 * @returns {{harnessName: string|undefined, harnessInstance: Object|null, modelRef: string|undefined, projectModelRef: string|undefined, aliasName: string|null, aliasMissing: string|null, targetIndex: number|null|undefined}} One consistent monitor triple.
 ***/
export function resolveMonitorTarget({ session, displayTarget, resolvedHarness, stage, project } = {}) {
	const liveHarnessId =
		typeof session?.harnessId === "string" ? session.harnessId.trim() : "";
	const harnessName =
		session?.harnessId ||
		resolvedHarness?.name ||
		stage?.harness ||
		project?.harness;
	if (liveHarnessId && displayTarget) {
		// Live run: halves come from the session actuals only. The model
		// slots stay empty so `resolveActiveTaskDisplay` reports the
		// observed session model (or harness-managed / unknown when the
		// session reports none) — never the peeked rotation's model.
		// `modelSelection` comes from the LIVE harness instance.
		let liveInstance = null;
		if (hasHarness(liveHarnessId)) {
			try {
				liveInstance = getHarnessByName(liveHarnessId);
			} catch {
				liveInstance = null;
			}
		}
		const peekedHarness =
			typeof displayTarget.harnessName === "string"
				? displayTarget.harnessName.trim()
				: "";
		return {
			harnessName,
			harnessInstance: liveInstance ?? resolvedHarness?.harness ?? null,
			modelRef: undefined,
			projectModelRef: undefined,
			aliasName: !displayTarget.aliasMissing ? displayTarget.aliasName : null,
			aliasMissing: displayTarget.aliasMissing ?? null,
			targetIndex:
				peekedHarness && peekedHarness !== liveHarnessId
					? undefined
					: displayTarget.targetIndex,
		};
	}
	return {
		harnessName,
		harnessInstance: resolvedHarness?.harness ?? null,
		modelRef: displayTarget ? displayTarget.modelRef : stage?.model,
		projectModelRef: displayTarget
			? displayTarget.projectModelRef
			: project?.defaultModel,
		aliasName:
			displayTarget && !displayTarget.aliasMissing
				? displayTarget.aliasName
				: null,
		aliasMissing: displayTarget?.aliasMissing ?? null,
		targetIndex: displayTarget ? displayTarget.targetIndex : null,
	};
}

/***
 * MARK: resolveEngineStageProjection
 * @description Reconciles the engine snapshot's displayed stage with the
 *   owner task's actual pipeline stage. The engine owner is the single
 *   source of "which task is running"; the running task's stage is its
 *   pipeline-resolved `currentStageId`. A manual move (or any transition
 *   that changes `currentStageId` without re-dispatching) can strand the
 *   engine's `activeStageId` on the stage the task just left, which made
 *   the header pill read `ACTIVE: <old stage>` while the task card showed
 *   the new one (task 072e2cfa). Reconciling at read time fixes already
 *   persisted stranded snapshots without a migration; writer paths call it
 *   too so a fresh move never depends on the next read.
 *   Agreement is checked by id, then case-insensitive name; with no owner
 *   task, no task stage reference, or agreement the engine's own fields are
 *   returned untouched (`reconciled: false`).
 * @example resolveEngineStageProjection({ engineState: { activeTaskId: 't1', activeStageId: 'merge', activeStageName: 'Merge and deploy' }, ownerTask: { currentStageId: '5' }, stages: [{ id: '5', name: 'Catchup' }] })
 *   => { activeStageId: '5', activeStageName: 'Catchup', activeStageType: null, reconciled: true }
 * @param {Object} [args]
 * @param {Object} [args.engineState] - Engine snapshot (activeTaskId/activeStage*).
 * @param {Object|null} [args.ownerTask] - The engine owner's task record.
 * @param {Array<Object>} [args.stages] - Pipeline stages for the owner task.
 * @returns {{activeStageId: (string|null), activeStageName: (string|null), activeStageType: (string|null), reconciled: boolean}}
 ***/
export function resolveEngineStageProjection({ engineState, ownerTask, stages } = {}) {
	const base = {
		activeStageId: engineState?.activeStageId ?? null,
		activeStageName: engineState?.activeStageName ?? null,
		activeStageType: engineState?.activeStageType ?? null,
		reconciled: false,
	};
	if (!engineState || engineState.activeTaskId == null) return base;
	const taskStageId = ownerTask?.currentStageId;
	if (taskStageId == null || String(taskStageId).trim() === "") return base;
	const list = Array.isArray(stages) ? stages : [];
	const found = findStageByIdOrName(list, taskStageId);
	const expectedName =
		found?.name || ownerTask?.currentStageName || String(taskStageId);
	const expectedType =
		found?.type ||
		ownerTask?.currentStageType ||
		engineState.activeStageType ||
		null;
	const engineStageId = engineState.activeStageId;
	const idsAgree =
		engineStageId != null && String(engineStageId) === String(taskStageId);
	const namesAgree =
		typeof engineState.activeStageName === "string" &&
		engineState.activeStageName.trim() !== "" &&
		engineState.activeStageName.trim().toLowerCase() ===
			String(expectedName).trim().toLowerCase();
	if (idsAgree && (namesAgree || engineState.activeStageName == null)) {
		return base;
	}
	if (idsAgree) {
		// Same stage id but a stale display name (e.g. renamed stage): the id
		// is authoritative, so only the name is re-pointed.
		return {
			activeStageId: engineStageId,
			activeStageName: expectedName,
			activeStageType: expectedType,
			reconciled: true,
		};
	}
	if (namesAgree) {
		// Legacy snapshot whose id was cleared (or never set) but whose name
		// already names the owner's stage: fill the missing id so every
		// consumer reads one agreed stage.
		return {
			activeStageId: taskStageId,
			activeStageName: expectedName,
			activeStageType: expectedType,
			reconciled: true,
		};
	}
	return {
		activeStageId: taskStageId,
		activeStageName: expectedName,
		activeStageType: expectedType,
		reconciled: true,
	};
}

/***
 * MARK: resolveActiveTaskDisplay
 * @description Describes an observed model, falling back to configured references without inventing model identity.
 *   For a harness without model selection (`modelSelection: "none"`, passed
 *   as the harness instance or selection string), the stage/project fallback
 *   chain is skipped: the harness owns its model, so an unobserved model is
 *   `null` with source `"harness-managed"` instead of a reference that could
 *   never run there. The `modelSelection` field is always returned (`"list"`
 *   when unknown) so monitor surfaces can hide the Model pill for `"none"`.
 *   For fully scripted stages (`ci`/`merge` — bash/git only, no model
 *   ever runs) no fallback runs at all: `model`/`harness` are `null`,
 *   `modelDetails.source` is `"scripted"`, and `isAutomatedStage` is `true`
 *   so monitor surfaces can hide the model+harness pills there.
 * @example resolveActiveTaskDisplay(task, stage, project, session.model)
 * @example resolveActiveTaskDisplay(task, stage, project, session.model, harnessInstance)
 ***/
export function resolveActiveTaskDisplay(task, stage, project, sessionModel, harnessOrSelection = null) {
	const modelSelection = resolveModelSelection(harnessOrSelection);
	const stageType = stage?.type || task?.currentStageType || null;
	const automated = isAutomatedStage(stageType);
	if (automated) {
		// Scripted stages (ci/merge) run bash/git only — no model ever
		// runs there. Report no model identity at all: the stage → project
		// fallback chain would otherwise manufacture a model that never ran
		// and the monitor would imply AI involvement.
		return {
			model: null,
			harness: null,
			modelSelection,
			isAutomatedStage: true,
			modelDetails: {
				provider: null,
				id: null,
				key: null,
				source: "scripted",
			},
			stageName: stage?.name || task?.currentStageName || null,
			stageType,
		};
	}
	const sessionRef = sessionModelRef(sessionModel);
	const sessionUsable =
		typeof sessionRef === "string" && sessionRef.trim() && sessionRef !== "default";
	let ref;
	let source;
	if (modelSelection === "none") {
		// A harness-managed model is never inherited from stage/project config.
		[ref, source] = sessionUsable ? [sessionRef, "session"] : [null, "harness-managed"];
	} else {
		const candidates = [
			[sessionRef, "session"],
			[stage?.model, "stage"],
			[project?.defaultModel, "project"],
		];
		[ref, source] = candidates.find(
			([value]) => typeof value === "string" && value.trim() && value !== "default",
		) || [null, "unknown"];
	}
	const parsed = parseModelKey(ref);
	const harness =
		sessionModel?.harnessId ||
		sessionModel?.harness ||
		stage?.harness ||
		project?.harness ||
		parsed?.harness ||
		null;
	// The run's harness wins over a stale harness prefix on a configured key.
	const model =
		parsed?.provider && harness
			? normalizeModelRef(`${parsed.provider}::${parsed.id}`, harness)
			: ref;
	return {
		model,
		harness,
		modelSelection,
		isAutomatedStage: false,
		modelDetails: {
			provider: parsed?.provider || null,
			id: parsed?.id || null,
			key: model,
			source,
		},
		stageName: stage?.name || task?.currentStageName || null,
		stageType,
	};
}
