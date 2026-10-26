import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	checkFiles,
	formatFailure,
	isSourceFile,
	listNewlyAdded,
	resolveDiffBase,
	topLevelFunctions,
} from "../scripts/check-one-function-per-file.mjs";

/***
 * MARK: check-one-function-per-file tests
 * @description Reusable gate tests for the new-file shape checker
 *   (scripts/check-one-function-per-file.mjs, WP-8 binding q1/q2/q3/q13):
 *   single-function files pass, unlisted multi-function files fail,
 *   grandfathered paths pass unless newly added, and only top-level named
 *   `function` declarations count (nested declarations, callbacks, and
 *   arrow-function constants are ignored).
 * @example run `node --test tests/check-one-function-per-file.test.mjs`
 ***/

describe("topLevelFunctions", () => {
	it("counts one top-level declaration", () => {
		assert.deepEqual(topLevelFunctions("export function solo() {}\n"), ["solo"]);
	});

	it("counts multiple top-level declarations including async and default", () => {
		const src = [
			"export async function first() {}",
			"function second() {}",
			"export default function third() {}",
		].join("\n");
		assert.deepEqual(topLevelFunctions(src), ["first", "second", "third"]);
	});

	it("ignores nested declarations and callbacks", () => {
		const src = [
			"export function outer() {",
			"  function inner() {}",
			"  setTimeout(function cb() {}, 1);",
			"  if (true) { function blocked() {} }",
			"}",
		].join("\n");
		assert.deepEqual(topLevelFunctions(src), ["outer"]);
	});

	it("ignores arrow-function constants", () => {
		const src = "export const helper = async () => {};\nexport const plain = () => {};\n";
		assert.deepEqual(topLevelFunctions(src), []);
	});

	it("ignores the word function inside comments, strings, and JSDoc examples", () => {
		const src = [
			"/**",
			" * @example function notReal() {}",
			" */",
			"// function alsoNotReal() {}",
			'const doc = "export function fake() {}";',
			"export function real() {}",
		].join("\n");
		assert.deepEqual(topLevelFunctions(src), ["real"]);
	});

	it("masks template raw text so apostrophes cannot swallow later code", () => {
		const src = [
			"const label = `don't ${compute(\"x\")} end`;",
			"export function real() {}",
			"function alsoReal() {}",
		].join("\n");
		assert.deepEqual(topLevelFunctions(src), ["real", "alsoReal"]);
	});

	it("still sees functions declared inside ${} interpolations at depth", () => {
		const src = [
			"const label = `prefix ${wrap(function inner() {})} suffix`;",
			"export function real() {}",
		].join("\n");
		assert.deepEqual(topLevelFunctions(src), ["real"]);
	});
});

describe("isSourceFile", () => {
	it("covers api, shared, and frontend/src JS/JSX", () => {
		assert.equal(isSourceFile("api/work/taskErrors.js"), true);
		assert.equal(isSourceFile("shared/stageTags.js"), true);
		assert.equal(isSourceFile("frontend/src/routing.js"), true);
		assert.equal(isSourceFile("frontend/src/components/X.jsx"), true);
	});

	it("excludes tests, specs, configs, and out-of-scope roots", () => {
		assert.equal(isSourceFile("api/work/taskErrors.test.js"), false);
		assert.equal(isSourceFile("api/flow/x.spec.js"), false);
		assert.equal(isSourceFile("scripts/check-one-function-per-file.mjs"), false);
		assert.equal(isSourceFile("frontend/dist/bundle.js"), false);
		assert.equal(isSourceFile("api/work/style.css"), false);
	});
});

describe("checkFiles", () => {
	it("passes single-function and zero-function files", () => {
		const { failures } = checkFiles({ "a.js": ["solo"], "b.js": [] }, [], []);
		assert.deepEqual(failures, []);
	});

	it("fails unlisted multi-function files", () => {
		const { failures } = checkFiles({ "new/thing.js": ["a", "b"] }, [], []);
		assert.equal(failures.length, 1);
		assert.equal(failures[0].file, "new/thing.js");
	});

	it("grandfathers allowlisted paths that already existed", () => {
		const counts = { "api/old.js": ["a", "b"] };
		const { failures } = checkFiles(counts, ["api/old.js"], []);
		assert.deepEqual(failures, []);
	});

	it("still fails an allowlisted path that is newly added", () => {
		const counts = { "api/sneaky.js": ["a", "b"] };
		const { failures } = checkFiles(counts, ["api/sneaky.js"], ["api/sneaky.js"]);
		assert.equal(failures.length, 1);
		assert.equal(failures[0].grandfatheredButNew, true);
	});

	it("reports stale allowlist entries for pruning", () => {
		const { stale } = checkFiles({ "api/old.js": ["solo"] }, ["api/old.js"], []);
		assert.deepEqual(stale, ["api/old.js"]);
	});
});

describe("formatFailure", () => {
	it("names the file, the functions, and the remediation", () => {
		const text = formatFailure([{ file: "api/work/newThing.js", names: ["a", "b"] }]);
		assert.match(text, /one-function-per-file/);
		assert.match(text, /api\/work\/newThing\.js/);
		assert.match(text, /1\. a/);
		assert.match(text, /Remediation:/);
		assert.match(text, /npm run check:one-function/);
	});
});

describe("git integration", () => {
	it("resolves a diff base or degrades to null outside git", () => {
		const base = resolveDiffBase();
		assert.ok(base === null || typeof base === "string");
	});

	it("lists newly-added paths as an array", () => {
		assert.ok(Array.isArray(listNewlyAdded()));
	});
});
