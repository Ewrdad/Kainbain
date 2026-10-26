import { describe, it, expect, vi } from "vitest";
import {
	VISION_CAPABLE_HARNESSES,
	harnessSupportsImageDispatch,
	modelSupportsImages,
	resolveVisionModel,
	supportsImages,
} from "./visionSupport.js";
import { FALLBACK_MODELS } from "../models.js";

describe("visionSupport (harness/model image capability)", () => {
	describe("harnessSupportsImageDispatch", () => {
		it("accepts the vision-capable dispatch surfaces (case-insensitive)", () => {
			expect(VISION_CAPABLE_HARNESSES).toContain("pi");
			expect(harnessSupportsImageDispatch("pi")).toBe(true);
			expect(harnessSupportsImageDispatch("PI")).toBe(true);
			expect(harnessSupportsImageDispatch("  pi  ")).toBe(true);
		});

		it("rejects CLI harnesses with text-only dispatch surfaces", () => {
			expect(harnessSupportsImageDispatch("muse")).toBe(false);
			expect(harnessSupportsImageDispatch("custom")).toBe(false);
			expect(harnessSupportsImageDispatch("antigravity")).toBe(false);
			expect(harnessSupportsImageDispatch("opencode")).toBe(false);
			expect(harnessSupportsImageDispatch("alias")).toBe(false);
		});

		it("defaults unknown harness names to false (conservative)", () => {
			expect(harnessSupportsImageDispatch("future-harness")).toBe(false);
			expect(harnessSupportsImageDispatch("")).toBe(false);
			expect(harnessSupportsImageDispatch(null)).toBe(false);
			expect(harnessSupportsImageDispatch(undefined)).toBe(false);
		});
	});

	describe("modelSupportsImages", () => {
		it("is true only when the model advertises image input", () => {
			expect(modelSupportsImages({ id: "m", input: ["text", "image"] })).toBe(true);
			expect(modelSupportsImages({ id: "m", input: ["IMAGE"] })).toBe(true);
			expect(modelSupportsImages({ id: "m", input: ["text"] })).toBe(false);
			expect(modelSupportsImages({ id: "m" })).toBe(false);
			expect(modelSupportsImages(null)).toBe(false);
			expect(modelSupportsImages(undefined)).toBe(false);
		});
	});

	describe("resolveVisionModel", () => {
		it("resolves against the supplied listing first", async () => {
			const listed = [{ id: "m1", provider: "p1", input: ["text"] }];
			const model = await resolveVisionModel("p1::m1", async () => listed);
			expect(model?.id).toBe("m1");
		});

		it("falls back to the fallback catalogue for known models", async () => {
			const known = FALLBACK_MODELS.find((m) =>
				m.input?.includes("image"),
			);
			const model = await resolveVisionModel(known.id, async () => []);
			expect(model?.id).toBe(known.id);
		});

		it("returns null for blank, sentinel and unresolvable references", async () => {
			expect(await resolveVisionModel("", async () => [])).toBeNull();
			expect(await resolveVisionModel(null, async () => [])).toBeNull();
			expect(await resolveVisionModel("default", async () => [])).toBeNull();
			expect(await resolveVisionModel("ghost::nope", async () => [])).toBeNull();
		});

		it("survives a throwing listModels supplier", async () => {
			const known = FALLBACK_MODELS.find((m) => m.input?.includes("image"));
			const model = await resolveVisionModel(known.id, async () => {
				throw new Error("catalogue unavailable");
			});
			expect(model?.id).toBe(known.id);
		});
	});

	describe("supportsImages (the run-level decision)", () => {
		const visionModel = FALLBACK_MODELS.find((m) => m.input?.includes("image"));
		const textModel = FALLBACK_MODELS.find(
			(m) => !m.input?.includes("image"),
		);

		it("attaches bytes only for a vision-capable harness AND model", async () => {
			expect(
				await supportsImages("pi", visionModel.id, { listModels: async () => [] }),
			).toBe(true);
			// Text-only model on a capable harness: no bytes.
			expect(
				await supportsImages("pi", textModel.id, { listModels: async () => [] }),
			).toBe(false);
			// Vision model on an incapable harness: no bytes.
			expect(
				await supportsImages("muse", visionModel.id, {
					listModels: async () => [],
				}),
			).toBe(false);
		});

		it("defaults unknown harness/model pairs to no bytes", async () => {
			expect(await supportsImages("unknown-harness", "any::model")).toBe(false);
			expect(await supportsImages("pi", "ghost::missing-model")).toBe(false);
			expect(await supportsImages("pi", "")).toBe(false);
			expect(await supportsImages("pi", undefined)).toBe(false);
		});

		it("never throws when the model listing fails", async () => {
			const listModels = vi.fn().mockRejectedValue(new Error("boom"));
			expect(await supportsImages("pi", textModel.id, { listModels })).toBe(false);
		});
	});
});