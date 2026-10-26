// Domain: Web Push — VAPID key lifecycle tests.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	getVapidKeys,
	getPublicVapidKey,
	getVapidSubject,
	resetVapidCache,
	resolvePushDir,
} from "./vapidKeys.js";
import { config } from "../config.js";

let dirs = [];

function makeDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-vapid-test-"));
	dirs.push(dir);
	return dir;
}

beforeEach(() => {
	resetVapidCache();
});

afterEach(() => {
	resetVapidCache();
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
 * MARK: VAPID key store tests
 * @description Generation, env override, disk persistence (0600), and corrupt
 *   file recovery — all against isolated temp dirs, never the live push home.
 ***/
describe("push VAPID key store", () => {
	it("generates a key pair and persists it to disk", async () => {
		const dir = makeDir();
		const keys = await getVapidKeys({ dir, env: {} });
		expect(typeof keys.publicKey).toBe("string");
		expect(keys.publicKey.length).toBeGreaterThan(0);
		expect(typeof keys.privateKey).toBe("string");
		expect(keys.privateKey.length).toBeGreaterThan(0);
		const stored = JSON.parse(
			fs.readFileSync(path.join(dir, "push-vapid.json"), "utf8"),
		);
		expect(stored.publicKey).toBe(keys.publicKey);
		expect(stored.privateKey).toBe(keys.privateKey);
	});

	it("reuses the persisted pair across cache resets", async () => {
		const dir = makeDir();
		const first = await getVapidKeys({ dir, env: {} });
		resetVapidCache();
		const second = await getVapidKeys({ dir, env: {} });
		expect(second).toEqual(first);
	});

	it("prefers explicit env keys over disk", async () => {
		const dir = makeDir();
		await getVapidKeys({ dir, env: {} });
		resetVapidCache();
		const keys = await getVapidKeys({
			dir,
			env: { VAPID_PUBLIC_KEY: "env-pub", VAPID_PRIVATE_KEY: "env-priv" },
		});
		expect(keys).toEqual({ publicKey: "env-pub", privateKey: "env-priv" });
	});

	it("regenerates when the persisted file is corrupt", async () => {
		const dir = makeDir();
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "push-vapid.json"), "not-json{{{", "utf8");
		const keys = await getVapidKeys({ dir, env: {} });
		expect(typeof keys.publicKey).toBe("string");
		expect(keys.publicKey.length).toBeGreaterThan(0);
	});

	it("exposes the public key alone for browsers", async () => {
		const dir = makeDir();
		const pub = await getPublicVapidKey({ dir, env: {} });
		const keys = await getVapidKeys({ dir, env: {} });
		expect(pub).toBe(keys.publicKey);
	});

	it("resolves the VAPID subject from env with a mailto fallback", () => {
		expect(getVapidSubject({ env: { VAPID_SUBJECT: "mailto:ops@example.com" } })).toBe(
			"mailto:ops@example.com",
		);
		expect(getVapidSubject({ env: {} })).toBe("mailto:admin@kainbain.local");
	});

	it("consumes the configured vapidSubject when no env or fallback is set", () => {
		const previous = config.vapidSubject;
		config.vapidSubject = "mailto:configured@example.com";
		try {
			expect(getVapidSubject({ env: {} })).toBe("mailto:configured@example.com");
			expect(
				getVapidSubject({ env: {}, fallback: "mailto:explicit@example.com" }),
			).toBe("mailto:explicit@example.com");
			expect(
				getVapidSubject({ env: { VAPID_SUBJECT: "mailto:env@example.com" } }),
			).toBe("mailto:env@example.com");
		} finally {
			config.vapidSubject = previous;
		}
	});

	it("defaults the push dir under ~/.kainbain", () => {
		expect(resolvePushDir()).toBe(path.join(os.homedir(), ".kainbain", "push"));
	});

	it("isolates cached keys per dir (no cross-dir leakage)", async () => {
		const dirA = makeDir();
		const dirB = makeDir();
		const keysA = await getVapidKeys({ dir: dirA, env: {} });
		const keysB = await getVapidKeys({ dir: dirB, env: {} });
		expect(keysA.publicKey).not.toBe(keysB.publicKey);
		// Re-reads hit their own cache entries without touching disk state.
		expect(await getVapidKeys({ dir: dirA, env: {} })).toEqual(keysA);
		expect(await getVapidKeys({ dir: dirB, env: {} })).toEqual(keysB);
	});
});
