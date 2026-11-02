/***
 * MARK: imageGenRoutes
 * @description Fastify routes under `/settings/image-gen` (system-level image
 *   provider keys — no project scoping, the key stays server-side):
 *   - `GET /settings/image-gen/providers` — catalogue with per-provider
 *     configured/source flags (keys are NEVER returned).
 *   - `PUT /settings/image-gen/providers/:id/key` — stores `{ key }`; 400 on
 *     unknown provider or invalid key.
 *   - `DELETE /settings/image-gen/providers/:id/key` — clears the stored key
 *     (an env override keeps the provider configured; reported honestly).
 *   - `POST /settings/image-gen/providers/:id/test` — user-triggered dry run
 *     through the real adapter (mock is free and instant; Muse spends one
 *     ~$0.01 generation); answers `{ ok, bytes?, ms?, error? }`.
 * @example app.register(imageGenRoutes, { deps: {} })
 ***/
import {
	clearImageGenKey,
	describeImageGenKey,
	getImageGenKey,
	resolveImageGenDir,
	setImageGenKey,
} from "../imageGen/keyStore.js";
import {
	generateImage,
	getImageGenProvider,
	listImageGenProviders,
} from "../imageGen/providers.js";

const TEST_PROMPT = "Connectivity test: a small plain grey square icon, flat, no text.";

/***
 * MARK: imageGenRoutes
 * @description Registers the `/settings/image-gen` routes on the Fastify app.
 * @example await app.register(imageGenRoutes, { deps: {} })
 ***/
export default async function imageGenRoutes(app, { deps } = {}) {
	const dir = deps?.imageGenDir || resolveImageGenDir();
	const fetchImpl = deps?.imageGenFetch;

	app.get("/settings/image-gen/providers", async () => ({
		providers: listImageGenProviders().map((provider) => ({
			...provider,
			...(provider.requiresKey
				? describeImageGenKey({ providerId: provider.id, dir })
				: { configured: true, source: null }),
		})),
	}));

	app.put("/settings/image-gen/providers/:id/key", async (request, reply) => {
		const providerId = String(request.params?.id || "");
		if (!getImageGenProvider(providerId)) {
			return reply.status(400).send({
				error: `Unknown image provider: ${providerId}`,
				code: "UNKNOWN_IMAGE_GEN_PROVIDER",
			});
		}
		try {
			const stored = setImageGenKey({
				providerId,
				key: request.body?.key,
				dir,
			});
			const { configured, source } = describeImageGenKey({ providerId, dir });
			return { providerId: stored.providerId, configured, source };
		} catch (err) {
			return reply.status(err?.statusCode || 400).send({
				error: err?.message || "Invalid image provider key",
				code: err?.code || "INVALID_IMAGE_GEN_KEY",
			});
		}
	});

	app.delete("/settings/image-gen/providers/:id/key", async (request, reply) => {
		const providerId = String(request.params?.id || "");
		if (!getImageGenProvider(providerId)) {
			return reply.status(400).send({
				error: `Unknown image provider: ${providerId}`,
				code: "UNKNOWN_IMAGE_GEN_PROVIDER",
			});
		}
		try {
			const cleared = clearImageGenKey({ providerId, dir });
			const { configured, source } = describeImageGenKey({ providerId, dir });
			return { providerId: cleared.providerId, configured, source };
		} catch (err) {
			return reply.status(err?.statusCode || 400).send({
				error: err?.message || "Could not clear the image provider key",
				code: err?.code || "INVALID_IMAGE_GEN_KEY",
			});
		}
	});

	app.post("/settings/image-gen/providers/:id/test", async (request, reply) => {
		const providerId = String(request.params?.id || "");
		const provider = getImageGenProvider(providerId);
		if (!provider) {
			return reply.status(400).send({
				ok: false,
				error: `Unknown image provider: ${providerId}`,
				code: "UNKNOWN_IMAGE_GEN_PROVIDER",
			});
		}
		const prompt =
			typeof request.body?.prompt === "string" && request.body.prompt.trim()
				? request.body.prompt
				: TEST_PROMPT;
		const started = Date.now();
		try {
			const bytes = await generateImage({
				providerId,
				prompt,
				apiKey: provider.requiresKey
					? getImageGenKey({ providerId, dir })
					: "",
				fetchImpl,
			});
			return { ok: true, bytes: bytes.length, ms: Date.now() - started };
		} catch (err) {
			return reply.status(err?.statusCode || 502).send({
				ok: false,
				error: err?.message || "Image generation failed",
				code: err?.code || "IMAGE_GEN_PROVIDER_ERROR",
			});
		}
	});
}
