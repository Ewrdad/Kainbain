import test from "node:test";
import assert from "node:assert/strict";
import { runImpromptuJob } from "./impromptu.js";

test("runImpromptuJob module is importable", () => {
	assert.equal(typeof runImpromptuJob, "function");
});
