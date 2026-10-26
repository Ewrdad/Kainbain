import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import promptLayoutRoutes from "./promptLayout.js";
import { DEFAULT_PROMPT_LAYOUT, MAX_LAYOUT_CHARS } from "../../shared/promptLayout.js";
import { PromptCurationEngine } from "../promptCuration.js";

describe("promptLayout routes", () => {
	let app;
	let tempDir;

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-prompt-layout-routes-test-"));
		const engine = new PromptCurationEngine({
			promptLayoutDir: tempDir,
			loadSkill: () => null,
		});
		app = fastify();
		await app.register(promptLayoutRoutes, {
			deps: {
				promptLayoutDir: tempDir,
				promptEngine: engine,
			},
		});
		await app.ready();
	});

	afterEach(async () => {
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

	it("GET /settings/prompt-layout returns canonical default state initially", async () => {
		const res = await app.inject({ method: "GET", url: "/settings/prompt-layout" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.isDefault).toBe(true);
		expect(body.layout).toBe(DEFAULT_PROMPT_LAYOUT);
		expect(body.consecutiveFallbacks).toBe(0);
		expect(body.degraded).toBe(false);
		expect(body.warnings).toEqual([]);
	});

	it("PUT /settings/prompt-layout rejects non-string layout with 400", async () => {
		const res = await app.inject({
			method: "PUT",
			url: "/settings/prompt-layout",
			payload: { layout: 123 },
		});
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.error).toMatch(/must be a markdown string/);
	});

	it("PUT /settings/prompt-layout rejects missing mandatory tokens with 400", async () => {
		const res = await app.inject({
			method: "PUT",
			url: "/settings/prompt-layout",
			payload: { layout: "{{task}}\n\n{{stage}}" }, // missing failureGuidance
		});
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.missingMandatory).toContain("failureGuidance");
		expect(body.error).toContain("{{failureGuidance}}");
	});

	it("PUT /settings/prompt-layout rejects unknown tokens with 400", async () => {
		const res = await app.inject({
			method: "PUT",
			url: "/settings/prompt-layout",
			payload: { layout: "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}\n\n{{unknownStuff}}" },
		});
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.unknownTokens).toContain("unknownStuff");
		expect(body.error).toContain("unknownStuff");
	});

	it("PUT /settings/prompt-layout rejects oversized layouts with 400", async () => {
		const res = await app.inject({
			method: "PUT",
			url: "/settings/prompt-layout",
			payload: {
				layout: "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}\n" + "x".repeat(MAX_LAYOUT_CHARS + 1),
			},
		});
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.error).toMatch(/the limit is 20000/);
	});

	it("PUT /settings/prompt-layout saves valid custom layout with warnings for omitted conditionals", async () => {
		const custom = "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}";
		const res = await app.inject({
			method: "PUT",
			url: "/settings/prompt-layout",
			payload: { layout: custom },
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.isDefault).toBe(false);
		expect(body.layout).toBe(custom);
		expect(body.warnings).toHaveLength(2); // failureDetails and testingGuidance omitted
	});

	it("POST /settings/prompt-layout/reset restores default layout", async () => {
		// Save custom first
		await app.inject({
			method: "PUT",
			url: "/settings/prompt-layout",
			payload: { layout: "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}" },
		});

		const res = await app.inject({
			method: "POST",
			url: "/settings/prompt-layout/reset",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.isDefault).toBe(true);
		expect(body.layout).toBe(DEFAULT_PROMPT_LAYOUT);
		expect(body.consecutiveFallbacks).toBe(0);
	});

	it("POST /settings/prompt-layout/dry-run previews rendered prompt without persisting", async () => {
		const custom = "# Custom Task\n{{task}}\n\n# Custom Stage\n{{stage}}\n\n{{failureGuidance}}";
		const res = await app.inject({
			method: "POST",
			url: "/settings/prompt-layout/dry-run",
			payload: { layout: custom },
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.renderedMarkdown).toContain("# Custom Task\n# Task");
		expect(body.renderedMarkdown).toContain("# Custom Stage\n# Stage");
		expect(body.renderedMarkdown).toContain("# Stage Failure Guidance");
		// Because failure context existed in the sample and failureDetails was omitted, autoReinjected has it
		expect(body.autoReinjected).toContain("failureDetails");
		expect(body.renderedMarkdown).toContain("# Failure Details");
		expect(body.fallbackUsed).toBe(false);

		// Assert that storage was NOT modified
		const getRes = await app.inject({ method: "GET", url: "/settings/prompt-layout" });
		const getBody = JSON.parse(getRes.payload);
		expect(getBody.isDefault).toBe(true);
	});

	it("POST /settings/prompt-layout/dry-run rejects invalid layouts with 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/settings/prompt-layout/dry-run",
			payload: { layout: "{{task}}\n\n{{invalidToken}}" },
		});
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.error).toContain("invalidToken");
	});

	it("POST /settings/prompt-layout/dry-run answers 500 when even the canonical render fails", async () => {
		// A totally broken engine must produce a JSON 500, never an
		// unhandled throw that wedges the settings preview.
		const broken = fastify();
		await broken.register(promptLayoutRoutes, {
			deps: {
				promptLayoutDir: tempDir,
				promptEngine: {
					curatePrompt: () => {
						throw new Error("boom");
					},
				},
			},
		});
		await broken.ready();
		try {
			const res = await broken.inject({
				method: "POST",
				url: "/settings/prompt-layout/dry-run",
				payload: { layout: DEFAULT_PROMPT_LAYOUT },
			});
			expect(res.statusCode).toBe(500);
			expect(JSON.parse(res.payload).error).toContain("Could not preview");
		} finally {
			await broken.close();
		}
	});
});
