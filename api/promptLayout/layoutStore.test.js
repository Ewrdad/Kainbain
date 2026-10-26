import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_PROMPT_LAYOUT } from "../../shared/promptLayout.js";
import {
	FALLBACK_DEGRADE_THRESHOLD,
	PROMPT_LAYOUT_FILE_NAME,
	getPromptLayoutState,
	getActivePromptLayout,
	recordPromptLayoutFallback,
	recordPromptLayoutSuccess,
	resetPromptLayout,
	updatePromptLayout,
} from "./layoutStore.js";

describe("api/promptLayout/layoutStore", () => {
	let tempDir;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-prompt-layout-store-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("returns DEFAULT_PROMPT_LAYOUT with isDefault: true on a fresh dir", () => {
		const state = getPromptLayoutState({ dir: tempDir });
		expect(state.isDefault).toBe(true);
		expect(state.layout).toBe(DEFAULT_PROMPT_LAYOUT);
		expect(state.consecutiveFallbacks).toBe(0);
		expect(state.degraded).toBe(false);

		expect(getActivePromptLayout({ dir: tempDir })).toBeNull();
	});

	it("updates layout, sets isDefault: false, and retrieves via getActivePromptLayout", () => {
		const customLayout = "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}";
		const updated = updatePromptLayout({ dir: tempDir, layout: customLayout });
		expect(updated.isDefault).toBe(false);
		expect(updated.layout).toBe(customLayout);

		expect(getActivePromptLayout({ dir: tempDir })).toBe(customLayout);
	});

	it("rejects invalid layouts on update without modifying storage", () => {
		expect(() =>
			updatePromptLayout({ dir: tempDir, layout: "invalid missing tokens" }),
		).toThrow(/Invalid prompt layout/);

		const state = getPromptLayoutState({ dir: tempDir });
		expect(state.isDefault).toBe(true);
	});

	it("resetPromptLayout restores factory default and clears counters", () => {
		const customLayout = "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}";
		updatePromptLayout({ dir: tempDir, layout: customLayout });
		recordPromptLayoutFallback({ dir: tempDir });

		const reset = resetPromptLayout({ dir: tempDir });
		expect(reset.isDefault).toBe(true);
		expect(reset.layout).toBe(DEFAULT_PROMPT_LAYOUT);
		expect(reset.consecutiveFallbacks).toBe(0);
		expect(reset.degraded).toBe(false);
	});

	it("records consecutive fallbacks and marks degraded at threshold", () => {
		for (let i = 1; i < FALLBACK_DEGRADE_THRESHOLD; i += 1) {
			const res = recordPromptLayoutFallback({ dir: tempDir });
			expect(res.consecutiveFallbacks).toBe(i);
			expect(res.degraded).toBe(false);
		}

		const degradedRes = recordPromptLayoutFallback({ dir: tempDir });
		expect(degradedRes.consecutiveFallbacks).toBe(FALLBACK_DEGRADE_THRESHOLD);
		expect(degradedRes.degraded).toBe(true);

		const state = getPromptLayoutState({ dir: tempDir });
		expect(state.degraded).toBe(true);
		expect(state.consecutiveFallbacks).toBe(FALLBACK_DEGRADE_THRESHOLD);

		// Success clears fallback count
		recordPromptLayoutSuccess({ dir: tempDir });
		const cleared = getPromptLayoutState({ dir: tempDir });
		expect(cleared.consecutiveFallbacks).toBe(0);
		expect(cleared.degraded).toBe(false);
	});

	it("falls back to default on corrupt stored file without throwing", () => {
		const filePath = path.join(tempDir, PROMPT_LAYOUT_FILE_NAME);
		fs.writeFileSync(filePath, "{ corrupt json");

		const state = getPromptLayoutState({ dir: tempDir });
		expect(state.isDefault).toBe(true);
		expect(state.layout).toBe(DEFAULT_PROMPT_LAYOUT);
		expect(getActivePromptLayout({ dir: tempDir })).toBeNull();
	});
});
