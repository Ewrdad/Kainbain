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
/***
 * MARK: fetchWithTimeout
 * @description Runs a fetch with an abort timeout so a hung mirror or API
 *   cannot wedge the idle loop forever. The timer is unref'd and always
 *   cleared, so test mocks that ignore the signal never hold the process
 *   open. A timeout surfaces as FETCH_FAILED (fail-safe: keep old version).
 * @example await fetchWithTimeout({ fetchImpl: fetch, url, timeoutMs: 1000 }) => Response
 ***/
export const fetchWithTimeout = async ({ fetchImpl = fetch, url, options = {}, timeoutMs = 30000 } = {}) => {
	const ms = Number(timeoutMs);
	const controller = new AbortController();
	let timer = null;
	// A hard race, not just an abort signal: even a fetch implementation
	// that ignores the signal cannot wedge the idle loop past timeoutMs.
	// Real fetches are also aborted so they stop holding sockets.
	const timeout = new Promise((_, reject) => {
		if (!Number.isFinite(ms) || ms <= 0) return;
		timer = setTimeout(() => {
			try { controller.abort(new Error(`fetch timed out after ${ms}ms for ${url}`)); } catch { /* ignore */ }
			reject(Object.assign(new Error(`Fetch timed out after ${ms}ms for ${url}.`), { code: "FETCH_FAILED" }));
		}, ms);
		if (typeof timer.unref === "function") timer.unref();
	});
	try {
		return await Promise.race([fetchImpl(url, { ...options, signal: controller.signal }), timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
};

export const downloadVerifiedAsset = async ({
	url,
	destDir,
	filename,
	expectedSha256,
	fetchImpl = fetch,
	fsImpl = fs,
	timeoutMs = 300000,
} = {}) => {
	if (!url) throw Object.assign(new Error("downloadVerifiedAsset needs a url."), { code: "INVALID_ARGS" });
	if (!filename) throw Object.assign(new Error("downloadVerifiedAsset needs a filename."), { code: "INVALID_ARGS" });
	fsImpl.mkdirSync(destDir, { recursive: true });
	const finalPath = path.join(destDir, filename);
	const partPath = `${finalPath}.part`;
	let res;
	try {
		res = await fetchWithTimeout({ fetchImpl, url, options: { headers: { accept: "application/octet-stream" } }, timeoutMs });
	} catch (err) {
		throw Object.assign(new Error(`Asset download failed: ${err?.message || err}.`), {
			code: err?.code || "DOWNLOAD_FAILED",
			statusCode: err?.statusCode ?? 502,
		});
	}
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
		// A half-written or tampered `.part` must never survive: the next
		// check re-downloads from scratch instead of trusting leftovers.
		try { fsImpl.rmSync(partPath, { force: true }); } catch { /* ignore */ }
		if (err?.code === "ASSET_SHA_MISMATCH" || err?.code === "DOWNLOAD_FAILED") throw err;
		throw Object.assign(new Error(`Asset download failed: ${err?.message || err}.`), { code: "DOWNLOAD_FAILED" });
	}
	fsImpl.renameSync(partPath, finalPath);
	return { path: finalPath };
};

export const fetchText = async ({ url, fetchImpl = fetch, accept = "application/json", timeoutMs = 30000 } = {}) => {
	let res;
	try {
		res = await fetchWithTimeout({ fetchImpl, url, options: { headers: { accept } }, timeoutMs });
	} catch (err) {
		throw Object.assign(new Error(`Fetch failed: ${err?.message || err}.`), {
			code: err?.code || "FETCH_FAILED",
			statusCode: err?.statusCode ?? 502,
		});
	}
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
