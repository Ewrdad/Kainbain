import { findSystemFilter } from './findSystemFilter';

/***
 * MARK: isSystemFilterDraftToken
 * @description Checks whether an in-progress `!` draft token names a
 *   registered system filter — the commit gate for Space/Enter while typing.
 * @example isSystemFilterDraftToken('!human') => true
 * @param {string} token
 * @returns {boolean}
 ***/
export function isSystemFilterDraftToken(token) {
  if (typeof token !== 'string' || token.length < 2) return false;
  if (token.charAt(0) !== '!') return false;
  if (token.charAt(1) === '!') return false;
  return Boolean(findSystemFilter(token.slice(1)));
}
