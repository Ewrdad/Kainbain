/***
 * MARK: zipEntries
 * @description Thin adapter over the `adm-zip` library: the ONLY module that
 *   knows the zip implementation. Turns a raw zip buffer into a plain entry
 *   list (`[{ path, bytes }]`) so the pure import validator
 *   (`skillImport.js`) stays unit-testable without any zip dependency.
 *
 *   Byte caps are enforced DURING extraction (from each entry's declared
 *   uncompressed size, before its bytes are inflated) so a zip bomb fails
 *   fast instead of exhausting memory. Every failure returns `{ error }`
 *   and never throws.
 * @example const { entries, error } = parseZipEntries(buffer, { maxEntries: 64, maxTotalBytes: 524288 })
 ***/

import AdmZip from "adm-zip";

/***
 * MARK: isSymlinkAttr
 * @description Whether a zip external-attributes field marks a symlink (unix
 *   file-type bits `0o120000` in the upper 16 bits). Symlinks are rejected
 *   outright: extracting one could point outside the project overlay.
 * @example isSymlinkAttr(0o120777 << 16) => true
 * @param {number} attr - The entry's `header.attr` value.
 * @returns {boolean}
 ***/
export function isSymlinkAttr(attr) {
	if (typeof attr !== "number" || !Number.isFinite(attr)) return false;
	return ((attr >>> 16) & 0o170000) === 0o120000;
}

/***
 * MARK: parseZipEntries
 * @description Parses a zip buffer into `{ entries, error }`. `entries` is a
 *   list of `{ path, bytes }` for every FILE entry (directories are skipped),
 *   where `path` is the raw stored entry name with backslashes normalized to
 *   `/`. Guards, in order: valid zip, entry-count cap, per-entry uncompressed
 *   cap (checked pre-inflation), total-uncompressed cap, symlink rejection.
 *   Path safety (absolute paths, `..` escape) is enforced by the caller
 *   (`skillImport.normalizeZipImport`), which sees every raw path here.
 * @example parseZipEntries(buf, { maxEntries: 64, maxFileBytes: 262144, maxTotalBytes: 524288 })
 * @param {Buffer|Uint8Array} buffer - Raw zip bytes.
 * @param {Object} [opts]
 * @param {number} [opts.maxEntries=64] - Max file entries accepted.
 * @param {number} [opts.maxFileBytes=262144] - Max uncompressed bytes per entry.
 * @param {number} [opts.maxTotalBytes=524288] - Max uncompressed bytes total.
 * @returns {{ entries: Array<{path: string, bytes: Buffer}>, error: string|null }}
 ***/
export function parseZipEntries(
	buffer,
	{ maxEntries = 64, maxFileBytes = 256 * 1024, maxTotalBytes = 512 * 1024 } = {},
) {
	if (!buffer || buffer.length === 0) {
		return { entries: [], error: "Zip file is empty" };
	}

	let zip;
	try {
		zip = new AdmZip(Buffer.from(buffer));
	} catch (err) {
		return {
			entries: [],
			error: `Not a valid zip file: ${err?.message || "unreadable archive"}`,
		};
	}

	let rawEntries;
	try {
		rawEntries = zip.getEntries();
	} catch (err) {
		return {
			entries: [],
			error: `Zip entries unreadable: ${err?.message || "unknown error"}`,
		};
	}

	const files = rawEntries.filter((entry) => !entry.isDirectory);
	if (files.length > maxEntries) {
		return {
			entries: [],
			error: `Zip has ${files.length} files (max ${maxEntries})`,
		};
	}

	const entries = [];
	let totalBytes = 0;
	for (const entry of files) {
		const rawName = String(entry.entryName || "");
		const entryPath = rawName.replace(/\\/g, "/");

		if (isSymlinkAttr(entry.header?.attr)) {
			return {
				entries: [],
				error: `Zip entry '${rawName}' is a symlink (rejected)`,
			};
		}

		// Pre-inflation cap: the central directory declares the uncompressed
		// size, so a bomb entry fails before its bytes are ever allocated.
		const declaredSize = Number(entry.header?.size);
		if (Number.isFinite(declaredSize) && declaredSize > maxFileBytes) {
			return {
				entries: [],
				error: `Zip entry '${rawName}' is ${declaredSize} bytes uncompressed (max ${maxFileBytes})`,
			};
		}

		let bytes;
		try {
			bytes = entry.getData();
		} catch (err) {
			return {
				entries: [],
				error: `Zip entry '${rawName}' unreadable: ${err?.message || "unknown error"}`,
			};
		}
		if (!bytes || bytes.length > maxFileBytes) {
			return {
				entries: [],
				error: `Zip entry '${rawName}' is ${bytes ? bytes.length : 0} bytes uncompressed (max ${maxFileBytes})`,
			};
		}
		totalBytes += bytes.length;
		if (totalBytes > maxTotalBytes) {
			return {
				entries: [],
				error: `Zip contents exceed ${maxTotalBytes} bytes uncompressed`,
			};
		}
		entries.push({ path: entryPath, bytes: Buffer.from(bytes) });
	}
	return { entries, error: null };
}
