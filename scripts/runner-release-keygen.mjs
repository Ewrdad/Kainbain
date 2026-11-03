#!/usr/bin/env node
/***
 * MARK: runner-release-keygen
 * @description One-time operator step BEFORE the first runner release
 *   (Option A, ADR 0012): generates the minisign-format Ed25519 release
 *   keypair. The PUBLIC half is printed for committing to
 *   scripts/runner-pinned-key/runner-release.pub (and the matching
 *   PINNED_RELEASE_PUBLIC_KEY constant in runner/updates/verify.js — CI
 *   fails the release when they differ). The SECRET half is printed ONCE
 *   for storing in the GitHub Actions secrets RUNNER_RELEASE_SIGNING_KEY
 *   (base64 32-byte seed) + RUNNER_RELEASE_SIGNING_KEYNUM (hex key id):
 *   never commit it, never log it, never reuse the test key.
 * @example node scripts/runner-release-keygen.mjs
 ***/
import crypto from "node:crypto";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const pubRaw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const privRaw = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
const keynum = crypto.randomBytes(8);
const pubLine = Buffer.concat([Buffer.from([0x45, 0x64]), keynum, pubRaw]).toString("base64");

console.log("--- COMMIT to scripts/runner-pinned-key/runner-release.pub ---");
console.log("untrusted comment: kainbain runner release signing key (verify-only; the secret lives in the GitHub Actions secret RUNNER_RELEASE_SIGNING_KEY)");
console.log(pubLine);
console.log("--- ALSO SET PINNED_RELEASE_PUBLIC_KEY in runner/updates/verify.js to the line above ---");
console.log("--- STORE in GitHub Actions secrets (Settings > Secrets > Actions), NEVER commit ---");
console.log(`RUNNER_RELEASE_SIGNING_KEY=${privRaw.toString("base64")}`);
console.log(`RUNNER_RELEASE_SIGNING_KEYNUM=${keynum.toString("hex")}`);
