// Domain: Web Push — general notification preferences storage.
/***
 * MARK: push settings store
 * @description Atomic JSON persistence for the General App Settings
 *   notification preferences at `<dir>/push-settings.json`:
 *   `{ enabled, triggers: { queueEmpty, unrecoverableStageError, schedulerStall }, stages }`.
 *   The `stages` namespace is reserved for future per-stage overrides
 *   (stage-specific rules land there without a migration). Missing files
 *   read as defaults; partial patches merge; unknown trigger keys are
 *   rejected so typos fail loudly instead of silently doing nothing.
 * @example updatePushSettings({ dir }, { triggers: { queueEmpty: false } })
 ***/
import fs from "node:fs";
import path from "node:path";
import { writePushJsonFile } from "./atomicWrite.js";

export const PUSH_SETTINGS_FILE_NAME = "push-settings.json";

export const KNOWN_TRIGGERS = Object.freeze([
	"queueEmpty",
	"unrecoverableStageError",
	"schedulerStall",
]);

/***
 * MARK: defaultPushSettings
 * @description Fresh defaults (new object per call — callers may mutate).
 * @returns {{ enabled: boolean, triggers: Object, stages: Object }}
 ***/
export function defaultPushSettings() {
	return {
		enabled: true,
		triggers: {
			queueEmpty: true,
			unrecoverableStageError: true,
			schedulerStall: true,
		},
		stages: {},
	};
}

/***
 * MARK: normalizePushSettings
 * @description Merges a raw payload over defaults; throws on type violations.
 * @param {*} raw
 * @returns {{ enabled: boolean, triggers: Object, stages: Object }}
 ***/
export function normalizePushSettings(raw) {
	const base = defaultPushSettings();
	if (raw === undefined || raw === null) return base;
	if (typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Invalid push settings: expected an object");
	}
	if (raw.enabled !== undefined) {
		if (typeof raw.enabled !== "boolean") {
			throw new Error("Invalid push settings: enabled must be a boolean");
		}
		base.enabled = raw.enabled;
	}
	if (raw.triggers !== undefined) {
		if (!raw.triggers || typeof raw.triggers !== "object" || Array.isArray(raw.triggers)) {
			throw new Error("Invalid push settings: triggers must be an object");
		}
		for (const key of Object.keys(raw.triggers)) {
			if (!KNOWN_TRIGGERS.includes(key)) {
				throw new Error(`Invalid push settings: unknown trigger "${key}"`);
			}
			/* eslint-disable-next-line security/detect-object-injection -- key validated against KNOWN_TRIGGERS above */
			const value = raw.triggers[key];
			if (typeof value !== "boolean") {
				throw new Error(`Invalid push settings: triggers.${key} must be a boolean`);
			}
			/* eslint-disable-next-line security/detect-object-injection -- key validated against KNOWN_TRIGGERS above */
			base.triggers[key] = value;
		}
	}
	if (raw.stages !== undefined) {
		if (!raw.stages || typeof raw.stages !== "object" || Array.isArray(raw.stages)) {
			throw new Error("Invalid push settings: stages must be an object");
		}
		base.stages = { ...raw.stages };
	}
	return base;
}

function settingsPath(dir) {
	return path.join(dir, PUSH_SETTINGS_FILE_NAME);
}

/***
 * MARK: getPushSettings
 * @description Reads persisted settings merged over defaults.
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Push state dir (required).
 * @returns {{ enabled: boolean, triggers: Object, stages: Object }}
 ***/
export function getPushSettings({ dir } = {}) {
	if (!dir) throw new Error("getPushSettings requires a dir");
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned push state, not request input */
		const raw = fs.readFileSync(settingsPath(dir), "utf8");
		return normalizePushSettings(JSON.parse(raw));
	} catch (error) {
		if (error?.message?.startsWith("Invalid push settings")) throw error;
		return defaultPushSettings();
	}
}

/***
 * MARK: updatePushSettings
 * @description Applies a partial patch over persisted settings and saves.
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Push state dir (required).
 * @param {Object} [patch] - Partial settings (`{ enabled?, triggers?, stages? }`).
 * @returns {{ enabled: boolean, triggers: Object, stages: Object }}
 ***/
export function updatePushSettings({ dir, patch } = {}) {
	if (!dir) throw new Error("updatePushSettings requires a dir");
	// A persisted-but-invalid file must not wedge future saves: merge over
	// defaults instead (the invalid patch itself still throws loudly below,
	// so typos keep failing with a 400 rather than silently doing nothing).
	let current;
	try {
		current = getPushSettings({ dir });
	} catch (error) {
		if (String(error?.message || "").startsWith("Invalid push settings")) {
			current = defaultPushSettings();
		} else {
			throw error;
		}
	}
	const merged = normalizePushSettings({
		enabled: patch?.enabled ?? current.enabled,
		triggers: { ...current.triggers, ...(patch?.triggers || {}) },
		stages: patch?.stages ?? current.stages,
	});
	writePushJsonFile(dir, PUSH_SETTINGS_FILE_NAME, merged);
	return merged;
}
