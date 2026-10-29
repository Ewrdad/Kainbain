import { describe, expect, it } from "vitest";
import { DEFAULT_DEPLOY_COMMAND, DEPLOY_COMMAND_PATTERN, isDeployCommand, isHostCommand, isPublishCommand } from "./deployCommands.js";
import { isDeployCommand as markersIsDeployCommand, isHostCommand as markersIsHostCommand, DEPLOY_COMMAND_PATTERN as MARKERS_PATTERN } from "../continuity/deployMarkers.js";

describe("isDeployCommand", () => {
	it("matches deploy.sh commands", () => {
		expect(isDeployCommand("./deploy.sh --prod")).toBe(true);
		expect(isDeployCommand("echo hi")).toBe(false);
	});

	it("matches deploy.sh nested in longer commands and paths", () => {
		expect(isDeployCommand("bash scripts/deploy.sh")).toBe(true);
	});

	it("rejects non-string and empty commands", () => {
		expect(isDeployCommand("")).toBe(false);
		expect(isDeployCommand(undefined)).toBe(false);
		expect(isDeployCommand(null)).toBe(false);
		expect(isDeployCommand(42)).toBe(false);
	});
});

describe("host commands (DA9)", () => {
	it("classifies redeploy/deploy scripts as host commands in both detectors; publish is ordinary ci", () => {
		for (const cmd of ["./redeploy.sh --frontend", "./deploy.sh --prod"]) {
			expect(isDeployCommand(cmd)).toBe(true);
			expect(isHostCommand(cmd)).toBe(true);
			expect(markersIsHostCommand(cmd)).toBe(true);
			expect(markersIsDeployCommand(cmd)).toBe(true);
		}
		// publish.sh is a standard ci stage (runner-dispatchable); publish.sh
		// itself re-execs into the primary checkout from a runner worktree.
		expect(isDeployCommand("./publish.sh --detect")).toBe(true);
		expect(isPublishCommand("./publish.sh --detect")).toBe(true);
		expect(isHostCommand("./publish.sh --detect")).toBe(false);
		expect(markersIsHostCommand("./publish.sh --detect")).toBe(false);
		expect(isHostCommand("npm test")).toBe(false);
		expect(markersIsDeployCommand("npm test")).toBe(false);
	});

	it("pins agreement between the two detector implementations", () => {
		expect(MARKERS_PATTERN.source).toBe(DEPLOY_COMMAND_PATTERN.source);
		for (const cmd of ["./publish.sh", "./redeploy.sh --all", "./deploy.sh --prod", "echo hi", ""]) {
			expect(markersIsDeployCommand(cmd)).toBe(isDeployCommand(cmd));
		}
	});
});

describe("deploy command constants", () => {
	it("exposes deploy command pattern and default", () => {
		expect(DEFAULT_DEPLOY_COMMAND).toContain("deploy.sh");
		expect(DEPLOY_COMMAND_PATTERN.test(DEFAULT_DEPLOY_COMMAND)).toBe(true);
	});

	it("pins the exact built-in default command", () => {
		expect(DEFAULT_DEPLOY_COMMAND).toBe("./deploy.sh --prod");
	});
});
