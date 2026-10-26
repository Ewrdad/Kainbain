/***
 * MARK: reviewCommentFormatter
 * @description Pure helpers that turn sidecar review comments into readable
 *   markdown for human approval/rejection stage reports and downstream agent
 *   guidance. No filesystem access: pass plain comment records in.
 * @example formatCommentsMarkdown([{ filePath: 'a.md', line: 2, body: 'Fix this' }]) => '### `a.md`\n- Line 2: Fix this'
 ***/

/***
 * MARK: normalizeReportPath
 * @description Canonical report anchor: strips leading `./` prefixes (even
 *   repeated ones) so `docs/tasks/t-1/plan.md` and `./docs/tasks/t-1/plan.md`
 *   compare equal. Never strips `../` — traversal stays visible to validators.
 * @example normalizeReportPath('./docs/tasks/t-1/plan.md') => 'docs/tasks/t-1/plan.md'
 * @param {unknown} value - Candidate path value.
 * @returns {string} Canonical path (empty string when not a string).
 ***/
export function normalizeReportPath(value) {
	if (typeof value !== "string") return "";
	let trimmed = value.trim();
	while (trimmed.startsWith("./")) trimmed = trimmed.slice(2);
	return trimmed;
}

/***
 * MARK: reportPathVariants
 * @description Both stored spellings of a report path (bare and `./`-prefixed)
 *   so the review whitelist accepts whichever form the client anchored with.
 * @example reportPathVariants('docs/tasks/t-1/plan.md') => ['docs/tasks/t-1/plan.md', './docs/tasks/t-1/plan.md']
 * @param {unknown} value - Candidate path value.
 * @returns {string[]} Usable variants (empty when not a usable path).
 ***/
export function reportPathVariants(value) {
	const canonical = normalizeReportPath(value);
	if (!canonical) return [];
	return [canonical, `./${canonical}`];
}

function commentSortKey(comment) {
	const line = Number.isInteger(comment?.line) ? comment.line : Number.MAX_SAFE_INTEGER;
	return line;
}

/***
 * MARK: formatCommentsMarkdown
 * @description Groups review comments by file/report path (sorted by line),
 *   rendering each thread with its line anchor, author, body, resolved state,
 *   and replies. Empty input renders a short "no comments" line.
 * @example formatCommentsMarkdown([]) => '_No review comments._'
 * @param {Array} [comments] - Sidecar comment records.
 * @returns {string} GitHub-flavored markdown section body.
 ***/
export function formatCommentsMarkdown(comments = []) {
	const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
	if (list.length === 0) return "_No review comments._";
	const groups = new Map();
	for (const comment of list) {
		const key = comment.filePath || "(no file)";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(comment);
	}
	const lines = [];
	const orderedKeys = [...groups.keys()].sort((a, b) => String(a).localeCompare(String(b)));
	for (const key of orderedKeys) {
		lines.push(`### \`${key}\``);
		const threads = groups.get(key).slice().sort((a, b) => commentSortKey(a) - commentSortKey(b));
		for (const thread of threads) {
			const anchor =
				thread.scope === "line" && Number.isInteger(thread.line)
					? `Line ${thread.line}`
					: "File";
			const state = thread.resolved ? "resolved" : "open";
			const author = thread.author || "human";
			lines.push(`- ${anchor} (${state}, ${author}): ${thread.body || ""}`);
			for (const reply of thread.replies || []) {
				if (!reply) continue;
				lines.push(`  - Reply (${reply.author || "human"}): ${reply.body || ""}`);
			}
		}
		lines.push("");
	}
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines.join("\n");
}

/***
 * MARK: feedbackAlreadyContainsComments
 * @description True when human feedback already carries the review threads
 *   (the fail modal pre-fills its draft from unresolved comments), so the
 *   report writer must not append them a second time.
 * @example feedbackAlreadyContainsComments('## Review comments\n- hi', [{ body: 'hi' }]) => true
 * @param {unknown} feedback - Human feedback text.
 * @param {Array} [comments] - Sidecar comment records.
 * @returns {boolean} Whether the feedback already includes the threads.
 ***/
export function feedbackAlreadyContainsComments(feedback, comments = []) {
	const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
	if (list.length === 0) return true;
	const text = typeof feedback === "string" ? feedback : "";
	if (!text.trim()) return false;
	if (text.includes("## Review comments") || text.includes("## Review Comments")) return true;
	return list.every((comment) => {
		const body = String(comment?.body || "").trim();
		if (!body) return true;
		return text.includes(body);
	});
}

/***
 * MARK: buildHumanApprovalContent
 * @description Report body for a passed human checkpoint: the approval header
 *   plus the review threads (so a line-by-line pass still records what the
 *   reviewer said) and the optional guidance for downstream stages.
 * @example buildHumanApprovalContent({ stageName: 'Review', comments: [] }) => '# Human approval: Review...'
 * @param {Object} [opts]
 * @param {string} [opts.stageName] - Exiting checkpoint name.
 * @param {string} [opts.guidance] - Optional pass guidance text.
 * @param {Array} [opts.comments] - Sidecar comment records.
 * @returns {string} Full markdown report content.
 ***/
export function buildHumanApprovalContent({ stageName, guidance, comments = [] } = {}) {
	const name = stageName || "stage";
	const cleanGuidance = typeof guidance === "string" ? guidance.trim() : "";
	const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
	const sections = [`# Human approval: ${name}`, "**Status:** PASSED"];
	if (list.length > 0) {
		sections.push("", "## Review Comments", formatCommentsMarkdown(list));
	}
	if (cleanGuidance) {
		sections.push("", "## Guidance", cleanGuidance);
	} else if (list.length > 0) {
		sections.push(
			"",
			"## Guidance",
			"Approved with review comments attached for downstream stages to consider.",
		);
	}
	return sections.join("\n");
}

/***
 * MARK: buildHumanRejectionContent
 * @description Report body for a failed human checkpoint: the rejection header
 *   with feedback, plus review threads unless the feedback already carries
 *   them (the fail-modal draft path).
 * @example buildHumanRejectionContent({ feedback: 'fix it', comments: [] }) => '# Human rejection...'
 * @param {Object} [opts]
 * @param {string} [opts.feedback] - Human rejection feedback.
 * @param {Array} [opts.comments] - Sidecar comment records.
 * @returns {string} Full markdown report content.
 ***/
export function buildHumanRejectionContent({ feedback, comments = [] } = {}) {
	const cleanFeedback = typeof feedback === "string" ? feedback.trim() : "";
	const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
	const sections = ["# Human rejection", "**Status:** FAILED", "", cleanFeedback];
	if (list.length > 0 && !feedbackAlreadyContainsComments(cleanFeedback, list)) {
		sections.push("", "## Review Comments", formatCommentsMarkdown(list));
	}
	return sections.join("\n");
}

/***
 * MARK: buildCommentsGuidance
 * @description Downstream prompt text carrying review threads into the next
 *   stage's goal (`## Human Guidance`), optionally combined with pass guidance.
 * @example buildCommentsGuidance({ guidance: 'ship it', comments: [{ filePath: 'a', body: 'x' }] }) => 'ship it\n\n## Review Comments...'
 * @param {Object} [opts]
 * @param {string} [opts.guidance] - Optional pass guidance text.
 * @param {Array} [opts.comments] - Sidecar comment records.
 * @returns {string} Guidance text (empty when there is nothing to carry).
 ***/
export function buildCommentsGuidance({ guidance, comments = [] } = {}) {
	const cleanGuidance = typeof guidance === "string" ? guidance.trim() : "";
	const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
	if (list.length === 0) return cleanGuidance;
	const formatted = formatCommentsMarkdown(list);
	if (!cleanGuidance) {
		return `Review comments to consider:\n\n${formatted}`;
	}
	if (feedbackAlreadyContainsComments(cleanGuidance, list)) return cleanGuidance;
	return `${cleanGuidance}\n\n## Review Comments\n${formatted}`;
}
