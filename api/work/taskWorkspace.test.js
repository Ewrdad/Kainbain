// Domain: The Work — unit tests for store-bound workspace/cwd resolution.
import { describe, it, expect } from "vitest";
import path from "node:path";
import {
	resolveProjectCwdForStore,
	repairDocsLinkAfterSwitch,
} from "./taskWorkspace.js";

describe("The Work: resolveProjectCwdForStore", () => {
	it("prefers an explicit cwd and resolves it", () => {
		expect(resolveProjectCwdForStore({}, "p1", "rel/dir")).toBe(
			path.resolve("rel/dir"),
		);
	});

	it("ignores blank or non-string explicit cwds and falls through", () => {
		const store = { projectStore: { getProject: () => ({ cwd: "/proj" }) } };
		expect(resolveProjectCwdForStore(store, "p1", "   ")).toBe("/proj");
		expect(resolveProjectCwdForStore(store, "p1", 42)).toBe("/proj");
		expect(resolveProjectCwdForStore(store, "p1", null)).toBe("/proj");
	});

	it("resolves the linked ProjectStore record cwd", () => {
		const store = { projectStore: { getProject: (id) => ({ id, cwd: "/proj" }) } };
		expect(resolveProjectCwdForStore(store, "p1")).toBe("/proj");
	});

	it("returns null when nothing can resolve it", () => {
		expect(resolveProjectCwdForStore({}, "p1")).toBeNull();
		expect(resolveProjectCwdForStore(null, "p1")).toBeNull();
		expect(
			resolveProjectCwdForStore(
				{ projectStore: { getProject: () => null } },
				"p1",
			),
		).toBeNull();
		expect(
			resolveProjectCwdForStore(
				{ projectStore: { getProject: () => ({}) } },
				"p1",
			),
		).toBeNull();
	});

	it("never throws on invalid or hostile input", () => {
		expect(
			resolveProjectCwdForStore(
				{ projectStore: { getProject: () => ({ cwd: 42 }) } },
				"p1",
			),
		).toBeNull();
		expect(
			resolveProjectCwdForStore(
				{
					projectStore: {
						getProject: () => {
							throw new Error("store down");
						},
					},
				},
				"p1",
			),
		).toBeNull();
		expect(
			resolveProjectCwdForStore(
				{ projectStore: { getProject: "not-a-function" } },
				"p1",
			),
		).toBeNull();
	});
});

describe("The Work: repairDocsLinkAfterSwitch", () => {
	it("returns null when there is no usable project store or project", () => {
		expect(repairDocsLinkAfterSwitch({}, "p1", "/repo")).toBeNull();
		expect(
			repairDocsLinkAfterSwitch({ projectStore: {} }, "p1", "/repo"),
		).toBeNull();
		expect(
			repairDocsLinkAfterSwitch(
				{
					projectStore: {
						getProject: () => null,
						ensureDocsLink: () => ({ state: "ok" }),
					},
				},
				"p1",
				"/repo",
			),
		).toBeNull();
	});

	it("verifies the link with the resolved cwd and returns the result", () => {
		let seen = null;
		const store = {
			projectStore: {
				getProject: (id) => ({ id, name: "P1" }),
				ensureDocsLink: (project) => {
					seen = project;
					return { state: "ok" };
				},
			},
		};
		expect(repairDocsLinkAfterSwitch(store, "p1", "/repo")).toEqual({
			state: "ok",
		});
		expect(seen).toMatchObject({ id: "p1", cwd: path.resolve("/repo") });
	});

	it("never throws when the link layer fails", () => {
		const store = {
			projectStore: {
				getProject: () => ({ id: "p1" }),
				ensureDocsLink: () => {
					throw new Error("disk down");
				},
			},
		};
		expect(repairDocsLinkAfterSwitch(store, "p1", "/repo")).toBeNull();
	});
});
