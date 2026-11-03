import { isAdminCommitSubject } from "./isAdminCommitSubject.js";

/***
 * MARK: filterChangelogEntries
 * @description Drops automation-noise entries (see `isAdminCommitSubject`)
 *   from an already-parsed entry list, keeping newest-first order. Never
 *   throws: a non-list reads as an empty changelog so one malformed source
 *   cannot break the dialog.
 * @example filterChangelogEntries([{ subject: 'KainBain: sync' }]) => []
 * @example filterChangelogEntries([{ subject: 'Fix the queue chip' }]) => [{ subject: 'Fix the queue chip' }]
 * @param {Array<Object>} entries - Parsed changelog entries, newest first.
 * @returns {Array<Object>} The kept entries, newest first.
 ***/
export function filterChangelogEntries(entries) {
	if (!Array.isArray(entries)) return [];
	return entries.filter((entry) => !isAdminCommitSubject(entry?.subject));
}
