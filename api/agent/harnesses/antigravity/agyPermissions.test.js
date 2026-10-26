import { describe, it, expect } from "vitest";
import {
	assertSafeAgyArgs,
	buildAgyArgs,
	buildAgyChildEnv,
	parseAgyAllowRules,
	parseAgyDurationMs,
	FORBIDDEN_AGY_FLAG,
} from "./agyPermissions.js";

/**
 * MARK: agyPermissions tests
 * @description The argv safety surface: the builder's shape (-p, stream-json,
 *   print-timeout, sandbox, model/effort/conversation), sandbox off by
 *   default, the permission-bypass flag constructible ONLY from the explicit
 *   skipPermissions setting (the guard still rejects it in every other argv),
 *   the child-env secret redaction, allow-rule validation (no wildcards, no
 *   unsandboxed), and duration parsing for the watchdog.
 */

describe("agy argv builder (operator-chosen YOLO surface)", () => {
	it("builds the documented headless argv for a default stage run", () => {
		const args = buildAgyArgs({ prompt: "Plan the work", printTimeout: "10m" });
		expect(args).toEqual([
			"-p",
			"Plan the work",
			"--output-format",
			"stream-json",
			"--print-timeout",
			"10m",
		]);
	});

	it("passes --sandbox only when enabled by deployment policy", () => {
		const off = buildAgyArgs({ prompt: "x", printTimeout: "5m" });
		expect(off).not.toContain("--sandbox");
		const on = buildAgyArgs({ prompt: "x", printTimeout: "5m", sandbox: true });
		expect(on).toContain("--sandbox");
	});

	it("passes --dangerously-skip-permissions only from the explicit setting", () => {
		const off = buildAgyArgs({ prompt: "x", printTimeout: "5m" });
		expect(off).not.toContain(FORBIDDEN_AGY_FLAG);
		const on = buildAgyArgs({
			prompt: "x",
			printTimeout: "5m",
			skipPermissions: true,
		});
		expect(on.filter((arg) => arg === FORBIDDEN_AGY_FLAG)).toHaveLength(1);
	});

	it("appends --model exactly once when a slug is pinned", () => {
		const args = buildAgyArgs({
			prompt: "x",
			printTimeout: "10m",
			modelSlug: "gemini-3.1-pro-high",
		});
		expect(args.filter((arg) => arg === "--model")).toHaveLength(1);
		expect(args[args.indexOf("--model") + 1]).toBe("gemini-3.1-pro-high");
	});

	it("omits --model when no slug resolved (default stays agy's own)", () => {
		const args = buildAgyArgs({ prompt: "x", printTimeout: "10m" });
		expect(args).not.toContain("--model");
	});

	it("appends --effort only when an effort level was resolved", () => {
		const withEffort = buildAgyArgs({ prompt: "x", printTimeout: "10m", modelSlug: "gemini-3.1-pro", effort: "high" });
		expect(withEffort).toContain("--effort");
		expect(withEffort[withEffort.indexOf("--effort") + 1]).toBe("high");

		const withoutEffort = buildAgyArgs({ prompt: "x", printTimeout: "10m", modelSlug: "gemini-3.1-pro-high" });
		expect(withoutEffort).not.toContain("--effort");
	});

	it("continues a conversation with --conversation when an id exists", () => {
		const args = buildAgyArgs({ prompt: "next", printTimeout: "10m", conversationId: "conv-42" });
		expect(args).toContain("--conversation");
		expect(args[args.indexOf("--conversation") + 1]).toBe("conv-42");
	});

	it("throws if the permission-bypass flag is ever constructed", () => {
		expect(() => assertSafeAgyArgs([FORBIDDEN_AGY_FLAG])).toThrow(/never auto-approves/);
		// Even hidden inside another argument (defensive: joined scan).
		expect(() => assertSafeAgyArgs(["--model", `${FORBIDDEN_AGY_FLAG}-x`])).toThrow();
		expect(() => buildAgyArgs({ prompt: "x", printTimeout: "10m" })).not.toThrow();
	});
});

describe("agy child env (secret redaction)", () => {
	it("keeps only the allowlisted basics and AGY_/GEMINI_/ANTIGRAVITY_ names", () => {
		const env = buildAgyChildEnv({
			PATH: "/usr/bin",
			HOME: "/home/u",
			LANG: "en_US.UTF-8",
			AGY_MOCK_MODE: "success",
			GEMINI_CLIENT_ID: "client",
			ANTIGRAVITY_TELEMETRY: "0",
			KAINBAIN_SECRET_VALUE: "nope",
			SESSION_ID: "nope",
			RANDOM: "nope",
		});
		expect(env).toEqual({
			PATH: "/usr/bin",
			HOME: "/home/u",
			LANG: "en_US.UTF-8",
			AGY_MOCK_MODE: "success",
			GEMINI_CLIENT_ID: "client",
			ANTIGRAVITY_TELEMETRY: "0",
		});
	});

	it("drops secret-shaped variables even from the allowlist prefixes", () => {
		const env = buildAgyChildEnv({
			PATH: "/usr/bin",
			GEMINI_API_KEY: "s3cr3t",
			AGY_AUTH_TOKEN: "tok",
			MY_CREDENTIAL: "cred",
			OPENAI_PASSWORD: "pw",
			ANTIGRAVITY_CLIENT_SECRET: "sec",
			AGY_MOCK_ARGV_LOG: "/tmp/log",
		});
		expect(Object.keys(env).sort()).toEqual(["AGY_MOCK_ARGV_LOG", "PATH"]);
	});

	it("honors lowercase proxy passthroughs", () => {
		const env = buildAgyChildEnv({
			http_proxy: "http://proxy:3128",
			no_proxy: "localhost",
			DB_PASSWORD: "nope",
		});
		expect(env).toEqual({ http_proxy: "http://proxy:3128", no_proxy: "localhost" });
	});
});

describe("agy allow rules (validated, logged-not-applied)", () => {
	it("accepts specific action(target) rules", () => {
		const parsed = parseAgyAllowRules("command(git),write_file(src/),read_url(docs.example.com)");
		expect(parsed.valid).toBe(true);
		expect(parsed.errors).toEqual([]);
		expect(parsed.rules).toEqual([
			{ action: "command", target: "git" },
			{ action: "write_file", target: "src/" },
			{ action: "read_url", target: "docs.example.com" },
		]);
	});

	it("accepts a regex-scoped command rule (no wildcard tokens)", () => {
		const parsed = parseAgyAllowRules("command(regex:npm run (build|lint|test))");
		expect(parsed.valid).toBe(true);
		expect(parsed.rules[0]).toEqual({ action: "command", target: "regex:npm run (build|lint|test)" });
	});

	it("rejects wildcarded command/write_file/read_file targets", () => {
		for (const rule of ["command(*)", "write_file(*)", "read_file(*)"]) {
			const parsed = parseAgyAllowRules(rule);
			expect(parsed.valid).toBe(false);
			expect(parsed.errors[0]).toMatch(/no wildcards/);
		}
		// A rule with trailing prose is malformed, not wildcarded.
		const malformed = parseAgyAllowRules("command(*) extra");
		expect(malformed.valid).toBe(false);
		expect(malformed.errors[0]).toMatch(/Malformed/);
	});

	it("rejects unknown actions, unsandboxed rules and malformed rules", () => {
		const parsed = parseAgyAllowRules("unsandboxed(anything),frobnicate(x),just-a-word");
		expect(parsed.valid).toBe(false);
		expect(parsed.errors).toHaveLength(3);
		expect(parsed.errors[0]).toMatch(/unsandboxed.*never permitted/);
		expect(parsed.rules).toEqual([]);
	});

	it("treats an unset/empty allow list as valid with no rules", () => {
		expect(parseAgyAllowRules("")).toEqual({ valid: true, rules: [], errors: [] });
		expect(parseAgyAllowRules("  ")).toEqual({ valid: true, rules: [], errors: [] });
	});
});

describe("agy duration parsing (watchdog)", () => {
	it("parses the documented duration forms", () => {
		expect(parseAgyDurationMs("10m")).toBe(600_000);
		expect(parseAgyDurationMs("90s")).toBe(90_000);
		expect(parseAgyDurationMs("1h")).toBe(3_600_000);
		expect(parseAgyDurationMs("500ms")).toBe(500);
		expect(parseAgyDurationMs("1500")).toBe(1500);
		expect(parseAgyDurationMs(5000)).toBe(5000);
	});

	it("returns 0 for unparseable values so callers can fall back", () => {
		expect(parseAgyDurationMs("")).toBe(0);
		expect(parseAgyDurationMs("ten minutes")).toBe(0);
		expect(parseAgyDurationMs(null)).toBe(0);
	});
});