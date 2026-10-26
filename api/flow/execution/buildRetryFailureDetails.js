import {
	excerptLog,
} from '../stageFailureRouting.js';
import { retryPromptLogBudget } from '../routing/tables/retryPromptLogBudget.js';

/***
 * MARK: buildRetryFailureDetails
 * @description Builds the failure-details section of a re-run prompt from the
 *   previous attempt: reason plus head+tail excerpts of prior stdout/stderr.
 *   Head+tail (not tail-only) so the stack-trace root — the part the next
 *   attempt must fix — survives truncation. Pure: returns null when there is
 *   nothing to report, never throws on malformed inputs.
 * @example buildRetryFailureDetails({ priorFailure: 'boom' }) => 'The previous stage failed …'
 * @param {Object} [inputs]
 * @param {string} [inputs.priorFailure] - Previous failure reason/message.
 * @param {string} [inputs.priorStdout] - Previous stdout (excerpted).
 * @param {string} [inputs.priorStderr] - Previous stderr (excerpted).
 * @param {string} [inputs.priorFailedStage] - Name of the failed stage, if known.
 * @param {string} [inputs.priorFailedStageType] - Type of the failed stage, if known.
 * @returns {string|null} Prompt section, or null when nothing failed before.
 ***/
export function buildRetryFailureDetails(inputs = {}) {
	try {
		// Normalize first: non-object inputs (null, strings, numbers) carry
		// no failure context and yield null, never a throw.
		const shaped = inputs && typeof inputs === "object" ? inputs : {};
		const {
			priorFailure,
			priorStdout,
			priorStderr,
			priorFailedStage,
			priorFailedStageType,
		} = shaped;
		if (!priorFailure && !priorStderr && !priorStdout) return null;
		const diagnosticParts = [];
		if (priorFailure) {
			diagnosticParts.push(`Error / Failure Reason:\n${priorFailure}`);
		}
		if (priorStdout && typeof priorStdout === "string" && priorStdout.trim()) {
			diagnosticParts.push(
				`Diagnostic Output (stdout / test execution):\n\`\`\`\n${excerptLog(priorStdout, retryPromptLogBudget)}\n\`\`\``,
			);
		}
		if (priorStderr && typeof priorStderr === "string" && priorStderr.trim()) {
			diagnosticParts.push(
				`Diagnostic Output (stderr):\n\`\`\`\n${excerptLog(priorStderr, retryPromptLogBudget)}\n\`\`\``,
			);
		}
		// Truthy-but-unusable inputs (e.g. a numeric stream) leave no
		// substantive section: report nothing rather than bare boilerplate.
		if (diagnosticParts.length === 0) return null;
		const reason = diagnosticParts.join("\n\n");
		if (priorFailedStage) {
			let typeSuffix = "";
			if (priorFailedStageType) {
				typeSuffix = ` (${priorFailedStageType})`;
			}
			return `The previous stage "${priorFailedStage}"${typeSuffix} failed before this stage was re-run. You MUST resolve these failures:\n\n${reason}`;
		}
		return `The previous stage failed before this stage was re-run. You MUST resolve these failures:\n\n${reason}`;
	} catch {
		return null;
	}
}
