const WELL_FORMED_HASH = /^\S{1,200}$/;

/***
 * MARK: isWellFormedConfigHash
 * @description Whether a reported config hash is safe to carry onward: a
 *   single whitespace-free token of at most 200 characters. Guards both wire
 *   ends — the Runner rejects a malformed dispatched hash (falls back to
 *   local compute) and the backend ignores a malformed reported one — so a
 *   newline can never corrupt a commit message or a history line. Shape-only
 *   on purpose: the digest algorithm itself is free to evolve.
 * @example isWellFormedConfigHash('sha256:abc123') => true
 * @example isWellFormedConfigHash('sha256:abc\ninjected') => false
 * @param {*} value - Candidate hash from the wire.
 * @returns {boolean} True when the value is safe to attest with.
 ***/
export function isWellFormedConfigHash(value) {
	return typeof value === "string" && WELL_FORMED_HASH.test(value.trim());
}
