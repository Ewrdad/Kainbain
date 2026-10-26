import { describe, it, expect } from "vitest";
import {
	VIBE_ACP_PROTOCOL_VERSION,
	applyVibeSessionMode,
	applyVibeSessionModel,
	buildVibeAcpHandshake,
	buildVibeAcpSessionParams,
	classifyVibeAcpStartupFailure,
	describeVibeWorkspaceTrust,
	detectSwallowedVibeFailure,
	resolveVibeAcpEndpoint,
	resolveVibePermissionDecision,
	resolveVibeSessionMode,
	sanitizeVibeAcpEnv,
	vibeTransportError,
} from "./vibeAcpSupport.js";

/**
 * MARK: vibeAcpSupport tests
 * @description Pure-function coverage for the vibe ACP flavor adapter (no
 *   spawn, no I/O beyond an injectable existence check): endpoint
 *   resolution order, child-env sanitization, handshake/session params,
 *   mode mapping, model application, permission decisions, the
 *   swallowed-transport filter, and startup-failure classification.
 *   End-to-end behavior over the mock agent lives in
 *   `vibeHarness.acp.test.js`.
 */

function makeFakeRuntime(invocations) {
	return {
		sessionId: "sess-1",
		async invoke(method, params) {
			invocations.push({ method, params });
			if (params?.value === "reject-me") {
				throw new Error("Unsupported config option model=reject-me");
			}
			return { configOptions: [] };
		},
	};
}

describe("resolveVibeAcpEndpoint (endpoint resolution order)", () => {
	it("an explicit override always wins", () => {
		expect(resolveVibeAcpEndpoint({ vibeBin: "/bin/vibe", acpBin: "/bin/mock" })).toEqual({
			command: "/bin/mock",
			args: [],
			mode: "override",
		});
	});

	it("resolves the vibe-acp sibling of an absolute vibe binary", () => {
		const endpoint = resolveVibeAcpEndpoint({
			vibeBin: "/home/u/.local/bin/vibe",
			existsFn: (candidate) => candidate === "/home/u/.local/bin/vibe-acp",
		});
		expect(endpoint).toEqual({
			command: "/home/u/.local/bin/vibe-acp",
			args: [],
			mode: "sibling",
		});
	});

	it("falls back to the bare PATH spelling when no sibling exists", () => {
		const endpoint = resolveVibeAcpEndpoint({
			vibeBin: "/x/fixtures/mock-vibe.mjs",
			existsFn: () => false,
		});
		expect(endpoint).toEqual({ command: "vibe-acp", args: [], mode: "path" });
	});

	it("skips the sibling probe for a bare vibe binary (no dir to probe)", () => {
		expect(resolveVibeAcpEndpoint({ vibeBin: "vibe", existsFn: () => true })).toEqual({
			command: "vibe-acp",
			args: [],
			mode: "path",
		});
	});
});

describe("sanitizeVibeAcpEnv (child env)", () => {
	it("keeps the basics, VIBE_* prefixes, and the explicit MISTRAL_API_KEY override", () => {
		const env = sanitizeVibeAcpEnv({
			PATH: "/bin",
			HOME: "/home/u",
			VIBE_HOME: "/custom/vibe-home",
			MISTRAL_API_KEY: "k-123",
			IRRELEVANT: "dropped",
		});
		expect(env.PATH).toBe("/bin");
		expect(env.HOME).toBe("/home/u");
		expect(env.VIBE_HOME).toBe("/custom/vibe-home");
		expect(env.MISTRAL_API_KEY).toBe("k-123");
		expect(env.IRRELEVANT).toBeUndefined();
		expect(env.NODE_NO_WARNINGS).toBe("1");
	});

	it("never propagates a VIBE_CLI launcher pin (parent's or otherwise)", () => {
		const env = sanitizeVibeAcpEnv({ PATH: "/bin", VIBE_CLI: "rust" });
		expect(env.VIBE_CLI).toBeUndefined();
	});

	it("drops secret-shaped VIBE_ names despite the prefix allowlist", () => {
		const env = sanitizeVibeAcpEnv({ PATH: "/bin", VIBE_SECRET_TOKEN: "s" });
		expect(env.VIBE_SECRET_TOKEN).toBeUndefined();
	});

	it("omits MISTRAL_API_KEY when the parent did not set it", () => {
		const env = sanitizeVibeAcpEnv({ PATH: "/bin" });
		expect("MISTRAL_API_KEY" in env).toBe(false);
	});
});

describe("handshake + session params", () => {
	it("negotiates protocol version 1 with permission interception", () => {
		expect(buildVibeAcpHandshake()).toEqual({
			protocolVersion: VIBE_ACP_PROTOCOL_VERSION,
			clientCapabilities: { sessions: { new: true }, permissionInterception: true },
		});
		expect(VIBE_ACP_PROTOCOL_VERSION).toBe(1);
	});

	it("carries the workspace root and NO model field (vibe ignores it there)", () => {
		expect(buildVibeAcpSessionParams({ cwd: "/repo" })).toEqual({
			cwd: "/repo",
			mcpServers: [],
		});
	});
});

describe("resolveVibeSessionMode (approval setting -> session mode)", () => {
	it("maps auto-approve on to the auto-approve mode", () => {
		expect(resolveVibeSessionMode({ autoApprove: true })).toBe("auto-approve");
	});
	it("maps auto-approve off to ask (permission gates answered by the policy)", () => {
		expect(resolveVibeSessionMode({ autoApprove: false })).toBe("ask");
	});
	it("defaults to auto-approve when the setting is absent", () => {
		expect(resolveVibeSessionMode({})).toBe("auto-approve");
	});
});

describe("applyVibeSessionMode / applyVibeSessionModel (session config)", () => {
	it("applies the mode over session/set_mode and reports acceptance", async () => {
		const invocations = [];
		const runtime = makeFakeRuntime(invocations);
		await expect(
			applyVibeSessionMode(runtime, "sess-1", "auto-approve"),
		).resolves.toBe(true);
		expect(invocations).toEqual([
			{ method: "session/set_mode", params: { sessionId: "sess-1", modeId: "auto-approve" } },
		]);
	});

	it("logs an unaccepted mode without failing the session", async () => {
		const warnings = [];
		const runtime = {
			async invoke() {
				throw new Error("Unknown session mode: yolo");
			},
		};
		await expect(
			applyVibeSessionMode(runtime, "sess-1", "yolo", { log: (m) => warnings.push(m) }),
		).resolves.toBe(false);
		expect(warnings.some((line) => line.includes("yolo"))).toBe(true);
	});

	it("pins the model over session/set_config_option (configId model)", async () => {
		const invocations = [];
		const runtime = makeFakeRuntime(invocations);
		await applyVibeSessionModel(runtime, "sess-1", { id: "mistral-medium-3.5" });
		expect(invocations).toEqual([
			{
				method: "session/set_config_option",
				params: { sessionId: "sess-1", configId: "model", value: "mistral-medium-3.5" },
			},
		]);
	});

	it("rejects a model application without an id (typed failure, no silent no-op)", async () => {
		await expect(applyVibeSessionModel(makeFakeRuntime([]), "sess-1", {})).rejects.toThrow(
			/resolved model with an id/,
		);
	});

	it("propagates the agent's rejection (the wrapper turns it into a run_error)", async () => {
		const runtime = makeFakeRuntime([]);
		await expect(
			applyVibeSessionModel(runtime, "sess-1", { id: "reject-me" }),
		).rejects.toThrow(/Unsupported config option/);
	});
});

describe("describeVibeWorkspaceTrust (workspace-trust diagnostic)", () => {
	it("warns non-destructively when the agent reports an untrusted workspace", () => {
		const warning = describeVibeWorkspaceTrust({
			_meta: { workspace_trust: { status: "untrusted", details: { cwd: "/repo" } } },
		});
		expect(warning).toContain("[WARN]");
		expect(warning).toContain("/repo");
		expect(warning).toContain("AGENTS.md");
		expect(warning).toContain("KAINBAIN_VIBE_ACP=off");
	});

	it("stays silent for a trusted workspace or a missing status", () => {
		expect(
			describeVibeWorkspaceTrust({
				_meta: { workspace_trust: { status: "trusted" } },
			}),
		).toBeNull();
		expect(describeVibeWorkspaceTrust({})).toBeNull();
		expect(describeVibeWorkspaceTrust(null)).toBeNull();
	});
});

describe("resolveVibePermissionDecision (permission policy)", () => {
	const request = {
		toolCall: { toolCallId: "t-1", title: "Write file" },
		options: [
			{ optionId: "allow-once", kind: "allow_once", name: "Allow once" },
			{ optionId: "allow-always", kind: "allow_always", name: "Always allow" },
			{ optionId: "reject", kind: "reject", name: "Reject" },
		],
	};

	it("auto-approve prefers allow_once (never a standing grant)", () => {
		expect(resolveVibePermissionDecision(request, { autoApprove: true })).toEqual({
			outcome: { outcome: "selected", optionId: "allow-once" },
		});
	});

	it("falls back to allow_always when allow_once is not offered", () => {
		const withoutOnce = {
			options: [
				{ optionId: "always", kind: "allow_always" },
				{ optionId: "no", kind: "reject" },
			],
		};
		expect(resolveVibePermissionDecision(withoutOnce, { autoApprove: true })).toEqual({
			outcome: { outcome: "selected", optionId: "always" },
		});
	});

	it("cancels deny-safe when approvals are off (no approval UI exists yet)", () => {
		expect(resolveVibePermissionDecision(request, { autoApprove: false })).toEqual({
			outcome: { outcome: "cancelled" },
		});
	});

	it("cancels when the agent offers no allow-kind option", () => {
		const noAllow = { options: [{ optionId: "no", kind: "reject" }] };
		expect(resolveVibePermissionDecision(noAllow, { autoApprove: true })).toEqual({
			outcome: { outcome: "cancelled" },
		});
	});
});

describe("detectSwallowedVibeFailure (swallowed transport filter)", () => {
	it.each([
		["Agent execution error: model unreachable: Error 502 Bad Gateway — retrying upstream", true],
		["model unreachable", true],
		["Error 502 while calling the model", true],
		["502 Bad Gateway", true],
		["bad gateway plus agent execution error", true],
		["Here is your holiday itinerary", false],
		["bad gateway", false],
		["agent execution error", false],
		["", false],
		[null, false],
	])("detects %j => %s", (text, expected) => {
		expect(detectSwallowedVibeFailure(text)).toBe(expected);
	});

	it("builds the typed VIBE_TRANSPORT_502 error with the snippet and fix", () => {
		const error = vibeTransportError("Agent execution error: model unreachable");
		expect(error.code).toBe("VIBE_TRANSPORT_502");
		expect(error.error).toContain("model unreachable");
		expect(error.hint).toContain("retry the turn");
	});
});

describe("classifyVibeAcpStartupFailure (startup classification)", () => {
	it.each([
		[
			new Error("Failed to start ACP agent 'vibe-acp': spawn vibe-acp ENOENT"),
			"VIBE_ACP_BIN_MISSING",
			"KAINBAIN_VIBE_ACP_BIN",
		],
		[
			new Error("initialize timed out after 300ms"),
			"VIBE_ACP_TIMEOUT",
			"KAINBAIN_VIBE_ACP=off",
		],
		[
			new Error("ACP agent reported: not logged in, login required"),
			"VIBE_ACP_AUTH_REQUIRED",
			"vibe --setup",
		],
		[
			new Error("ACP agent 'vibe-acp' exited during startup (code 1): boom"),
			"VIBE_ACP_DISCOVERY_FAILED",
			"KAINBAIN_VIBE_ACP=off",
		],
	])("classifies %s as %s", (error, code, hintFragment) => {
		const classified = classifyVibeAcpStartupFailure(error, { bin: "vibe-acp" });
		expect(classified.code).toBe(code);
		expect(classified.hint).toContain(hintFragment);
		expect(classified.message.length).toBeGreaterThan(0);
	});

	it("names the attempted binary in the missing-binary message", () => {
		const classified = classifyVibeAcpStartupFailure(new Error("spawn ENOENT"), {
			bin: "/custom/vibe-acp",
		});
		expect(classified.message).toContain("/custom/vibe-acp");
	});
});
