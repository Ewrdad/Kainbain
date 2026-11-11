import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkForUpdate } from "./updates/index.js";
import { verifyManifestSignature } from "./updates/verify.js";
import { fixtureManifest, signTestManifest, TEST_PUBLIC_KEY } from "./updates/testkey.js";

const verifyWithTestKey = ({ manifestBytes, signatureText }) =>
	verifyManifestSignature({ manifestBytes, signatureText, publicKey: TEST_PUBLIC_KEY });

const quiet = { warn: () => {}, log: () => {} };

const POINTER = "https://api.github.com/repos/Ewrdad/Kainbain/releases/latest";
const LIST = "https://api.github.com/repos/Ewrdad/Kainbain/releases?per_page=30&page=1";

// One signed candidate release: manifest + signature + the GitHub asset
// rows pointing at them. `requires` defaults to the repo's own range.
const candidate = (version, { requires = { backendApi: ">=1.0.0 <2.0.0" }, base = "https://dl.local" } = {}) => {
	const manifest = fixtureManifest({ version, ...(requires ? { requires } : {}) });
	const text = JSON.stringify(manifest);
	return {
		manifest,
		text,
		sig: signTestManifest(Buffer.from(text, "utf8")),
		assets: [
			{ name: "manifest.json", browser_download_url: `${base}/${version}/manifest.json` },
			{ name: "manifest.json.minisig", browser_download_url: `${base}/${version}/manifest.json.minisig` },
			{ name: `kainbain-runner-${version}-linux-x64.tar.gz`, browser_download_url: `${base}/${version}/asset.tar.gz` },
		],
	};
};

const githubFetch = ({ latest, list = [], byUrl = {} }) => {
	const seen = [];
	return {
		seen,
		fetch: async (url) => {
			const href = String(url);
			seen.push(href);
			if (href === POINTER) return { ok: true, status: 200, text: async () => JSON.stringify(latest) };
			if (href === LIST) return { ok: true, status: 200, text: async () => JSON.stringify(list) };
			if (byUrl[href]) return { ok: true, status: 200, text: async () => byUrl[href] };
			return { ok: false, status: 404 };
		},
	};
};

const checkGithub = (fetch, extra = {}) =>
	checkForUpdate({
		currentVersion: "0.1.0",
		updateUrl: POINTER,
		fetchImpl: fetch,
		verifyImpl: verifyWithTestKey,
		platform: "linux",
		arch: "x64",
		backendApiVersion: "1.0.0",
		logger: quiet,
		...extra,
	});

describe("checkForUpdate compatibility selection (GitHub)", () => {
	it("takes a compatible latest through the fast path without listing releases", async () => {
		const rel = candidate("0.2.0");
		const { seen, fetch } = githubFetch({
			latest: { tag_name: "runner-v0.2.0", prerelease: false, assets: rel.assets },
			byUrl: { [`https://dl.local/0.2.0/manifest.json`]: rel.text, [`https://dl.local/0.2.0/manifest.json.minisig`]: rel.sig },
		});
		const got = await checkGithub(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.2.0");
		assert.ok(!seen.includes(LIST), "the fast path never fetches the releases list");
	});

	it("walks older releases when latest is incompatible and picks the newest compatible one", async () => {
		const latest = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		const older = candidate("0.2.0");
		const oldest = candidate("0.1.5");
		const byUrl = {};
		for (const rel of [latest, older, oldest]) {
			byUrl[`https://dl.local/${rel.manifest.version}/manifest.json`] = rel.text;
			byUrl[`https://dl.local/${rel.manifest.version}/manifest.json.minisig`] = rel.sig;
		}
		const { fetch } = githubFetch({
			latest: { tag_name: "runner-v0.9.0", prerelease: false, assets: latest.assets },
			list: [
				{ tag_name: "runner-v0.9.0", prerelease: false, draft: false, assets: latest.assets },
				{ tag_name: "runner-v0.8.0-rc.1", prerelease: true, draft: false, assets: [] },
				{ tag_name: "runner-v0.2.0", prerelease: false, draft: false, assets: older.assets },
				{ tag_name: "runner-v0.1.5", prerelease: false, draft: false, assets: oldest.assets },
				{ tag_name: "runner-v0.1.4", prerelease: false, draft: true, assets: [] },
				{ tag_name: "backend-snapshot", prerelease: false, draft: false, assets: [] },
			],
			byUrl,
		});
		const got = await checkGithub(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.2.0");
		assert.equal(got.update?.releaseMeta?.tag_name, "runner-v0.2.0");
	});

	it("reports no update (with the reason) when nothing compatible is newer", async () => {
		const latest = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		const { fetch } = githubFetch({
			latest: { tag_name: "runner-v0.9.0", prerelease: false, assets: latest.assets },
			list: [{ tag_name: "runner-v0.9.0", prerelease: false, draft: false, assets: latest.assets }],
			byUrl: { [`https://dl.local/0.9.0/manifest.json`]: latest.text, [`https://dl.local/0.9.0/manifest.json.minisig`]: latest.sig },
		});
		const got = await checkGithub(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /No compatible release newer than 0\.1\.0/);
		assert.match(got.reason, /requires backendApi/);
	});

	it("fails closed when the releases list cannot be fetched", async () => {
		const latest = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		const fetch = async (url) => {
			if (String(url) === POINTER) {
				return { ok: true, status: 200, text: async () => JSON.stringify({ tag_name: "runner-v0.9.0", prerelease: false, assets: latest.assets }) };
			}
			if (String(url).endsWith("manifest.json")) return { ok: true, status: 200, text: async () => latest.text };
			if (String(url).endsWith("manifest.json.minisig")) return { ok: true, status: 200, text: async () => latest.sig };
			throw Object.assign(new Error("connect ECONNREFUSED"), { code: "FETCH_FAILED" });
		};
		const got = await checkGithub(fetch);
		assert.equal(got.ok, false);
		assert.match(got.reason, /could not list releases/);
	});

	it("skips gating entirely when the backend version is unknown", async () => {
		const rel = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		const { seen, fetch } = githubFetch({
			latest: { tag_name: "runner-v0.9.0", prerelease: false, assets: rel.assets },
			byUrl: { [`https://dl.local/0.9.0/manifest.json`]: rel.text, [`https://dl.local/0.9.0/manifest.json.minisig`]: rel.sig },
		});
		const got = await checkGithub(fetch, { backendApiVersion: null });
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.9.0");
		assert.ok(!seen.includes(LIST));
	});

	it("aborts (never skips past) a list entry whose manifest signature fails", async () => {
		const latest = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		const older = candidate("0.2.0");
		const tamperedSig = signTestManifest(Buffer.from(JSON.stringify({ ...older.manifest, version: "9.9.9" }), "utf8"));
		const { fetch } = githubFetch({
			latest: { tag_name: "runner-v0.9.0", prerelease: false, assets: latest.assets },
			list: [
				{ tag_name: "runner-v0.9.0", prerelease: false, draft: false, assets: latest.assets },
				{ tag_name: "runner-v0.2.0", prerelease: false, draft: false, assets: older.assets },
			],
			byUrl: {
				[`https://dl.local/0.9.0/manifest.json`]: latest.text,
				[`https://dl.local/0.9.0/manifest.json.minisig`]: latest.sig,
				[`https://dl.local/0.2.0/manifest.json`]: older.text,
				[`https://dl.local/0.2.0/manifest.json.minisig`]: tamperedSig,
			},
		});
		const got = await checkGithub(fetch);
		assert.equal(got.ok, false);
		assert.match(got.reason, /FAILED|key id/i);
	});

	it("filters by the manifest version, not a lying tag", async () => {
		const latest = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		// Tag claims 0.5.0 but the signed manifest inside says 0.1.0: not
		// newer, so the walk must not select it.
		const liar = candidate("0.1.0");
		const { fetch } = githubFetch({
			latest: { tag_name: "runner-v0.9.0", prerelease: false, assets: latest.assets },
			list: [
				{ tag_name: "runner-v0.9.0", prerelease: false, draft: false, assets: latest.assets },
				{ tag_name: "runner-v0.5.0", prerelease: false, draft: false, assets: liar.assets },
			],
			byUrl: {
				[`https://dl.local/0.9.0/manifest.json`]: latest.text,
				[`https://dl.local/0.9.0/manifest.json.minisig`]: latest.sig,
				[`https://dl.local/0.1.0/manifest.json`]: liar.text,
				[`https://dl.local/0.1.0/manifest.json.minisig`]: liar.sig,
			},
		});
		const got = await checkGithub(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
	});
});

describe("checkForUpdate compatibility selection (mirror)", () => {
	const MIRROR = "http://mirror.local/r";

	const mirrorFetch = (files) => async (url) => {
		const body = files[String(url)];
		if (body === undefined) return { ok: false, status: 404 };
		return { ok: true, status: 200, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
	};

	const checkMirror = (fetch, extra = {}) =>
		checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: MIRROR,
			fetchImpl: fetch,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			backendApiVersion: "1.0.0",
			logger: quiet,
			...extra,
		});

	it("walks the releases.json index for the newest compatible release", async () => {
		const newer = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" }, base: `${MIRROR}/v` });
		const older = candidate("0.2.0", { base: `${MIRROR}/v` });
		const fetch = mirrorFetch({
			[`${MIRROR}/releases.json`]: {
				schema: 1,
				component: "runner",
				releases: [
					{ version: "0.9.0", manifestUrl: `${MIRROR}/v/0.9.0/manifest.json`, signatureUrl: `${MIRROR}/v/0.9.0/manifest.json.minisig` },
					{ version: "0.3.0-rc.1", manifestUrl: `${MIRROR}/v/0.3.0-rc.1/manifest.json`, signatureUrl: `${MIRROR}/v/0.3.0-rc.1/manifest.json.minisig` },
					{ version: "0.2.0", manifestUrl: `${MIRROR}/v/0.2.0/manifest.json`, signatureUrl: `${MIRROR}/v/0.2.0/manifest.json.minisig` },
				],
			},
			[`${MIRROR}/v/0.9.0/manifest.json`]: newer.text,
			[`${MIRROR}/v/0.9.0/manifest.json.minisig`]: newer.sig,
			[`${MIRROR}/v/0.2.0/manifest.json`]: older.text,
			[`${MIRROR}/v/0.2.0/manifest.json.minisig`]: older.sig,
		});
		const got = await checkMirror(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.2.0");
		assert.equal(got.update?.sourceUrl, `${MIRROR}/v/0.2.0/manifest.json`);
	});

	it("falls back to the single manifest when the index is absent (legacy mirror)", async () => {
		const rel = candidate("0.2.0");
		const fetch = mirrorFetch({
			[`${MIRROR}/manifest.json`]: rel.text,
			[`${MIRROR}/manifest.json.minisig`]: rel.sig,
		});
		const got = await checkMirror(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.2.0");
	});

	it("compat-filters the fallback manifest too", async () => {
		const rel = candidate("0.2.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		const fetch = mirrorFetch({
			[`${MIRROR}/manifest.json`]: rel.text,
			[`${MIRROR}/manifest.json.minisig`]: rel.sig,
		});
		const got = await checkMirror(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /not compatible/);
	});

	it("fails loudly on a present-but-invalid index", async () => {
		const fetch = mirrorFetch({ [`${MIRROR}/releases.json`]: "{oops" });
		const got = await checkMirror(fetch);
		assert.equal(got.ok, false);
		assert.match(got.reason, /not valid JSON/);
	});

	it("reports no releases on an empty index", async () => {
		const fetch = mirrorFetch({ [`${MIRROR}/releases.json`]: { schema: 1, component: "runner", releases: [] } });
		const got = await checkMirror(fetch);
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /no releases/i);
	});

	it("treats a full manifest.json URL as an explicit pin (still compat-filtered, never a walk)", async () => {
		const rel = candidate("0.9.0", { requires: { backendApi: ">=2.0.0 <3.0.0" } });
		const fetch = mirrorFetch({
			[`${MIRROR}/pinned/manifest.json`]: rel.text,
			[`${MIRROR}/pinned/manifest.json.minisig`]: rel.sig,
		});
		const got = await checkMirror(fetch, { updateUrl: `${MIRROR}/pinned/manifest.json` });
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /not compatible/);
	});
});
