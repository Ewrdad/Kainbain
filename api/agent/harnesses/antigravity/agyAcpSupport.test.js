import { describe, it, expect } from "vitest";
import {
	AGY_ACP_PROTOCOL_VERSION,
	buildAgyAcpHandshake,
	buildAgyAcpSessionParams,
	classifyAgyAcpStartupFailure,
	detectSwallowed502,
	resolveAgyAcpEndpoint,
	resolveAgyPermissionDecision,
	sanitizeAgyAcpEnv,
	swallowed502Error,
} from "./agyAcpSupport.js";

/**
 * MARK: agyAcpSupport tests
 * @description The Antigravity flavor in isolation (no spawn): entrypoint
 *   resolution, env sanitization, the swallowed-502 filter, the permission
 *   policy, and startup-failure classification.
 */

const PERMISSION_REQUEST = {
	toolCall: { toolCallId: "tool-1", title: "Write file src/example.js" },
	options: [
		{ optionId: "allow-once", kind: "allow_once", name: "Allow once" },
		{ optionId: "allow-always", kind: "allow_always", name: "Allow always" },
		{ optionId: "reject", kind: "reject", name: "Reject" },
	],
};

describe("agyAcpSupport entrypoint", () => {
	it("uses the `agy acp` subcommand by default", () => {
		expect(resolveAgyAcpEndpoint({ agyBin: "agy" })).toEqual({
			command: "agy",
			args: ["acp"],
			mode: "subcommand",
		});
	});

	it("prefers an explicit standalone ACP binary override", () => {
		expect(resolveAgyAcpEndpoint({ agyBin: "agy", acpBin: "/bin/mock-acp" })).toEqual({
			command: "/bin/mock-acp",
			args: [],
			mode: "standalone",
		});
	});
});

describe("agyAcpSupport env sanitization", () => {
	it("keeps agent config, strips traps and secrets, pins warning suppression", () => {
		const env = sanitizeAgyAcpEnv({
			PATH: "/bin",
			HOME: "/home/u",
			AGY_CUSTOM: "kept",
			GEMINI_API_KEY: "must-drop",
			CLAUDECODE: "1",
			NODE_NO_WARNINGS: "0",
			SECRET_SAUCE: "must-drop",
			MY_AUTH_CREDENTIAL: "must-drop",
			RANDOM_VAR: "dropped-by-allowlist",
		});
		expect(env).toMatchObject({
			PATH: "/bin",
			HOME: "/home/u",
			AGY_CUSTOM: "kept",
			NODE_NO_WARNINGS: "1",
		});
		expect(env).not.toHaveProperty("CLAUDECODE");
		expect(env).not.toHaveProperty("GEMINI_API_KEY");
		expect(env).not.toHaveProperty("SECRET_SAUCE");
		expect(env).not.toHaveProperty("MY_AUTH_CREDENTIAL");
		expect(env).not.toHaveProperty("RANDOM_VAR");
	});

	it("never mutates its input", () => {
		const base = { PATH: "/bin", CLAUDECODE: "1" };
		sanitizeAgyAcpEnv(base);
		expect(base).toEqual({ PATH: "/bin", CLAUDECODE: "1" });
	});
});

describe("agyAcpSupport swallowed-502 filter", () => {
	it("traps the canonical T3 failure prose", () => {
		expect(
			detectSwallowed502(
				"Agent execution error: model unreachable: Error 502 Bad Gateway — retrying upstream",
			),
		).toBe(true);
	});

	it("traps reworded variants of the same failure", () => {
		expect(detectSwallowed502("model unreachable, please retry")).toBe(true);
		expect(detectSwallowed502("upstream returned ERROR 502")).toBe(true);
		expect(detectSwallowed502("502 Bad Gateway from the model endpoint")).toBe(true);
	});

	it("passes ordinary prose (no false trips on holiday itineraries or code samples)", () => {
		expect(detectSwallowed502("Here is your holiday itinerary")).toBe(false);
		expect(detectSwallowed502("")).toBe(false);
		expect(detectSwallowed502(null)).toBe(false);
		// A lone weak marker is not enough to condemn a turn.
		expect(detectSwallowed502("the gateway pattern forwards requests")).toBe(false);
	});

	it("builds a typed, retryable transport error", () => {
		const error = swallowed502Error("boom: model unreachable: Error 502");
		expect(error.code).toBe("AGY_TRANSPORT_502");
		expect(error.error).toContain("502");
		expect(error.hint).toContain("retry");
	});
});

describe("agyAcpSupport permission policy", () => {
	it("auto-allows (preferring allow_once) under the YOLO default", () => {
		expect(
			resolveAgyPermissionDecision(PERMISSION_REQUEST, { skipPermissions: true }),
		).toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
	});

	it("falls back to allow_always when no allow_once exists", () => {
		const decision = resolveAgyPermissionDecision(
			{ options: [{ optionId: "x", kind: "allow_always" }] },
			{ skipPermissions: true },
		);
		expect(decision).toEqual({ outcome: { outcome: "selected", optionId: "x" } });
	});

	it("cancels deny-safe without an approval UI (and when no allow option exists)", () => {
		expect(
			resolveAgyPermissionDecision(PERMISSION_REQUEST, { skipPermissions: false }),
		).toEqual({ outcome: { outcome: "cancelled" } });
		expect(
			resolveAgyPermissionDecision(
				{ options: [{ optionId: "reject", kind: "reject" }] },
				{ skipPermissions: true },
			),
		).toEqual({ outcome: { outcome: "cancelled" } });
	});
});

describe("agyAcpSupport startup classification", () => {
	it("names a missing binary with its fix", () => {
		const error = classifyAgyAcpStartupFailure(new Error("spawn agy ENOENT"), { bin: "agy" });
		expect(error.code).toBe("AGY_BIN_MISSING");
		expect(error.hint).toContain("KAINBAIN_AGY_BIN");
	});

	it("names handshake timeouts (and points stale CLIs at exec mode)", () => {
		const error = classifyAgyAcpStartupFailure(
			new Error('ACP request "initialize" timed out after 30000ms'),
		);
		expect(error.code).toBe("AGY_TIMEOUT");
		expect(error.hint).toContain("KAINBAIN_AGY_ACP=off");
	});

	it("names auth failures", () => {
		const error = classifyAgyAcpStartupFailure(
			new Error("not logged in: run `agy auth login` first"),
		);
		expect(error.code).toBe("AGY_AUTH_REQUIRED");
		expect(error.hint).toContain("agy auth login");
	});

	it("falls back to discovery-failed (never misreports auth)", () => {
		const error = classifyAgyAcpStartupFailure(new Error("exited with code 1"));
		expect(error.code).toBe("AGY_DISCOVERY_FAILED");
	});
});

describe("agyAcpSupport handshake params", () => {
	it("negotiates protocol version 1 with permission interception", () => {
		expect(buildAgyAcpHandshake()).toEqual({
			protocolVersion: AGY_ACP_PROTOCOL_VERSION,
			clientCapabilities: { sessions: { new: true }, permissionInterception: true },
		});
	});

	it("roots the session in the workspace and pins the model when set", () => {
		expect(buildAgyAcpSessionParams({ cwd: "/repo" })).toEqual({ cwd: "/repo", mcpServers: [] });
		expect(
			buildAgyAcpSessionParams({ cwd: "/repo", model: { provider: "antigravity", id: "m1" } }),
		).toEqual({ cwd: "/repo", mcpServers: [], model: { provider: "antigravity", id: "m1" } });
	});
});
