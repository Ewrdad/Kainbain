import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: point the stores at throwaway roots BEFORE the app (and every
// store it constructs at import time) is loaded, so no fixture in this file
// can ever touch the live projects root or the live SilverBullet notes space.
// Mirrors the mkdtemp + rmSync convention used by projectStore.test.js.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/**
 * MARK: Project & Workflow API Integration
 * @description Verifies project discovery, automated symlinked provisioning,
 * workflow stage management, non-linear failback (jump to any stage), and deletion.
 */
describe("Project & Workflow API Integration", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("should list discovered or seeded projects", async () => {
		await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Initial Project" },
		});
		const res = await app.inject({ method: "GET", url: "/projects" });
		expect(res.statusCode).toBe(200);
		const projects = JSON.parse(res.payload);
		expect(projects.length).toBeGreaterThanOrEqual(1);
	});

	it("should create a new project with default stages, slug, and directories", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Provisioned App" },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.name).toBe("Provisioned App");
		expect(project.slug).toBe("provisioned-app");
		expect(project.stages.length).toBeGreaterThan(0);
		// Stages must carry a type discriminator (agent | human)
		expect(project.stages.some((s) => s.type === "agent")).toBe(true);
		expect(project.stages.some((s) => s.type === "human")).toBe(true);
	});

	it("never echoes credential-bearing remote URLs back through the API (audit K-1)", async () => {
		const token = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Token Route App",
				gitUrl: `https://${token}@git.example.com/team/r.git`,
			},
		});
		expect(res.statusCode).toBe(201);
		expect(res.payload).not.toContain(token);
		expect(res.payload).toContain("https://git.example.com/team/r.git");
		const project = JSON.parse(res.payload);

		const fetched = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		expect(fetched.statusCode).toBe(200);
		expect(fetched.payload).not.toContain(token);
	});

	it("should reject project creation when name is missing", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("name is required");
	});

	it("should accept a harness choice on create and echo it in the payload", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Harness Route App", harness: "pi" },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.harness).toBe("pi");

		// GET reflects the stored choice.
		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		expect(JSON.parse(getRes.payload).harness).toBe("pi");
	});

	it("should omit harness (follow-the-default) when create omits it", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Harness Default App" },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		// No resolved default is echoed: an absent key means the configured
		// default harness applies at session time.
		expect(project).not.toHaveProperty("harness");
	});

	it("should reject a non-string harness on create", async () => {
		// fastify's default ajv coerces scalars (123 → "123") for string schemas —
		// the app-wide convention for string fields — but non-coercible shapes
		// (objects/arrays) are a client error.
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Bad Harness App", harness: { nested: true } },
		});
		expect(res.statusCode).toBe(400);
	});

	it("should update the harness via patch and reflect it on get", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Harness Patch App", harness: "pi" },
		});
		const created = JSON.parse(createRes.payload);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { harness: "next-harness" },
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).harness).toBe("next-harness");

		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${created.id}`,
		});
		expect(JSON.parse(getRes.payload).harness).toBe("next-harness");
	});

	it("should reject a non-string harness on patch", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Harness Patch Bad App" },
		});
		const created = JSON.parse(createRes.payload);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { harness: [] },
		});
		expect(patchRes.statusCode).toBe(400);
	});

	it("should accept retry and timeout overrides on create and echo them in the payload", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Retry Settings App",
				maxAutoIterations: 3,
				maxTransientRetries: 2,
				autoIterationEnabled: false,
				agentTimeoutMs: 111111,
				ciTimeoutMs: 22222,
			},
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.maxAutoIterations).toBe(3);
		expect(project.maxTransientRetries).toBe(2);
		expect(project.autoIterationEnabled).toBe(false);
		expect(project.agentTimeoutMs).toBe(111111);
		expect(project.ciTimeoutMs).toBe(22222);
	});

	it("should update and clear retry overrides via patch and reflect them on get", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Retry Patch App", maxAutoIterations: 3 },
		});
		const created = JSON.parse(createRes.payload);
		expect(created.maxAutoIterations).toBe(3);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { maxAutoIterations: 5, autoIterationEnabled: false },
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).maxAutoIterations).toBe(5);
		expect(JSON.parse(patchRes.payload).autoIterationEnabled).toBe(false);

		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${created.id}`,
		});
		expect(JSON.parse(getRes.payload).maxAutoIterations).toBe(5);

		// Null clears the override back to "follow the default".
		const clearRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { maxAutoIterations: null, autoIterationEnabled: null },
		});
		expect(clearRes.statusCode).toBe(200);
		expect(JSON.parse(clearRes.payload).maxAutoIterations).toBeUndefined();
		expect(JSON.parse(clearRes.payload).autoIterationEnabled).toBeUndefined();
	});

	it("should reject mistyped retry overrides on patch", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Retry Patch Bad App" },
		});
		const created = JSON.parse(createRes.payload);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { maxAutoIterations: "many", autoIterationEnabled: "no" },
		});
		expect(patchRes.statusCode).toBe(400);
	});

	it("should accept a harnessCommand on create and echo it in the payload", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Custom Command App",
				harness: "custom",
				harnessCommand: "claude -p",
			},
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.harness).toBe("custom");
		expect(project.harnessCommand).toBe("claude -p");

		// GET reflects the stored command line.
		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		const fetched = JSON.parse(getRes.payload);
		expect(fetched.harness).toBe("custom");
		expect(fetched.harnessCommand).toBe("claude -p");
	});

	it("should update and clear the harnessCommand via patch", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Custom Command Patch App",
				harness: "custom",
				harnessCommand: "claude -p",
			},
		});
		const created = JSON.parse(createRes.payload);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { harnessCommand: "muse exec --yolo" },
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).harnessCommand).toBe("muse exec --yolo");

		// An empty string clears the command (normalized to absent on the wire).
		const clearRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { harnessCommand: "" },
		});
		expect(clearRes.statusCode).toBe(200);
		expect(JSON.parse(clearRes.payload)).not.toHaveProperty("harnessCommand");
	});

	it("should reject a non-string harnessCommand on patch", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Command Patch Bad App" },
		});
		const created = JSON.parse(createRes.payload);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { harnessCommand: 42 },
		});
		// Scalars coerce for string schemas (app-wide convention), so a NUMBER
		// coerces; only non-coercible shapes are client errors.
		expect(patchRes.statusCode).toBe(200);

		const badRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { harnessCommand: { cli: "claude -p" } },
		});
		expect(badRes.statusCode).toBe(400);
	});

	it("should activate a project and resolve it as the active project", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const target = projects[projects.length - 1];

		const actRes = await app.inject({
			method: "POST",
			url: `/projects/${target.id}/activate`,
		});
		expect(actRes.statusCode).toBe(200);
		expect(JSON.parse(actRes.payload).projectId).toBe(target.id);
	});

	it("should return 404 for a non-existent project", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/projects/non-existent-id",
		});
		expect(res.statusCode).toBe(404);
	});

	it("should return a project by id", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const target = projects[0];

		const res = await app.inject({
			method: "GET",
			url: `/projects/${target.id}`,
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).id).toBe(target.id);
		expect(JSON.parse(res.payload).stages.length).toBeGreaterThan(0);
	});

	it("should patch a project's name", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const target = projects[0];

		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${target.id}`,
			payload: { name: "Renamed Project" },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).name).toBe("Renamed Project");
	});

	it("should return 404 when patching a non-existent project", async () => {
		const res = await app.inject({
			method: "PATCH",
			url: "/projects/non-existent-id",
			payload: { name: "X" },
		});
		expect(res.statusCode).toBe(404);
	});

	it("should get and update a project's workflow stages", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const project = projects[0];

		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/workflow`,
		});
		expect(getRes.statusCode).toBe(200);
		const { stages } = JSON.parse(getRes.payload);
		expect(stages.length).toBeGreaterThan(0);

		const updatedStages = stages.map((s) => ({ ...s, paused: true }));
		const putRes = await app.inject({
			method: "PUT",
			url: `/projects/${project.id}/workflow`,
			payload: { stages: updatedStages },
		});
		expect(putRes.statusCode).toBe(200);
		expect(JSON.parse(putRes.payload).stages.every((s) => s.paused)).toBe(true);
	});

	it("should jump to any stage (non-linear failback)", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const project = projects[0];
		const stages = project.stages;

		// Jump to the last stage directly (non-adjacent)
		const lastStage = stages[stages.length - 1];
		const jumpRes = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/workflow/jump`,
			payload: { stageId: lastStage.id },
		});
		expect(jumpRes.statusCode).toBe(200);
		expect(JSON.parse(jumpRes.payload).currentStageId).toBe(lastStage.id);
	});

	it("should skip to the next stage", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const project = projects[0];
		const stages = project.stages;

		// Jump to the first stage, then skip forward
		await app.inject({
			method: "POST",
			url: `/projects/${project.id}/workflow/jump`,
			payload: { stageId: stages[0].id },
		});
		const skipRes = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/workflow/skip`,
		});
		expect(skipRes.statusCode).toBe(200);
		expect(JSON.parse(skipRes.payload).currentStageId).toBe(stages[1].id);
	});

	it("should reject a jump to a non-existent stage", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const project = projects[0];

		const res = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/workflow/jump`,
			payload: { stageId: "does-not-exist" },
		});
		expect(res.statusCode).toBe(404);
	});

	it("should delete a project via DELETE /projects/:id", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "To Be Deleted" },
		});
		const created = JSON.parse(createRes.payload);

		const deleteRes = await app.inject({
			method: "DELETE",
			url: `/projects/${created.id}`,
		});
		expect(deleteRes.statusCode).toBe(200);
		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${created.id}`,
		});
		expect(getRes.statusCode).toBe(404);
	});

	it("round-trips stage.skills through PUT /projects/:id/workflow (incl. expectedUpdatedAt)", async () => {
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(listRes.payload);
		const project = projects[0];

		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/workflow`,
		});
		const { stages } = JSON.parse(getRes.payload);

		const stagesWithSkills = stages.map((s, i) =>
			i === 0
				? {
						...s,
						skills: [
							{
								name: "creating-new-tickets",
								mode: "direct",
								// Canonical references only, since save-time kbRef validation is active.
								config: {
									targetWorkflow: "wf-default",
									targetStage: "Idea",
									customFlag: "preserved",
								},
							},
						],
					}
				: s,
		);

		const putRes = await app.inject({
			method: "PUT",
			url: `/projects/${project.id}/workflow`,
			payload: { stages: stagesWithSkills },
		});
		expect(putRes.statusCode).toBe(200);
		const { stages: updated } = JSON.parse(putRes.payload);
		expect(updated[0].skills).toEqual([
			{
				name: "creating-new-tickets",
				mode: "direct",
				config: {
					targetWorkflow: "wf-default",
					targetStage: "Idea",
					customFlag: "preserved",
				},
			},
		]);

		// And a re-fetch reflects the persisted state.
		const reGet = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/workflow`,
		});
		const { stages: reloaded } = JSON.parse(reGet.payload);
		expect(reloaded[0].skills[0].name).toBe("creating-new-tickets");
		expect(reloaded[0].skills[0].config.targetStage).toBe("Idea");

		// Restore the original stages so other tests are unaffected.
		await app.inject({
			method: "PUT",
			url: `/projects/${project.id}/workflow`,
			payload: { stages },
		});
	});

	it("should manage named workflows via /projects/:id/workflows endpoints", async () => {
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Workflow Route App" },
		});
		const project = JSON.parse(projRes.payload);

		// List initial workflows
		const listWfRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/workflows`,
		});
		expect(listWfRes.statusCode).toBe(200);
		const listData = JSON.parse(listWfRes.payload);
		expect(listData.workflows.length).toBe(1);
		expect(listData.activeWorkflowId).toBe(listData.workflows[0].id);

		// Create a new workflow
		const createWfRes = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/workflows`,
			payload: {
				name: "Release Pipeline",
				stages: [
					{ id: "rel-1", name: "Release Prep", type: "agent" },
					{ id: "rel-2", name: "Publish", type: "ci", command: "npm publish" },
				],
			},
		});
		expect(createWfRes.statusCode).toBe(201);
		const newWf = JSON.parse(createWfRes.payload);
		expect(newWf.name).toBe("Release Pipeline");
		expect(newWf.stages.length).toBe(2);

		// Switch to the new workflow
		const switchRes = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/workflows/${newWf.id}/switch`,
		});
		expect(switchRes.statusCode).toBe(200);
		expect(JSON.parse(switchRes.payload).activeWorkflowId).toBe(newWf.id);

		// Update the workflow
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}/workflows/${newWf.id}`,
			payload: { name: "Automated Release Pipeline" },
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).name).toBe("Automated Release Pipeline");

		// Delete the workflow
		const deleteWfRes = await app.inject({
			method: "DELETE",
			url: `/projects/${project.id}/workflows/${newWf.id}`,
		});
		expect(deleteWfRes.statusCode).toBe(200);
		expect(JSON.parse(deleteWfRes.payload).status).toBe("deleted");
	});

	it("should return 409 Conflict when updating project with mismatched expectedUpdatedAt", async () => {
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Concurrency App" },
		});
		const project = JSON.parse(projRes.payload);

		const conflictRes = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: {
				name: "Stale Edit",
				expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
			},
		});
		expect(conflictRes.statusCode).toBe(409);
		expect(JSON.parse(conflictRes.payload).error).toContain(
			"modified concurrently",
		);
	});
});

/**
 * MARK: Save-time skill reference validation
 * @description Verifies the PUT /projects/:id/workflow gate over
 *   stage.skills[i].config values whose keyword declares kbRef metadata
 *   (api/kbReferences.js): unknown references are rejected with a descriptive
 *   400 while legacy skills, unknown keys, non-string values, built-in
 *   templates, and canonical ids keep saving.
 ***/
describe("Save-time skill reference validation", () => {
	const SCRATCH = "KB Ref Validation Scratch";
	let projectId;

	beforeAll(async () => {
		await app.ready();
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: SCRATCH },
		});
		expect(res.statusCode).toBe(201);
		projectId = JSON.parse(res.payload).id;
	});

	afterAll(async () => {
		// Remove the scratch project so repeated runs (and the live projects
		// root) are not polluted by validation fixtures.
		if (projectId) {
			await app.inject({ method: "DELETE", url: `/projects/${projectId}` });
		}
	});

	async function getStages() {
		const res = await app.inject({
			method: "GET",
			url: `/projects/${projectId}/workflow`,
		});
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload).stages;
	}

	function withFirstStageSkill(stages, skill) {
		return stages.map((s, i) => (i === 0 ? { ...s, skills: [skill] } : s));
	}

	it("accepts a valid canonical config (ids) for a kbRef-declared skill", async () => {
		const stages = await getStages();
		// A fresh project's workflow ids are generated (not wf-default), so
		// resolve the project's own canonical ids for the payload.
		const wfRes = await app.inject({
			method: "GET",
			url: `/projects/${projectId}/workflows`,
		});
		const workflows = JSON.parse(wfRes.payload).workflows || [];
		const workflow = workflows.find((w) => Array.isArray(w.stages) && w.stages.length > 0);
		expect(workflow).toBeTruthy();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${projectId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					name: "creating-new-tickets",
					mode: "direct",
					config: {
						targetProject: "{{project}}",
						targetWorkflow: workflow.id,
						targetStage: workflow.stages[0].id,
					},
				}),
			},
		});
		expect(res.statusCode).toBe(200);
	});

	it("rejects an unknown stage name with a descriptive 400 and details", async () => {
		const stages = await getStages();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${projectId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					name: "creating-new-tickets",
					mode: "direct",
					config: { targetStage: "NoSuchStageAnywhere" },
				}),
			},
		});
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.error).toContain("Invalid skill target references");
		expect(body.details).toEqual([
			{
				skill: "creating-new-tickets",
				key: "targetStage",
				value: "NoSuchStageAnywhere",
				reason: expect.stringContaining("no unique stage"),
			},
		]);
	});

	it("rejects an unknown workflow id the same way", async () => {
		const stages = await getStages();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${projectId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					name: "creating-new-tickets",
					mode: "direct",
					config: { targetWorkflow: "wf-ghost" },
				}),
			},
		});
		expect(res.statusCode).toBe(400);
		const { details } = JSON.parse(res.payload);
		expect(details[0]).toMatchObject({
			skill: "creating-new-tickets",
			key: "targetWorkflow",
			value: "wf-ghost",
		});
		expect(details[0].reason).toContain("no workflow with a matching id or name");
	});

	it("tolerates a skill missing from the registry (unknown keys and non-string values pass)", async () => {
		const stages = await getStages();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${projectId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					name: "no-such-skill-in-any-library",
					mode: "direct",
					config: { anythingAtAll: "ghost", keepMe: 42 },
				}),
			},
		});
		expect(res.statusCode).toBe(200);
	});

	it("tolerates a registry-known legacy skill whose KB_config declares no kbRef metadata", async () => {
		const stages = await getStages();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${projectId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					// Real library skill (skills/kainbain-task-analysis): known to the
					// registry but carries no kbRef metadata, so every config value
					// must pass validation untouched (legacy tolerance).
					name: "kainbain-task-analysis",
					mode: "direct",
					config: { anythingAtAll: "ghost", keepMe: 42 },
				}),
			},
		});
		expect(res.statusCode).toBe(200);
	});

	it("tolerates non-kbRef keywords (kbApiBase) and empty overrides on a kbRef skill", async () => {
		const stages = await getStages();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${projectId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					name: "creating-new-tickets",
					mode: "direct",
					config: { kbApiBase: "http://anywhere:9999", targetStage: "" },
				}),
			},
		});
		expect(res.statusCode).toBe(200);
	});

	it("still enforces the stages-array shape before validation", async () => {
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${projectId}/workflow`,
			payload: { stages: "nope" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("stages array is required");
	});
});

/**
 * MARK: Save-time skill reference validation — cross-project targets
 * @description Deep-review regression (task 20d61742): the save-time gate used
 *   to scope workflow/stage resolution to the EDITED project's workflows only,
 *   so a valid cross-project target (the documented primary use of
 *   creating-new-tickets) was falsely rejected with a misleading 400 even
 *   though the stage-skills panel's cascading dropdowns offer exactly those
 *   values. These tests pin the fixed behaviour end-to-end against the real
 *   store: a config pointing at ANOTHER project's canonical workflow/stage
 *   saves, while a reference that does not exist in the TARGET project is
 *   still rejected with an error naming the target project.
 ***/
describe("Save-time skill reference validation — cross-project targets", () => {
	const SOURCE = "KB Ref Cross Source";
	const TARGET = "KB Ref Cross Target";
	let sourceId;
	let targetId;

	beforeAll(async () => {
		await app.ready();
		const src = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: SOURCE },
		});
		expect(src.statusCode).toBe(201);
		sourceId = JSON.parse(src.payload).id;
		const tgt = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: TARGET },
		});
		expect(tgt.statusCode).toBe(201);
		targetId = JSON.parse(tgt.payload).id;
	});

	afterAll(async () => {
		// Remove the scratch projects so repeated runs (and the live projects
		// root) are not polluted by validation fixtures.
		if (sourceId) await app.inject({ method: "DELETE", url: `/projects/${sourceId}` });
		if (targetId) await app.inject({ method: "DELETE", url: `/projects/${targetId}` });
	});

	async function getSourceStages() {
		const res = await app.inject({
			method: "GET",
			url: `/projects/${sourceId}/workflow`,
		});
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload).stages;
	}

	function withFirstStageSkill(stages, skill) {
		return stages.map((s, i) => (i === 0 ? { ...s, skills: [skill] } : s));
	}

	async function getTargetWorkflow() {
		const res = await app.inject({
			method: "GET",
			url: `/projects/${targetId}/workflows`,
		});
		expect(res.statusCode).toBe(200);
		const workflows = JSON.parse(res.payload).workflows || [];
		const workflow = workflows.find((w) => Array.isArray(w.stages) && w.stages.length > 0);
		expect(workflow).toBeTruthy();
		return workflow;
	}

	it("accepts a config targeting another known project's canonical workflow/stage (regression)", async () => {
		const stages = await getSourceStages();
		const workflow = await getTargetWorkflow();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${sourceId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					name: "creating-new-tickets",
					mode: "direct",
					config: {
						targetProject: targetId,
						targetWorkflow: workflow.id,
						targetStage: workflow.stages[0].id,
					},
				}),
			},
		});
		expect(res.statusCode).toBe(200);
	});

	it("still rejects a cross-project config whose workflow is unknown in the target project", async () => {
		const stages = await getSourceStages();
		const res = await app.inject({
			method: "PUT",
			url: `/projects/${sourceId}/workflow`,
			payload: {
				stages: withFirstStageSkill(stages, {
					name: "creating-new-tickets",
					mode: "direct",
					config: { targetProject: targetId, targetWorkflow: "wf-ghost" },
				}),
			},
		});
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.error).toContain("Invalid skill target references");
		expect(body.details[0]).toMatchObject({
			skill: "creating-new-tickets",
			key: "targetWorkflow",
			value: "wf-ghost",
		});
		// The error names the effective (target) project scoping.
		expect(body.details[0].reason).toContain(`project "${TARGET} (${targetId})"`);
	});
});
