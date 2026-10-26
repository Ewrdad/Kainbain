// Domain: House Setup — preserving complete files when saving to disk.
import path from "node:path";
import fs from "node:fs";
/***
 * MARK: _atomicWriteFileSync
 * @description Writes file content atomically via a temporary file and rename to prevent corrupted / truncated files.
 * @example _atomicWriteFileSync('/path/to/task.md', '# Content')
 * @param {string} filePath
 * @param {string} content
 * @returns {void}
 ***/
export function _atomicWriteFileSync(filePath, content) {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
	fs.writeFileSync(tempPath, content, "utf8");
	fs.renameSync(tempPath, filePath);
}

