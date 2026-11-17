import { tempProjectsRoot, tempNotesRoot } from "./isolatedTestRoots.js";
import { afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ./isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds (sample seeding is off by default).

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});
import { describe, it, expect, beforeAll } from "vitest";
import { DOC_SECTIONS, SECTION_LABELS } from "./siteDocs.js";
import * as frontendDocsSections from "../frontend/src/components/docs/docsSections.js";
import * as frontendDeriveSectionOrder from "../frontend/src/components/docs/deriveSectionOrder.js";
import * as frontendResolveSectionLabel from "../frontend/src/components/docs/resolveSectionLabel.js";
import app from "./index.js";

// Every frontend module that could re-grow a hand-maintained taxonomy copy.
const FRONTEND_DOCS_MODULES = [
	["docsSections.js", frontendDocsSections],
	["deriveSectionOrder.js", frontendDeriveSectionOrder],
	["resolveSectionLabel.js", frontendResolveSectionLabel],
];

/**
 * MARK: siteDocs frontend parity tests
 * @description Locks the single-source taxonomy contract: the GET /docs index
 *   carries exactly the API's `DOC_SECTIONS` order and `SECTION_LABELS`, and
 *   the frontend keeps no second copy — it derives order and labels from the
 *   index at runtime (`deriveSectionOrder` / `resolveSectionLabel`). A backend
 *   regroup therefore needs no frontend change; re-adding a hand-maintained
 *   frontend list turns red here instead of drifting silently in production.
 * @example run `npm run test --prefix api`
 */

describe("siteDocs frontend parity", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("ships the sections in sidebar order through GET /docs", async () => {
		const index = JSON.parse((await app.inject({ method: "GET", url: "/docs" })).payload);
		expect(index.sections).toEqual(DOC_SECTIONS);
	});

	it("ships every label identically through GET /docs", async () => {
		const index = JSON.parse((await app.inject({ method: "GET", url: "/docs" })).payload);
		expect(index.sectionLabels).toEqual(SECTION_LABELS);
	});

	it("keeps every indexed article inside a shipped section", async () => {
		const index = JSON.parse((await app.inject({ method: "GET", url: "/docs" })).payload);
		for (const doc of index.docs) {
			expect(
				index.sections.includes(doc.section),
				`[siteDocs parity] Indexed article "${doc.slug}" is in section "${doc.section}", which GET /docs does not ship — the sidebar could never group it. Fix: index it under a DOC_SECTIONS id in api/siteDocs.js.`,
			).toBe(true);
		}
	});

	it("keeps no second taxonomy copy in any frontend docs module", () => {
		for (const [moduleName, moduleNamespace] of FRONTEND_DOCS_MODULES) {
			expect(
				moduleNamespace.DOC_SECTION_ORDER,
				`[siteDocs parity] ${moduleName} ships its own DOC_SECTION_ORDER again — a rename would need a hand edit there. Fix: remove the literal and read the order from the GET /docs index via deriveSectionOrder.`,
			).toBeUndefined();
			expect(
				moduleNamespace.DOC_SECTION_LABELS,
				`[siteDocs parity] ${moduleName} ships its own DOC_SECTION_LABELS again — a rename would need a hand edit there. Fix: remove the literal and read labels from the GET /docs index via resolveSectionLabel.`,
			).toBeUndefined();
		}
	});
});
