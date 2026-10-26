import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import {
	DEFAULT_HARNESS,
	HARNESS_MOCK,
	hasHarness,
	listHarnesses,
	getHarnessByName,
	resolveHarnessForProject,
	resolveHarnessName,
} from "../../harnessRegistry.js";
import { buildHarnessRoster } from "../../../crew/harnessRoster.js";
import { harnessesView } from "../../../crew/modelDiscovery.js";
import harnessesRoutes from "../../../routes/harnesses.js";
import { createAgentRunner } from "../../../agentRunner.js";
import { MOCK_MODELS } from "./mockHarness.js";

/***
 * MARK: mockHarness.registration sibling tests
 * @description Proves the mock harness promotion: registered in the
 *   construction registry with its honest synthetic catalog, projected into
 *   the `/harnesses` view + model routes, explicitly selectable (never a
 *   silent fallback — the default stays pi), and able to run an agent stage
 *   to completion. Hermetic: a throwaway Fastify app over the real roster
 *   (no full API boot, no SDK, no network).
 ***/

async function buildListApp() {
	const fakeSessionStore = {
		getHarness: () => getHarnessByName("pi"),
	};
	const harnessRegistry = buildHarnessRoster(fakeSessionStore);
	const app = Fastify();
	await app.register(harnessesRoutes, {
		deps: {
			harnessRegistry,
			sessionStore: fakeSessionStore,
			taskStore: { listTasks: () => [] },
		},
	});
	await app.ready();
	return app;
}

describe("mock harness registration", () => {
	it("is registered with a description and the synthetic catalog", () => {
		expect(HARNESS_MOCK).toBe("mock");
		expect(hasHarness("mock")).toBe(true);
		expect(
			listHarnesses().some((h) => h.name === "mock" && h.description),
		).toBe(true);
		const first = getHarnessByName("mock");
		expect(first.id).toBe("mock");
		expect(first.modelSelection).toBe("list");
		expect(getHarnessByName("mock")).toBe(first); // memoized
		return expect(first.listModels()).resolves.toEqual(MOCK_MODELS);
	});

	it("keeps pi the default and never silently substitutes mock", () => {
		expect(DEFAULT_HARNESS).toBe("pi");
		expect(resolveHarnessName({})).toBe("pi");
		expect(resolveHarnessForProject({}).name).toBe("pi");
		// Unknown names fall back to the built-in default (pi), never mock.
		expect(resolveHarnessForProject({ id: "p1" }, {}).name).toBe("pi");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(
				resolveHarnessForProject({ id: "p1", harness: "nope" }).name,
			).toBe("pi");
		} finally {
			warn.mockRestore();
		}
	});

	it("resolves explicit project/stage selection of mock", () => {
		expect(resolveHarnessForProject({ harness: "mock" }).name).toBe("mock");
		expect(
			resolveHarnessForProject({ harness: "pi" }, { harnessName: "mock" }).name,
		).toBe("mock");
	});

	it("is listed on GET /harnesses as always available", async () => {
		const app = await buildListApp();
		try {
			const res = await app.inject({ method: "GET", url: "/harnesses" });
			expect(res.statusCode).toBe(200);
			const mock = JSON.parse(res.payload).harnesses.find(
				(h) => h.id === "mock",
			);
			expect(mock).toMatchObject({
				name: "Mock",
				modelSelection: "list",
				isDefault: false,
				available: true,
				detectionSource: "builtin",
			});
		} finally {
			await app.close();
		}
	});

	it("serves its synthetic catalog on GET /harnesses/mock/models", async () => {
		const app = await buildListApp();
		try {
			const res = await app.inject({
				method: "GET",
				url: "/harnesses/mock/models",
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.models).toEqual([
				expect.objectContaining({
					key: "mock::mock::echo-v1",
					harness: "mock",
					id: "echo-v1",
					provider: "mock",
				}),
			]);
			expect(body).not.toHaveProperty("discoveryError");
		} finally {
			await app.close();
		}
	});

	it("reports ok through the health probe (never reddens the aggregate)", async () => {
		const harness = getHarnessByName("mock");
		await expect(harness.probeHealth()).resolves.toMatchObject({
			name: "mock",
			status: "ok",
		});
	});

	it("is excluded from stuck-check diagnosis (honest 503 via the existing guard)", async () => {
		const harness = getHarnessByName("mock");
		expect(typeof harness.createDiagnosisSession).not.toBe("function");
		const fakeSessionStore = {
			getHarness: () => getHarnessByName("pi"),
		};
		const view = await harnessesView({
			registry: buildHarnessRoster(fakeSessionStore),
			defaultHarness: fakeSessionStore.getHarness(),
			models: [],
		});
		expect(view.find((entry) => entry.id === "mock").supportsDiagnosis).toBe(
			false,
		);
	});

	it("runs an agent stage to completion with self-labeled output", async () => {
		const harness = getHarnessByName("mock");
		const session = await harness.createSession({ id: "proj-1" });
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(session),
		});
		const res = await runner("Do the thing", { projectId: "proj-1" });
		expect(res.failed).toBe(false);
		expect(res.harnessId).toBe("mock");
		expect(res.output).toMatch(/^Mock reply: /);
	});
});
