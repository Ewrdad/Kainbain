// Domain: Access — organisation sign-in and access-control requests.

/***
 * MARK: UNAUTHORIZED_EVENT
 * @description Window event fired when an auth request answers 401 (the
 *   session expired or was revoked). The router guard listens for it and
 *   sends the user back to the login page.
 * @example UNAUTHORIZED_EVENT => 'kainbain:unauthorized'
 ***/
export const UNAUTHORIZED_EVENT = 'kainbain:unauthorized';
