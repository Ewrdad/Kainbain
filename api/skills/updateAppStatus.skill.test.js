/* eslint-disable security/detect-non-literal-fs-filename -- shipped-skill contract assertions by design */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
	SKILL_NAME_PATTERN,
	loadSkill,
	normalizeSkillKeywords,
} from "./skillsRegistry.js";

/***
 * MARK: update-app-status skill contract
 * @description Verifies the SHIPPED update-app-status skill package (not a
 *   fixture): valid slug + frontmatter, resolvable keywords (api base,
 *   project ref, network override, health endpoint, port hint), and a working
 *   standalone helper script for non-agent projects.
 ***/
const REPO_SKILLS_DIR = path.resolve(
	path.dirname(new URL(import.meta.url, "file:///").pathname),
	"..",
	"..",
	"skills",
);
const SKILL_DIR = path.join(REPO_SKILLS_DIR, "update-app-status");

describe("update-app-status skill package", () => {
	it("loads valid from the repo skills library", () => {
		expect(SKILL_NAME_PATTERN.test("update-app-status")).toBe(true);
		const skill = loadSkill({
			name: "update-app-status",
			skillsDir: REPO_SKILLS_DIR,
			projectSkillsDir: null,
		});
		expect(skill).toBeTruthy();
		expect(skill.invalid).not.toBe(true);
		expect(skill.name).toBe("update-app-status");
		expect(skill.body).toContain("PATCH");
		expect(skill.body).toContain("/app-status");
	});

	it("resolves keywords with safe defaults", () => {
		const skill = loadSkill({
			name: "update-app-status",
			skillsDir: REPO_SKILLS_DIR,
			projectSkillsDir: null,
		});
		const keywords = normalizeSkillKeywords(skill.config?.keywords);
		expect(keywords.kbApiBase).toBe("http://localhost:3100");
		expect(keywords.networkHost).toBe("");
		expect(keywords.healthEndpoint).toBe("/health");
		expect(skill.config.keywords.targetProject.kbRef).toBe("project");
		expect(typeof keywords.targetProject).toBe("string");
		expect(typeof keywords.defaultPort).toBe("string");
	});

	it("ships an executable helper script with working --help", () => {
		const script = path.join(SKILL_DIR, "scripts", "update-app-status.sh");
		expect(fs.existsSync(script)).toBe(true);
		expect(fs.statSync(script).mode & 0o111).toBeTruthy();
		const help = execFileSync("bash", [script, "--help"], { encoding: "utf8" });
		expect(help).toContain("--project");
		expect(help).toContain("--port");
		expect(help).toContain("--network-host");
		expect(help).toContain("--clear");
		expect(fs.readFileSync(script, "utf8")).toContain("/app-status");
	});
});
