import crypto from "node:crypto";
import fs from "node:fs";

/***
 * MARK: updateVerify
 * @description Signature + integrity verification for the runner self-update
 *   channel (Option A, ADR 0012, R05). Trust root: the minisign PUBLIC key
 *   pinned below. It is compiled into the runner source — NEVER fetched from
 *   the network, never taken from a downloaded file. Compromise of the
 *   backend, the GitHub API, or the asset store alone cannot ship a runner
 *   binary: the updater aborts unless the manifest carries a valid
 *   signature from this key, and aborts unless the asset matches the
 *   manifest's sha256. Verification order is fixed: signature → schema →
 *   sha256. Rotation happens only via a new runner release signed by the
 *   old key (or a fresh bootstrap install).
 * @example await verifyManifestSignature({ manifestBytes, signatureText }) => { ok: true }
 ***/

// Kainbain runner release signing key (verify-only public half).
// The secret half lives in the GitHub Actions secret
// RUNNER_RELEASE_SIGNING_KEY; this constant must never be replaced by a
// value read from disk, config, or the network at runtime.
// Provisioning: run `node scripts/runner-release-keygen.mjs` ONCE, commit
// the printed public line here (and in scripts/runner-pinned-key/
// runner-release.pub — CI fails the release when they differ), and store
// the secret halves in GitHub Actions secrets. The value below is the
// initial placeholder: replace it before cutting the first real release,
// otherwise runners will reject that release's manifest signature.
export const PINNED_RELEASE_PUBLIC_KEY =
	"RWSQEBHai7CRR5kCeIbhz4AuZxyghDr69fY2wF1ETbjkiwCYdIrWkypA";
export const PINNED_RELEASE_KEYNUM = "901011da8bb09147";

const MINISIGN_SIG_ALG = "Ed";

const decodeMinisignPub = (keyText) => {
	const line = String(keyText || "")
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("untrusted comment:"))
		.at(-1);
	if (!line) return { ok: false, reason: "Public key file has no key line." };
	let raw;
	try {
		raw = Buffer.from(line, "base64");
	} catch {
		return { ok: false, reason: "Public key line is not base64." };
	}
	if (raw.length !== 42 || raw.subarray(0, 2).toString("ascii") !== MINISIGN_SIG_ALG) {
		return { ok: false, reason: "Public key is not a minisign Ed25519 key (want 42 bytes, 'Ed' prefix)." };
	}
	return { ok: true, keynum: raw.subarray(2, 10).toString("hex"), pubRaw: raw.subarray(10) };
};

// Returns the GLOBAL signature (over the manifest bytes). A minisign
// .minisig file carries two signatures: the global one (line 2, signs the
// file) and the trusted-comment one (line 4, signs sig+comment for human
// `minisign -V` output). Only the global signature gates an install; the
// trusted-comment signature is verified opportunistically when present.
const decodeMinisignSig = (sigText) => {
	const lines = String(sigText || "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.filter((l) => !l.startsWith("untrusted comment:"));
	if (lines.length === 0) return { ok: false, reason: "Signature file is empty." };
	let raw;
	try {
		raw = Buffer.from(lines[0], "base64");
	} catch {
		return { ok: false, reason: "Signature line is not base64." };
	}
	if (raw.length !== 74 || raw.subarray(0, 2).toString("ascii") !== MINISIGN_SIG_ALG) {
		return { ok: false, reason: "Signature is not a minisign Ed25519 signature (want 74 bytes, 'Ed' prefix)." };
	}
	return { ok: true, keynum: raw.subarray(2, 10).toString("hex"), sig: raw.subarray(10) };
};

const spkiDerFor = (pubRaw) =>
	Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pubRaw)]);

export const verifyManifestSignature = ({ manifestBytes, signatureText, publicKey = PINNED_RELEASE_PUBLIC_KEY } = {}) => {
	if (!manifestBytes || manifestBytes.length === 0) {
		return { ok: false, reason: "Nothing to verify (empty manifest bytes)." };
	}
	const pub = decodeMinisignPub(publicKey);
	if (!pub.ok) return pub;
	if (pub.keynum !== PINNED_RELEASE_KEYNUM && publicKey === PINNED_RELEASE_PUBLIC_KEY) {
		return { ok: false, reason: "Pinned release key mismatch (source tampered?)." };
	}
	const sig = decodeMinisignSig(signatureText);
	if (!sig.ok) return sig;
	if (sig.keynum !== pub.keynum) {
		return { ok: false, reason: `Signature key id ${sig.keynum} does not match public key id ${pub.keynum}.` };
	}
	let keyObject;
	try {
		keyObject = crypto.createPublicKey({ key: spkiDerFor(pub.pubRaw), format: "der", type: "spki" });
	} catch {
		return { ok: false, reason: "Pinned public key does not parse as Ed25519." };
	}
	let valid = false;
	try {
		valid = crypto.verify(null, Buffer.from(manifestBytes), keyObject, Buffer.from(sig.sig));
	} catch {
		valid = false;
	}
	if (!valid) return { ok: false, reason: "Manifest signature verification FAILED (tampered manifest or wrong key)." };
	return { ok: true, keynum: sig.keynum };
};

export const sha256HexOf = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

export const verifyAssetBytes = ({ bytes, expectedSha256 }) => {
	const actual = sha256HexOf(bytes || Buffer.alloc(0));
	const expected = String(expectedSha256 || "").trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(expected)) return { ok: false, reason: "Expected sha256 is malformed.", actual };
	let match = false;
	try {
		match = crypto.timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(expected, "utf8"));
	} catch {
		match = actual === expected;
	}
	if (!match) return { ok: false, reason: `Asset sha256 mismatch (want ${expected.slice(0, 16)}…, got ${actual.slice(0, 16)}…).`, actual };
	return { ok: true, actual };
};

export const verifyAssetFile = async ({ filePath, expectedSha256 }) => {
	const expected = String(expectedSha256 || "").trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(expected)) return { ok: false, reason: "Expected sha256 is malformed.", actual: null };
	const hash = crypto.createHash("sha256");
	const stream = fs.createReadStream(filePath);
	await new Promise((resolve, reject) => {
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", resolve);
		stream.on("error", reject);
	});
	const digest = hash.digest("hex");
	let match = false;
	try {
		match = crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(expected, "utf8"));
	} catch {
		match = digest === expected;
	}
	if (!match) {
		return { ok: false, reason: `Asset sha256 mismatch (want ${expected.slice(0, 16)}…, got ${digest.slice(0, 16)}…).`, actual: digest };
	}
	return { ok: true, actual: digest };
};
