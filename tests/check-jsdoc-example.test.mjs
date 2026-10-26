import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	checkMissing,
	findPublicExports,
	formatExampleFailure,
	hasExampleTag,
	isDocSourceFile,
	nearestJsdoc,
	readBaseline,
	scanMissing,
} from "../scripts/check-jsdoc-example.mjs";

/***
 * MARK: check-jsdoc-example tests
 * @description Reusable gate tests for the JSDoc `@example` checker
 *   (scripts/check-jsdoc-example.mjs, WP-8 binding q6/q7/q8): every public
 *   export needs an `@example` in its nearest preceding JSDoc block, the
 *   committed baseline grandfathers the pre-gate gap, and only exports
 *   outside the baseline fail.
 * @example run `node --test tests/check-jsdoc-example.test.mjs`
 ***/

describe("hasExampleTag", () => {
	it("detects @example in a JSDoc block", () => {
		assert.equal(hasExampleTag("/**\n * @example f() => 1\n */"), true);
		assert.equal(hasExampleTag("/**\n * @description no example here\n */"), false);
		assert.equal(hasExampleTag("/** @examplex nope */"), false);
	});
});

describe("nearestJsdoc", () => {
	it("finds an attached block and rejects detached ones", () => {
		const src = "/**\n * @example f() => 1\n */\nexport const a = 1;\n";
		assert.ok(nearestJsdoc(src, src.indexOf("export")) !== null);
		const detached = "/**\n * @example f() => 1\n */\nconst gap = 1;\nexport const a = 1;\n";
		assert.equal(nearestJsdoc(detached, detached.indexOf("export")), null);
	});
});

describe("findPublicExports", () => {
	it("finds functions, classes, bindings, and defaults with example status", () => {
		const src = [
			"/**",
			" * @example solo() => 1",
			" */",
			"export function solo() { return 1; }",
			"export class Naked {}",
			"/** @example CONFIG.a => 1 */",
			"export const CONFIG = {};",
			"export default solo;",
		].join("\n");
		const found = findPublicExports(src);
		assert.deepEqual(
			found.map((e) => [e.exportName, e.kind, e.hasExample]),
			[
				["solo", "function", true],
				["Naked", "class", false],
				["CONFIG", "const", true],
				["default", "default", false],
			],
		);
	});

	it("splits multi-declarator consts under one JSDoc block", () => {
		const src = "/**\n * @example A => 1\n */\nexport const A = 1, B = 2;\n";
		const found = findPublicExports(src);
		assert.deepEqual(
			found.map((e) => [e.exportName, e.hasExample]),
			[
				["A", true],
				["B", true],
			],
		);
	});

	it("skips re-export lists and export-star", () => {
		const src = 'export { solo } from "./solo.js";\nexport * from "./more.js";\n';
		assert.deepEqual(findPublicExports(src), []);
	});

	it("ignores the word export inside comments and strings", () => {
		const src = '// export const fake = 1;\nconst s = "export function nope() {}";\n';
		assert.deepEqual(findPublicExports(src), []);
	});

	it("masks template raw text so apostrophes cannot swallow later exports", () => {
		const src = [
			"const label = `don't ${compute(\"x\")} end`;",
			"export function real() {}",
		].join("\n");
		const found = findPublicExports(src);
		assert.deepEqual(
			found.map((e) => [e.exportName, e.kind, e.hasExample]),
			[["real", "function", false]],
		);
	});
});

describe("isDocSourceFile", () => {
	it("covers api, shared, and frontend/src JS/JSX", () => {
		assert.equal(isDocSourceFile("api/work/taskErrors.js"), true);
		assert.equal(isDocSourceFile("shared/stageTags.js"), true);
		assert.equal(isDocSourceFile("frontend/src/routing.jsx"), true);
	});

	it("excludes tests, fixtures, mocks, and scripts", () => {
		assert.equal(isDocSourceFile("api/work/taskErrors.test.js"), false);
		assert.equal(isDocSourceFile("shared/toolLogFormat.fixtures.js"), false);
		assert.equal(isDocSourceFile("frontend/src/x/__fixtures__.js"), false);
		assert.equal(isDocSourceFile("scripts/check-doc-links.mjs"), false);
		assert.equal(isDocSourceFile("api/coverage/lcov-report/x.js"), false);
	});
});

describe("checkMissing", () => {
	const missing = [{ file: "a.js", exportName: "newFn", kind: "function" }];
	const baseline = [{ file: "old.js", exportName: "oldFn", kind: "function" }];

	it("passes baselined exports and fails new ones", () => {
		const { failures } = checkMissing(
			[...missing, ...baseline],
			baseline,
			false,
		);
		assert.deepEqual(failures, missing);
	});

	it("fails everything in strict mode", () => {
		const { failures } = checkMissing([...missing, ...baseline], baseline, true);
		assert.equal(failures.length, 2);
	});

	it("reports baseline entries that now carry @example", () => {
		const { prunable } = checkMissing(missing, [...missing, ...baseline], false);
		assert.deepEqual(prunable, [baseline[0]]);
	});
});

describe("formatExampleFailure", () => {
	it("names the export and gives a fix recipe", () => {
		const text = formatExampleFailure([
			{ file: "frontend/src/new.js", exportName: "Fresh", kind: "function" },
		]);
		assert.match(text, /@example/);
		assert.match(text, /frontend\/src\/new\.js/);
		assert.match(text, /function Fresh/);
		assert.match(text, /Remediation:/);
		assert.match(text, /npm run check:jsdoc-example/);
	});
});

describe("committed-tree grandfather proof", () => {
	it("the baseline covers every currently-missing export", () => {
		const baseline = readBaseline();
		assert.ok(baseline.length > 0, "baseline must be generated and committed");
		for (const entry of baseline) {
			assert.equal(typeof entry.file, "string");
			assert.equal(typeof entry.exportName, "string");
			assert.equal(typeof entry.kind, "string");
		}
		const { failures } = checkMissing(scanMissing(), baseline, false);
		assert.deepEqual(failures, []);
	});
});
