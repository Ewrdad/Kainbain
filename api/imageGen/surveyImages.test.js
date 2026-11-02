import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	appendSurveyRound,
	readSurvey,
	resolveSurveyPath,
	saveSurveyAnswers,
	withSurveyFileWriteLock,
} from "../work/taskSurvey.js";
import { listTaskImages } from "../work/taskAssets.js";
import { MOCK_IMAGE_PNG_BASE64 } from "./providers.js";
import {
	SURVEY_IMAGE_CAP,
	chosenSurveyImageFileName,
	ensureSurveyImages,
	imageGenRequestedBy,
	persistChosenSurveyImages,
	reportSurveyImagesToTask,
	resolveImageGenProvider,
	surveyImageFileName,
	upsertChosenDesignsSection,
} from "./surveyImages.js";

const taskId = "t-img-1";
const img = (overrides = {}) => ({
	id: "qi",
	type: "image",
	text: "Pick a design",
	options: ["dark dashboard with teal charts", "light minimal dashboard"],
	required: false,
	showIf: null,
	...overrides,
});
const stageWith = (imageGen) => ({
	id: "ask",
	skills: [{ name: "question-me", config: { imageGen } }],
});
const museFetch = async () => ({
	ok: true,
	status: 200,
	json: async () => ({ data: [{ b64_json: MOCK_IMAGE_PNG_BASE64 }] }),
});
const imagesOf = (cwd, qid = "qi") => {
	const { rounds } = readSurvey(cwd, null, taskId);
	const found = rounds.flatMap((r) => r.questions || []).find((q) => q.id === qid);
	return found?.images || [];
};

describe("api/imageGen/surveyImages resolution", () => {
	it("reads the question-me imageGen config and fails safe to none", () => {
		expect(imageGenRequestedBy(stageWith("muse"))).toBe("muse");
		expect(imageGenRequestedBy({ skills: [{ name: "question-me" }] })).toBeNull();
		expect(imageGenRequestedBy({ skills: [] })).toBeNull();
		expect(resolveImageGenProvider(stageWith("muse"))).toBe("muse");
		expect(resolveImageGenProvider(stageWith("Mock"))).toBe("mock");
		expect(resolveImageGenProvider(stageWith("nope"))).toBe("none");
		expect(resolveImageGenProvider(stageWith("none"))).toBe("none");
		expect(resolveImageGenProvider({})).toBe("none");
		expect(resolveImageGenProvider("muse")).toBe("muse");
		expect(resolveImageGenProvider("../x")).toBe("none");
	});

	it("names sanitized deterministic asset files", () => {
		expect(surveyImageFileName(1, "q1", 0)).toBe("survey-r1-q1-0.png");
		expect(surveyImageFileName(2, "../../evil", 3)).toBe("survey-r2-evil-3.png");
	});
});

describe("api/imageGen/surveyImages job", () => {
	let cwd;
	let savedKey;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-survey-images-test-"));
		savedKey = process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY;
		delete process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY;
	});

	afterEach(() => {
		if (savedKey === undefined) delete process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY;
		else process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY = savedKey;
		try {
			fs.rmSync(cwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("generates assets and ready entries through the mock provider", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		const summary = await ensureSurveyImages({
			cwd,
			project: null,
			taskId,
			stage: stageWith("mock"),
		});
		expect(summary).toMatchObject({ providerId: "mock", status: "done", generated: 2, failed: 0 });
		expect(imagesOf(cwd)).toEqual([
			{ option: 0, file: "assets/survey-r1-qi-0.png", status: "ready" },
			{ option: 1, file: "assets/survey-r1-qi-1.png", status: "ready" },
		]);
		const assets = listTaskImages(cwd, taskId);
		expect(assets.map((a) => a.name).sort()).toEqual(["survey-r1-qi-0.png", "survey-r1-qi-1.png"]);
		expect(fs.readFileSync(path.join(cwd, "docs", "tasks", taskId, "assets", "survey-r1-qi-0.png")).toString("base64")).toBe(
			MOCK_IMAGE_PNG_BASE64,
		);
	});

	it("no-ops when imageGen is none (default) without touching the survey", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		const before = readSurvey(cwd, null, taskId).markdown;
		const summary = await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("none") });
		expect(summary).toMatchObject({ providerId: "none", status: "disabled", generated: 0 });
		expect(readSurvey(cwd, null, taskId).markdown).toBe(before);
		expect(listTaskImages(cwd, taskId)).toEqual([]);
	});

	it("warns and disables on an unknown provider", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		const summary = await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("midjourney") });
		expect(summary.providerId).toBe("none");
		expect(summary.warnings.join("\n")).toMatch("Unknown image provider 'midjourney'");
		expect(imagesOf(cwd)).toEqual([]);
	});

	it("marks no-key failures (terminal, descriptions fallback) when unconfigured", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		const summary = await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("muse") });
		expect(summary).toMatchObject({ providerId: "muse", status: "done", generated: 0, failed: 2 });
		const entries = imagesOf(cwd);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ option: 0, status: "failed", code: "no-key" });
		expect(entries[0].error).toMatch("No API key saved");
		expect(entries[0]).not.toHaveProperty("file");
		expect(listTaskImages(cwd, taskId)).toEqual([]);
	});

	it("heals no-key failures once a key exists", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("muse") });
		expect(imagesOf(cwd)[0].code).toBe("no-key");
		process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY = "sk-test";
		const summary = await ensureSurveyImages({
			cwd,
			project: null,
			taskId,
			stage: stageWith("muse"),
			fetchImpl: museFetch,
		});
		expect(summary).toMatchObject({ generated: 2, failed: 0 });
		expect(imagesOf(cwd).map((e) => e.status)).toEqual(["ready", "ready"]);
	});

	it("enforces the per-survey cap with descriptions-only overflow", async () => {
		expect(SURVEY_IMAGE_CAP).toBe(12);
		const questions = [0, 1, 2, 3].map((n) =>
			img({ id: `q${n}`, options: ["a", "b", "c", "d"] }),
		);
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions });
		const summary = await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("mock") });
		expect(summary).toMatchObject({ status: "done", generated: 12, capped: 4 });
		expect(imagesOf(cwd, "q3")).toHaveLength(4);
		expect(imagesOf(cwd, "q3").map((e) => e.code)).toEqual(["cap", "cap", "cap", "cap"]);
		expect(imagesOf(cwd, "q3")[0].error).toMatch("limit reached");
		expect(listTaskImages(cwd, taskId)).toHaveLength(12);
	});

	it("never regenerates ready images (skips them)", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("mock") });
		const second = await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("mock") });
		expect(second).toMatchObject({ generated: 0, skipped: 2 });
	});

	it("retries gen failures only when retryFailed is set (park behaviour)", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY = "sk-test";
		const failingFetch = async () => ({ ok: false, status: 500, text: async () => "boom" });
		const first = await ensureSurveyImages({
			cwd,
			project: null,
			taskId,
			stage: stageWith("muse"),
			fetchImpl: failingFetch,
			retryFailed: true,
		});
		expect(first).toMatchObject({ generated: 0, failed: 2 });
		expect(imagesOf(cwd)[0]).toMatchObject({ status: "failed", code: "gen" });
		expect(first.errors.length).toBeGreaterThan(0);

		// A survey-read run leaves terminal gen failures alone (no hammering).
		const readRun = await ensureSurveyImages({
			cwd,
			project: null,
			taskId,
			stage: stageWith("muse"),
			fetchImpl: museFetch,
		});
		expect(readRun).toMatchObject({ generated: 0, failed: 0 });
		expect(imagesOf(cwd)[0].code).toBe("gen");

		// A park run heals them.
		const parkRun = await ensureSurveyImages({
			cwd,
			project: null,
			taskId,
			stage: stageWith("muse"),
			fetchImpl: museFetch,
			retryFailed: true,
		});
		expect(parkRun).toMatchObject({ generated: 2 });
		expect(imagesOf(cwd).map((e) => e.status)).toEqual(["ready", "ready"]);
	});

	it("regenerates orphaned pending entries from a crashed run", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		const { updateSurveyImages } = await import("../work/taskSurvey.js");
		updateSurveyImages({
			cwd,
			project: null,
			taskId,
			questionId: "qi",
			images: [
				{ option: 0, file: "assets/survey-r1-qi-0.png", status: "pending" },
				{ option: 1, file: "assets/survey-r1-qi-1.png", status: "pending" },
			],
		});
		const summary = await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("mock") });
		expect(summary).toMatchObject({ generated: 2 });
		expect(imagesOf(cwd).map((e) => e.status)).toEqual(["ready", "ready"]);
	});

	it("shares one run across concurrent calls for the same task+file", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		const opts = { cwd, project: null, taskId, stage: stageWith("mock") };
		const first = ensureSurveyImages(opts);
		const second = ensureSurveyImages(opts);
		expect(second).toBe(first);
		const [a, b] = await Promise.all([first, second]);
		expect(a).toBe(b);
		expect(a.generated).toBe(2);
	});

	it("holds image splices while another writer owns the survey file lock", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		const lockPath = resolveSurveyPath(cwd, null, taskId);
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		const holder = withSurveyFileWriteLock(lockPath, () => gate);
		await new Promise((r) => setTimeout(r, 20));
		const job = ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("mock") });
		// The mock job splices within milliseconds when unlocked: nothing may
		// have landed while the lock is held elsewhere.
		await new Promise((r) => setTimeout(r, 150));
		expect(imagesOf(cwd)).toEqual([]);
		release();
		const summary = await job;
		await holder;
		expect(summary).toMatchObject({ generated: 2, failed: 0 });
		expect(imagesOf(cwd).map((e) => e.status)).toEqual(["ready", "ready"]);
	});

	it("persists the chosen picture behind the lock, idempotently", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		await ensureSurveyImages({ cwd, project: null, taskId, stage: stageWith("mock") });
		saveSurveyAnswers({
			cwd,
			project: null,
			taskId,
			patch: { qi: { selected: ["dark dashboard with teal charts"], notes: "" } },
		});
		const surveyPath = resolveSurveyPath(cwd, null, taskId);
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		const holder = withSurveyFileWriteLock(surveyPath, () => gate);
		await new Promise((r) => setTimeout(r, 20));
		const pending = persistChosenSurveyImages({ cwd, project: null, taskId });
		await new Promise((r) => setTimeout(r, 150));
		expect(fs.readFileSync(surveyPath, "utf8")).not.toContain("## Chosen designs");
		release();
		const first = await pending;
		await holder;
		expect(first).toMatchObject({ sectionWritten: true, errors: [] });
		expect(first.chosen).toHaveLength(1);
		const doc = fs.readFileSync(surveyPath, "utf8");
		expect(doc).toContain("## Chosen designs");
		expect(doc).toContain("assets/survey-r1-qi-chosen.png");
		const chosenBytes = fs.readFileSync(
			path.join(cwd, "docs", "tasks", taskId, "assets", "survey-r1-qi-chosen.png"),
		);
		expect(chosenBytes.toString("base64")).toBe(MOCK_IMAGE_PNG_BASE64);
		// Round JSON untouched by the merge: answers and images[] intact.
		const { rounds } = readSurvey(cwd, null, taskId);
		expect(rounds[0].answers.qi.selected).toEqual(["dark dashboard with teal charts"]);
		expect(rounds[0].questions[0].images.map((e) => e.status)).toEqual(["ready", "ready"]);
		// Idempotent re-submit: byte-identical file, a single section.
		const second = await persistChosenSurveyImages({ cwd, project: null, taskId, rounds });
		expect(second).toMatchObject({ sectionWritten: true });
		const doc2 = fs.readFileSync(surveyPath, "utf8");
		expect(doc2).toBe(doc);
		expect(doc2.split("## Chosen designs")).toHaveLength(2);
	});

	it("loses no updates when a submit lands mid-generation", async () => {
		appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: [img()] });
		process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY = "sk-test";
		let releaseGen;
		const genGate = new Promise((resolve) => {
			releaseGen = resolve;
		});
		const gatedFetch = async (...args) => {
			await genGate;
			return museFetch(...args);
		};
		const job = ensureSurveyImages({
			cwd,
			project: null,
			taskId,
			stage: stageWith("muse"),
			fetchImpl: gatedFetch,
		});
		// Wait for pass 1 to publish pending entries: the job is now blocked
		// inside generation, exactly when a submit may arrive.
		for (let i = 0; i < 100 && imagesOf(cwd).length < 2; i += 1) {
			await new Promise((r) => setTimeout(r, 25));
		}
		expect(imagesOf(cwd).map((e) => e.status)).toEqual(["pending", "pending"]);
		saveSurveyAnswers({
			cwd,
			project: null,
			taskId,
			patch: { qi: { selected: ["light minimal dashboard"], notes: "n" } },
		});
		// Nothing ready yet: the early merge correctly records nothing.
		const early = await persistChosenSurveyImages({ cwd, project: null, taskId });
		expect(early.chosen).toEqual([]);
		expect(early.sectionWritten).toBe(false);
		// Hold the file lock while generation completes: the pass-2 splice
		// must queue behind it instead of racing the submit's writes.
		const lockPath = resolveSurveyPath(cwd, null, taskId);
		let releaseLock;
		const lockGate = new Promise((resolve) => {
			releaseLock = resolve;
		});
		const holder = withSurveyFileWriteLock(lockPath, () => lockGate);
		await new Promise((r) => setTimeout(r, 20));
		releaseGen();
		await new Promise((r) => setTimeout(r, 150));
		expect(imagesOf(cwd).map((e) => e.status)).toEqual(["pending", "pending"]);
		releaseLock();
		const summary = await job;
		await holder;
		expect(summary).toMatchObject({ generated: 2, failed: 0 });
		// Late merge after readiness: every concurrent update survives.
		const late = await persistChosenSurveyImages({ cwd, project: null, taskId });
		expect(late.chosen).toHaveLength(1);
		const { rounds } = readSurvey(cwd, null, taskId);
		expect(rounds[0].answers.qi).toEqual({ selected: ["light minimal dashboard"], notes: "n" });
		expect(rounds[0].questions[0].images.map((e) => e.status)).toEqual(["ready", "ready"]);
		expect(fs.readFileSync(lockPath, "utf8")).toContain("## Chosen designs");
	});

	it("honours a custom survey file and never throws on bad input", async () => {
		appendSurveyRound({
			cwd,
			project: null,
			taskId,
			outputFile: "FEEDBACK.md",
			stage: "ask",
			questions: [img()],
		});
		const summary = await ensureSurveyImages({
			cwd,
			project: null,
			taskId,
			surveyFile: "FEEDBACK.md",
			stage: stageWith("mock"),
		});
		expect(summary).toMatchObject({ generated: 2 });
		expect(readSurvey(cwd, null, taskId, "FEEDBACK.md").rounds[0].questions[0].images).toHaveLength(2);
		expect(readSurvey(cwd, null, taskId).exists).toBe(false);

		await expect(ensureSurveyImages({})).resolves.toMatchObject({ status: "invalid" });
		await expect(ensureSurveyImages({ cwd, taskId: "missing-task", stage: stageWith("mock") })).resolves.toMatchObject({
			status: "no-survey",
		});
	});
});

describe("api/imageGen/surveyImages reporting", () => {
	it("reports the summary to the task log and stays silent when disabled", () => {
		const saved = [];
		const store = { _saveTaskMarkdown: (cwdArg, taskArg) => void saved.push([cwdArg, taskArg]) };
		const task = { id: "t1", processLog: [] };
		const lines = reportSurveyImagesToTask({
			store,
			cwd: "/repo",
			task,
			summary: {
				providerId: "muse",
				status: "done",
				generated: 3,
				failed: 1,
				capped: 0,
				skipped: 0,
				warnings: ["Unknown image provider 'x' — disabled."],
				errors: ["r1/qi#0: timed out"],
			},
		});
		expect(lines).toHaveLength(3);
		expect(lines[0]).toMatch("provider 'muse' — 3 generated, 1 failed");
		expect(saved).toHaveLength(1);

		expect(
			reportSurveyImagesToTask({
				store,
				cwd: "/repo",
				task,
				summary: { providerId: "none", status: "disabled", warnings: [], errors: [] },
			}),
		).toBeNull();
	});
});
