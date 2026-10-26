import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	MUSE_MSP_APPROVAL_MODES,
	MUSE_MSP_SCHEMA_FINGERPRINT,
	assertSafeMuseServeArgs,
	buildMuseMspHandshake,
	buildMuseMspSessionParams,
	buildMuseServeSpawnPlan,
	classifyMuseMspStartupFailure,
	describeMuseMspSandboxPosture,
	describeMuseMspSchemaDrift,
	isKnownApprovalMode,
	parseMuseServeExtraArgs,
	resolveMuseMspApprovalDecision,
	resolveMuseMspApprovalMode,
	sanitizeMuseMspEnv,
	selectMuseTransport,
} from "./museMspSupport.js";
import { generateUuidV7 } from "./uuidv7.js";

describe("museMspSupport — serve spawn guard", () => {
	it("pins the provider and never emits --workspace on a serve plan", () => {
		const plan = buildMuseServeSpawnPlan({
			workspaceDir: "/tmp/ws",
			settings: { bin: "muse", provider: "echo" },
		});
		expect(plan.args[0]).toBe("serve");
		expect(plan.args).toContain("--provider");
		expect(plan.args).not.toContain("--workspace");
		expect(plan.workspaceRoot).toBe("/tmp/ws");
	});

	it("refuses --disable-sandbox without the explicit yolo opt-in", () => {
		expect(() => assertSafeMuseServeArgs(["serve", "--disable-sandbox"], {})).toThrow(
			/--disable-sandbox/,
		);
		expect(() =>
			assertSafeMuseServeArgs(["serve", "--disable-sandbox"], { yolo: true }),
		).not.toThrow();
	});

	it("only adds --disable-sandbox when yolo is set", () => {
		const sandboxed = buildMuseServeSpawnPlan({
			workspaceDir: "/tmp/ws",
			settings: { provider: "echo", yolo: false },
		});
		expect(sandboxed.args).not.toContain("--disable-sandbox");
		const yolo = buildMuseServeSpawnPlan({
			workspaceDir: "/tmp/ws",
			settings: { provider: "echo", yolo: true },
		});
		expect(yolo.args).toContain("--disable-sandbox");
	});

	it("rejects --workspace anywhere on a serve argv", () => {
		expect(() => assertSafeMuseServeArgs(["serve", "--workspace", "/x"], {})).toThrow(
			/--workspace/,
		);
	});

	it("rejects shell operators and harness-owned pins in extra args", () => {
		expect(() => parseMuseServeExtraArgs("--provider meta")).toThrow(/--provider/);
		expect(() => parseMuseServeExtraArgs("--disable-sandbox")).toThrow(/--disable-sandbox/);
		expect(() => parseMuseServeExtraArgs("--flag;rm -rf /")).toThrow(/shell operators/);
		expect(parseMuseServeExtraArgs("--contributor-mode off")).toEqual([
			"--contributor-mode",
			"off",
		]);
	});
});

describe("museMspSupport — env + handshake", () => {
	it("redacts secrets and pins NODE_NO_WARNINGS", () => {
		const env = sanitizeMuseMspEnv({ PATH: "/bin", MUSE_API_KEY: "s3cr3t", XDG_DATA_HOME: "/x" });
		expect(env.PATH).toBe("/bin");
		expect(env.XDG_DATA_HOME).toBe("/x");
		expect(env.MUSE_API_KEY).toBeUndefined();
		expect(env.NODE_NO_WARNINGS).toBe("1");
	});

	it("builds a valid initialize handshake", () => {
		const handshake = buildMuseMspHandshake({ version: "9.9.9" });
		expect(handshake.clientInfo.name).toMatch(/^[a-z0-9_]+$/);
		expect(handshake.clientInfo.version).toBe("9.9.9");
	});

	it("pins workspaceRoot and selects only known approval modes", () => {
		const params = buildMuseMspSessionParams({
			workspaceRoot: "/repo",
			approvalMode: "allowAll",
			modelId: "muse-wonder-1.0",
		});
		expect(params).toEqual({
			workspaceRoot: "/repo",
			approvalMode: "allowAll",
			modelId: "muse-wonder-1.0",
		});
		expect(buildMuseMspSessionParams({ workspaceRoot: "/r", approvalMode: "yolo" })).toEqual({
			workspaceRoot: "/r",
		});
	});
});

describe("museMspSupport — approval policy", () => {
	it("maps yolo onto the closed enum, select-never-create", () => {
		expect(resolveMuseMspApprovalMode({ yolo: true })).toBe("allowAll");
		expect(resolveMuseMspApprovalMode({ yolo: false })).toBe("onRequest");
		for (const mode of MUSE_MSP_APPROVAL_MODES) expect(isKnownApprovalMode(mode)).toBe(true);
		expect(isKnownApprovalMode("yolo")).toBe(false);
	});

	it("prefers the once-scoped approval under allowAll", () => {
		const decision = resolveMuseMspApprovalDecision(
			{
				availableChoices: [
					{ choiceId: "session", decision: "approvedForSession", scope: "session" },
					{ choiceId: "once", decision: "approved", scope: "once" },
				],
			},
			{ approvalMode: "allowAll" },
		);
		expect(decision.choiceId).toBe("once");
	});

	it("denies under onRequest and fails closed on an unknown shape", () => {
		const denied = resolveMuseMspApprovalDecision(
			{
				availableChoices: [
					{ choiceId: "yes", decision: "approved", scope: "once" },
					{ choiceId: "no", decision: "denied", scope: "once" },
				],
			},
			{ approvalMode: "onRequest" },
		);
		expect(denied.choiceId).toBe("no");
		expect(resolveMuseMspApprovalDecision({ availableChoices: [] }, {})).toBe(null);
	});
});

describe("museMspSupport — transport selection", () => {
	it("honours off/on and the auto probe", () => {
		expect(selectMuseTransport({ mspMode: "off" })).toBe("exec");
		expect(selectMuseTransport({ mspMode: "on" })).toBe("msp");
		expect(
			selectMuseTransport({ mspMode: "auto", bin: "/bin/mock" }, { supportsServe: () => false }),
		).toBe("exec");
		expect(
			selectMuseTransport({ mspMode: "auto", bin: "/bin/mock" }, { supportsServe: () => true }),
		).toBe("msp");
	});

	it("engages on an explicit MSP binary override", () => {
		expect(
			selectMuseTransport({ mspMode: "auto", mspBin: "/opt/muse" }, { supportsServe: () => false }),
		).toBe("msp");
	});
});

describe("museMspSupport — diagnostics + startup classification", () => {
	it("stays silent on a matching fingerprint and warns on drift", () => {
		expect(
			describeMuseMspSchemaDrift({ schema: { fingerprint: MUSE_MSP_SCHEMA_FINGERPRINT } }),
		).toBe(null);
		expect(describeMuseMspSchemaDrift({ schema: { fingerprint: "sha256:other" } })).toMatch(
			/drift/,
		);
	});

	it("records the host-lifetime sandbox posture loudly when yolo is on", () => {
		expect(describeMuseMspSandboxPosture({ sandboxAvailability: "available" }, { yolo: true })).toMatch(
			/sandbox disabled/,
		);
		expect(describeMuseMspSandboxPosture({ sandboxAvailability: "available" }, { yolo: false })).toMatch(
			/sandbox enabled/,
		);
	});

	it("classifies the common startup failures with a rollback hint", () => {
		const missing = classifyMuseMspStartupFailure(new Error("spawn muse ENOENT"), { bin: "muse" });
		expect(missing.code).toBe("MUSE_MSP_BIN_MISSING");
		expect(missing.hint).toMatch(/KAINBAIN_MUSE_MSP=off/);
		expect(classifyMuseMspStartupFailure(new Error("MSP request timed out after 30ms")).code).toBe(
			"MUSE_MSP_TIMEOUT",
		);
		expect(classifyMuseMspStartupFailure(new Error("Not initialized")).code).toBe(
			"MUSE_MSP_HANDSHAKE_FAILED",
		);
		expect(classifyMuseMspStartupFailure(new Error("Already initialized")).code).toBe(
			"MUSE_MSP_HANDSHAKE_FAILED",
		);
		// The camelCase data.kind spelling classifies the same way.
		expect(classifyMuseMspStartupFailure(new Error("notInitialized")).code).toBe(
			"MUSE_MSP_HANDSHAKE_FAILED",
		);
		expect(
			classifyMuseMspStartupFailure(new Error("authentication required: log in first")).code,
		).toBe("MUSE_MSP_AUTH_REQUIRED");
		// The bare word "initialized" must NOT classify as a handshake failure.
		expect(
			classifyMuseMspStartupFailure(new Error("uninitialized workspace root")).code,
		).toBe("MUSE_MSP_DISCOVERY_FAILED");
		expect(classifyMuseMspStartupFailure(new Error("something else broke")).code).toBe(
			"MUSE_MSP_DISCOVERY_FAILED",
		);
	});
});

describe("generateUuidV7", () => {
	it("is a v7 UUID and stays monotonic under burst generation", () => {
		const ids = Array.from({ length: 200 }, () => generateUuidV7());
		for (const id of ids) {
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		}
		for (let i = 1; i < ids.length; i += 1) expect(ids[i] > ids[i - 1]).toBe(true);
	});
});

describe("muse MSP schema fingerprint (drift guard)", () => {
	it("matches the captured real fixture", () => {
		const fixture = JSON.parse(
			fs.readFileSync(
				path.join(
					path.dirname(fileURLToPath(import.meta.url)),
					"..",
					"fixtures",
					"msp-schema.json",
				),
				"utf8",
			),
		);
		expect(fixture.schema.fingerprint).toBe(MUSE_MSP_SCHEMA_FINGERPRINT);
		expect(fixture.schema.version).toBe(1);
	});
});
