/***
 * MARK: accessibilityRoutes
 * @description Public accessibility-statement API (task 4bda7321):
 *
 *   GET  /accessibility/results  -> the versioned check-results artifact
 *     (`api/accessibility-results.json`, read per request so a refresh
 *     needs no restart), with the team inbox resolved from file-or-config.
 *     Missing or unparseable file answers 503 `results_unavailable` so the
 *     statement view falls back to its honestly-dated curated copy.
 *   POST /accessibility/feedback -> accepts one accessibility report
 *     (`{ message, needGroup?, contact?, pageUrl? }`, any issue welcome
 *     whether or not a standard covers it), validates it, rate-limits it,
 *     and appends it to the JSONL team inbox file. Answers 201
 *     `{ received, id, inbox }`.
 *
 *   Privacy: only the reporter's own fields are persisted (id + timestamp
 *   added). Client IPs live transiently in the in-memory rate-limit buckets
 *   only — never logged, never stored.
 * @example app.register(accessibilityRoutes, { deps })
 ***/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { throwIfLiveAccessibilityFeedbackPathUnderTest } from "../flow/resolveStatePath.js";
import {
	isNeedGroupId,
	parseResultsArtifact,
} from "../../shared/accessibilityStatement.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE = path.join(HERE, "..", "accessibility-results.json");

/***
 * MARK: FEEDBACK_RATE_LIMIT_MAX
 * @description Max accessibility reports accepted per client per window (anti-abuse minimum).
 * @example FEEDBACK_RATE_LIMIT_MAX => 5
 ***/
export const FEEDBACK_RATE_LIMIT_MAX = 5;

/***
 * MARK: FEEDBACK_RATE_LIMIT_WINDOW_MS
 * @description Rate-limit window for accessibility reports (15 minutes).
 * @example FEEDBACK_RATE_LIMIT_WINDOW_MS => 900000
 ***/
export const FEEDBACK_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/***
 * MARK: FEEDBACK_BODY_LIMIT_BYTES
 * @description Request body ceiling for the feedback endpoint (32 KB payload cap).
 * @example FEEDBACK_BODY_LIMIT_BYTES => 32768
 ***/
export const FEEDBACK_BODY_LIMIT_BYTES = 32 * 1024;

/***
 * MARK: FEEDBACK_CONTACT_MAX_CHARS
 * @description Max characters for the reporter's optional contact field.
 * @example FEEDBACK_CONTACT_MAX_CHARS => 320
 ***/
export const FEEDBACK_CONTACT_MAX_CHARS = 320;

/***
 * MARK: FEEDBACK_PAGE_URL_MAX_CHARS
 * @description Max characters for the reporter's optional page-URL field.
 * @example FEEDBACK_PAGE_URL_MAX_CHARS => 2048
 ***/
export const FEEDBACK_PAGE_URL_MAX_CHARS = 2048;

/***
 * MARK: resolveFeedbackFile
 * @description Resolves the JSONL inbox path: the configured path when set,
 *   else `~/.kainbain/accessibility-feedback.jsonl` (the
 *   `KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE` schema key, empty by default).
 *
 *   Test-pollution guard (2026-11 incident, residual D9 of 99ccc12f,
 *   task b3dec9b0): while `VITEST` is set, resolving the LIVE inbox
 *   THROWS (via `throwIfLiveAccessibilityFeedbackPathUnderTest`), on EVERY
 *   branch — including an explicit literal live path — so a suite that
 *   forgets its temp pin fails loudly instead of appending test reports
 *   to the real user inbox. Production (`VITEST` unset) resolves
 *   byte-identically to before.
 * @example resolveFeedbackFile('/tmp/inbox.jsonl') => '/tmp/inbox.jsonl'
 * @example resolveFeedbackFile('') => os.homedir() + '/.kainbain/accessibility-feedback.jsonl'
 ***/
export const resolveFeedbackFile = (configuredPath) => {
	let resolved;
	if (typeof configuredPath === "string" && configuredPath.trim() !== "") {
		resolved = configuredPath;
	} else {
		resolved = path.join(
			os.homedir(),
			".kainbain",
			"accessibility-feedback.jsonl",
		);
	}
	throwIfLiveAccessibilityFeedbackPathUnderTest({
		candidatePath: resolved,
		callerName: "resolveFeedbackFile",
	});
	return resolved;
};

/***
 * MARK: resolveContactEmail
 * @description Resolves the team inbox address: the artifact's address when
 *   present and well-formed, else the configured address when well-formed,
 *   else empty (unconfigured — the view shows the on-site form only).
 * @example resolveContactEmail('team@example.com', '') => 'team@example.com'
 * @example resolveContactEmail('', 'team@example.com') => 'team@example.com'
 * @example resolveContactEmail('not an email', '') => ''
 ***/
export const resolveContactEmail = (fileValue, configValue) => {
	for (const candidate of [fileValue, configValue]) {
		if (typeof candidate !== "string") continue;
		const trimmed = candidate.trim();
		if (trimmed === "" || trimmed.length > 320 || /\s/.test(trimmed)) continue;
		if (!trimmed.includes("@")) continue;
		return trimmed;
	}
	return "";
};

/***
 * MARK: checkRateLimit
 * @description Sliding-window gate over an in-memory `Map<key, number[]>`
 *   of hit timestamps. Prunes expired hits, then denies when the window
 *   already holds `max` hits (reporting `retryAfterMs`) or records the hit
 *   and allows. Pure apart from the passed-in store — tests inject a fresh
 *   Map and a fake clock.
 * @example checkRateLimit(new Map(), 'ip', 1000, 5, 900000).allowed => true
 ***/
export const checkRateLimit = (store, key, nowMs, max, windowMs) => {
	const now = Number.isFinite(nowMs) ? nowMs : Date.now();
	const hits = (store.get(key) || []).filter(
		(stamp) => Number.isFinite(stamp) && stamp > now - windowMs,
	);
	if (hits.length >= max) {
		const oldest = Math.min(...hits);
		store.set(key, hits);
		return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
	}
	hits.push(now);
	store.set(key, hits);
	return { allowed: true, retryAfterMs: 0 };
};

/***
 * MARK: validateFeedbackBody
 * @description Validates a report body. The message is required (free text —
 *   any issue is welcome whether or not a standard covers it); the need
 *   group, contact, and page URL are optional triage aids that never gate
 *   submission. Returns `{ value }` on success or `{ errors }` listing
 *   `{ field, message, fix }` entries the form renders next to each field.
 *   A non-positive ceiling falls back to 4000 so a misconfigured cap can
 *   never silently reject every report.
 * @example validateFeedbackBody({ message: 'Focus is lost' }, 4000).value.message => 'Focus is lost'
 * @example validateFeedbackBody({ message: '  ' }, 4000).errors[0].field => 'message'
 ***/
export const validateFeedbackBody = (body, maxChars) => {
	const errors = [];
	const source = body !== null && typeof body === "object" ? body : {};
	const ceiling = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 4000;

	const message = typeof source.message === "string" ? source.message.trim() : "";
	if (message === "") {
		errors.push({
			field: "message",
			message: "Describe the problem you hit.",
			fix: "Write a sentence or two about what happened — for example, which page and what got in your way.",
		});
	} else if (message.length > ceiling) {
		errors.push({
			field: "message",
			message: `Keep the description under ${ceiling} characters (yours is ${message.length}).`,
			fix: "Shorten the description to the key details: the page, the barrier, and what you were trying to do.",
		});
	}

	let needGroup = null;
	if (source.needGroup !== undefined && source.needGroup !== null && source.needGroup !== "") {
		if (!isNeedGroupId(source.needGroup)) {
			errors.push({
				field: "needGroup",
				message: "Pick one of the listed areas, or leave it blank.",
				fix: "Choose the closest area — seeing, hearing, getting around, thinking and understanding, or helpful technology — or leave it blank.",
			});
		} else {
			needGroup = source.needGroup;
		}
	}

	let contact = null;
	if (source.contact !== undefined && source.contact !== null && source.contact !== "") {
		if (typeof source.contact !== "string") {
			errors.push({
				field: "contact",
				message: "Contact details must be text.",
				fix: "Leave contact details blank, or write them as plain text.",
			});
		} else if (source.contact.trim().length > FEEDBACK_CONTACT_MAX_CHARS) {
			errors.push({
				field: "contact",
				message: `Keep contact details under ${FEEDBACK_CONTACT_MAX_CHARS} characters.`,
				fix: "Shorten the contact details to just an email address or phone number.",
			});
		} else {
			contact = source.contact.trim();
		}
	}

	let pageUrl = null;
	if (source.pageUrl !== undefined && source.pageUrl !== null && source.pageUrl !== "") {
		if (typeof source.pageUrl !== "string") {
			errors.push({
				field: "pageUrl",
				message: "The page address must be text.",
				fix: "Leave the page address blank, or paste the page address as text.",
			});
		} else if (source.pageUrl.trim().length > FEEDBACK_PAGE_URL_MAX_CHARS) {
			errors.push({
				field: "pageUrl",
				message: `Keep the page address under ${FEEDBACK_PAGE_URL_MAX_CHARS} characters.`,
				fix: "Shorten the page address to just the page path.",
			});
		} else {
			pageUrl = source.pageUrl.trim();
		}
	}

	if (errors.length > 0) return { errors };
	return { value: { message, needGroup, contact, pageUrl } };
};

const feedbackBodySchema = {
	type: "object",
	additionalProperties: true,
	properties: {
		message: { type: "string" },
		needGroup: { type: "string" },
		contact: { type: "string" },
		pageUrl: { type: "string" },
	},
};

const resultsResponseSchema = {
	type: "object",
	additionalProperties: true,
	properties: {
		schemaVersion: { type: "number" },
		generatedAt: { type: ["string", "null"] },
		appVersion: { type: "string" },
		contactEmail: { type: "string" },
		wcag22aaa: { type: "array" },
		wcag30: { type: "array" },
		knownIssues: { type: "array" },
	},
};

const feedbackResponseSchema = {
	type: "object",
	additionalProperties: true,
	properties: {
		received: { type: "boolean" },
		id: { type: "string" },
		inbox: { type: "string" },
	},
};

const errorResponseSchema = {
	type: "object",
	additionalProperties: true,
	properties: {
		error: { type: "string" },
		code: { type: "string" },
		errors: { type: "array" },
		retryAfterSeconds: { type: "number" },
	},
};

/***
 * MARK: accessibilityRoutes
 * @description Registers GET /accessibility/results and POST /accessibility/feedback.
 * @param {Object} app - Fastify instance.
 * @param {Object} [opts] - Route options: `{ deps, resultsFile, feedbackFile, clock, rateLimitStore }`.
 *   `resultsFile` overrides the artifact path, `feedbackFile` overrides the
 *   inbox path, `clock` overrides `Date.now`, and `rateLimitStore` overrides
 *   the in-memory buckets (all test seams; production passes `{ deps }`
 *   only).
 * @example app.register(accessibilityRoutes, { deps })
 ***/
export default async function accessibilityRoutes(app, opts = {}) {
	const { resultsFile, feedbackFile, clock, rateLimitStore } = opts;
	const artifactFile = resultsFile || RESULTS_FILE;
	const inboxFile = feedbackFile || resolveFeedbackFile(config.accessibilityFeedbackFile);
	const now = typeof clock === "function" ? clock : () => Date.now();
	const buckets = rateLimitStore instanceof Map ? rateLimitStore : new Map();

	/***
	 * MARK: Get accessibility results
	 * @description Serves the versioned check-results artifact the statement
	 *   view renders from. Read per request so a refresh needs no restart.
	 ***/
	app.get(
		"/accessibility/results",
		{
			schema: {
				response: { 200: resultsResponseSchema, 503: errorResponseSchema },
			},
		},
		async (_request, reply) => {
			let raw;
			try {
				raw = await fs.promises.readFile(artifactFile, "utf8");
			} catch {
				reply.code(503);
				return { error: "Accessibility results are unavailable right now.", code: "results_unavailable" };
			}
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				reply.code(503);
				return { error: "Accessibility results are unavailable right now.", code: "results_unavailable" };
			}
			const { artifact, warnings } = parseResultsArtifact(parsed);
			if (warnings.length > 0) {
				app.log.warn({ warnings }, "accessibility results artifact failed validation");
			}
			artifact.contactEmail = resolveContactEmail(
				artifact.contactEmail,
				config.accessibilityContactEmail,
			);
			return artifact;
		},
	);

	/***
	 * MARK: Submit accessibility feedback
	 * @description Accepts one accessibility report and appends it to the
	 *   team inbox file. Validates, rate-limits (5 per client per 15
	 *   minutes), and caps the payload at 32 KB.
	 ***/
	app.post(
		"/accessibility/feedback",
		{
			bodyLimit: FEEDBACK_BODY_LIMIT_BYTES,
			schema: {
				body: feedbackBodySchema,
				response: {
					201: feedbackResponseSchema,
					400: errorResponseSchema,
					429: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const gate = checkRateLimit(
				buckets,
				request.ip || "unknown",
				now(),
				FEEDBACK_RATE_LIMIT_MAX,
				FEEDBACK_RATE_LIMIT_WINDOW_MS,
			);
			if (!gate.allowed) {
				const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
				reply.code(429).header("Retry-After", retryAfterSeconds);
				return {
					error: "Too many reports in a short time. Please wait a little and try again.",
					code: "rate_limited",
					retryAfterSeconds,
				};
			}
			const { value, errors } = validateFeedbackBody(
				request.body,
				config.accessibilityFeedbackMaxChars,
			);
			if (errors) {
				reply.code(400);
				return { error: "The report needs a small fix before it can be sent.", code: "invalid_report", errors };
			}
			const record = {
				id: randomUUID(),
				receivedAt: new Date(now()).toISOString(),
				...value,
			};
			try {
				await fs.promises.mkdir(path.dirname(inboxFile), { recursive: true });
				await fs.promises.appendFile(inboxFile, `${JSON.stringify(record)}\n`, "utf8");
			} catch (err) {
				request.log.error({ err }, "failed to store accessibility report");
				reply.code(500);
				return {
					error: "The report could not be saved. Please try again.",
					code: "report_store_failed",
				};
			}
			request.log.info({ reportId: record.id, needGroup: record.needGroup }, "accessibility report received");
			reply.code(201);
			return {
				received: true,
				id: record.id,
				inbox: resolveContactEmail("", config.accessibilityContactEmail),
			};
		},
	);
}
