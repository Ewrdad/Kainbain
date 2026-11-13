// Role: audit trail — who changed access, what changed, and when.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import fs from "node:fs";
import path from "node:path";

/***
 * MARK: AUDIT_FILENAME
 * @description Append-only audit log for sign-ins and every role, mapping,
 *   and settings change. One JSON object per line for easy tailing.
 * @example AUDIT_FILENAME => 'audit.jsonl'
 ***/
export const AUDIT_FILENAME = "audit.jsonl";

/***
 * MARK: auditFilePath
 * @description Absolute path of the audit log for a state dir.
 * @example auditFilePath('/tmp/x') => '/tmp/x/audit.jsonl'
 * @param {string} stateDir - Auth state directory.
 * @returns {string} Path of `audit.jsonl` inside it.
 ***/
export const auditFilePath = (stateDir) => path.join(stateDir, AUDIT_FILENAME);

/***
 * MARK: recordAuthAudit
 * @description Appends one audit entry (sign-in, role change, mapping
 *   change, settings change, logout). Never throws: audit must not break
 *   the action it records.
 * @example recordAuthAudit({ stateDir: '/tmp/x', actor: 'admin', action: 'user.role.set' }) => true
 * @param {Object} args - Labelled inputs.
 * @param {string} args.stateDir - Auth state directory.
 * @param {string} args.action - Machine-readable action name.
 * @param {string} [args.actor] - Who acted (user id, or 'system').
 * @param {Object} [args.detail] - Extra action context (no secrets).
 * @returns {boolean} True when the entry was appended.
 ***/
export const recordAuthAudit = ({ stateDir, action, actor, detail } = {}) => {
	if (typeof stateDir !== "string" || stateDir === "") return false;
	if (typeof action !== "string" || action === "") return false;
	try {
		if (!fs.existsSync(stateDir)) {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- state dir resolved by resolveAuthStateDir */
			fs.mkdirSync(stateDir, { recursive: true });
		}
		const entry = {
			at: new Date().toISOString(),
			actor: typeof actor === "string" && actor !== "" ? actor : "system",
			action,
			detail:
				detail && typeof detail === "object" && !Array.isArray(detail)
					? detail
					: {},
		};
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path built by auditFilePath from the resolved state dir */
		fs.appendFileSync(auditFilePath(stateDir), `${JSON.stringify(entry)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
};

/***
 * MARK: readAuthAudit
 * @description Reads the audit log back (newest first) for the per-key usage
 *   view. Corrupt lines are skipped, a missing log reads as empty — reading
 *   never throws.
 * @example readAuthAudit({ stateDir: '/tmp/x' }) => []
 * @param {Object} [args] - Labelled inputs.
 * @param {string} [args.stateDir] - Auth state directory.
 * @param {number} [args.limit] - Most entries to return (default 200).
 * @returns {Object[]} Audit entries, newest first.
 ***/
export const readAuthAudit = ({ stateDir, limit } = {}) => {
	if (typeof stateDir !== "string" || stateDir === "") return [];
	const max =
		Number.isFinite(Number(limit)) && Number(limit) > 0
			? Math.floor(Number(limit))
			: 200;
	let raw = "";
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path built by auditFilePath from the resolved state dir */
		raw = fs.readFileSync(auditFilePath(stateDir), "utf8");
	} catch {
		return [];
	}
	const entries = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object") entries.push(parsed);
		} catch {
			// skip corrupt lines
		}
	}
	return entries.reverse().slice(0, max);
};
