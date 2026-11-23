import { describe, it, expect } from "vitest";
import Fastify from "fastify";

/***
 * MARK: Fastify default JSON body limit pin
 * @description Pins Fastify's default 1 MiB JSON body ceiling on a bare
 *   instance built with the same options as `api/index.js`
 *   (`fastify({ logger })`, no `bodyLimit`): bodies over 1 MiB are
 *   rejected with 413 `FST_ERR_CTP_BODY_TOO_LARGE`, bodies under pass.
 *   The 413 completion-payload fix (task d164fb3f) raises the limit ONLY
 *   on the runner `complete-execution` route — this pin guards every
 *   other route's default. Passes before and after that change.
 ***/
describe("Fastify default JSON body limit (1 MiB pin)", () => {
	it("rejects a >1 MiB JSON body with 413 FST_ERR_CTP_BODY_TOO_LARGE", async () => {
		const app = Fastify({ logger: false });
		try {
			app.post("/probe", async () => ({ ok: true }));
			const res = await app.inject({
				method: "POST",
				url: "/probe",
				payload: { blob: "x".repeat(1024 * 1024 + 1024) },
			});
			expect(res.statusCode).toBe(413);
			expect(JSON.parse(res.payload)).toMatchObject({
				code: "FST_ERR_CTP_BODY_TOO_LARGE",
			});
		} finally {
			await app.close();
		}
	});

	it("accepts a JSON body just under 1 MiB", async () => {
		const app = Fastify({ logger: false });
		try {
			app.post("/probe", async () => ({ ok: true }));
			const res = await app.inject({
				method: "POST",
				url: "/probe",
				payload: { blob: "x".repeat(1024 * 1024 - 4096) },
			});
			expect(res.statusCode).toBe(200);
			expect(JSON.parse(res.payload)).toEqual({ ok: true });
		} finally {
			await app.close();
		}
	});
});
