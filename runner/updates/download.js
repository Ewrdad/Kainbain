import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { verifyAssetBytes, verifyAssetFile } from "./verify.js";

/***
 * MARK: updateDownload
 * @description Atomic asset download for the runner self-update channel
 *   (Option A, ADR 0012). Bytes stream to `<name>.part`, the sha256 is
 *   verified from the completed file, and only then is it renamed into
 *   place — a failed or tampered download never leaves a half-written
 *   asset behind. No extraction here (see index.js apply step).
 * @example await downloadVerifiedAsset({ url, destDir, filename, expectedSha256, fetchImpl }) => { path }
 ***/
export const downloadVerifiedAsset = async ({
	url,
	destDir,
	filename,
	expectedSha256,
	fetchImpl = fetch,
	fsImpl = fs,
} = {}) => {
	if (!url) throw Object.assign(new Error("downloadVerifiedAsset needs a url."), { code: "INVALID_ARGS" });
	if (!filename) throw Object.assign(new Error("downloadVerifiedAsset needs a filename."), { code: "INVALID_ARGS" });
	fsImpl.mkdirSync(destDir, { recursive: true });
	const finalPath = path.join(destDir, filename);
	const partPath = `${finalPath}.part`;
	const res = await fetchImpl(url, { headers: { accept: "application/octet-stream" } });
	if (!res || res.ok !== true) {
		throw Object.assign(new Error(`Asset download failed: HTTP ${res?.status ?? "no-response"} for ${url}.`), {
			code: "DOWNLOAD_FAILED",
			statusCode: typeof res?.status === "number" ? res.status : 502,
		});
	}
	try {
		if (typeof res.arrayBuffer === "function") {
			const bytes = Buffer.from(await res.arrayBuffer());
			const check = verifyAssetBytes({ bytes, expectedSha256 });
			if (!check.ok) {
				throw Object.assign(new Error(`Asset verification failed: ${check.reason}`), { code: "ASSET_SHA_MISMATCH" });
			}
			fsImpl.writeFileSync(partPath, bytes);
		} else if (res.body && typeof res.body.pipe === "function") {
			const out = fsImpl.createWriteStream(partPath);
			await pipeline(res.body, out);
			// Streamed path: verify from the completed file.
			const fileCheck = await verifyAssetFile({ filePath: partPath, expectedSha256 });
			if (!fileCheck.ok) {
				throw Object.assign(new Error(`Asset verification failed: ${fileCheck.reason}`), { code: "ASSET_SHA_MISMATCH" });
			}
		} else {
			throw Object.assign(new Error("Fetch implementation returned no readable body."), { code: "DOWNLOAD_FAILED" });
		}
	} catch (err) {
		if (err?.code === "ASSET_SHA_MISMATCH") throw err;
		try { fsImpl.rmSync(partPath, { force: true }); } catch { /* ignore */ }
		throw Object.assign(new Error(`Asset download failed: ${err?.message || err}.`), { code: "DOWNLOAD_FAILED" });
	}
	fsImpl.renameSync(partPath, finalPath);
	return { path: finalPath };
};

export const fetchText = async ({ url, fetchImpl = fetch, accept = "application/json" } = {}) => {
	const res = await fetchImpl(url, { headers: { accept } });
	if (!res || res.ok !== true) {
		throw Object.assign(new Error(`Fetch failed: HTTP ${res?.status ?? "no-response"} for ${url}.`), {
			code: "FETCH_FAILED",
			statusCode: typeof res?.status === "number" ? res.status : 502,
		});
	}
	if (typeof res.text === "function") return res.text();
	if (typeof res.json === "function" && accept.includes("json")) {
		const data = await res.json();
		return typeof data === "string" ? data : JSON.stringify(data);
	}
	throw Object.assign(new Error("Fetch implementation returned no readable body."), { code: "FETCH_FAILED" });
};
