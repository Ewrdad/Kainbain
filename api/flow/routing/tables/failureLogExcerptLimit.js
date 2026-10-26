/***
 * MARK: failureLogExcerptLimit
 * @description Maximum characters kept per log excerpt on a failed timeline
 *   entry. Timeline entries persist inside the task.md frontmatter blob, so
 *   raw stderr/stdout are excerpted (head+tail) via `excerptLog`.
 * @example failureLogExcerptLimit => 3072
 ***/
export const failureLogExcerptLimit = 3072;
