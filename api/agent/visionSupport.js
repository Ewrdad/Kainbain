// Domain: Agent — the vision (image-input) capability decision.
//
// Vision matrix (spike 1B, committed here per the implementation plan):
//
//   | Harness    | Image bytes at dispatch? | Why                                                        |
//   | ---------- | ------------------------ | ---------------------------------------------------------- |
//   | pi         | YES (model-gated)        | The pi SDK's session.prompt accepts PromptOptions.images   |
//   |            |                          | (flat ImageContent [{ type: "image", data, mimeType }]) —  |
//   |            |                          | the wrapped session forwards unknown prompt options.       |
//   | antigravity| no — path mention only   | agy CLI stages receive the prompt as one text file.        |
//   | custom     | no — path mention only   | Free-text command line; no image-part surface.             |
//   | muse       | no — path mention only   | muse CLI runs read a text prompt file.                     |
//   | vibe       | no — path mention only   | vibe CLI runs read a text prompt / prompt file.            |
//   | opencode   | no — path mention only   | opencode SDK server prompt surface is text-only here.      |
//   | alias      | (resolved first)         | The virtual alias harness resolves to a real one above.    |
//   | unknown    | no — path mention only   | Conservative default: never send bytes blindly.            |
//
// Model gate: a model carries `input: ["text", "image"]` in its catalogue
// entry (see api/models.js FALLBACK_MODELS and every harness listing). Only
// models advertising "image" receive bytes; unknown/unresolvable models
// default to NO vision (path mention only) — a wrong "no" degrades to the
// file-path mention every agent can read, a wrong "yes" could crash a run.
import { FALLBACK_MODELS, resolveModel } from "../models.js";

/** Harnesses whose dispatch surface can carry image bytes. */
export const VISION_CAPABLE_HARNESSES = ["pi"];

/***
 * MARK: harnessSupportsImageDispatch
 * @description Whether a harness's dispatch surface can carry image bytes at all (see the vision matrix at the top of this file). Unknown names default to false.
 * @example harnessSupportsImageDispatch('pi') => true
 * @example harnessSupportsImageDispatch('muse') => false
 * @param {string} harnessName
 * @returns {boolean}
 ***/
export function harnessSupportsImageDispatch(harnessName) {
	return VISION_CAPABLE_HARNESSES.includes(
		String(harnessName || "").trim().toLowerCase(),
	);
}

/***
 * MARK: modelSupportsImages
 * @description Whether a model object advertises image input (`input` array containing "image").
 * @example modelSupportsImages({ id: 'm', input: ['text', 'image'] }) => true
 * @example modelSupportsImages({ id: 'm', input: ['text'] }) => false
 * @param {Object|null} model
 * @returns {boolean}
 ***/
export function modelSupportsImages(model) {
	return (
		Array.isArray(model?.input) &&
		model.input.map((v) => String(v).toLowerCase()).includes("image")
	);
}

/***
 * MARK: resolveVisionModel
 * @description Resolves a model reference (any accepted form) against the supplied
 *   model listing, then the fallback catalogue. Returns null for blank/unresolvable
 *   references so the caller can take the conservative no-vision path.
 * @example await resolveVisionModel('ollama-cloud::gemma4:31b-cloud', async () => models) => model
 * @param {string} modelRef
 * @param {Function} [listModels] - Async () => model[] supplier (e.g. session.listModels).
 * @returns {Promise<Object|null>}
 ***/
export async function resolveVisionModel(modelRef, listModels) {
	if (!modelRef || typeof modelRef !== "string") return null;
	if (modelRef === "default") return null;
	let available = [];
	if (typeof listModels === "function") {
		try {
			const listed = await listModels();
			if (Array.isArray(listed)) available = listed;
		} catch {
			available = [];
		}
	}
	const resolved = resolveModel(available, modelRef);
	if (resolved) return resolved;
	// Fallback catalogue: keeps the vision decision working when a harness has
	// no live listing but the model is a known fallback entry.
	return resolveModel(FALLBACK_MODELS, modelRef) || null;
}

/***
 * MARK: supportsImages
 * @description Whether a run on `harnessName` + `modelRef` should receive image BYTES:
 *   true only when the harness can dispatch images AND the model advertises image input.
 *   Everything else (unknown harness, unknown model, text-only model) degrades to a
 *   file-path mention — never a hard error, so a stage never breaks over capability.
 * @example await supportsImages('pi', 'ollama-cloud::gemma4:31b-cloud', { listModels }) => true
 * @example await supportsImages('muse', 'anything') => false
 * @param {string} harnessName
 * @param {string} modelRef
 * @param {Object} [opts]
 * @param {Function} [opts.listModels] - Async () => model[] supplier.
 * @returns {Promise<boolean>}
 ***/
export async function supportsImages(harnessName, modelRef, { listModels } = {}) {
	if (!harnessSupportsImageDispatch(harnessName)) return false;
	const model = await resolveVisionModel(modelRef, listModels);
	return modelSupportsImages(model);
}