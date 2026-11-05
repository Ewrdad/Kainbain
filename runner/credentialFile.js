import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: shortRunnerId
 * @description Strips the `local-` prefix from a Runner id, mirroring the
 *   `SHORT=${ID#local-}` rule in startRunner.sh that names the env file
 *   and systemd unit — the credential file follows the same naming.
 * @example shortRunnerId('local-pi') => 'pi'
 * @param {string} runnerId - Runner id.
 * @returns {string} Short id (unchanged when it has no `local-` prefix).
 ***/
export function shortRunnerId(runnerId) {
	const id = typeof runnerId === "string" ? runnerId.trim() : "";
	return id.startsWith("local-") ? id.slice("local-".length) : id;
}

/***
 * MARK: credentialFilePathFor
 * @description Absolute path of the file holding one Runner's collected
 *   credential (`~/.kainbain/runner-<short>.credential`), beside the env
 *   file startRunner.sh writes. Null when no usable id/home is given.
 * @example credentialFilePathFor('local-pi', '/home/u') => '/home/u/.kainbain/runner-pi.credential'
 * @param {string} runnerId - Runner id.
 * @param {string} [homeDir] - Home directory (defaults to the OS home).
 * @returns {string|null} Credential file path, or null.
 ***/
export function credentialFilePathFor(runnerId, homeDir = os.homedir()) {
	const short = shortRunnerId(runnerId);
	const home = typeof homeDir === "string" && homeDir.trim() ? homeDir.trim() : "";
	if (!short || !home) return null;
	return path.join(home, ".kainbain", `runner-${short}.credential`);
}

/***
 * MARK: loadRunnerCredential
 * @description Reads a previously collected Runner credential from disk.
 *   Never throws: a missing/unreadable file simply yields "" so the
 *   daemon falls through to the join flow.
 * @example loadRunnerCredential('local-pi', '/home/u') => 'cred-…' or ''
 * @param {string} runnerId - Runner id.
 * @param {string} [homeDir] - Home directory (defaults to the OS home).
 * @returns {string} Stored credential, or "" when none.
 ***/
export function loadRunnerCredential(runnerId, homeDir = os.homedir()) {
	const file = credentialFilePathFor(runnerId, homeDir);
	if (!file) return "";
	try {
		return String(fs.readFileSync(file, "utf8") ?? "").trim();
	} catch {
		return "";
	}
}

/***
 * MARK: saveRunnerCredential
 * @description Persists a collected Runner credential to disk (mode 0600,
 *   creating `~/.kainbain` when needed) so the next boot authenticates
 *   without another handover. Throws on invalid input or write failure —
 *   the caller decides how to degrade.
 * @example saveRunnerCredential('local-pi', 'cred-…', '/home/u') => '/home/u/.kainbain/runner-pi.credential'
 * @param {string} runnerId - Runner id.
 * @param {string} credential - Credential to store.
 * @param {string} [homeDir] - Home directory (defaults to the OS home).
 * @returns {string} Credential file path written.
 ***/
export function saveRunnerCredential(runnerId, credential, homeDir = os.homedir()) {
	const file = credentialFilePathFor(runnerId, homeDir);
	if (!file) throw new Error("Cannot store a Runner credential without a Runner id and home directory.");
	if (typeof credential !== "string" || !credential.trim()) {
		throw new Error("Cannot store an empty Runner credential.");
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${credential.trim()}\n`, { mode: 0o600 });
	try {
		fs.chmodSync(file, 0o600);
	} catch {
		// Best effort: the write mode already requested 0600.
	}
	return file;
}
