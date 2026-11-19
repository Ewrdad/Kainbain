import { describe, expect, it } from "vitest";
import * as barrel from "./projectStore.js";
import * as aliasRenames from "./project/aliasRenames.js";
import * as appStatus from "./project/appStatus.js";
import * as deployCommands from "./project/deployCommands.js";
import * as docsRepo from "./project/docsRepo.js";
import * as docsRepoPointer from "./project/docsRepoPointer.js";
import * as gitRemote from "./project/gitRemote.js";
import * as projectSlug from "./project/projectSlug.js";
import * as retrySettings from "./project/retrySettings.js";
import * as stageNormalizers from "./project/stageNormalizers.js";
import * as workflowDefaults from "./project/workflowDefaults.js";

/***
 * MARK: projectStore barrel surface
 * @description Guards the WP-3 zero-consumer-change promise: every public
 * symbol stays reachable via `api/projectStore.js`, and each re-export is
 * the identical reference as the defining module (no copies, no wrappers).
 ***/
describe("projectStore barrel surface", () => {
	const expectedTypes = {
		APP_STATUS_VALUES: "object",
		DEFAULT_ACCENT_COLOR: "string",
		DEFAULT_AGENT_DIR: "string",
		DEFAULT_DEPLOY_COMMAND: "string",
		DEFAULT_MODEL: "string",
		DEFAULT_STAGES: "object",
		DEFAULT_WORKFLOW_ID: "string",
		DEFAULT_WORKFLOW_NAME: "string",
		DEPLOY_COMMAND_PATTERN: "object",
		DOCS_REPO_BRANCH_MODE_SYNCED: "string",
		DOCS_REPO_PATH_MAX_LENGTH: "number",
		DOCS_REPO_POINTERS_FILENAME: "string",
		DOCS_REPO_URL_MAX_LENGTH: "number",
		HOST_COMMAND_PATTERN: "object",
		PUBLISH_COMMAND_PATTERN: "object",
		ProjectStore: "function",
		RETRY_SETTING_KEYS: "object",
		assertValidDocsRepoForWrite: "function",
		assertDocsRepoSeparateFromMain: "function",
		createDefaultWorkflow: "function",
		detectGitRemote: "function",
		docsRepoPointerFor: "function",
		docsRepoUrlFor: "function",
		hasDocsRepo: "function",
		inferAliasRenames: "function",
		isDeployCommand: "function",
		isHostCommand: "function",
		isPublishCommand: "function",
		isValidDocsRepoLocalPath: "function",
		isValidDocsRepoUrl: "function",
		migrateMergeDeployStages: "function",
		normalizeAppStatus: "function",
		normalizeDocsRepoPointers: "function",
		normalizeDocsRepoSettings: "function",
		normalizeProjectRetrySettings: "function",
		normalizeRetryCount: "function",
		normalizeRetryEnabled: "function",
		normalizeStage: "function",
		normalizeStageSkills: "function",
		normalizeStageTags: "function",
		normalizeStageType: "function",
		normalizeStages: "function",
		normalizeTimeoutMs: "function",
		normalizeWorkflow: "function",
		normalizeWorkflows: "function",
		readDocsRepoPointers: "function",
		rememberDocsRepoPointer: "function",
		removeDocsRepoPointer: "function",
		resolveDefaultGitRemote: "function",
		resolveDocsRepoLocalPath: "function",
		resolveDocsRepoPointersPath: "function",
		resolveKainbainHome: "function",
		slugifyProjectName: "function",
		writeDocsRepoPointers: "function",
	};

	it("exposes the full public surface with stable types", () => {
		expect(Object.keys(barrel).sort()).toEqual(Object.keys(expectedTypes).sort());
		for (const [name, type] of Object.entries(expectedTypes)) {
			expect(typeof barrel[name], name).toBe(type);
		}
	});

	it("re-exports the identical module references (no copies)", () => {
		const groups = [
			aliasRenames,
			appStatus,
			deployCommands,
			docsRepo,
			docsRepoPointer,
			gitRemote,
			projectSlug,
			retrySettings,
			stageNormalizers,
			workflowDefaults,
		];
		for (const group of groups) {
			for (const [name, value] of Object.entries(group)) {
				if (name.startsWith("_") || name === "warnLegacyNoneHarnessModel") continue;
				expect(barrel[name], name).toBe(value);
			}
		}
	});

	it("keeps ProjectStore a constructable class", () => {
		expect(barrel.ProjectStore.toString().startsWith("class ")).toBe(true);
	});
});
