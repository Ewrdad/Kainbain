import { describe, it, expect, vi } from "vitest";
import {
	listKnownEntities,
	resolveKbReference,
	validateSkillConfig,
	collectInvalidSkillReferences,
} from "./kbReferences.js";

/***
 * MARK: kbReferences tests
 * @description Verifies the shared KB-reference resolver/validator: entity
 *   enumeration over a project store (with pruning + tolerance of malformed
 *   store output), reference resolution rules (id exact; name/slug
 *   case-insensitive; stages scoped to a workflow or demanded unique across
 *   workflows), keyword-config validation (kbRef metadata, built-in
 *   templates, legacy tolerance) and the save-time aggregation used by
 *   PUT /projects/:id/workflow.
 ***/

const store = {
	listProjects: () => [
		{
			id: "proj-1",
			name: "KainBain",
			slug: "kainbain",
			activeWorkflowId: "wf-default",
		},
		{ id: "proj-2", name: "Scratch", slug: "scratch" },
	],
	getWorkflows: (projectId) => {
		if (projectId === "proj-1") {
			return [
				{
					id: "wf-default",
					name: "Feature Pipeline",
					isDefault: true,
					stages: [
						{ id: "stage-idea", name: "Idea" },
						{ id: "stage-plan", name: "Plan" },
					],
				},
				{
					id: "wf-audit-1",
					name: "Audit",
					isDefault: false,
					stages: [
						{ id: "stage-audit", name: "Audit" },
						{ id: "stage-idea-2", name: "Idea" },
					],
				},
			];
		}
		if (projectId === "proj-2") {
			return [
				{
					id: "wf-solo",
					name: "Solo",
					isDefault: true,
					stages: [{ id: "stage-only", name: "Only" }],
				},
			];
		}
		return [];
	},
};

const entities = listKnownEntities({ projectStore: store, projectId: "proj-1" });

/* eslint-disable security/detect-object-injection -- test fixture: skillsByName keys are literal skill names */
const registryFor = (skillsByName) => ({
	getSkill: (name) => skillsByName[name] || null,
});
/* eslint-enable security/detect-object-injection */

describe("listKnownEntities", () => {
	it("enumerates pruned projects and the project's workflows with stages", () => {
		expect(entities.projects).toEqual([
			{ id: "proj-1", name: "KainBain", slug: "kainbain" },
			{ id: "proj-2", name: "Scratch", slug: "scratch" },
		]);
		expect(entities.workflows).toEqual([
			{
				id: "wf-default",
				name: "Feature Pipeline",
				isDefault: true,
				stages: [
					{ id: "stage-idea", name: "Idea" },
					{ id: "stage-plan", name: "Plan" },
				],
			},
			{
				id: "wf-audit-1",
				name: "Audit",
				isDefault: false,
				stages: [
					{ id: "stage-audit", name: "Audit" },
					{ id: "stage-idea-2", name: "Idea" },
				],
			},
		]);
		expect(entities.activeWorkflowId).toBe("wf-default");
		// The snapshot records which project `workflows` belongs to and exposes a
		// per-project enumeration accessor (used for cross-project scoping).
		expect(entities.projectId).toBe("proj-1");
		expect(typeof entities.workflowsFor).toBe("function");
	});

	it("returns empty workflows for an unknown or missing projectId", () => {
		const unknown = listKnownEntities({ projectStore: store, projectId: "nope" });
		expect(unknown.projects).toEqual(entities.projects);
		expect(unknown.workflows).toEqual([]);
		expect(unknown.activeWorkflowId).toBe(null);
		expect(unknown.projectId).toBe("nope");
		expect(typeof unknown.workflowsFor).toBe("function");

		const noId = listKnownEntities({ projectStore: store });
		expect(noId.workflows).toEqual([]);
		expect(noId.activeWorkflowId).toBe(null);
		expect(noId.projectId).toBe(null);
	});

	it("degrades to the empty snapshot for a broken or missing store", () => {
		expect(listKnownEntities()).toEqual({
			projects: [],
			workflows: [],
			activeWorkflowId: null,
			projectId: null,
		});
		expect(
			listKnownEntities({
				projectStore: {
					listProjects: () => {
						throw new Error("disk on fire");
					},
				},
			}),
		).toEqual({ projects: [], workflows: [], activeWorkflowId: null, projectId: null });
	});

	it("falls back to the default workflow for activeWorkflowId", () => {
		const snapshot = listKnownEntities({ projectStore: store, projectId: "proj-2" });
		expect(snapshot.activeWorkflowId).toBe("wf-solo");
	});

	it("exposes a workflowsFor accessor that enumerates any known project's workflows", () => {
		const proj2Workflows = [
			{
				id: "wf-solo",
				name: "Solo",
				isDefault: true,
				stages: [{ id: "stage-only", name: "Only" }],
			},
		];
		expect(entities.workflowsFor("proj-2")).toEqual(proj2Workflows);
		// Reference forms (case-insensitive name, slug) resolve too.
		expect(entities.workflowsFor("Scratch")).toEqual(proj2Workflows);
		expect(entities.workflowsFor("scratch")).toEqual(proj2Workflows);
		// The snapshot's own project set and unknown/empty refs.
		expect(entities.workflowsFor("proj-1")).toEqual(entities.workflows);
		expect(entities.workflowsFor("ghost")).toEqual([]);
		expect(entities.workflowsFor("")).toEqual([]);
		expect(entities.workflowsFor(null)).toEqual([]);
	});

	it("caches per-project workflow enumeration across repeated calls", () => {
		let getWorkflowsCalls = 0;
		const countingStore = {
			listProjects: store.listProjects,
			getWorkflows: (projectId) => {
				getWorkflowsCalls += 1;
				return store.getWorkflows(projectId);
			},
		};
		const snapshot = listKnownEntities({ projectStore: countingStore, projectId: "proj-1" });
		const first = snapshot.workflowsFor("proj-2");
		const second = snapshot.workflowsFor("proj-2");
		expect(second).toBe(first); // same pruned array instance from the cache
		// One call for the snapshot (proj-1) + one for proj-2, none on the repeat.
		expect(getWorkflowsCalls).toBe(2);
	});

	it("tolerates a store whose getWorkflows explodes inside the accessor", () => {
		// The snapshot project (proj-1) still enumerates; only the accessor's
		// target project explodes.
		const brokenStore = {
			listProjects: store.listProjects,
			getWorkflows: (projectId) => {
				if (projectId !== "proj-1") throw new Error("disk on fire");
				return store.getWorkflows(projectId);
			},
		};
		const snapshot = listKnownEntities({ projectStore: brokenStore, projectId: "proj-1" });
		expect(() => snapshot.workflowsFor("proj-2")).not.toThrow();
		expect(snapshot.workflowsFor("proj-2")).toEqual([]);
	});
});

describe("resolveKbReference", () => {
	it("resolves projects by exact id, case-insensitive name, and slug", () => {
		expect(resolveKbReference({ kind: "project", value: "proj-1", entities })).toEqual({
			id: "proj-1",
			label: "KainBain (proj-1)",
		});
		expect(resolveKbReference({ kind: "project", value: "kainbain", entities })?.id).toBe(
			"proj-1",
		);
		expect(resolveKbReference({ kind: "project", value: "KAINBAIN", entities })?.id).toBe(
			"proj-1",
		);
	});

	it("resolves workflows by exact id and case-insensitive name", () => {
		expect(resolveKbReference({ kind: "workflow", value: "wf-default", entities })?.id).toBe(
			"wf-default",
		);
		expect(
			resolveKbReference({ kind: "workflow", value: "feature pipeline", entities })?.id,
		).toBe("wf-default");
		expect(resolveKbReference({ kind: "workflow", value: "Feature Pipeline", entities })?.id).toBe(
			"wf-default",
		);
	});

	it("resolves stages scoped to a workflow by id or case-insensitive name", () => {
		expect(
			resolveKbReference({
				kind: "stage",
				value: "Idea",
				entities,
				workflowId: "wf-default",
			})?.id,
		).toBe("stage-idea");
		expect(
			resolveKbReference({
				kind: "stage",
				value: "stage-idea",
				entities,
				workflowId: "wf-default",
			})?.id,
		).toBe("stage-idea");
	});

	it("demands a unique stage match when no workflow scope is given (ambiguous name => null)", () => {
		// "Idea" exists in both workflows -> ambiguous without scope.
		expect(resolveKbReference({ kind: "stage", value: "Idea", entities })).toBeNull();
		// "Plan" exists exactly once across all workflows -> resolves unscoped.
		expect(resolveKbReference({ kind: "stage", value: "Plan", entities })?.id).toBe(
			"stage-plan",
		);
	});

	it("falls back to the unscoped unique-match rule when the workflowId is unknown", () => {
		expect(
			resolveKbReference({
				kind: "stage",
				value: "Plan",
				entities,
				workflowId: "wf-nope",
			})?.id,
		).toBe("stage-plan");
	});

	it("scopes workflow resolution to the given project when projectScopeId is set", () => {
		// wf-solo only exists in proj-2; against the proj-1 snapshot it is unknown.
		expect(resolveKbReference({ kind: "workflow", value: "wf-solo", entities })).toBeNull();
		expect(
			resolveKbReference({ kind: "workflow", value: "wf-solo", entities, projectScopeId: "proj-2" })?.id,
		).toBe("wf-solo");
		expect(
			resolveKbReference({ kind: "workflow", value: "Solo", entities, projectScopeId: "proj-2" })?.id,
		).toBe("wf-solo");
		// A scope that resolves to no known project yields no candidates when the
		// snapshot can enumerate per project (the scope is authoritative).
		expect(
			resolveKbReference({ kind: "workflow", value: "wf-default", entities, projectScopeId: "proj-ghost" }),
		).toBeNull();
		// Snapshots without a workflowsFor accessor degrade to the snapshot set.
		expect(
			resolveKbReference({
				kind: "workflow",
				value: "wf-default",
				entities: { projects: entities.projects, workflows: entities.workflows },
				projectScopeId: "proj-ghost",
			})?.id,
		).toBe("wf-default");
	});

	it("scopes stage resolution to the given project's workflows when projectScopeId is set", () => {
		// "Only" exists only in proj-2's wf-solo.
		expect(
			resolveKbReference({ kind: "stage", value: "stage-only", entities, projectScopeId: "proj-2" })?.id,
		).toBe("stage-only");
		expect(
			resolveKbReference({
				kind: "stage",
				value: "Only",
				entities,
				workflowId: "wf-solo",
				projectScopeId: "proj-2",
			})?.id,
		).toBe("stage-only");
		// Scoped to proj-2, a proj-1 stage name is unknown.
		expect(
			resolveKbReference({ kind: "stage", value: "Idea", entities, projectScopeId: "proj-2" }),
		).toBeNull();
	});

	it("returns null for unknown, empty, or non-string values and unknown kinds", () => {
		expect(resolveKbReference({ kind: "project", value: "ghost", entities })).toBeNull();
		expect(resolveKbReference({ kind: "workflow", value: "  ", entities })).toBeNull();
		expect(resolveKbReference({ kind: "workflow", value: 42, entities })).toBeNull();
		expect(resolveKbReference({ kind: "ticket", value: "x", entities })).toBeNull();
		expect(resolveKbReference({ kind: "project", value: "", entities })).toBeNull();
	});
});

describe("validateSkillConfig", () => {
	const kbConfig = {
		keywords: {
			kbApiBase: { value: "http://localhost:3100", description: "API base" },
			targetProject: { value: "{{project}}", kbRef: "project" },
			targetWorkflow: { value: "wf-default", kbRef: "workflow", dependsOn: "targetProject" },
			targetStage: { value: "Idea", kbRef: "stage", dependsOn: "targetWorkflow" },
		},
	};

	it("accepts canonical ids and reports them as resolved references", () => {
		const result = validateSkillConfig({
			config: {
				kbApiBase: "http://elsewhere:3100",
				targetProject: "proj-1",
				targetWorkflow: "wf-audit-1",
				targetStage: "stage-audit",
			},
			kbConfig,
			entities,
			currentProjectId: "proj-1",
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.resolved.targetWorkflow).toEqual({
			id: "wf-audit-1",
			label: "Audit (wf-audit-1)",
		});
	});

	it("accepts legacy name references case-insensitively", () => {
		const result = validateSkillConfig({
			config: { targetProject: "KAINBAIN", targetWorkflow: "feature pipeline", targetStage: "idea" },
			kbConfig,
			entities,
			currentProjectId: "proj-1",
		});
		expect(result.valid).toBe(true);
		expect(result.resolved.targetStage?.id).toBe("stage-idea");
	});

	it("treats the {{project}} built-in as valid and resolves it against the current project", () => {
		const result = validateSkillConfig({
			config: { targetProject: "{{project}}" },
			kbConfig,
			entities,
			currentProjectId: "proj-2",
		});
		expect(result.valid).toBe(true);
		expect(result.resolved.targetProject).toEqual({
			id: "proj-2",
			label: "Scratch (proj-2)",
		});
	});

	it("treats {{project}} with an unknown current project as valid but unresolved", () => {
		const result = validateSkillConfig({
			config: { targetProject: "{{ project }}" },
			kbConfig,
			entities,
			currentProjectId: null,
		});
		expect(result.valid).toBe(true);
		expect(result.resolved.targetProject).toBeUndefined();
	});

	it("treats other {{...}} templates as valid built-ins resolved at run time", () => {
		const result = validateSkillConfig({
			config: { targetStage: "{{currentStage}}" },
			kbConfig,
			entities,
		});
		expect(result.valid).toBe(true);
	});

	it("rejects unknown references with descriptive errors", () => {
		const result = validateSkillConfig({
			config: {
				targetWorkflow: "wf-ghost",
				targetStage: "Nowhere",
			},
			kbConfig,
			entities,
		});
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(2);
		expect(result.errors[0]).toMatchObject({
			key: "targetWorkflow",
			value: "wf-ghost",
		});
		expect(result.errors[0].reason).toContain("no workflow with a matching id or name");
		expect(result.errors[1].key).toBe("targetStage");
		expect(result.errors[1].reason).toContain("no unique stage");
	});

	it("scopes stage validation to the workflow resolved from the config", () => {
		const result = validateSkillConfig({
			config: { targetWorkflow: "wf-audit-1", targetStage: "Audit" },
			kbConfig,
			entities,
		});
		expect(result.valid).toBe(true);
		expect(result.resolved.targetStage?.id).toBe("stage-audit");
	});

	it("passes unknown keys, non-string values, and empty overrides untouched", () => {
		const result = validateSkillConfig({
			config: {
				customFlag: "whatever",
				targetStage: 42,
				targetWorkflow: "",
				targetProject: null,
			},
			kbConfig,
			entities,
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it("passes everything for a legacy skill without kbRef metadata", () => {
		const legacy = { keywords: { targetStage: { value: "Idea" } } };
		const result = validateSkillConfig({
			config: { targetStage: "Totally Unknown", targetProject: "ghost" },
			kbConfig: legacy,
			entities,
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it("tolerates missing config, missing kbConfig, and odd shapes", () => {
		expect(validateSkillConfig({ kbConfig, entities }).valid).toBe(true);
		expect(validateSkillConfig({ config: null, kbConfig, entities }).valid).toBe(true);
		expect(validateSkillConfig({ config: { targetStage: "Plan" }, kbConfig: null, entities }).valid).toBe(
			true,
		);
	});
});

/*** Cross-project scoping — the deep-review regression (task 20d61742): *
 * validateSkillConfig used to scope workflow/stage resolution to the EDITED
 * project's workflows only, so a valid cross-project target (the documented
 * primary use of creating-new-tickets) was falsely rejected while the UI's
 * cascading dropdowns offered exactly those values. The tests below pin the
 * fixed behaviour: the effective project is resolved first ({{project}}/empty
 * => edited project, else the resolved known project) and workflow/stage
 * references are validated against THAT project's workflows.
 ***/
describe("validateSkillConfig — cross-project scoping", () => {
	const kbConfig = {
		keywords: {
			targetProject: { value: "{{project}}", kbRef: "project" },
			targetWorkflow: { value: "wf-default", kbRef: "workflow", dependsOn: "targetProject" },
			targetStage: { value: "Idea", kbRef: "stage", dependsOn: "targetWorkflow" },
		},
	};

	// Mirrors the deep-review reproduction: editing proj-a while targeting
	// proj-b's real workflow/stage (proj-b/wf-b1/s-b1).
	const reproStore = {
		listProjects: () => [
			{ id: "proj-a", name: "Project A", slug: "project-a" },
			{ id: "proj-b", name: "Project B", slug: "project-b" },
		],
		getWorkflows: (projectId) => {
			if (projectId === "proj-a") {
				return [
					{
						id: "wf-a1",
						name: "A Pipeline",
						isDefault: true,
						stages: [{ id: "s-a1", name: "Start" }],
					},
				];
			}
			if (projectId === "proj-b") {
				return [
					{
						id: "wf-b1",
						name: "B Pipeline",
						isDefault: true,
						stages: [{ id: "s-b1", name: "Inbox" }],
					},
				];
			}
			return [];
		},
	};

	const reproEntities = listKnownEntities({ projectStore: reproStore, projectId: "proj-a" });

	it("accepts a cross-project target by canonical ids (regression: deep-review reproduction)", () => {
		const result = validateSkillConfig({
			config: { targetProject: "proj-b", targetWorkflow: "wf-b1", targetStage: "s-b1" },
			kbConfig,
			entities: reproEntities,
			currentProjectId: "proj-a",
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.resolved.targetProject).toEqual({ id: "proj-b", label: "Project B (proj-b)" });
		expect(result.resolved.targetWorkflow).toEqual({ id: "wf-b1", label: "B Pipeline (wf-b1)" });
		expect(result.resolved.targetStage).toEqual({ id: "s-b1", label: "Inbox (s-b1)" });
	});

	it("accepts cross-project legacy references (name/slug) resolved against the target project", () => {
		const result = validateSkillConfig({
			config: { targetProject: "project-b", targetWorkflow: "b pipeline", targetStage: "inbox" },
			kbConfig,
			entities: reproEntities,
			currentProjectId: "proj-a",
		});
		expect(result.valid).toBe(true);
		expect(result.resolved.targetStage?.id).toBe("s-b1");
	});

	it("resolves cross-project targets regardless of config key order", () => {
		const result = validateSkillConfig({
			config: { targetStage: "s-b1", targetWorkflow: "wf-b1", targetProject: "proj-b" },
			kbConfig,
			entities: reproEntities,
			currentProjectId: "proj-a",
		});
		expect(result.valid).toBe(true);
		expect(result.resolved.targetStage?.id).toBe("s-b1");
	});

	it("scopes {{project}} and empty project keys to the project being edited", () => {
		const proj2Entities = listKnownEntities({ projectStore: store, projectId: "proj-2" });
		for (const targetProject of ["{{project}}", "", " {{project}} "]) {
			const result = validateSkillConfig({
				config: { targetProject, targetWorkflow: "wf-solo", targetStage: "stage-only" },
				kbConfig,
				entities: proj2Entities,
				currentProjectId: "proj-2",
			});
			expect(result.valid).toBe(true);
			expect(result.resolved.targetWorkflow?.id).toBe("wf-solo");
		}
	});

	it("validates stage references uniquely within the resolved target project", () => {
		// Editing proj-2 while targeting proj-1: "Idea" exists in BOTH of
		// proj-1's workflows, so without a workflow scope it is ambiguous there.
		const proj2Entities = listKnownEntities({ projectStore: store, projectId: "proj-2" });
		const ambiguous = validateSkillConfig({
			config: { targetProject: "proj-1", targetStage: "Idea" },
			kbConfig,
			entities: proj2Entities,
			currentProjectId: "proj-2",
		});
		expect(ambiguous.valid).toBe(false);
		expect(ambiguous.errors[0].reason).toContain("no unique stage");
		expect(ambiguous.errors[0].reason).toContain("KainBain (proj-1)");

		// A stage name unique within the target project resolves.
		const unique = validateSkillConfig({
			config: { targetProject: "proj-1", targetStage: "Plan" },
			kbConfig,
			entities: proj2Entities,
			currentProjectId: "proj-2",
		});
		expect(unique.valid).toBe(true);
		expect(unique.resolved.targetStage?.id).toBe("stage-plan");
	});

	it("names the effective project in cross-project error messages", () => {
		const result = validateSkillConfig({
			config: { targetProject: "proj-b", targetWorkflow: "wf-ghost" },
			kbConfig,
			entities: reproEntities,
			currentProjectId: "proj-a",
		});
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].reason).toBe(
			'Unknown workflow reference "wf-ghost" — no workflow with a matching id or name exists in project "Project B (proj-b)"',
		);
	});

	it("keeps the edited-project fallback when a project key is unresolvable", () => {
		// "ghost" produces an error for the project key itself; the workflow key
		// is still validated against the EDITED project's workflows (the pre-
		// cross-project behaviour), so only the project error is reported.
		const result = validateSkillConfig({
			config: { targetProject: "ghost", targetWorkflow: "wf-a1" },
			kbConfig,
			entities: reproEntities,
			currentProjectId: "proj-a",
		});
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ key: "targetProject", value: "ghost" });
	});

	it("aggregates cross-project failures through collectInvalidSkillReferences", () => {
		const ticketsDescriptor = {
			name: "creating-new-tickets",
			config: kbConfig,
		};
		const stages = [
			{
				id: "stage-ok",
				skills: [
					{
						name: "creating-new-tickets",
						mode: "direct",
						config: { targetProject: "proj-b", targetWorkflow: "wf-b1", targetStage: "s-b1" },
					},
				],
			},
			{
				id: "stage-bad",
				skills: [
					{
						name: "creating-new-tickets",
						mode: "direct",
						config: { targetProject: "proj-b", targetWorkflow: "wf-ghost" },
					},
				],
			},
		];
		const failures = collectInvalidSkillReferences({
			stages,
			projectId: "proj-a",
			projectStore: reproStore,
			skillsRegistry: registryFor({ "creating-new-tickets": ticketsDescriptor }),
		});
		expect(failures).toEqual([
			{
				skill: "creating-new-tickets",
				key: "targetWorkflow",
				value: "wf-ghost",
				reason: expect.stringContaining('in project "Project B (proj-b)"'),
			},
		]);
	});
});

describe("collectInvalidSkillReferences", () => {
	const ticketsDescriptor = {
		name: "creating-new-tickets",
		config: {
			keywords: {
				targetProject: { value: "{{project}}", kbRef: "project" },
				targetWorkflow: { value: "wf-default", kbRef: "workflow", dependsOn: "targetProject" },
				targetStage: { value: "Idea", kbRef: "stage", dependsOn: "targetWorkflow" },
			},
		},
	};

	const stages = [
		{
			id: "stage-a",
			skills: [
				{
					name: "creating-new-tickets",
					mode: "direct",
					config: { targetWorkflow: "wf-default", targetStage: "Idea" },
				},
			],
		},
		{
			id: "stage-b",
			skills: [
				{ name: "creating-new-tickets", mode: "direct", config: { targetStage: "Nowhere" } },
			],
		},
	];

	it("aggregates invalid references across stages with skill/key/value/reason", () => {
		const failures = collectInvalidSkillReferences({
			stages,
			projectId: "proj-1",
			projectStore: store,
			skillsRegistry: registryFor({ "creating-new-tickets": ticketsDescriptor }),
		});
		expect(failures).toEqual([
			{
				skill: "creating-new-tickets",
				key: "targetStage",
				value: "Nowhere",
				reason: expect.stringContaining("no unique stage"),
			},
		]);
	});

	it("returns [] when every attachment config is valid", () => {
		const failures = collectInvalidSkillReferences({
			stages: [
				{
					id: "stage-a",
					skills: [
						{
							name: "creating-new-tickets",
							config: { targetWorkflow: "wf-default", targetStage: "Plan" },
						},
					],
				},
			],
			projectId: "proj-1",
			projectStore: store,
			skillsRegistry: registryFor({ "creating-new-tickets": ticketsDescriptor }),
		});
		expect(failures).toEqual([]);
	});

	it("tolerates unknown skills, invalid descriptors, nameless attachments, and legacy configs", () => {
		const failures = collectInvalidSkillReferences({
			stages: [
				{
					id: "stage-a",
					skills: [
						{ name: "ghost-skill", config: { targetStage: "Nowhere" } },
						{ config: { targetStage: "Nowhere" } },
						{
							name: "broken-skill",
							config: { targetStage: "Nowhere" },
						},
						{
							name: "legacy-skill",
							config: { anything: "goes" },
						},
					],
				},
			],
			projectId: "proj-1",
			projectStore: store,
			skillsRegistry: registryFor({
				"broken-skill": { name: "broken-skill", invalid: true, config: null },
				"legacy-skill": {
					name: "legacy-skill",
					config: { keywords: { anything: { value: "x" } } },
				},
			}),
		});
		expect(failures).toEqual([]);
	});

	it("resolves the project overlay scope from the project record's cwd", () => {
		const seen = [];
		const registry = {
			getSkill: (name, { projectCwd } = {}) => {
				seen.push(projectCwd);
				return ticketsDescriptor;
			},
		};
		collectInvalidSkillReferences({
			stages: [{ id: "s", skills: [{ name: "creating-new-tickets", config: {} }] }],
			project: { id: "proj-1", cwd: "/home/server/projects/kainbain" },
			projectId: "proj-1",
			projectStore: store,
			skillsRegistry: registry,
		});
		expect(seen).toEqual(["/home/server/projects/kainbain"]);
	});

	it("returns [] for malformed stages or a registry without getSkill", () => {
		expect(
			collectInvalidSkillReferences({
				stages: "not-an-array",
				projectId: "proj-1",
				projectStore: store,
				skillsRegistry: registryFor({}),
			}),
		).toEqual([]);
		expect(
			collectInvalidSkillReferences({
				stages,
				projectId: "proj-1",
				projectStore: store,
				skillsRegistry: { noGetSkill: true },
			}),
		).toEqual([]);
		expect(collectInvalidSkillReferences()).toEqual([]);
	});

	it("never throws when the store explodes mid-validation", () => {
		const brokenStore = {
			listProjects: () => store.listProjects(),
			getWorkflows: () => {
				throw new Error("disk on fire");
			},
		};
		const failures = collectInvalidSkillReferences({
			stages,
			projectId: "proj-1",
			projectStore: brokenStore,
			skillsRegistry: registryFor({ "creating-new-tickets": ticketsDescriptor }),
		});
		// Entities degrade to projects-only; workflows unknown so workflow/stage
		// references cannot resolve -> reported, not thrown (once per attachment).
		expect(new Set(failures.map((f) => f.key))).toEqual(
			new Set(["targetStage", "targetWorkflow"]),
		);
		expect(failures.length).toBeGreaterThanOrEqual(3);
	});

	it("uses validateSkillConfig via the real registry API (getSkill contract)", () => {
		const skillsRegistry = { getSkill: vi.fn(() => ticketsDescriptor) };
		collectInvalidSkillReferences({
			stages,
			projectId: "proj-1",
			projectStore: store,
			skillsRegistry,
		});
		expect(skillsRegistry.getSkill).toHaveBeenCalledWith("creating-new-tickets", {
			projectCwd: null,
		});
	});
});