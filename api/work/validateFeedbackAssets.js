// Domain: The Work — authoritative submit-time feedback validation for the
// API shell. Builds presence from disk union the task branch (the same
// two-tier rule prompt curation warns by, so branch-flap between upload and
// submit can never refuse a human) and delegates the decision to the shared
// helper, keeping every route's validation call a one-liner.
import {
	filterBranchBackedRefs,
	findMissingAssetRefs,
} from "./taskAssets.js";
import {
	feedbackProseChars,
	formatFeedbackValidationError,
	isImageOnlyFeedback,
	MIN_FEEDBACK_PROSE_CHARS,
} from "../../shared/feedbackValidation/index.js";

/***
 * MARK: validateFeedbackForTask
 * @description Validates one human-feedback draft against a task's real
 *   attachments: dangling `assets/*` refs (bytes on neither disk nor the
 *   task branch) and image-only drafts refuse with `ok: false` and a
 *   caller-ready `error` naming every missing file. Unverifiable locations
 *   (no checkout or task id) fail open on presence — only the image-only
 *   rule still applies. Never throws.
 * @example validateFeedbackForTask({ text: 'Please add tests' }).ok => true
 * @example validateFeedbackForTask({ text: '![a](assets/gone.png)' }).ok => false
 * @example validateFeedbackForTask(null).ok => true
 * @param {Object} [args]
 * @param {string} [args.projectCwd] - Checkout root holding the task folder.
 * @param {string} [args.taskId]
 * @param {string} [args.branch] - Task branch (falls back to `kb/<taskId>`, like curation).
 * @param {Object|string} [args.docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @param {string} [args.text] - Draft text to validate.
 * @param {number} [args.minProseChars] - Prose bar (default `MIN_FEEDBACK_PROSE_CHARS`).
 * @returns {{ok: boolean, missing: Array, imageOnly: boolean, proseChars: number, error: string}} The decision.
 ***/
export function validateFeedbackForTask(args) {
	// Null-safe on purpose: this guard sits on every human-text route and
	// promises never to throw, so a missing argument reads as "nothing to
	// verify" (presence fails open, the image-only rule still applies).
	const { projectCwd, taskId, branch, docsProject, text, minProseChars } =
		args && typeof args === "object" ? args : {};
	const content = typeof text === "string" ? text : "";
	const bar =
		Number.isFinite(minProseChars) && minProseChars > 0
			? Math.floor(minProseChars)
			: MIN_FEEDBACK_PROSE_CHARS;
	let missing = [];
	try {
		missing = findMissingAssetRefs(projectCwd, taskId, content, docsProject);
		// Branch-flap second look (curation parity): the persisted task
		// branch wins, otherwise the `kb/<taskId>` derivation is attempted.
		// An unusable branch reads as "unknown" and keeps the warnings.
		if (missing.length > 0) {
			const branchName =
				typeof branch === "string" && branch
					? branch
					: taskId && taskId !== "unassigned"
						? `kb/${taskId}`
						: null;
			missing = filterBranchBackedRefs(
				projectCwd,
				branchName,
				taskId,
				missing,
				docsProject,
			);
		}
	} catch {
		missing = [];
	}
	const imageOnly = isImageOnlyFeedback(content, { minProseChars: bar });
	const error = formatFeedbackValidationError({
		missing: missing.map((entry) => entry?.ref).filter(Boolean),
		imageOnly,
		minProseChars: bar,
	});
	return {
		ok: missing.length === 0 && !imageOnly,
		missing,
		imageOnly,
		proseChars: feedbackProseChars(content),
		error,
	};
}
