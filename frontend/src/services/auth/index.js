// Domain: Access — organisation sign-in and access-control requests.
// Barrel: one function per file (repo one-function-per-file standard); this
// entry point only re-exports so existing `services/auth/index.js` importers
// keep working unchanged.
export { UNAUTHORIZED_EVENT } from './unauthorizedEvent.js';
export { notifyUnauthorized } from './notifyUnauthorized.js';
export { authFetch } from './authFetch.js';
export { fetchAuthStatus } from './fetchAuthStatus.js';
export { startLogin } from './startLogin.js';
export { signOut } from './signOut.js';
export { listUsers } from './listUsers.js';
export { setUserRoles } from './setUserRoles.js';
export { setUserProjectRoles } from './setUserProjectRoles.js';
export { setUserDisabled } from './setUserDisabled.js';
export { getGroupMappings } from './getGroupMappings.js';
export { setGroupMappings } from './setGroupMappings.js';
export { getAuthSettings } from './getAuthSettings.js';
export { saveAuthSettings } from './saveAuthSettings.js';
