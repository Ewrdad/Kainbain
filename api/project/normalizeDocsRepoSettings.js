// Domain: Separate docs repo — tolerant read-path normalizer (one function
// per file; see `./docsRepo.js` for the barrel).
import path from "node:path";
import { redactCredentials } from "../git/validation.js";
import { DOCS_REPO_BRANCH_MODE_SYNCED } from "./docsRepoConstants.js";
import { isValidDocsRepoUrl } from "./isValidDocsRepoUrl.js";
import { isValidDocsRepoLocalPath } from "./isValidDocsRepoLocalPath.js";
import { hasDocsRepo } from "./hasDocsRepo.js";

/***
 * MARK: normalizeDocsRepoSettings
 * @description Tolerant read-path normalizer for `docsRepo` found on a source
 *   object (loaded project.json, in-memory project). Only keys present on
 *   the source are returned, so spreading never invents keys; invalid fields
 *   degrade to absent (write paths 400 strictly beforehand). The URL is
 *   credential-redacted here too, so a hand-edited config with a token never
 *   reaches an API response. Idempotent.
 * @example normalizeDocsRepoSettings({ docsRepo: { url: 'https://t@git.example.com/me/kb.git' } }) => { docsRepo: { url: 'https://git.example.com/me/kb.git', branchMode: 'synced' } }
 * @param {Object} [source]
 * @returns {{docsRepo?: {url?: string, localPath?: string, branchMode?: string}}}
 ***/
export function normalizeDocsRepoSettings(source) {
	const normalized = {};
	if (!source || typeof source !== "object") return normalized;
	const raw = source.docsRepo;
	if (raw === undefined) return normalized;
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		normalized.docsRepo = undefined;
		return normalized;
	}
	const out = {};
	if (raw.url !== undefined && raw.url !== null) {
		if (isValidDocsRepoUrl(raw.url)) out.url = redactCredentials(raw.url.trim());
		else out.url = undefined;
	}
	if (raw.localPath !== undefined && raw.localPath !== null) {
		if (isValidDocsRepoLocalPath(raw.localPath)) out.localPath = path.resolve(raw.localPath.trim());
		else out.localPath = undefined;
	}
	if (raw.branchMode !== undefined && raw.branchMode !== null) {
		out.branchMode = raw.branchMode === DOCS_REPO_BRANCH_MODE_SYNCED ? DOCS_REPO_BRANCH_MODE_SYNCED : undefined;
	}
	// An object with no usable field at all clears the setting.
	if (!hasDocsRepo({ docsRepo: out })) {
		normalized.docsRepo = undefined;
		return normalized;
	}
	if (out.url === undefined) delete out.url;
	if (out.localPath === undefined) delete out.localPath;
	if (!out.branchMode) out.branchMode = DOCS_REPO_BRANCH_MODE_SYNCED;
	normalized.docsRepo = out;
	return normalized;
}
