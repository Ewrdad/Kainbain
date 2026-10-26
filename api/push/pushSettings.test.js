// Domain: Web Push — push settings store tests.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	defaultPushSettings,
	getPushSettings,
	normalizePushSettings,
	updatePushSettings,
} from "./pushSettings.js";

let dirs = [];

function makeDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-settings-test-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of dirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	}
	dirs = [];
});

/***
 * MARK: push settings tests
 * @description Defaults, partial patches, unknown-trigger rejection, and the
 *   reserved `stages` extensibility namespace — all on isolated temp dirs.
 ***/
describe("push settings store", () => {
	it("returns enabled defaults when nothing is stored", () => {
		expect(getPushSettings({ dir: makeDir() })).toEqual({
			enabled: true,
			triggers: { queueEmpty: true, unrecoverableStageError: true, schedulerStall: true },
			stages: {},
		});
	});

	it("requires a dir", () => {
		expect(() => getPushSettings({})).toThrow();
		expect(() => updatePushSettings({ patch: {} })).toThrow();
	});

	it("applies partial patches and persists them", () => {
		const dir = makeDir();
		const updated = updatePushSettings({
			dir,
			patch: { triggers: { queueEmpty: false } },
		});
		expect(updated.triggers.queueEmpty).toBe(false);
		expect(updated.triggers.unrecoverableStageError).toBe(true);
		expect(updated.triggers.schedulerStall).toBe(true);
		expect(updated.enabled).toBe(true);
		expect(getPushSettings({ dir })).toEqual(updated);
	});

	it("merges stored settings from before a new trigger existed onto current defaults", () => {
		// Backward compatibility: a push-settings.json written when only two
		// triggers existed must not lose the new schedulerStall default, and
		// must not re-enable a trigger the operator turned off.
		const dir = makeDir();
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "push-settings.json"),
			JSON.stringify({ enabled: true, triggers: { queueEmpty: false }, stages: {} }),
			"utf8",
		);
		const settings = getPushSettings({ dir });
		expect(settings.triggers).toEqual({
			queueEmpty: false,
			unrecoverableStageError: true,
			schedulerStall: true,
		});
		expect(updatePushSettings({ dir, patch: { triggers: { schedulerStall: false } } }).triggers).toEqual({
			queueEmpty: false,
			unrecoverableStageError: true,
			schedulerStall: false,
		});
	});

	it("toggles the master switch", () => {
		const dir = makeDir();
		expect(updatePushSettings({ dir, patch: { enabled: false } }).enabled).toBe(false);
	});

	it("rejects unknown triggers", () => {
		const dir = makeDir();
		expect(() =>
			updatePushSettings({ dir, patch: { triggers: { winLottery: true } } }),
		).toThrow(/unknown trigger/);
	});

	it("rejects non-boolean values", () => {
		expect(() => normalizePushSettings({ enabled: "yes" })).toThrow();
		expect(() =>
			normalizePushSettings({ triggers: { queueEmpty: 1 } }),
		).toThrow();
	});

	it("keeps the stages namespace for future per-stage overrides", () => {
		const dir = makeDir();
		const updated = updatePushSettings({
			dir,
			patch: { stages: { impl: { notifyOnFailure: true } } },
		});
		expect(updated.stages).toEqual({ impl: { notifyOnFailure: true } });
		expect(getPushSettings({ dir }).stages).toEqual({
			impl: { notifyOnFailure: true },
		});
	});

	it("falls back to defaults on corrupt files", () => {
		const dir = makeDir();
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "push-settings.json"),
			"corrupt{{{",
			"utf8",
		);
		expect(getPushSettings({ dir })).toEqual(defaultPushSettings());
	});
});
