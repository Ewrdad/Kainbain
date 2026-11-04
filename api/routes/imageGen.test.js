import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import imageGenRoutes from "./imageGen.js";
import { MOCK_IMAGE_PNG_BASE64 } from "../imageGen/providers.js";

describe("imageGen routes", () => {
	let app;
	let tempDir;

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-image-gen-routes-test-"));
		delete process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY;
		delete process.env.KAINBAIN_IMAGE_GEN_MOCK_API_KEY;
		app = fastify();
		await app.register(imageGenRoutes, { deps: { imageGenDir: tempDir } });
		await app.ready();
	});

	afterEach(async () => {
		delete process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY;
		delete process.env.KAINBAIN_IMAGE_GEN_MOCK_API_KEY;
		try {
			await app?.close();
		} catch {
			// ignore teardown errors
		}
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("GET /settings/image-gen/providers lists providers with flags (never keys)", async () => {
		const res = await app.inject({ method: "GET", url: "/settings/image-gen/providers" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.providers.map((p) => p.id)).toEqual(["muse", "mock"]);
		expect(body.providers[0]).toMatchObject({
			id: "muse",
			requiresKey: true,
			configured: false,
			source: null,
		});
		expect(body.providers[1]).toMatchObject({ id: "mock", configured: true });
		expect(res.payload).not.toContain("sk-");
		for (const provider of body.providers) {
			expect(provider).not.toHaveProperty("key");
			expect(provider).not.toHaveProperty("apiKey");
		}
	});

	it("PUT stores a key and flips configured (round-trip via GET)", async () => {
		const put = await app.inject({
			method: "PUT",
			url: "/settings/image-gen/providers/muse/key",
			payload: { key: "sk-live-secret" },
		});
		expect(put.statusCode).toBe(200);
		expect(JSON.parse(put.payload)).toMatchObject({
			providerId: "muse",
			configured: true,
			source: "stored",
		});
		expect(put.payload).not.toContain("sk-live-secret");

		const get = await app.inject({ method: "GET", url: "/settings/image-gen/providers" });
		const muse = JSON.parse(get.payload).providers.find((p) => p.id === "muse");
		expect(muse).toMatchObject({ configured: true, source: "stored" });
	});

	it("PUT rejects unknown providers and invalid keys", async () => {
		const unknown = await app.inject({
			method: "PUT",
			url: "/settings/image-gen/providers/nope/key",
			payload: { key: "sk-x" },
		});
		expect(unknown.statusCode).toBe(400);
		expect(JSON.parse(unknown.payload).code).toBe("UNKNOWN_IMAGE_GEN_PROVIDER");

		const traversal = await app.inject({
			method: "PUT",
			url: "/settings/image-gen/providers/..%2F..%2Fx/key",
			payload: { key: "sk-x" },
		});
		expect(traversal.statusCode).toBe(400);

		const empty = await app.inject({
			method: "PUT",
			url: "/settings/image-gen/providers/muse/key",
			payload: { key: "   " },
		});
		expect(empty.statusCode).toBe(400);
		expect(JSON.parse(empty.payload).code).toBe("INVALID_IMAGE_GEN_KEY");
	});

	it("DELETE clears the stored key (env override stays honestly configured)", async () => {
		await app.inject({
			method: "PUT",
			url: "/settings/image-gen/providers/muse/key",
			payload: { key: "sk-live-secret" },
		});
		const cleared = await app.inject({
			method: "DELETE",
			url: "/settings/image-gen/providers/muse/key",
		});
		expect(cleared.statusCode).toBe(200);
		expect(JSON.parse(cleared.payload)).toMatchObject({
			providerId: "muse",
			configured: false,
		});

		process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY = "sk-from-env";
		const stillConfigured = await app.inject({
			method: "DELETE",
			url: "/settings/image-gen/providers/muse/key",
		});
		expect(JSON.parse(stillConfigured.payload)).toMatchObject({
			providerId: "muse",
			configured: true,
		});
		const get = await app.inject({ method: "GET", url: "/settings/image-gen/providers" });
		const muse = JSON.parse(get.payload).providers.find((p) => p.id === "muse");
		expect(muse).toMatchObject({ configured: true, source: "env" });
	});

	it("POST test runs the mock provider end to end", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/settings/image-gen/providers/mock/test",
			payload: {},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.ok).toBe(true);
		expect(body.bytes).toBe(Buffer.from(MOCK_IMAGE_PNG_BASE64, "base64").length);
		expect(typeof body.ms).toBe("number");
	});

	it("POST test on muse without a key answers 400 (no provider call)", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/settings/image-gen/providers/muse/test",
			payload: {},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload)).toMatchObject({ ok: false, code: "IMAGE_GEN_NO_KEY" });
	});

	it("POST test on an unknown provider answers 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/settings/image-gen/providers/nope/test",
			payload: {},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).ok).toBe(false);
	});
});
