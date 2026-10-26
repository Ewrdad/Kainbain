// Domain: default prompt layout — server-owned persistence and health.
// Mirrors the push-settings atomic-store posture: missing/corrupt files read
// as defaults on GET (never wedging the settings UI), invalid writes fail
// loudly, and every write is tmp-file + rename so a crash never leaves a
// half-written layout behind.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	DEFAULT_PROMPT_LAYOUT,
	validatePromptLayout,
} from "../../shared/promptLayout.js";

export const PROMPT_LAYOUT_FILE_NAME = "prompt-layout.json";

/***
 * MARK: FALLBACK_DEGRADE_THRESHOLD
 * @description Consecutive render fallbacks before the layout counts as
 *   degraded: the engine keeps serving the canonical layout automatically
 *   and the settings UI shows a review banner (the Step-6 request-for-help
 *   surface — the fallback itself stays silent per-task).
 * @example FALLBACK_DEGRADE_THRESHOLD => 5
 ***/
export const FALLBACK_DEGRADE_THRESHOLD = 5;

/***
 * MARK: resolvePromptLayoutDir
 * @description Default on-disk home for the prompt layout file. Explicit
 *   `KAINBAIN_PROMPT_LAYOUT_DIR` wins (tests and isolated deploys);
 *   otherwise `~/.kainbain/prompt-layout`, mirroring the push-state
 *   `~/.kainbain/push` convention.
 * @example resolvePromptLayoutDir() => "/home/server/.kainbain/prompt-layout"
 ***/
export function resolvePromptLayoutDir() {
	const override =
		typeof process.env.KAINBAIN_PROMPT_LAYOUT_DIR === "string"
			? process.env.KAINBAIN_PROMPT_LAYOUT_DIR.trim()
			: "";
	if (override) return override;
	return path.join(os.homedir(), ".kainbain", "prompt-layout");
}

function layoutPath(dir) {
	return path.join(dir, PROMPT_LAYOUT_FILE_NAME);
}

// Monotonic counter so concurrent writes from this process never share a
// tmp file (the pid alone collides when two PUTs race in one process).
let tmpWriteCounter = 0;

/***
 * MARK: writeLayoutJsonFile
 * @description Crash-safe JSON write for layout state: tmp-file + rename so
 *   readers never see a half-written file.
 * @param {string} dir - Server-owned layout state dir (created when missing).
 * @param {*} value - JSON-serializable state.
 * @returns {string} The absolute target path written.
 ***/
export function writeLayoutJsonFile(dir, value) {
	if (!dir || typeof dir !== "string") {
		throw new Error("writeLayoutJsonFile requires a dir");
	}
	const resolvedDir = path.resolve(dir);
	const target = path.join(resolvedDir, PROMPT_LAYOUT_FILE_NAME);
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned layout state, not request input */
	fs.mkdirSync(resolvedDir, { recursive: true });
	tmpWriteCounter += 1;
	const tmp = path.join(
		resolvedDir,
		`.${PROMPT_LAYOUT_FILE_NAME}.tmp-${process.pid}-${tmpWriteCounter}`,
	);
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned layout state, not request input */
	fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned layout state, not request input */
		fs.chmodSync(tmp, 0o600);
	} catch {
		// Best-effort: the write mode already requested 0600.
	}
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned layout state, not request input */
	fs.renameSync(tmp, target);
	return target;
}

function readStoredState(dir) {
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned layout state, not request input */
	const raw = fs.readFileSync(layoutPath(dir), "utf8");
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	return parsed;
}

function storedLayoutOrNull(stored) {
	const layout = stored?.layout ?? null;
	if (layout === null) return null;
	if (typeof layout !== "string") return null;
	if (!validatePromptLayout(layout).ok) return null;
	return layout;
}

function storedFallbackCount(stored) {
	const count = stored?.consecutiveFallbacks;
	return typeof count === "number" && Number.isFinite(count) && count > 0
		? Math.floor(count)
		: 0;
}

/***
 * MARK: getPromptLayoutState
 * @description Reads the persisted layout state merged over defaults. A
 *   missing, corrupt, or invalid file reads as the default layout (the
 *   settings UI keeps working; the next PUT overwrites the bad file).
 * @example getPromptLayoutState({ dir: '/tmp/kb-x' }).isDefault => true
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Layout state dir (required).
 * @returns {{ layout: string, isDefault: boolean, consecutiveFallbacks: number, degraded: boolean }}
 ***/
export function getPromptLayoutState({ dir } = {}) {
	if (!dir) throw new Error("getPromptLayoutState requires a dir");
	let stored = null;
	try {
		stored = readStoredState(dir);
	} catch {
		stored = null;
	}
	const layout = storedLayoutOrNull(stored) ?? DEFAULT_PROMPT_LAYOUT;
	const consecutiveFallbacks = storedFallbackCount(stored);
	return {
		layout,
		isDefault: storedLayoutOrNull(stored) === null,
		consecutiveFallbacks,
		degraded: consecutiveFallbacks >= FALLBACK_DEGRADE_THRESHOLD,
	};
}

/***
 * MARK: getActivePromptLayout
 * @description Returns the custom layout string, or null when the default
 *   layout is active. The engine treats null as "today's code path".
 * @example getActivePromptLayout({ dir: '/tmp/kb-x' }) => null
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Layout state dir (required).
 * @returns {string|null} Custom layout markdown, or null for default.
 ***/
export function getActivePromptLayout({ dir } = {}) {
	if (!dir) throw new Error("getActivePromptLayout requires a dir");
	try {
		return storedLayoutOrNull(readStoredState(dir));
	} catch {
		return null;
	}
}

/***
 * MARK: updatePromptLayout
 * @description Validates and persists a new default layout. Invalid layouts
 *   throw an `Invalid prompt layout` error (the route maps it to a 400) and
 *   never touch the stored file.
 * @example updatePromptLayout({ dir, layout: DEFAULT_PROMPT_LAYOUT }).isDefault => false
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Layout state dir (required).
 * @param {string} [opts.layout] - New layout markdown.
 * @returns {{ layout: string, isDefault: boolean, consecutiveFallbacks: number, degraded: boolean }}
 ***/
export function updatePromptLayout({ dir, layout } = {}) {
	if (!dir) throw new Error("updatePromptLayout requires a dir");
	const validation = validatePromptLayout(layout);
	if (!validation.ok) {
		const detail = validation.errors.join(" ");
		throw new Error(`Invalid prompt layout: ${detail}`);
	}
	let consecutiveFallbacks = 0;
	try {
		consecutiveFallbacks = storedFallbackCount(readStoredState(dir));
	} catch {
		consecutiveFallbacks = 0;
	}
	writeLayoutJsonFile(dir, {
		layout,
		updatedAt: new Date().toISOString(),
		consecutiveFallbacks,
	});
	return getPromptLayoutState({ dir });
}

/***
 * MARK: resetPromptLayout
 * @description Restores the factory default layout and clears the fallback
 *   counter (a reset is a fresh start, not a degraded one).
 * @example resetPromptLayout({ dir }).isDefault => true
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Layout state dir (required).
 * @returns {{ layout: string, isDefault: boolean, consecutiveFallbacks: number, degraded: boolean }}
 ***/
export function resetPromptLayout({ dir } = {}) {
	if (!dir) throw new Error("resetPromptLayout requires a dir");
	writeLayoutJsonFile(dir, {
		layout: null,
		updatedAt: new Date().toISOString(),
		consecutiveFallbacks: 0,
	});
	return getPromptLayoutState({ dir });
}

/***
 * MARK: recordPromptLayoutFallback
 * @description Records one render fallback to the canonical layout. Called
 *   by the engine whenever a custom layout is bypassed at render time.
 * @example recordPromptLayoutFallback({ dir }).consecutiveFallbacks => 1
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Layout state dir (required).
 * @returns {{ consecutiveFallbacks: number, degraded: boolean }}
 ***/
export function recordPromptLayoutFallback({ dir } = {}) {
	if (!dir) throw new Error("recordPromptLayoutFallback requires a dir");
	let stored = null;
	try {
		stored = readStoredState(dir);
	} catch {
		stored = null;
	}
	const consecutiveFallbacks = storedFallbackCount(stored) + 1;
	writeLayoutJsonFile(dir, {
		layout: storedLayoutOrNull(stored),
		updatedAt:
			stored && typeof stored.updatedAt === "string" ? stored.updatedAt : null,
		consecutiveFallbacks,
	});
	return {
		consecutiveFallbacks,
		degraded: consecutiveFallbacks >= FALLBACK_DEGRADE_THRESHOLD,
	};
}

/***
 * MARK: recordPromptLayoutSuccess
 * @description Clears the consecutive-fallback counter after a custom layout
 *   renders cleanly. Writes only when a counter is actually set, so default
 *   installs never gain a state file just by running tasks.
 * @example recordPromptLayoutSuccess({ dir }) => undefined
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Layout state dir (required).
 ***/
export function recordPromptLayoutSuccess({ dir } = {}) {
	if (!dir) throw new Error("recordPromptLayoutSuccess requires a dir");
	let stored = null;
	try {
		stored = readStoredState(dir);
	} catch {
		return;
	}
	if (storedFallbackCount(stored) === 0) return;
	writeLayoutJsonFile(dir, {
		layout: storedLayoutOrNull(stored),
		updatedAt:
			stored && typeof stored.updatedAt === "string" ? stored.updatedAt : null,
		consecutiveFallbacks: 0,
	});
}
