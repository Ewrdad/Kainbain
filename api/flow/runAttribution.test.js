// Domain: The Flow — unit tests for the shared timeline run-attribution shape.
import { describe, it, expect } from "vitest";
import {
	buildTimelineAttribution,
	stampArrivalRowAttribution,
} from "./runAttribution.js";

describe("The Flow: buildTimelineAttribution", () => {
	it("keeps the reportMetadata field names for a fully attributed run", () => {
		expect(
			buildTimelineAttribution({
				harnessId: "pi",
				modelRef: "llama-cloud-direct::glm-5.3-flash:cloud",
				aliasName: "worker",
				targetIndex: 1,
			}),
		).toEqual({
			harnessId: "pi",
			modelRef: "llama-cloud-direct::glm-5.3-flash:cloud",
			aliasName: "worker",
			targetIndex: 1,
		});
	});

	it("drops blank and undefined fields instead of wording them", () => {
		expect(
			buildTimelineAttribution({
				harnessId: "antigravity",
				modelRef: "   ",
				aliasName: undefined,
				targetIndex: null,
			}),
		).toEqual({ harnessId: "antigravity" });
		expect(
			buildTimelineAttribution({
				harnessId: "",
				modelRef: "mistral::large",
				aliasName: "",
			}),
		).toEqual({ modelRef: "mistral::large" });
	});

	it("returns null when neither harness nor model names anything", () => {
		expect(buildTimelineAttribution({})).toBeNull();
		expect(buildTimelineAttribution()).toBeNull();
		expect(
			buildTimelineAttribution({ aliasName: "worker", targetIndex: 0 }),
		).toBeNull();
		expect(
			buildTimelineAttribution({ aliasName: "  ", targetIndex: -1 }),
		).toBeNull();
	});

	it("never passes unknown fields (the in-memory stageId matcher) through", () => {
		expect(
			buildTimelineAttribution({
				stageId: "a1",
				harnessId: "pi",
				modelRef: "glm",
			}),
		).toEqual({ harnessId: "pi", modelRef: "glm" });
	});

	it("keeps targetIndex only as a genuine non-negative integer", () => {
		expect(
			buildTimelineAttribution({ harnessId: "pi", targetIndex: 2 }),
		).toEqual({ harnessId: "pi", targetIndex: 2 });
		expect(
			buildTimelineAttribution({ harnessId: "pi", targetIndex: "1" }),
		).toEqual({ harnessId: "pi" });
		expect(
			buildTimelineAttribution({ harnessId: "pi", targetIndex: -3 }),
		).toEqual({ harnessId: "pi" });
	});

	it("is total on malformed input (never throws, never invents placeholders)", () => {
		expect(buildTimelineAttribution(null)).toBeNull();
		expect(buildTimelineAttribution("pi")).toBeNull();
		expect(buildTimelineAttribution([])).toBeNull();
	});
});

describe("The Flow: stampArrivalRowAttribution", () => {
	const RUN = { harnessId: "pi", modelRef: "glm", aliasName: "worker", targetIndex: 0 };

	function taskWithTimeline(rows) {
		return { id: "t-1", timeline: rows };
	}

	it("stamps the most recent arrival row into the run's own stage", () => {
		const other = { stage: "Plan", status: "Advanced", duration: "1s" };
		const arrival = { stage: "Build", status: "Moved", duration: "2s" };
		const task = taskWithTimeline([other, arrival]);
		const stamped = stampArrivalRowAttribution(task, "Build", RUN);
		expect(stamped).toBe(arrival);
		expect(arrival).toEqual({
			stage: "Build",
			status: "Moved",
			duration: "2s",
			...RUN,
		});
		// Other stages' rows stay untouched.
		expect(other.harnessId).toBeUndefined();
	});

	it("stamps the NEWEST matching arrival row (latest visit wins)", () => {
		const firstVisit = { stage: "Build", status: "Advanced", duration: "1s" };
		const secondVisit = { stage: "Build", status: "Moved", duration: "2s" };
		const task = taskWithTimeline([firstVisit, secondVisit]);
		const stamped = stampArrivalRowAttribution(task, "Build", RUN);
		expect(stamped).toBe(secondVisit);
		expect(firstVisit.harnessId).toBeUndefined();
	});

	it("recognizes every arrival status form the transitions write", () => {
		for (const status of [
			"Moved",
			"Advanced",
			"Advanced (First Stage)",
			"Failed back",
		]) {
			const arrival = { stage: "Build", status };
			const stamped = stampArrivalRowAttribution(
				taskWithTimeline([arrival]),
				"Build",
				RUN,
			);
			expect(stamped).toBe(arrival);
		}
	});

	it("never touches outcome rows (Failed / Retrying / Completed)", () => {
		for (const status of ["Failed", "Retrying", "Completed"]) {
			const row = { stage: "Build", status };
			const task = taskWithTimeline([row]);
			expect(stampArrivalRowAttribution(task, "Build", RUN)).toBeNull();
			expect(row.harnessId).toBeUndefined();
		}
	});

	it("returns null with no matching arrival row, blank choice, or malformed input", () => {
		const task = taskWithTimeline([
			{ stage: "Build", status: "Advanced" },
		]);
		expect(stampArrivalRowAttribution(task, "Review plan", RUN)).toBeNull();
		expect(stampArrivalRowAttribution(task, "Build", {})).toBeNull();
		expect(stampArrivalRowAttribution(task, "Build", null)).toBeNull();
		expect(stampArrivalRowAttribution(task, "", RUN)).toBeNull();
		expect(stampArrivalRowAttribution(null, "Build", RUN)).toBeNull();
		expect(stampArrivalRowAttribution("junk", "Build", RUN)).toBeNull();
		expect(stampArrivalRowAttribution({ timeline: "nope" }, "Build", RUN)).toBeNull();
	});

	it("drops the in-memory stageId matcher and blank fields when stamping", () => {
		const arrival = { stage: "Build", status: "Moved" };
		const stamped = stampArrivalRowAttribution(taskWithTimeline([arrival]), "Build", {
			stageId: "a1",
			harnessId: "pi",
			modelRef: "  ",
			aliasName: "worker",
			targetIndex: -1,
		});
		expect(stamped).toBe(arrival);
		expect(arrival).toEqual({
			stage: "Build",
			status: "Moved",
			harnessId: "pi",
			aliasName: "worker",
		});
	});
});
