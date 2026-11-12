import { describe, it, expect } from "vitest";
import { parseMuseMspModels } from "./museMspModelCatalog.js";

/***
 * MARK: parseMuseMspModels tests
 * @description Unit coverage for the backend muse `model/list` mapping:
 *   rows map to harness-keyed engine models, rows without a modelId are
 *   skipped, and a row whose segments cannot form a canonical key (e.g.
 *   an id containing `::`) is skipped instead of failing the whole
 *   menu — the same forward tolerance the runner leg and the
 *   antigravity/vibe catalogues apply. No host is spawned.
 ***/
describe("parseMuseMspModels", () => {
	it("maps rows to harness-keyed models with the provider fallback", () => {
		expect(
			parseMuseMspModels({
				providerId: "meta",
				models: [
					{ modelId: "muse-spark-1.4", displayLabel: "Muse Spark 1.4", providerId: "meta" },
					{ modelId: "legacy-row" },
				],
			}),
		).toEqual([
			expect.objectContaining({
				provider: "meta",
				id: "muse-spark-1.4",
				name: "Muse Spark 1.4",
				key: "muse::meta::muse-spark-1.4",
				harness: "muse",
			}),
			expect.objectContaining({
				provider: "meta",
				id: "legacy-row",
				key: "muse::meta::legacy-row",
			}),
		]);
	});

	it("skips rows without a modelId and serves single-colon ids", () => {
		expect(
			parseMuseMspModels({
				models: [
					null,
					"nope",
					{ providerId: "meta" },
					{ modelId: "", providerId: "meta" },
					{ modelId: "muse-spark-1.4:cloud", providerId: "meta" },
				],
			}),
		).toEqual([
			expect.objectContaining({ id: "muse-spark-1.4:cloud", key: "muse::meta::muse-spark-1.4:cloud" }),
		]);
	});

	it("skips unkeyable rows instead of failing the whole menu", () => {
		// A `::`-bearing id cannot form a canonical key: the row drops
		// while its healthy siblings still serve.
		expect(
			parseMuseMspModels({
				models: [
					{ modelId: "muse-spark-1.4", providerId: "meta" },
					{ modelId: "weird::id", providerId: "meta" },
					{ modelId: "fine-too", providerId: "meta" },
				],
			}).map((m) => m.key),
		).toEqual(["muse::meta::muse-spark-1.4", "muse::meta::fine-too"]);
	});

	it("yields [] for a host with no bundled models", () => {
		expect(parseMuseMspModels({ models: [], providerId: "meta" })).toEqual([]);
		expect(parseMuseMspModels(null)).toEqual([]);
		expect(parseMuseMspModels({})).toEqual([]);
	});
});
