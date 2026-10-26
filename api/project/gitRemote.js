import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { redactCredentials } from "../git.js";

/***
 * MARK: resolveDefaultGitRemote
 * @description Resolves the default git remote for a project slug from
 *   `KAINBAIN_GIT_REMOTE_TEMPLATE`, expanding `${SLUG}`, `${NAME}`, and
 *   `${USER}` (`USER`/`USERNAME` from the environment). A blank or unset
 *   template means NO remote (returns null) — the only honest default for
 *   unknown hosting; callers must skip `git remote add` and persist
 *   `gitUrl`/`gitRepo` as null rather than fabricating a host.
 * @example resolveDefaultGitRemote('my-app') => null // template unset
 * @param {string} slug - Project slug for `${SLUG}` expansion.
 * @param {Object} [opts]
 * @param {string} [opts.name] - Project display name for `${NAME}` expansion.
 * @returns {string|null} Expanded remote URL, or null when no template is configured.
 ***/
export function resolveDefaultGitRemote(slug, { name } = {}) {
	const template = (process.env.KAINBAIN_GIT_REMOTE_TEMPLATE || "").trim();
	if (!template) return null;
	const user = (process.env.USER || process.env.USERNAME || "").trim();
	return template
		.split("${SLUG}")
		.join(slug || "")
		.split("${NAME}")
		.join(name || slug || "")
		.split("${USER}")
		.join(user);
}

/***
 * MARK: detectGitRemote
 * @description Inspects git remotes in a project directory to check for an upstream origin remote URL.
 *   The returned `repoUrl` is credential-redacted (see `redactCredentials`):
 *   safe for `repoUrl` persistence, API responses, and logs. Git operations
 *   read the live remote from `.git/config` directly, never this value.
 * @example detectGitRemote('/path/to/project') => { hasUpstreamRepo: true, repoUrl: 'https://git.example.com/user/repo.git' }
 * @param {string} projectDir
 * @returns {{ hasUpstreamRepo: boolean, repoUrl: string|null }}
 ***/
export function detectGitRemote(projectDir) {
	if (!projectDir || typeof projectDir !== "string") {
		return { hasUpstreamRepo: false, repoUrl: null };
	}
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		const gitDir = path.join(projectDir, ".git");
		if (!fs.existsSync(gitDir)) {
			return { hasUpstreamRepo: false, repoUrl: null };
		}
		const stdout = execFileSync("git", ["config", "--get", "remote.origin.url"], {
			cwd: projectDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		/* eslint-enable security/detect-non-literal-fs-filename */
		if (stdout) {
			return { hasUpstreamRepo: true, repoUrl: redactCredentials(stdout) };
		}
	} catch {
		// Non-blocking: remote not configured or git not available
	}
	return { hasUpstreamRepo: false, repoUrl: null };
}
