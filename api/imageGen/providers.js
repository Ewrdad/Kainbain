// Domain: image generation — provider registry behind one gateway seam.
// Runners and agents never see API keys: they write descriptions, the backend
// generates images through these adapters. Adding a provider means appending
// one descriptor below (plus its key in the key store) — no other code changes.
import { redactSecretsText } from "../../shared/redactSecrets.js";

/***
 * MARK: MUSE_IMAGE_MODEL
 * @description Model id for Meta's Muse Image on the Meta Model API.
 * @example MUSE_IMAGE_MODEL => 'muse-image-1.0'
 ***/
export const MUSE_IMAGE_MODEL = "muse-image-1.0";

/***
 * MARK: MUSE_IMAGE_API_BASE_URL
 * @description Default Meta Model API base URL (OpenAI-compatible
 *   `/images/generations` endpoint). Overridable per deploy via
 *   `KAINBAIN_IMAGE_GEN_MUSE_BASE_URL` (else `META_MODEL_API_BASE_URL`).
 * @example MUSE_IMAGE_API_BASE_URL => 'https://api.meta.ai/v1'
 ***/
export const MUSE_IMAGE_API_BASE_URL = "https://api.meta.ai/v1";

/***
 * MARK: IMAGE_GEN_DEFAULT_SIZE
 * @description The single fixed image size for v1 (one size for every image
 *   question — no per-question size field yet).
 * @example IMAGE_GEN_DEFAULT_SIZE => '1024x1024'
 ***/
export const IMAGE_GEN_DEFAULT_SIZE = "1024x1024";

/***
 * MARK: IMAGE_GEN_TIMEOUT_MS
 * @description Per-request timeout for provider calls. Muse Image is agentic
 *   (it plans and revises before returning), so this is generous — generation
 *   always runs in the background, never on a request path.
 * @example IMAGE_GEN_TIMEOUT_MS => 120000
 ***/
export const IMAGE_GEN_TIMEOUT_MS = 120000;

/***
 * MARK: MOCK_IMAGE_PNG_BASE64
 * @description Deterministic 1x1 PNG returned by the mock provider (offline
 *   tests, UI states, and plumbing checks — no network, no key, no cost).
 * @example Buffer.from(MOCK_IMAGE_PNG_BASE64, 'base64').length > 0 => true
 ***/
export const MOCK_IMAGE_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/***
 * MARK: IMAGE_GEN_PROMPT_MAX_LENGTH
 * @description Longest prompt sent to a provider (over-long agent descriptions
 *   fail that image with a fallback instead of hitting provider limits).
 * @example IMAGE_GEN_PROMPT_MAX_LENGTH => 4000
 ***/
export const IMAGE_GEN_PROMPT_MAX_LENGTH = 4000;

/***
 * MARK: resolveMuseApiBaseUrl
 * @description Effective Muse API base: explicit deploy override first, then
 *   the ecosystem `META_MODEL_API_BASE_URL`, then the Meta default.
 * @example resolveMuseApiBaseUrl() => 'https://api.meta.ai/v1'
 ***/
export const resolveMuseApiBaseUrl = () => {
	const override = [process.env.KAINBAIN_IMAGE_GEN_MUSE_BASE_URL, process.env.META_MODEL_API_BASE_URL]
		.map((v) => (typeof v === "string" ? v.trim().replace(/\/+$/, "") : ""))
		.find((v) => v && /^https?:\/\//i.test(v));
	return override || MUSE_IMAGE_API_BASE_URL;
};

const assertValidPrompt = (prompt) => {
	if (typeof prompt !== "string" || !prompt.trim()) {
		const err = new Error("Image prompt must be a non-empty string");
		err.statusCode = 400;
		err.code = "INVALID_IMAGE_GEN_PROMPT";
		throw err;
	}
	if (prompt.length > IMAGE_GEN_PROMPT_MAX_LENGTH) {
		const err = new Error(
			`Image prompt exceeds ${IMAGE_GEN_PROMPT_MAX_LENGTH} chars`,
		);
		err.statusCode = 400;
		err.code = "INVALID_IMAGE_GEN_PROMPT";
		throw err;
	}
	return prompt;
};

// Picks the first usable image payload out of an OpenAI-compatible response:
// inline base64 first (no second request), then a fetchable https URL. The
// `images[]` spellings cover Meta's documented `image_url` variant.
const extractImageRef = (payload) => {
	const lists = [];
	if (Array.isArray(payload?.data)) lists.push(payload.data);
	if (Array.isArray(payload?.images)) lists.push(payload.images);
	const items = lists.flat().filter((item) => item && typeof item === "object");
	for (const item of items) {
		const b64 = item.b64_json ?? item.b64 ?? item.image_base64 ?? item.base64;
		if (typeof b64 === "string" && b64.trim()) return { b64: b64.trim() };
	}
	for (const item of items) {
		const url = item.url ?? item.image_url;
		if (typeof url === "string" && /^https:\/\//i.test(url.trim())) {
			return { url: url.trim() };
		}
	}
	return null;
};

const fetchWithTimeout = async (fetchImpl, url, { timeoutMs, ...init }) => {
	const impl = fetchImpl || globalThis.fetch;
	if (typeof impl !== "function") {
		const err = new Error("No fetch implementation available for image generation");
		err.statusCode = 500;
		err.code = "IMAGE_GEN_NO_FETCH";
		throw err;
	}
	// Raced locally (not just signalled): a hung transport that ignores the
	// abort signal must still lose the race so background jobs cannot wedge.
	const controller = new AbortController();
	let timer;
	const timeoutPromise = new Promise((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			const timeout = new Error(`Image request timed out after ${timeoutMs}ms`);
			timeout.statusCode = 504;
			timeout.code = "IMAGE_GEN_TIMEOUT";
			reject(timeout);
		}, timeoutMs);
	});
	try {
		return await Promise.race([
			impl(url, { ...init, signal: controller.signal }),
			timeoutPromise,
		]);
	} finally {
		clearTimeout(timer);
	}
};

/***
 * MARK: generateMockImage
 * @description Deterministic offline generation: validates the prompt and
 *   returns the fixture PNG. No network, no key, no cost.
 * @example (await generateMockImage({ prompt: 'a login screen' })).length > 0 => true
 * @param {Object} [opts]
 * @param {string} [opts.prompt] - Image description.
 * @returns {Promise<Buffer>} PNG bytes.
 ***/
export const generateMockImage = async ({ prompt } = {}) => {
	assertValidPrompt(prompt);
	return Buffer.from(MOCK_IMAGE_PNG_BASE64, "base64");
};

/***
 * MARK: generateMuseImage
 * @description Text-to-image via Muse Image (`muse-image-1.0`) on the Meta
 *   Model API (OpenAI-compatible `POST /images/generations`, API-key auth).
 *   Accepts inline `b64_json` or a follow-up `url` response. The key never
 *   appears in errors; provider error bodies are truncated and redacted.
 * @example (await generateMuseImage({ prompt: 'x', apiKey: 'k', fetchImpl: stub })).length > 0 => true
 * @param {Object} [opts]
 * @param {string} [opts.prompt] - Image description.
 * @param {string} [opts.size] - Requested size (defaults to IMAGE_GEN_DEFAULT_SIZE).
 * @param {string} [opts.apiKey] - Meta Model API key (secret — never logged).
 * @param {Function} [opts.fetchImpl] - Fetch override (tests).
 * @param {number} [opts.timeoutMs] - Per-request timeout (defaults to IMAGE_GEN_TIMEOUT_MS).
 * @returns {Promise<Buffer>} Image bytes.
 ***/
export const generateMuseImage = async ({
	prompt,
	size = IMAGE_GEN_DEFAULT_SIZE,
	apiKey,
	fetchImpl,
	timeoutMs = IMAGE_GEN_TIMEOUT_MS,
} = {}) => {
	assertValidPrompt(prompt);
	if (typeof apiKey !== "string" || !apiKey.trim()) {
		const err = new Error("Muse image provider has no API key saved");
		err.statusCode = 400;
		err.code = "IMAGE_GEN_NO_KEY";
		throw err;
	}
	const base = resolveMuseApiBaseUrl();
	let response;
	try {
		response = await fetchWithTimeout(fetchImpl, `${base}/images/generations`, {
			timeoutMs,
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: MUSE_IMAGE_MODEL,
				prompt,
				size: size || IMAGE_GEN_DEFAULT_SIZE,
				n: 1,
				response_format: "b64_json",
			}),
		});
	} catch (err) {
		if (err?.code === "IMAGE_GEN_TIMEOUT") throw err;
		const wrapped = new Error(`Muse image request failed: ${err?.message || "network error"}`);
		wrapped.statusCode = 502;
		wrapped.code = "IMAGE_GEN_PROVIDER_ERROR";
		throw wrapped;
	}
	if (!response || response.ok !== true) {
		const status = response?.status || "unknown";
		let snippet = "";
		try {
			snippet = String(await response?.text?.()).slice(0, 200);
		} catch {
			snippet = "";
		}
		const err = new Error(
			`Muse image request failed (HTTP ${status})${snippet ? `: ${redactSecretsText(snippet)}` : ""}`,
		);
		err.statusCode = 502;
		err.code = "IMAGE_GEN_PROVIDER_ERROR";
		throw err;
	}
	let payload = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}
	const ref = extractImageRef(payload);
	if (!ref) {
		const err = new Error("Muse image response carried no usable image");
		err.statusCode = 502;
		err.code = "IMAGE_GEN_PROVIDER_ERROR";
		throw err;
	}
	if (ref.b64) {
		try {
			return Buffer.from(ref.b64, "base64");
		} catch {
			const err = new Error("Muse image response carried invalid base64");
			err.statusCode = 502;
			err.code = "IMAGE_GEN_PROVIDER_ERROR";
			throw err;
		}
	}
	const fileResponse = await fetchWithTimeout(fetchImpl, ref.url, { timeoutMs });
	if (!fileResponse || fileResponse.ok !== true) {
		const err = new Error(
			`Muse image download failed (HTTP ${fileResponse?.status || "unknown"})`,
		);
		err.statusCode = 502;
		err.code = "IMAGE_GEN_PROVIDER_ERROR";
		throw err;
	}
	const arrayBuffer = await fileResponse.arrayBuffer();
	return Buffer.from(arrayBuffer);
};

const REGISTRY = [
	{
		id: "muse",
		label: "Muse Image (Meta)",
		description: "Meta Muse Image via the Meta Model API (~$0.01/image). Needs an API key.",
		requiresKey: true,
		generate: generateMuseImage,
	},
	{
		id: "mock",
		label: "Mock (offline tests)",
		description: "Deterministic fixture PNG. No network, no key, no cost.",
		requiresKey: false,
		generate: generateMockImage,
	},
];

/***
 * MARK: listImageGenProviders
 * @description Public provider catalogue (id/label only — never keys or the
 *   generate functions themselves). The skill dropdown and the settings tab
 *   both render from this list.
 * @example listImageGenProviders().map((p) => p.id) => ['muse', 'mock']
 ***/
export const listImageGenProviders = () =>
	REGISTRY.map(({ id, label, description, requiresKey }) => ({
		id,
		label,
		description,
		requiresKey,
	}));

/***
 * MARK: getImageGenProvider
 * @description One registered provider adapter by id, or null when unknown.
 * @example getImageGenProvider('muse')?.id => 'muse'
 * @param {string} providerId
 * @returns {Object|null}
 ***/
export const getImageGenProvider = (providerId) =>
	REGISTRY.find((entry) => entry.id === providerId) || null;

/***
 * MARK: isKnownImageGenProvider
 * @description Whether an id names a registered provider.
 * @example isKnownImageGenProvider('muse') => true
 * @param {string} providerId
 * @returns {boolean}
 ***/
export const isKnownImageGenProvider = (providerId) =>
	REGISTRY.some((entry) => entry.id === providerId);

/***
 * MARK: generateImage
 * @description Gateway entry point: generates one image through the named
 *   provider. Unknown providers fail safe with `UNKNOWN_IMAGE_GEN_PROVIDER`
 *   (the survey job turns that into a descriptions fallback, never a crash).
 * @example (await generateImage({ providerId: 'mock', prompt: 'x' })).length > 0 => true
 * @param {Object} [opts]
 * @param {string} [opts.providerId] - Registered provider id.
 * @param {string} [opts.prompt] - Image description.
 * @param {string} [opts.size] - Requested size.
 * @param {string} [opts.apiKey] - Provider API key (secret — never logged).
 * @param {Function} [opts.fetchImpl] - Fetch override (tests).
 * @param {number} [opts.timeoutMs] - Per-request timeout.
 * @returns {Promise<Buffer>} Image bytes.
 ***/
export const generateImage = async ({ providerId, ...rest } = {}) => {
	const provider = getImageGenProvider(providerId);
	if (!provider) {
		const err = new Error(`Unknown image provider: ${String(providerId)}`);
		err.statusCode = 400;
		err.code = "UNKNOWN_IMAGE_GEN_PROVIDER";
		throw err;
	}
	return provider.generate(rest);
};
