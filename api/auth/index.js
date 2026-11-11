// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).
export { ROLE_CATALOG, BUILTIN_ADMIN_IDENTITY, KNOWN_ROLES } from './roles.js';
export { isKnownRole, sanitizeRoles, resolveEffectiveRoles, userHasAnyRole, roleHasPermission } from './roles.js';
export { AUTH_STATE_DIRNAME, ACCESS_OVERRIDES_FILENAME, RUNTIME_OVERRIDE_KEYS } from './accessConfig.js';
export { resolveAuthStateDir, accessOverridesPath, readAccessOverrides, sanitizeGroupRoleMappings, resolveAuthConfig, writeAccessOverrides, toPositiveInt, createAccessConfig } from './accessConfig.js';
export { USERS_FILENAME, usersFilePath, normalizeUserRecord, isBootstrapAdmin, createUserStore } from './userStore.js';
export { SESSIONS_FILENAME, sessionsFilePath, hashSessionId, newSessionId, shouldUseSecureCookie, buildSessionCookie, buildClearedCookie, readSessionIdFromHeader, createSessionStore } from './sessionStore.js';
export { PUBLIC_AUTH_PATH_PREFIXES, isPublicAuthPath, readProjectIdFromRequest, readApiKeySecretFromHeaders, createAuthRequestHook } from './middleware.js';
export { unauthenticatedReply, forbiddenReply, createAccessGuards } from './rbac.js';
export { AUDIT_FILENAME, auditFilePath, recordAuthAudit, readAuthAudit } from './auditLog.js';
export { KNOWN_API_KEY_SCOPES, isKnownApiKeyScope, sanitizeApiKeyScopes, ROLE_API_KEY_SCOPES, impliedApiKeyScopes, effectiveApiKeyScopes, keyHasScope } from './apiKeyScopes.js';
export { API_KEYS_FILENAME, API_KEY_SECRET_PREFIX, API_KEY_NAME_MAX_LENGTH, apiKeysFilePath, hashApiKeySecret, newApiKeySecret, normalizeApiKeyName, normalizeApiKeyExpiry, publicApiKeyShape, createApiKeyStore } from './apiKeyStore.js';
export { resolveRequestActor, actorLabel } from './actor.js';
export { discoverOidcIssuer, buildAuthorizeUrl, exchangeCodeForTokens, verifyIdToken, newCodeVerifier, CODE_VERIFIER_BYTES } from './oidcClient.js';
export { PENDING_AUTH_COOKIE, buildAuthRoutes } from './routes.js';
export { createAuthService } from './service.js';
