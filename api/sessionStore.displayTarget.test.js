import { describe, it, expect } from "vitest";
import { SessionStore } from "./sessionStore.js";
import { selectAliasTarget } from "./aliasSelector.js";
import { registerHarness } from "./agent/harnessRegistry.js";

/***
 * MARK: resolveDisplayTarget tests
 * @description Pins the display-resolution seam: one peek-only call returns
 *   the FULL alias pick (concrete harness + model together, plus the alias
 *   identity), mirroring dispatch's `resolveStageTarget` without consuming
 *   rotation steps. Non-alias pairs pass both model slots through
 *   byte-identically; `resolveDisplayHarness` delegates for its harness half.
 ***/

let unique = 5000;
const nextId = (prefix) => `${prefix}-${++unique}`;

function registerSpyHarness() {
	const name = nextId("display-target-harness");
	registerHarness(
		name,
		() => ({ createSession: async () => ({}), modelSelection: "list" }),
		{ description: "resolveDisplayTarget test harness" },
	);
	return name;
}

function projectWith(overrides = {}) {
	return { id: nextId("proj"), cwd: "/tmp/display-target", ...overrides };
}

describe("resolveDisplayTarget stage alias refs", () => {
	it("resolves a single-target stage alias to harness + model + alias identity", () => {
		const target = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "pi",
			defaultModel: "google::base",
			modelAliases: [{ name: "small", harness: target, model: "google::m1" }],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ id: "s1", harness: "alias", model: "small" },
			{ peek: true },
		);
		expect(resolved).toMatchObject({
			harnessName: target,
			modelRef: "google::m1",
			projectModelRef: undefined,
			aliasName: "small",
			aliasMissing: null,
			targetIndex: 0,
		});
		expect(resolved.harness).toBe(store.getHarness(project, target));
	});

	it("previews the same next pick across peeks and never advances the counter", () => {
		const first = registerSpyHarness();
		const second = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "pi",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: first, model: "m1", percent: 50 },
						{ harness: second, model: "m2", percent: 50 },
					],
				},
			],
		});
		const stage = { id: "s1", harness: "alias", model: "mix" };
		const firstPeek = store.resolveDisplayTarget(project, stage, { peek: true });
		const secondPeek = store.resolveDisplayTarget(project, stage, { peek: true });
		expect(secondPeek).toMatchObject({
			harnessName: firstPeek.harnessName,
			modelRef: firstPeek.modelRef,
			aliasName: "mix",
			targetIndex: firstPeek.targetIndex,
		});
		// The live rotation still serves the peeked target first (peeks
		// consumed nothing), then moves on.
		const liveFirst = selectAliasTarget(project, "mix", {
			isHarnessKnown: () => true,
		});
		expect(liveFirst.harness).toBe(firstPeek.harnessName);
		expect(liveFirst.model).toBe(firstPeek.modelRef);
		expect(liveFirst.targetIndex).toBe(firstPeek.targetIndex);
		const liveSecond = selectAliasTarget(project, "mix", {
			isHarnessKnown: () => true,
		});
		expect(liveSecond.harness).not.toBe(firstPeek.harnessName);
	});

	it("keeps harness and model on the same weighted target", () => {
		const first = registerSpyHarness();
		const second = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "pi",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: first, model: "google::m1", percent: 50 },
						{ harness: second, model: "m2", percent: 50 },
					],
				},
			],
		});
		const both = new Set([`${first}::google::m1`, `${second}::m2`]);
		for (let i = 0; i < 4; i++) {
			const resolved = store.resolveDisplayTarget(
				project,
				{ id: "s1", harness: "alias", model: "mix" },
				{ peek: true },
			);
			expect(both.has(`${resolved.harnessName}::${resolved.modelRef}`)).toBe(
				true,
			);
		}
	});

	it("skips targets on unknown harnesses for that resolution", () => {
		const known = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "pi",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: "no-such-harness", model: "ghost-model", percent: 90 },
						{ harness: known, model: "m2", percent: 10 },
					],
				},
			],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ id: "s1", harness: "alias", model: "mix" },
			{ peek: true },
		);
		expect(resolved).toMatchObject({
			harnessName: known,
			modelRef: "m2",
			aliasName: "mix",
			aliasMissing: null,
			targetIndex: 1,
		});
	});

	it("falls back naming the alias when the stage alias is unknown", () => {
		const store = new SessionStore({});
		const project = projectWith({
			harness: "pi",
			defaultModel: "google::base",
			modelAliases: [],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ id: "s1", harness: "alias", model: "ghost" },
			{ peek: true },
		);
		expect(resolved).toMatchObject({
			harnessName: "pi",
			modelRef: undefined,
			projectModelRef: "google::base",
			aliasName: "ghost",
			aliasMissing: "ghost",
			targetIndex: null,
		});
	});

	it("names '(blank)' when the stage alias name is blank", () => {
		const store = new SessionStore({});
		const project = projectWith({
			harness: "pi",
			defaultModel: "google::base",
			modelAliases: [{ name: "small", harness: "pi", model: "m" }],
		});
		for (const model of ["", "   ", undefined]) {
			const resolved = store.resolveDisplayTarget(
				project,
				{ id: "s1", harness: "alias", model },
				{ peek: true },
			);
			expect(resolved).toMatchObject({
				aliasName: null,
				aliasMissing: "(blank)",
				modelRef: undefined,
				projectModelRef: "google::base",
			});
		}
	});

	it("peek-resolves the project-default alias for the fallback when the stage alias is unknown", () => {
		const target = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: target, model: "google::m1" }],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ id: "s1", harness: "alias", model: "ghost" },
			{ peek: true },
		);
		// The shown fallback is the project-default pick (harness AND
		// model together); the stage alias name clears the stage slot so
		// no alias name ever shows as a model.
		expect(resolved).toMatchObject({
			harnessName: target,
			modelRef: undefined,
			projectModelRef: "google::m1",
			aliasMissing: "ghost",
		});
	});

	it("carries the blank pick model for self-managed harness targets", () => {
		const target = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "pi",
			defaultModel: "google::base",
			modelAliases: [{ name: "cli", harness: target, model: "" }],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ id: "s1", harness: "alias", model: "cli" },
			{ peek: true },
		);
		expect(resolved).toMatchObject({
			harnessName: target,
			modelRef: "",
			projectModelRef: undefined,
			aliasName: "cli",
			aliasMissing: null,
			targetIndex: 0,
		});
	});
});

describe("resolveDisplayTarget project-default aliases", () => {
	it("resolves an inherited project-default alias to harness + model together", () => {
		const target = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: target, model: "google::m1" }],
		});
		for (const stage of [undefined, {}, { harness: "" }, { id: "s1" }]) {
			const resolved = store.resolveDisplayTarget(project, stage, {
				peek: true,
			});
			expect(resolved).toMatchObject({
				harnessName: target,
				modelRef: "google::m1",
				projectModelRef: undefined,
				aliasName: "small",
				aliasMissing: null,
				targetIndex: 0,
			});
		}
	});

	it("ignores the stage model for an inherited alias exactly like dispatch", () => {
		const target = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: target, model: "google::m1" }],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ id: "s1", model: "explicit-but-ignored" },
			{ peek: true },
		);
		expect(resolved).toMatchObject({
			harnessName: target,
			modelRef: "google::m1",
			aliasName: "small",
		});
	});

	it("falls back with cleared model slots when the project alias is unknown", () => {
		const store = new SessionStore({});
		const project = projectWith({
			harness: "alias",
			defaultModel: "ghost",
			modelAliases: [],
		});
		const resolved = store.resolveDisplayTarget(project, undefined, {
			peek: true,
		});
		expect(resolved).toMatchObject({
			harnessName: "pi",
			modelRef: undefined,
			projectModelRef: undefined,
			aliasName: "ghost",
			aliasMissing: "ghost",
			targetIndex: null,
		});
	});

	it("names '(blank)' when the project alias name is blank", () => {
		const store = new SessionStore({});
		const project = projectWith({
			harness: "alias",
			defaultModel: "   ",
			modelAliases: [{ name: "small", harness: "pi", model: "m" }],
		});
		const resolved = store.resolveDisplayTarget(project, {}, { peek: true });
		expect(resolved).toMatchObject({
			harnessName: "pi",
			modelRef: undefined,
			projectModelRef: undefined,
			aliasName: null,
			aliasMissing: "(blank)",
		});
	});
});

describe("resolveDisplayTarget non-alias passthrough", () => {
	it("passes both model slots through byte-identically", () => {
		const store = new SessionStore({});
		const project = projectWith({ harness: "pi", defaultModel: "google::base" });
		for (const stage of [
			undefined,
			{},
			{ harness: "", model: undefined },
			{ harness: "custom", model: "p::requested" },
			{ harness: "custom", model: "" },
			{ harness: "custom", model: "default" },
		]) {
			const resolved = store.resolveDisplayTarget(project, stage, {
				peek: true,
			});
			expect(resolved.modelRef).toBe(stage?.model);
			expect(resolved.projectModelRef).toBe("google::base");
			expect(resolved.aliasName).toBeNull();
			expect(resolved.aliasMissing).toBeNull();
			expect(resolved.targetIndex).toBeNull();
		}
	});

	it("an explicit non-alias harness wins over an alias project default", () => {
		const target = registerSpyHarness();
		const store = new SessionStore({});
		const project = projectWith({
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: target, model: "google::m1" }],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ id: "s1", harness: "custom", model: "p::requested" },
			{ peek: true },
		);
		expect(resolved).toMatchObject({
			harnessName: "custom",
			modelRef: "p::requested",
			projectModelRef: "small",
			aliasName: null,
			aliasMissing: null,
		});
	});

	it("honors the pinned test harness with no alias", () => {
		const pinned = { createSession: async () => ({}) };
		const store = new SessionStore({ harness: pinned });
		const project = projectWith({
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: "pi", model: "m" }],
		});
		const resolved = store.resolveDisplayTarget(
			project,
			{ harness: "alias", model: "small" },
			{ peek: true },
		);
		expect(resolved.harness).toBe(pinned);
		expect(resolved.aliasName).toBeNull();
		expect(resolved.aliasMissing).toBeNull();
	});
});

describe("resolveDisplayHarness delegation", () => {
	it("returns the seam's harness half for every shape", () => {
		const target = registerSpyHarness();
		const store = new SessionStore({});
		const aliasProject = projectWith({
			harness: "pi",
			defaultModel: "google::base",
			modelAliases: [{ name: "small", harness: target, model: "google::m1" }],
		});
		for (const [project, stage] of [
			[aliasProject, { harness: "alias", model: "small" }],
			[aliasProject, { harness: "alias", model: "ghost" }],
			[aliasProject, { harness: "custom", model: "p::m" }],
			[aliasProject, undefined],
			[
				projectWith({
					harness: "alias",
					defaultModel: "small",
					modelAliases: aliasProject.modelAliases,
				}),
				{},
			],
		]) {
			const viaSeam = store.resolveDisplayTarget(project, stage, {
				peek: true,
			});
			const viaHarness = store.resolveDisplayHarness(project, stage, {
				peek: true,
			});
			expect(viaHarness.name).toBe(viaSeam.harnessName);
			expect(viaHarness.harness).toBe(viaSeam.harness);
		}
	});
});
