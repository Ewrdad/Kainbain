import { GIT_FAILURE_KINDS } from "./gitFailureKinds.js";

const BINARY_GUARD_SIGNATURE = /binary-guard check FAILED/i;
const HOOK_NAME_PATTERN = /(pre-commit|pre-push|pre-receive|pre-merge-commit|commit-msg|post-merge|pre-rebase|pre-applypatch|pre-auto-gc)\b/i;
const HOOK_MENTION_PATTERN = /\bhooks?\b|pre-commit|pre-push|pre-receive|commit-msg|pre-merge-commit/i;
const GUARD_FILE_LINE = /:\s*expected magic\s+\S+?,?\s*found\s+/i;

const BINARY_GUARD_REMEDY =
	"Re-capture each corrupt file with `node scripts/capture-screenshot.mjs --out <path>` or restore it binary-safely with " +
	"`git checkout <ref> -- <path>`, then re-verify with `xxd -l 8 <path>` and `file <path>`. Never create, edit, or restore " +
	"binaries with text tools. `git commit --no-verify` bypasses this guard — use it only as a deliberate manual escape hatch " +
	"to land an intentional baseline, never for new damage.";

const GUARD_UNUSABLE_REMEDY =
	"The binary guard itself could not run (see the hook output above) — fix the hook invocation (node on PATH, a valid repo " +
	"root), then retry the stage. `git commit --no-verify` bypasses the guard — use it only as a deliberate manual escape hatch.";

const GENERIC_HOOK_REMEDY =
	"Inspect the hook output above, fix or unstage the reported files, then retry the stage. `git commit --no-verify` skips " +
	"commit hooks — use it only as a deliberate manual escape hatch, never automatically.";

const COMMIT_REMEDY =
	"Inspect the git output above for the cause (tree state, identity, or repo config), fix it in the worktree, then retry the stage.";

/***
 * MARK: parseHookFailure
 * @description Classifies one failed git commit/merge from its captured
 *   output. A binary-guard rejection (`binary-guard check FAILED` plus
 *   per-file `<relPath>: expected magic …` lines) yields kind
 *   `hook-rejected` with the affected files and the concrete re-capture
 *   remedy; any other hook mention (a `pre-commit:` wrapper line, a
 *   `hook` word) yields `hook-rejected` with a best-effort hook name (or
 *   `"unknown"`), no files, the full output preserved, and the generic
 *   remedy; output with no hook marker at all yields `commit-failed`.
 *   Never throws: foreign hooks with arbitrary stderr degrade to the
 *   generic branch with their output intact, and non-string inputs coerce
 *   to empty. Caps are NOT applied here — `buildGitFailureDetails` owns
 *   truncation so every producer truncates identically.
 * @example parseHookFailure({ exitCode: 1, stderr: 'binary-guard check FAILED (1 corrupt binary):\n  a.png: expected magic 89504e47, found efbfbd' }).files => ['a.png']
 * @example parseHookFailure({ exitCode: 1, stderr: 'gpg failed to sign' }).kind => 'commit-failed'
 * @param {Object} [input] - `{ command, exitCode, stdout, stderr }`.
 * @returns {{ kind: string, hookName: string|null, files: string[], hookOutput: string, remedy: string }} Parsed hook failure (uncapped).
 ***/
export function parseHookFailure(input = {}) {
	// `command`/`exitCode` ride along for forward compatibility (callers
	// pass what they captured); classification reads the output only.
	const coerce = (value) => {
		if (typeof value === "string") return value;
		try {
			return String(value ?? "");
		} catch {
			return "";
		}
	};
	const { stdout = "", stderr = "" } = input && typeof input === "object" ? input : {};
	const out = coerce(stdout);
	const err = coerce(stderr);
	// The hook's own voice (stderr) reads first; command stdout follows when
	// a chatty hook wrote to both.
	const hookOutput = [err.trim(), out.trim()].filter(Boolean).join("\n");

	if (BINARY_GUARD_SIGNATURE.test(hookOutput)) {
		const files = [];
		const seen = new Set();
		for (const line of hookOutput.split("\n")) {
			const at = line.search(GUARD_FILE_LINE);
			if (at === -1) continue;
			const rel = line
				.slice(0, at)
				.trim()
				.replace(/^[-\s*]+/, "")
				.replace(/^(?:pre-commit|pre-push|commit-msg)\s*:\s*/i, "")
				.trim();
			if (!rel || seen.has(rel)) continue;
			seen.add(rel);
			files.push(rel);
		}
		const nameMatch = hookOutput.match(HOOK_NAME_PATTERN);
		return {
			kind: GIT_FAILURE_KINDS.HOOK_REJECTED,
			hookName: nameMatch ? nameMatch[1].toLowerCase() : "pre-commit",
			files,
			hookOutput,
			remedy: files.length > 0 ? BINARY_GUARD_REMEDY : GUARD_UNUSABLE_REMEDY,
		};
	}

	if (HOOK_MENTION_PATTERN.test(hookOutput)) {
		const nameMatch = hookOutput.match(HOOK_NAME_PATTERN);
		return {
			kind: GIT_FAILURE_KINDS.HOOK_REJECTED,
			hookName: nameMatch ? nameMatch[1].toLowerCase() : "unknown",
			files: [],
			hookOutput,
			remedy: GENERIC_HOOK_REMEDY,
		};
	}

	return {
		kind: GIT_FAILURE_KINDS.COMMIT_FAILED,
		hookName: null,
		files: [],
		hookOutput,
		remedy: COMMIT_REMEDY,
	};
}
