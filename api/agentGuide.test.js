import { describe, it, expect } from "vitest";
import {
	API_BASE,
	BASE_PATH_PREFIX,
	ENDPOINTS,
	TASK_STATUSES,
	STAGE_TYPES,
	RECOMMENDED_WORKFLOW,
	WS_EVENT_TYPES,
	TASK_BLOCKING,
	AGENT_GUIDE,
	renderMarkdownGuide,
} from "./agentGuide.js";

/***
 * MARK: agentGuide catalogue tests
 * @description Impl-level assertions on the machine-readable agent guide
 *   catalogue: every endpoint entry carries { method, path, purpose }, stable
 *   paths exist, status/stage vocabularies are intact, the recommended
 *   workflow is ordered, and the markdown renderer toggles examples.
 ***/

describe("agentGuide constants", () => {
	it("exposes a non-empty API base and root path prefix", () => {
		expect(typeof API_BASE).toBe("string");
		expect(API_BASE.length).toBeGreaterThan(0);
		expect(BASE_PATH_PREFIX).toBe("/");
	});

	it("ENDPOINTS entries all carry method, path, and purpose", () => {
		expect(ENDPOINTS.length).toBeGreaterThan(0);
		for (const ep of ENDPOINTS) {
			expect(typeof ep.method).toBe("string");
			expect(typeof ep.path).toBe("string");
			expect(ep.path.startsWith("/")).toBe(true);
			expect(typeof ep.purpose).toBe("string");
			expect(ep.purpose.length).toBeGreaterThan(0);
		}
	});

	it("covers the stable discovery/task/model/skill/docs/deploy paths", () => {
		const paths = new Set(ENDPOINTS.map((ep) => `${ep.method} ${ep.path}`));
		for (const route of [
			"GET /status",
			"GET /projects",
			"POST /tasks",
			"GET /tasks/:id",
			"GET /compute/models",
			"GET /skills",
			"GET /docs",
			"GET /docs/:slug",
			"POST /deploy",
		]) {
			expect(paths.has(route)).toBe(true);
		}
	});

	it("TASK_STATUSES covers the lifecycle vocabulary", () => {
		for (const key of [
			"idle",
			"in_stage",
			"running_agent",
			"blocked",
			"paused",
			"failed",
			"completed",
		]) {
			// eslint-disable-next-line security/detect-object-injection -- test keys are literals from the vocabulary list above
			expect(typeof TASK_STATUSES[key]).toBe("string");
		}
	});

	it("STAGE_TYPES covers the authoritative stage types", () => {
		expect(Object.keys(STAGE_TYPES).sort()).toEqual(
			["agent", "ci", "human", "merge"].sort(),
		);
	});

	it("RECOMMENDED_WORKFLOW is an ordered title/call/why sequence", () => {
		expect(RECOMMENDED_WORKFLOW.length).toBeGreaterThan(0);
		expect(RECOMMENDED_WORKFLOW[0].title).toBe("Discover projects");
		for (const step of RECOMMENDED_WORKFLOW) {
			expect(typeof step.title).toBe("string");
			expect(typeof step.call).toBe("string");
			expect(typeof step.why).toBe("string");
		}
	});

	it("WS_EVENT_TYPES is a non-empty string list", () => {
		expect(WS_EVENT_TYPES.length).toBeGreaterThan(0);
		for (const type of WS_EVENT_TYPES) {
			expect(typeof type).toBe("string");
		}
	});

	it("TASK_BLOCKING documents the dependency contract", () => {
		for (const key of ["shape", "chains", "release", "failClosed", "validation"]) {
			// eslint-disable-next-line security/detect-object-injection -- test keys are literals from the list above
			expect(typeof TASK_BLOCKING[key]).toBe("string");
		}
	});

	it("AGENT_GUIDE wires the catalogue into one structured object", () => {
		expect(AGENT_GUIDE.endpoints).toBe(ENDPOINTS);
		expect(AGENT_GUIDE.taskStatuses).toBe(TASK_STATUSES);
		expect(AGENT_GUIDE.stageTypes).toBe(STAGE_TYPES);
		expect(AGENT_GUIDE.taskBlocking).toBe(TASK_BLOCKING);
		expect(AGENT_GUIDE.recommendedWorkflow).toBe(RECOMMENDED_WORKFLOW);
		expect(AGENT_GUIDE.websocket.eventTypes).toBe(WS_EVENT_TYPES);
		expect(typeof AGENT_GUIDE.description).toBe("string");
	});
});

describe("renderMarkdownGuide", () => {
	it("renders endpoint paths and the workflow by default", () => {
		const md = renderMarkdownGuide();
		expect(md).toContain("# KainBain Agent Integration Guide");
		expect(md).toContain("GET /projects");
		expect(md).toContain("POST /tasks");
		expect(md).toContain("## Recommended workflow for an integrating agent");
		expect(md).toContain("Discover projects");
		expect(md).toContain("## Live events (WebSocket)");
	});

	it("omits the workflow and live-events sections when withExamples is false", () => {
		const md = renderMarkdownGuide({ withExamples: false });
		expect(md).toContain("# KainBain Agent Integration Guide");
		expect(md).toContain("GET /projects");
		expect(md).not.toContain("## Recommended workflow for an integrating agent");
		expect(md).not.toContain("## Live events (WebSocket)");
	});

	it("lists every task status and stage type", () => {
		const md = renderMarkdownGuide({ withExamples: false });
		for (const key of Object.keys(TASK_STATUSES)) {
			expect(md).toContain(`\`${key}\``);
		}
		for (const key of Object.keys(STAGE_TYPES)) {
			expect(md).toContain(`\`${key}\``);
		}
	});
});
