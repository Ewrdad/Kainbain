import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	IMAGE_GEN_DEFAULT_SIZE,
	MOCK_IMAGE_PNG_BASE64,
	MUSE_IMAGE_API_BASE_URL,
	MUSE_IMAGE_MODEL,
	generateImage,
	generateMockImage,
	generateMuseImage,
	getImageGenProvider,
	isKnownImageGenProvider,
	listImageGenProviders,
	resolveMuseApiBaseUrl,
} from "./providers.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const jsonResponse = ({ status = 200, payload = {} } = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	json: async () => payload,
	text: async () => JSON.stringify(payload),
	arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
});

const bytesResponse = (buffer) => ({
	ok: true,
	status: 200,
	json: async () => {
		throw new Error("not json");
	},
	text: async () => buffer.toString("latin1"),
	arrayBuffer: async () => buffer,
});

describe("api/imageGen/providers registry", () => {
	it("lists muse first with key metadata (never keys or generate fns)", () => {
		const list = listImageGenProviders();
		expect(list.map((p) => p.id)).toEqual(["muse", "mock"]);
		for (const entry of list) {
			expect(Object.keys(entry).sort()).toEqual(
				["description", "id", "label", "requiresKey"].sort(),
			);
		}
		expect(list[0]).toMatchObject({ id: "muse", requiresKey: true });
		expect(list[1]).toMatchObject({ id: "mock", requiresKey: false });
	});

	it("resolves adapters by id", () => {
		expect(getImageGenProvider("muse")?.id).toBe("muse");
		expect(typeof getImageGenProvider("muse")?.generate).toBe("function");
		expect(getImageGenProvider("nope")).toBeNull();
		expect(isKnownImageGenProvider("mock")).toBe(true);
		expect(isKnownImageGenProvider("nope")).toBe(false);
	});

	it("generateImage fails safe on unknown providers", async () => {
		await expect(generateImage({ providerId: "nope", prompt: "x" })).rejects.toMatchObject({
			statusCode: 400,
			code: "UNKNOWN_IMAGE_GEN_PROVIDER",
		});
	});
});

describe("api/imageGen/providers mock", () => {
	it("returns the deterministic fixture PNG", async () => {
		const bytes = await generateMockImage({ prompt: "a login screen" });
		expect(Buffer.isBuffer(bytes)).toBe(true);
		expect(bytes.subarray(0, 8)).toEqual(PNG_MAGIC);
		expect(bytes.toString("base64")).toBe(MOCK_IMAGE_PNG_BASE64);
	});

	it("rejects empty and over-long prompts", async () => {
		await expect(generateMockImage({ prompt: "  " })).rejects.toMatchObject({
			code: "INVALID_IMAGE_GEN_PROMPT",
		});
		await expect(generateMockImage({ prompt: "x".repeat(4001) })).rejects.toMatchObject({
			code: "INVALID_IMAGE_GEN_PROMPT",
		});
	});
});

describe("api/imageGen/providers muse", () => {
	const savedEnv = {};

	beforeEach(() => {
		for (const name of ["KAINBAIN_IMAGE_GEN_MUSE_BASE_URL", "META_MODEL_API_BASE_URL"]) {
			savedEnv[name] = process.env[name];
			delete process.env[name];
		}
	});

	afterEach(() => {
		for (const [name, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it("resolves the API base (deploy override, then ecosystem, then default)", () => {
		expect(resolveMuseApiBaseUrl()).toBe(MUSE_IMAGE_API_BASE_URL);
		process.env.META_MODEL_API_BASE_URL = "https://stub.local/meta/";
		expect(resolveMuseApiBaseUrl()).toBe("https://stub.local/meta");
		process.env.KAINBAIN_IMAGE_GEN_MUSE_BASE_URL = "https://kb.local/m/";
		expect(resolveMuseApiBaseUrl()).toBe("https://kb.local/m");
		process.env.KAINBAIN_IMAGE_GEN_MUSE_BASE_URL = "not-a-url";
		expect(resolveMuseApiBaseUrl()).toBe("https://stub.local/meta");
	});

	it("requires an API key", async () => {
		await expect(
			generateMuseImage({ prompt: "x", apiKey: "  ", fetchImpl: async () => ({}) }),
		).rejects.toMatchObject({ statusCode: 400, code: "IMAGE_GEN_NO_KEY" });
	});

	it("posts an OpenAI-compatible generations request and decodes b64_json", async () => {
		const calls = [];
		const fetchImpl = async (url, init) => {
			calls.push({ url, init });
			return jsonResponse({ payload: { data: [{ b64_json: MOCK_IMAGE_PNG_BASE64 }] } });
		};
		const bytes = await generateMuseImage({
			prompt: "a settings page",
			apiKey: "sk-test",
			fetchImpl,
		});
		expect(bytes.toString("base64")).toBe(MOCK_IMAGE_PNG_BASE64);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(`${MUSE_IMAGE_API_BASE_URL}/images/generations`);
		expect(calls[0].init.method).toBe("POST");
		expect(calls[0].init.headers.authorization).toBe("Bearer sk-test");
		expect(JSON.parse(calls[0].init.body)).toMatchObject({
			model: MUSE_IMAGE_MODEL,
			prompt: "a settings page",
			size: IMAGE_GEN_DEFAULT_SIZE,
			n: 1,
		});
	});

	it("accepts Meta's images[]/image_url spelling via a follow-up download", async () => {
		const imageBytes = Buffer.from("fake-image-bytes");
		const urls = [];
		const fetchImpl = async (url) => {
			urls.push(url);
			if (String(url).endsWith("/images/generations")) {
				return jsonResponse({
					payload: { images: [{ image_url: "https://cdn.meta.ai/out/img1.png" }] },
				});
			}
			return bytesResponse(imageBytes);
		};
		const bytes = await generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl });
		expect(bytes).toEqual(imageBytes);
		expect(urls).toEqual([
			`${MUSE_IMAGE_API_BASE_URL}/images/generations`,
			"https://cdn.meta.ai/out/img1.png",
		]);
	});

	it("refuses non-https download URLs", async () => {
		const fetchImpl = async () => jsonResponse({
			payload: { data: [{ url: "file:///etc/passwd" }] },
		});
		await expect(generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl })).rejects.toMatchObject({
			code: "IMAGE_GEN_PROVIDER_ERROR",
		});
	});

	it("rejects oversize inline payloads before allocating the decode", async () => {
		const big = Buffer.alloc(32, 7).toString("base64");
		const fetchImpl = async () => jsonResponse({
			payload: { data: [{ b64_json: big }] },
		});
		await expect(
			generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl, maxBytes: 10 }),
		).rejects.toMatchObject({ statusCode: 502, code: "IMAGE_GEN_PROVIDER_ERROR" });
	});

	it("rejects oversize downloads on the declared length without reading the body", async () => {
		let bodyRead = false;
		const fetchImpl = async (url) => {
			if (String(url).endsWith("/images/generations")) {
				return jsonResponse({
					payload: { data: [{ url: "https://cdn.meta.ai/out/big.png" }] },
				});
			}
			return {
				ok: true,
				status: 200,
				headers: { get: (name) => (String(name).toLowerCase() === "content-length" ? "999999" : null) },
				arrayBuffer: async () => {
					bodyRead = true;
					return Buffer.alloc(1);
				},
			};
		};
		await expect(
			generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl, maxBytes: 10 }),
		).rejects.toMatchObject({ statusCode: 502, code: "IMAGE_GEN_PROVIDER_ERROR" });
		expect(bodyRead).toBe(false);
	});

	it("rejects oversize downloads even when the header lies", async () => {
		const fetchImpl = async (url) => {
			if (String(url).endsWith("/images/generations")) {
				return jsonResponse({
					payload: { data: [{ url: "https://cdn.meta.ai/out/big.png" }] },
				});
			}
			return bytesResponse(Buffer.alloc(32, 7));
		};
		await expect(
			generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl, maxBytes: 10 }),
		).rejects.toMatchObject({ statusCode: 502, code: "IMAGE_GEN_PROVIDER_ERROR" });
	});

	it("maps provider failures to 502 without leaking the key", async () => {
		const fetchImpl = async () => ({
			ok: false,
			status: 401,
			text: async () => "bad api_key=sk-test-secret",
		});
		const failure = await generateMuseImage({ prompt: "x", apiKey: "sk-test-secret", fetchImpl }).catch(
			(err) => err,
		);
		expect(failure).toMatchObject({ statusCode: 502, code: "IMAGE_GEN_PROVIDER_ERROR" });
		expect(String(failure.message)).toContain("HTTP 401");
		expect(String(failure.message)).not.toContain("sk-test-secret");
	});

	it("wraps network failures as provider errors", async () => {
		const fetchImpl = async () => {
			throw new Error("socket hang up");
		};
		await expect(generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl })).rejects.toMatchObject({
			statusCode: 502,
			code: "IMAGE_GEN_PROVIDER_ERROR",
		});
	});

	it("rejects responses without a usable image", async () => {
		const fetchImpl = async () => jsonResponse({ payload: { data: [] } });
		await expect(generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl })).rejects.toMatchObject({
			code: "IMAGE_GEN_PROVIDER_ERROR",
		});
	});

	it("rejects corrupt base64 instead of writing garbage bytes", async () => {
		const fetchImpl = async () =>
			jsonResponse({ payload: { data: [{ b64_json: "!!!not-base64!!!" }] } });
		await expect(generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl })).rejects.toMatchObject({
			statusCode: 502,
			code: "IMAGE_GEN_PROVIDER_ERROR",
		});
	});

	it("times out a hung provider", async () => {
		const fetchImpl = () => new Promise(() => {});
		await expect(
			generateMuseImage({ prompt: "x", apiKey: "k", fetchImpl, timeoutMs: 20 }),
		).rejects.toMatchObject({ statusCode: 504, code: "IMAGE_GEN_TIMEOUT" });
	});
});
