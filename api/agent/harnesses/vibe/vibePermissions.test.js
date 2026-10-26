import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
	assertSafeVibeArgs,
	buildVibeChildEnv,
	parseVibeExtraArgs,
	readVibeExport,
	VIBE_PROMPT_FILE_THRESHOLD_BYTES,
} from "./vibePermissions.js";

// Hermetic handles for the settings-dependent builders: resolveVibeSettings
// reads the validated config (an import-time snapshot of the environment),
// so the module is imported fresh with every KAINBAIN_VIBE_* var (plus the
// agent-timeout fallback) deleted — ambient env can never flip a "by
// default" assertion. The pure argv/env helpers above need no isolation and
// stay statically imported.
const VIBE_ENV_KEYS = [
	"KAINBAIN_VIBE_BIN",
	"KAINBAIN_VIBE_CLI",
	"KAINBAIN_VIBE_AUTO_APPROVE",
	"KAINBAIN_VIBE_AGENT",
	"KAINBAIN_VIBE_TIME_LIMIT",
	"KAINBAIN_VIBE_TRUST",
	"KAINBAIN_VIBE_ENABLED_TOOLS",
	"KAINBAIN_VIBE_DISABLED_TOOLS",
	"KAINBAIN_VIBE_TIMEOUT_MS",
	"KAINBAIN_VIBE_ARGS",
	"KAINBAIN_AGENT_TIMEOUT_MS",
];

let buildVibeSpawnPlan;
let resolveVibeSettings;

beforeAll(async () => {
	for (const key of VIBE_ENV_KEYS) vi.stubEnv(key, undefined);
	// Ambient launcher env, not KAINBAIN config: a shell running inside a
	// vibe session exports VIBE_CLI, and the child-env allowlist keeps
	// VIBE_* names through to the child. Left in place it would flip the
	// "auto leaves the selector unset" spawn-plan assertion on a developer
	// machine, so delete it for the duration of the suite.
	vi.stubEnv("VIBE_CLI", undefined);
	vi.resetModules();
	const permissions = await import("./vibePermissions.js");
	buildVibeSpawnPlan = permissions.buildVibeSpawnPlan;
	resolveVibeSettings = permissions.resolveVibeSettings;
});

afterAll(() => {
	vi.unstubAllEnvs();
});

describe("vibe spawn plan (safety-first)", () => {
	it("builds the minimal argv with prompt, streaming output, output dir, workdir pin, trust, and auto-approve by default", async () => {
		const plan = await buildVibeSpawnPlan({
			prompt: "say hello",
			workspaceDir: "/tmp/ws",
			settings: { vibeBin: "vibe" },
		});
		try {
			expect(plan.command).toBe("vibe");
			expect(plan.args[0]).toBe("--prompt");
			expect(plan.args[1]).toBe("say hello");
			expect(plan.args).toContain("--output");
			expect(plan.args[plan.args.indexOf("--output") + 1]).toBe("streaming");
			expect(plan.args).toContain("--output-dir");
			expect(plan.args).toContain("--workdir");
			expect(plan.args[plan.args.indexOf("--workdir") + 1]).toBe("/tmp/ws");
			expect(plan.args).toContain("--trust");
			// Operator-chosen auto-approve default (no approval UI exists yet).
			expect(plan.args).toContain("--auto-approve");
			expect(plan.promptFile).toBeNull();
			expect(typeof plan.outputDir).toBe("string");
			// The spawn plan carries the env (single source of truth): the
			// default pin is the classic Python CLI, whose flag contract the
			// argv above depends on.
			expect(plan.env.VIBE_CLI).toBe("python");
		} finally {
			await plan.cleanup();
		}
	});

	it("omits --auto-approve and --trust when explicitly opted out", async () => {
		const plan = await buildVibeSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: { vibeBin: "vibe", autoApprove: false, trust: false },
		});
		try {
			expect(plan.args).not.toContain("--auto-approve");
			expect(plan.args).not.toContain("--yolo");
			expect(plan.args).not.toContain("--trust");
		} finally {
			await plan.cleanup();
		}
	});

	it("carries the resolved CLI pin on plan.env (python default, rust opt-in, auto unset)", async () => {
		const rustPlan = await buildVibeSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: { vibeBin: "vibe", cli: "rust" },
		});
		try {
			expect(rustPlan.env.VIBE_CLI).toBe("rust");
		} finally {
			await rustPlan.cleanup();
		}
		const autoPlan = await buildVibeSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: { vibeBin: "vibe", cli: "auto" },
		});
		try {
			// auto leaves the selector unset so the upstream rollout decides.
			expect(autoPlan.env.VIBE_CLI).toBeUndefined();
		} finally {
			await autoPlan.cleanup();
		}
	});

	it("passes agent profile, time limit, and tool filters as structured flags", async () => {
		const plan = await buildVibeSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: {
				vibeBin: "vibe",
				agent: "plan",
				timeLimitS: 120,
				enabledTools: ["file_system.*"],
				disabledTools: ["bash*"],
			},
		});
		try {
			const joined = plan.args.join(" ");
			expect(joined).toContain("--agent plan");
			expect(joined).toContain("--time-limit 120");
			expect(joined).toContain("--enabled-tools file_system.*");
			expect(joined).toContain("--disabled-tools bash*");
		} finally {
			await plan.cleanup();
		}
	});

	it("omits unset agent/limits/tool filters (CLI defaults apply)", async () => {
		const plan = await buildVibeSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: {
				vibeBin: "vibe",
				agent: "",
				timeLimitS: null,
				enabledTools: [],
				disabledTools: [],
			},
		});
		try {
			for (const flag of [
				"--agent",
				"--time-limit",
				"--enabled-tools",
				"--disabled-tools",
			]) {
				expect(plan.args).not.toContain(flag);
			}
		} finally {
			await plan.cleanup();
		}
	});

	it("stages oversized prompts to --prompt-file and cleans up the run dir", async () => {
		const plan = await buildVibeSpawnPlan({
			prompt: "p".repeat(VIBE_PROMPT_FILE_THRESHOLD_BYTES + 1),
			workspaceDir: "/tmp/ws",
			settings: { vibeBin: "vibe" },
		});
		expect(plan.args).toContain("--prompt-file");
		expect(plan.args).not.toContain("--prompt");
		expect(plan.promptFile).toContain("kainbain-vibe-run-");
		const { existsSync } = await import("node:fs");
		expect(existsSync(plan.outputDir)).toBe(true);
		await plan.cleanup();
		expect(existsSync(plan.promptFile)).toBe(false);
	});

	it("requires an absolute workspaceDir", async () => {
		await expect(
			buildVibeSpawnPlan({ prompt: "hi", workspaceDir: "", settings: {} }),
		).rejects.toThrow("workspaceDir");
	});

	it("omits an out-of-range time limit instead of passing a malformed flag (fail safe)", async () => {
		const plan = await buildVibeSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: {
				vibeBin: "vibe",
				timeLimitS: Number.NaN,
			},
		});
		try {
			for (const flag of ["--time-limit"]) {
				expect(plan.args).not.toContain(flag);
			}
		} finally {
			await plan.cleanup();
		}
	});

	it("refuses dash-leading tool-filter values instead of misconfiguring the sandbox", async () => {
		await expect(
			buildVibeSpawnPlan({
				prompt: "hi",
				workspaceDir: "/tmp/ws",
				settings: { vibeBin: "vibe", enabledTools: ["--output"] },
			}),
		).rejects.toThrow('starting with "-"');
		await expect(
			buildVibeSpawnPlan({
				prompt: "hi",
				workspaceDir: "/tmp/ws",
				settings: { vibeBin: "vibe", disabledTools: ["-x"] },
			}),
		).rejects.toThrow('starting with "-"');
	});
});

describe("vibe argv guard", () => {
	it("refuses an unpinned spawn without --workdir", () => {
		expect(() => assertSafeVibeArgs(["--prompt", "hi"], {})).toThrow("--workdir");
	});

	it("refuses silent --auto-approve without the explicit opt-in", () => {
		expect(() =>
			assertSafeVibeArgs(["--prompt", "hi", "--workdir", "/w", "--auto-approve"], {}),
		).toThrow("opt-in");
		expect(
			assertSafeVibeArgs(["--prompt", "hi", "--workdir", "/w", "--auto-approve"], {
				autoApprove: true,
			}),
		).toBe(true);
	});
});

describe("vibe extra args", () => {
	it("passes through non-owned flags", () => {
		expect(parseVibeExtraArgs("--smart-approve")).toEqual(["--smart-approve"]);
		// Budget flags are no longer harness-owned: the harness never
		// imposes turn/price/token limits, so an operator may opt back in
		// via KAINBAIN_VIBE_ARGS.
		expect(parseVibeExtraArgs("--max-turns 3")).toEqual(["--max-turns", "3"]);
		expect(parseVibeExtraArgs("--max-price 0.5")).toEqual(["--max-price", "0.5"]);
		expect(parseVibeExtraArgs("--max-tokens 100")).toEqual(["--max-tokens", "100"]);
		expect(parseVibeExtraArgs("")).toEqual([]);
	});

	it("rejects shell operators", () => {
		expect(() => parseVibeExtraArgs("--smart-approve; rm -rf /")).toThrow(
			"shell operators",
		);
	});

	it("rejects harness-owned flags in exact and --flag=value form", () => {
		for (const raw of [
			"--workdir /other",
			"--auto-approve",
			"--yolo",
			"--output json",
			"--output=json",
			"--output-dir /tmp/x",
			"--prompt-file /tmp/p",
			"--agent plan",
			"--time-limit 10",
			"--enabled-tools bash*",
			"--disabled-tools bash*",
			"--trust",
		]) {
			expect(() => parseVibeExtraArgs(raw), raw).toThrow("harness owns");
		}
	});
});

describe("vibe child env", () => {
	it("keeps the allowlist and drops secret-shaped names", () => {
		const child = buildVibeChildEnv({
			PATH: "/bin",
			HOME: "/home/u",
			VIBE_HOME: "/home/u/.vibe",
			OTHER_KEY: "s3cr3t",
			MY_TOKEN: "s3cr3t",
		});
		expect(child.PATH).toBe("/bin");
		expect(child.VIBE_HOME).toBe("/home/u/.vibe");
		expect(child.OTHER_KEY).toBeUndefined();
		expect(child.MY_TOKEN).toBeUndefined();
	});

	it("passes MISTRAL_API_KEY explicitly when set, and omits it when absent", () => {
		expect(
			buildVibeChildEnv({ PATH: "/bin", MISTRAL_API_KEY: "sk-test" }).MISTRAL_API_KEY,
		).toBe("sk-test");
		expect(buildVibeChildEnv({ PATH: "/bin" }).MISTRAL_API_KEY).toBeUndefined();
	});

	it("sets VIBE_CLI from the resolved pin and lets the harness pin win over an inherited value", () => {
		// python/rust are explicit selections; auto/undefined leave it to the rollout.
		expect(buildVibeChildEnv({ PATH: "/bin" }, { cli: "python" }).VIBE_CLI).toBe("python");
		expect(buildVibeChildEnv({ PATH: "/bin" }, { cli: "rust" }).VIBE_CLI).toBe("rust");
		// A parent-provided VIBE_CLI=rust cannot silently override the pin.
		expect(
			buildVibeChildEnv({ PATH: "/bin", VIBE_CLI: "rust" }, { cli: "python" }).VIBE_CLI,
		).toBe("python");
		expect(buildVibeChildEnv({ PATH: "/bin" }, { cli: "auto" }).VIBE_CLI).toBeUndefined();
		expect(buildVibeChildEnv({ PATH: "/bin" }).VIBE_CLI).toBeUndefined();
	});

	it("keeps VIBE_CLI through the allowlist even when the parent sets it and the pin is auto", () => {
		expect(
			buildVibeChildEnv({ PATH: "/bin", VIBE_CLI: "python" }, { cli: "auto" }).VIBE_CLI,
		).toBe("python");
	});
});

describe("vibe export record", () => {
	it("reads usage/cost/outcome from export.json", async () => {
		const fs = await import("node:fs");
		const os = await import("node:os");
		const path = await import("node:path");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-export-"));
		try {
			fs.writeFileSync(
				path.join(dir, "export.json"),
				JSON.stringify({
					outcome: "finished",
					stop_reason: null,
					error: null,
					usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
					cost_usd: 0.001,
					steps: 2,
					exit_code: 0,
				}),
			);
			expect(readVibeExport(dir)).toEqual({
				outcome: "finished",
				stopReason: null,
				error: null,
				usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				costUsd: 0.001,
				steps: 2,
				exitCode: 0,
			});
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("degrades to null when the export is missing or malformed", () => {
		expect(readVibeExport("/definitely/not/a/real/dir")).toBeNull();
		expect(readVibeExport(null)).toBeNull();
	});
});

describe("vibe settings resolution", () => {
	it("resolves operator defaults (auto-approve + trust on)", () => {
		const settings = resolveVibeSettings({});
		expect(settings.autoApprove).toBe(true);
		expect(settings.trust).toBe(true);
	});

	it("resolves the CLI pin from vibeCli/cli overrides over the Python default", () => {
		expect(resolveVibeSettings({}).cli).toBe("python");
		expect(resolveVibeSettings({ vibeCli: "rust" }).cli).toBe("rust");
		expect(resolveVibeSettings({ cli: "auto" }).cli).toBe("auto");
		// Explicit overrides win in the documented order (vibeCli, then cli).
		expect(resolveVibeSettings({ vibeCli: "rust", cli: "auto" }).cli).toBe("rust");
	});
});
