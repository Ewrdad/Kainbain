import { describe, it, expect } from "vitest";
import { DOC_SECTIONS, SECTION_LABELS } from "./siteDocs.js";
import {
	DOC_SECTION_LABELS,
	DOC_SECTION_ORDER,
} from "../frontend/src/components/docs/docsSections.js";

/**
 * MARK: siteDocs frontend parity tests
 * @description Locks the two taxonomy copies together: the frontend sidebar
 *   (`frontend/src/components/docs/docsSections.js`) must expose exactly the
 *   API's `DOC_SECTIONS` / `SECTION_LABELS`, so regrouping one side without
 *   the other turns red here instead of drifting silently in production.
 * @example run `npm run test --prefix api`
 */

describe("siteDocs frontend parity", () => {
	it("exposes the same sections in the same order", () => {
		expect(DOC_SECTION_ORDER).toEqual(DOC_SECTIONS);
	});

	it("labels every section identically", () => {
		expect(DOC_SECTION_LABELS).toEqual(SECTION_LABELS);
	});
});
