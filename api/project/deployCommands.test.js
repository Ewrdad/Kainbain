import { describe, expect, it } from "vitest";
import { DEFAULT_DEPLOY_COMMAND, DEPLOY_COMMAND_PATTERN, isDeployCommand } from "./deployCommands.js";

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

describe("deploy command constants", () => {
	it("exposes deploy command pattern and default", () => {
		expect(DEFAULT_DEPLOY_COMMAND).toContain("deploy.sh");
		expect(DEPLOY_COMMAND_PATTERN.test(DEFAULT_DEPLOY_COMMAND)).toBe(true);
	});

	it("pins the exact built-in default command", () => {
		expect(DEFAULT_DEPLOY_COMMAND).toBe("./deploy.sh --prod");
	});
});
