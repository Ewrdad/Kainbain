import { parseAttestationToken } from "./parseAttestationToken.js";
import { parseAttestationTrailers } from "./parseAttestationTrailers.js";

/***
 * MARK: verifyAttestationLink
 * @description Checks one history-entry ↔ wrap-up-commit attestation link:
 *   the entry token and the commit trailers must name the same task, stage,
 *   and config hash, and the entry's commit SHA must equal the commit's own
 *   SHA. Reports every problem instead of failing fast, so one run shows
 *   the whole gap. A clean-tree attestation (token `commit=none`, no commit
 *   supplied) links on the entry alone. Total — missing evidence on either
 *   side is a reported problem, never a throw.
 * @example verifyAttestationLink({ historyAction: '… [attestation task=t stage=5 config=sha256:abc commit=none]', commitBody: null, commitSha: null }).linked => true
 * @param {Object} [input] - Labelled inputs.
 * @param {string|null} [input.historyAction] - History entry action line.
 * @param {string|null} [input.commitBody] - Full commit message body.
 * @param {string|null} [input.commitSha] - The commit's own SHA (`git rev-parse`), or null when no commit exists.
 * @returns {{linked: boolean, problems: Array<string>, history: Object|null, commit: Object}} Link report.
 ***/
export function verifyAttestationLink(input) {
	const commit = parseAttestationTrailers(input?.commitBody);
	const history = parseAttestationToken(input?.historyAction);
	const problems = [];
	if (!history) {
		problems.push("history entry carries no attestation token");
		return { linked: false, problems, history, commit };
	}
	const commitAttested =
		typeof commit.configHash === "string" && commit.configHash.trim();
	if (!commitAttested && history.commitSha !== null) {
		problems.push("commit body carries no attestation trailers");
	}
	if (commitAttested) {
		if (history.taskId !== commit.taskId) {
			problems.push(
				`task mismatch: history names ${history.taskId}, commit names ${commit.taskId}`,
			);
		}
		if (history.stageId !== commit.stageId) {
			problems.push(
				`stage mismatch: history names ${history.stageId}, commit names ${commit.stageId}`,
			);
		}
		if (history.configHash !== commit.configHash) {
			problems.push(
				`config hash mismatch: history ${history.configHash} vs commit ${commit.configHash}`,
			);
		}
	}
	const actualSha =
		typeof input?.commitSha === "string" && input.commitSha.trim()
			? input.commitSha.trim()
			: null;
	if (history.commitSha && !actualSha) {
		problems.push(
			`history names commit ${history.commitSha} but no commit was supplied`,
		);
	} else if (!history.commitSha && actualSha) {
		problems.push(
			`history records a clean tree but commit ${actualSha} was supplied`,
		);
	} else if (
		history.commitSha &&
		actualSha &&
		history.commitSha.toLowerCase() !== actualSha.toLowerCase()
	) {
		problems.push(
			`commit mismatch: history names ${history.commitSha} but the commit is ${actualSha}`,
		);
	}
	return { linked: problems.length === 0, problems, history, commit };
}
