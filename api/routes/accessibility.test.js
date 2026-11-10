import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import accessibilityRoutes, {
	FEEDBACK_BODY_LIMIT_BYTES,
	FEEDBACK_RATE_LIMIT_MAX,
	FEEDBACK_RATE_LIMIT_WINDOW_MS,
	checkRateLimit,
	resolveContactEmail,
	resolveFeedbackFile,
	validateFeedbackBody,
} from "./accessibility.js";
import { parseResultsArtifact } from "../../shared/accessibilityStatement.js";
import { config } from "../config.js";

/***
 * MARK: accessibility route tests
 * @description Verifies GET /accessibility/results and POST
 *   /accessibility/feedback against scoped Fastify instances (never the
 *   shared app singleton): the results shape and 503 path, report
 *   validation (message required, triage fields optional), the 201 +
 *   JSONL persistence path, rate limiting (429 + Retry-After), the 32 KB
 *   body cap, and the store-failure 500. Every POST test points the inbox
 *   at a temp file, so the real `~/.kainbain` inbox is never touched.
 ***/

let tmpDir;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a11y-feedback-"));
});

afterEach(() => {
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

async function buildApp(overrides = {}) {
	const app = Fastify({ logger: false });
	await app.register(accessibilityRoutes, {
		deps: {},
		feedbackFile: path.join(tmpDir, "inbox.jsonl"),
		...overrides,
	});
	await app.ready();
	return app;
}

function inboxLines(file) {
	if (!fs.existsSync(file)) return [];
	return fs
		.readFileSync(file, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line));
}

describe("GET /accessibility/results", () => {
	it("serves the checked-in artifact with the full row set", async () => {
		const app = await buildApp();
		const response = await app.inject({ method: "GET", url: "/accessibility/results" });
		expect(response.statusCode).toBe(200);
		const payload = JSON.parse(response.payload);
		expect(payload.schemaVersion).toBe(1);
		expect(typeof payload.generatedAt).toBe("string");
		expect(payload.wcag22aaa).toHaveLength(28);
		expect(payload.wcag30.length).toBeGreaterThan(0);
		expect(Array.isArray(payload.knownIssues)).toBe(true);
		await app.close();
	});

	it("pins the checked-in artifact to zero validation warnings (producer schema gate)", () => {
		const raw = fs.readFileSync(
			path.join(import.meta.dirname, "..", "accessibility-results.json"),
			"utf8",
		);
		const { warnings } = parseResultsArtifact(JSON.parse(raw));
		expect(warnings).toEqual([]);
	});

	it("answers 503 when the artifact file is missing", async () => {
		const app = await buildApp({ resultsFile: path.join(tmpDir, "missing.json") });
		const response = await app.inject({ method: "GET", url: "/accessibility/results" });
		expect(response.statusCode).toBe(503);
		expect(JSON.parse(response.payload)).toMatchObject({ code: "results_unavailable" });
		await app.close();
	});

	it("answers 503 when the artifact file is not valid JSON", async () => {
		const bad = path.join(tmpDir, "bad.json");
		fs.writeFileSync(bad, "{ not json", "utf8");
		const app = await buildApp({ resultsFile: bad });
		const response = await app.inject({ method: "GET", url: "/accessibility/results" });
		expect(response.statusCode).toBe(503);
		expect(JSON.parse(response.payload)).toMatchObject({ code: "results_unavailable" });
		await app.close();
	});

	it("fills omitted rows as unknown instead of crashing", async () => {
		const sparse = path.join(tmpDir, "sparse.json");
		fs.writeFileSync(
			sparse,
			JSON.stringify({ schemaVersion: 1, wcag22aaa: [], wcag30: [] }),
			"utf8",
		);
		const app = await buildApp({ resultsFile: sparse });
		const response = await app.inject({ method: "GET", url: "/accessibility/results" });
		expect(response.statusCode).toBe(200);
		const payload = JSON.parse(response.payload);
		expect(payload.wcag22aaa).toHaveLength(28);
		expect(payload.wcag22aaa.every((row) => row.status === "unknown")).toBe(true);
		await app.close();
	});
});

describe("POST /accessibility/feedback", () => {
	it("accepts a minimal report with 201 and appends it to the inbox file", async () => {
		const inbox = path.join(tmpDir, "inbox.jsonl");
		const app = await buildApp({ feedbackFile: inbox });
		const response = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "Focus jumps to the top after I save a task." },
		});
		expect(response.statusCode).toBe(201);
		const payload = JSON.parse(response.payload);
		expect(payload.received).toBe(true);
		expect(typeof payload.id).toBe("string");
		const lines = inboxLines(inbox);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			id: payload.id,
			message: "Focus jumps to the top after I save a task.",
			needGroup: null,
			contact: null,
			pageUrl: null,
		});
		expect(typeof lines[0].receivedAt).toBe("string");
		await app.close();
	});

	it("accepts optional triage fields without gating on them", async () => {
		const inbox = path.join(tmpDir, "inbox.jsonl");
		const app = await buildApp({ feedbackFile: inbox });
		const response = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: {
				message: "The contrast on the low-data banner is hard to read.",
				needGroup: "seeing",
				contact: "reporter@example.com",
				pageUrl: "/#/observability",
			},
		});
		expect(response.statusCode).toBe(201);
		expect(inboxLines(inbox)[0]).toMatchObject({
			needGroup: "seeing",
			contact: "reporter@example.com",
			pageUrl: "/#/observability",
		});
		await app.close();
	});

	it("rejects an empty message with a named error and a fix suggestion", async () => {
		const inbox = path.join(tmpDir, "inbox.jsonl");
		const app = await buildApp({ feedbackFile: inbox });
		const response = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "   ", needGroup: "seeing" },
		});
		expect(response.statusCode).toBe(400);
		const payload = JSON.parse(response.payload);
		expect(payload.code).toBe("invalid_report");
		expect(payload.errors[0]).toMatchObject({ field: "message" });
		expect(payload.errors[0].fix.length).toBeGreaterThan(0);
		expect(inboxLines(inbox)).toHaveLength(0);
		await app.close();
	});

	it("rejects an over-long message naming the ceiling", async () => {
		const ceiling = config.accessibilityFeedbackMaxChars > 0 ? config.accessibilityFeedbackMaxChars : 4000;
		const app = await buildApp();
		const response = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "x".repeat(ceiling + 10) },
		});
		expect(response.statusCode).toBe(400);
		expect(JSON.parse(response.payload).errors[0].message).toContain(String(ceiling));
		await app.close();
	});

	it("rejects an unknown need group without dropping the message guidance", async () => {
		const app = await buildApp();
		const response = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "Something is wrong.", needGroup: "smell" },
		});
		expect(response.statusCode).toBe(400);
		const payload = JSON.parse(response.payload);
		expect(payload.errors).toHaveLength(1);
		expect(payload.errors[0]).toMatchObject({ field: "needGroup" });
		await app.close();
	});

	it("rate-limits to 5 reports per window with 429 and Retry-After", async () => {
		let nowMs = 1_700_000_000_000;
		const app = await buildApp({ clock: () => nowMs, rateLimitStore: new Map() });
		for (let i = 0; i < FEEDBACK_RATE_LIMIT_MAX; i += 1) {
			const response = await app.inject({
				method: "POST",
				url: "/accessibility/feedback",
				payload: { message: `Report ${i}` },
			});
			expect(response.statusCode).toBe(201);
		}
		const limited = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "One too many." },
		});
		expect(limited.statusCode).toBe(429);
		expect(JSON.parse(limited.payload).code).toBe("rate_limited");
		expect(limited.headers["retry-after"]).toBeDefined();
		// The window expiring re-opens the gate.
		nowMs += FEEDBACK_RATE_LIMIT_WINDOW_MS + 1;
		const reopened = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "After the window." },
		});
		expect(reopened.statusCode).toBe(201);
		await app.close();
	});

	it("rejects bodies over the 32 KB cap with 413", async () => {
		const app = await buildApp();
		const response = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "x".repeat(FEEDBACK_BODY_LIMIT_BYTES + 1024) },
		});
		expect(response.statusCode).toBe(413);
		await app.close();
	});

	it("answers 500 when the inbox file cannot be written", async () => {
		// A directory where the inbox file should be: mkdir passes, append fails.
		const app = await buildApp({ feedbackFile: tmpDir });
		const response = await app.inject({
			method: "POST",
			url: "/accessibility/feedback",
			payload: { message: "Nowhere to store this." },
		});
		expect(response.statusCode).toBe(500);
		expect(JSON.parse(response.payload).code).toBe("report_store_failed");
		await app.close();
	});
});

describe("accessibility route helpers", () => {
	it("resolves the inbox path from config or the home default", () => {
		expect(resolveFeedbackFile("/tmp/inbox.jsonl")).toBe("/tmp/inbox.jsonl");
		expect(resolveFeedbackFile("")).toBe(
			path.join(os.homedir(), ".kainbain", "accessibility-feedback.jsonl"),
		);
		expect(resolveFeedbackFile(null)).toContain("accessibility-feedback.jsonl");
	});

	it("prefers the artifact inbox, then config, then empty", () => {
		expect(resolveContactEmail("file@example.com", "config@example.com")).toBe("file@example.com");
		expect(resolveContactEmail("", "config@example.com")).toBe("config@example.com");
		expect(resolveContactEmail("  ", "")).toBe("");
		expect(resolveContactEmail("not an email", "config@example.com")).toBe("config@example.com");
		expect(resolveContactEmail("no-at-sign", "also bad")).toBe("");
	});

	it("gates the sliding window and expires old hits", () => {
		const store = new Map();
		const max = 2;
		const windowMs = 1000;
		expect(checkRateLimit(store, "ip", 1000, max, windowMs).allowed).toBe(true);
		expect(checkRateLimit(store, "ip", 1500, max, windowMs).allowed).toBe(true);
		const denied = checkRateLimit(store, "ip", 1800, max, windowMs);
		expect(denied.allowed).toBe(false);
		expect(denied.retryAfterMs).toBe(200);
		expect(checkRateLimit(store, "other", 1800, max, windowMs).allowed).toBe(true);
		expect(checkRateLimit(store, "ip", 2001, max, windowMs).allowed).toBe(true);
	});

	it("validates report bodies without gating on optional fields", () => {
		expect(validateFeedbackBody({ message: " hi " }, 4000).value).toMatchObject({
			message: "hi",
			needGroup: null,
			contact: null,
			pageUrl: null,
		});
		expect(validateFeedbackBody(null, 4000).errors[0].field).toBe("message");
		expect(validateFeedbackBody({ message: "x".repeat(11) }, 10).errors[0].field).toBe(
			"message",
		);
		// A non-positive ceiling falls back instead of rejecting everything.
		expect(validateFeedbackBody({ message: "ok" }, 0).value.message).toBe("ok");
		expect(validateFeedbackBody({ message: "x", contact: "y".repeat(321) }, 4000).errors[0].field).toBe(
			"contact",
		);
		expect(
			validateFeedbackBody({ message: "x", pageUrl: "y".repeat(2049) }, 4000).errors[0].field,
		).toBe("pageUrl");
	});
});
