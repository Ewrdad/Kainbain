/***
 * MARK: changelogLimits
 * @description Shared size bounds for the baked Kainbain changelog. Both the
 *   deploy-time baker (`scripts/generate-changelog.mjs`) and the serve-time
 *   live-git fallback (`api/deployManager.js`) read these, so a bound can
 *   never drift between what is baked and what is served live. The separators
 *   are the wire format of the `git log --format` output both sides parse.
 * @example import { DEFAULT_LIMIT } from './changelogLimits.js'
 ***/

/***
 * MARK: DEFAULT_LIMIT
 * @description How many task-merge entries one changelog artifact holds at
 *   most. 200 entries stay fast to bake, small on disk (~140KB with bodies
 *   capped), and quick to render behind the dialog's "Show more" paging.
 * @example DEFAULT_LIMIT => 200
 ***/
export const DEFAULT_LIMIT = 200;

/***
 * MARK: MAX_BODY_CHARS
 * @description Per-entry body cap. KainBain auto-commit messages embed whole
 *   task prompts (averaging ~3KB) — uncapped bodies push 200 entries to
 *   ~675KB, capped they stay near ~140KB. Longer bodies are cut with a
 *   `bodyTruncated` flag so the dialog can offer the full text honestly.
 * @example MAX_BODY_CHARS => 500
 ***/
export const MAX_BODY_CHARS = 500;

/***
 * MARK: FIELD_SEP
 * @description Separates fields inside one `git log` record (NUL). Commit
 *   subjects can hold pipes and quotes, so a printable separator would split
 *   real text — NUL never appears in a commit message (git truncates there).
 * @example ['a', 'b'].join(FIELD_SEP) => 'a\x00b'
 ***/
export const FIELD_SEP = "\x00";

/***
 * MARK: RECORD_SEP
 * @description Separates whole `git log` records (ASCII record separator).
 *   Bodies span lines, so newline cannot delimit records.
 * @example ['r1', 'r2'].join(RECORD_SEP) => 'r1\x1er2'
 ***/
export const RECORD_SEP = "\x1e";
