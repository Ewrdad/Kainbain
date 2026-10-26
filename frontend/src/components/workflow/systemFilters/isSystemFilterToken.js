/***
 * MARK: isSystemFilterToken
 * @description Structural token shape check: true when a token starts with
 *   `!` and has at least one more non-`!` character. Shape only — it does
 *   NOT check whether the id is registered (see `isSystemFilterDraftToken`
 *   and the parser for that).
 * @example isSystemFilterToken('!failed') => true
 * @param {string} token
 * @returns {boolean}
 ***/
export function isSystemFilterToken(token) {
  if (typeof token !== 'string' || token.length < 2) return false;
  if (token.charAt(0) !== '!') return false;
  if (token.charAt(1) === '!') return false;
  return true;
}
