// Role: auth HTTP endpoints — sign-in flow plus user and role administration.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import crypto from "node:crypto";
import {
	buildAuthorizeUrl,
	discoverOidcIssuer,
	exchangeCodeForTokens,
	newCodeVerifier,
	newOpaqueToken,
	readGroupsClaim,
	verifyIdToken,
} from "./oidcClient.js";
import {
	buildClearedCookie,
	buildSessionCookie,
	readSessionIdFromHeader,
	shouldUseSecureCookie,
} from "./sessionStore.js";
import { recordAuthAudit } from "./auditLog.js";
import { KNOWN_ROLES } from "./roles.js";

/***
 * MARK: PENDING_AUTH_COOKIE
 * @description Short-lived cookie holding one sign-in attempt (`state`,
 *   `nonce`, PKCE verifier) between `/auth/login` and `/auth/callback`.
 * @example PENDING_AUTH_COOKIE => 'kb_oauth_pending'
 ***/
export const PENDING_AUTH_COOKIE = "kb_oauth_pending";

const PENDING_AUTH_MAX_AGE_MS = 10 * 60 * 1000;

const SETTINGS_BODY_KEYS = [
	"authEnabled",
	"authIssuerUrl",
	"authClientId",
	"authClientSecret",
	"authRedirectUri",
	"authScopes",
	"authGroupsClaim",
	"authAdminGroup",
	"authBootstrapAdmins",
	"authSessionTtlMs",
	"authSessionIdleMs",
	"authRoleManagerRoles",
];

const readPendingAttempt = (request) => {
	const raw = readSessionIdFromHeader(
		request.headers?.cookie,
		PENDING_AUTH_COOKIE,
	);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(
			Buffer.from(raw, "base64url").toString("utf8"),
		);
		if (
			!parsed ||
			typeof parsed.state !== "string" ||
			typeof parsed.nonce !== "string" ||
			typeof parsed.verifier !== "string"
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
};

const statesMatch = (left, right) => {
	if (typeof left !== "string" || typeof right !== "string") return false;
	const leftBuffer = Buffer.from(left, "utf8");
	const rightBuffer = Buffer.from(right, "utf8");
	if (leftBuffer.length !== rightBuffer.length) return false;
	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const sameOrigin = (request) => ({
	protocol: `${request.protocol || "http"}:`,
	hostname: request.hostname || "localhost",
});

const issuersMatch = (configured, discovered) => {
	if (typeof configured !== "string" || typeof discovered !== "string") {
		return false;
	}
	return configured.replace(/\/+$/, "") === discovered.replace(/\/+$/, "");
};

const publicUserShape = (user) => {
	if (!user) return null;
	return {
		id: user.id,
		name: user.name || user.email || user.id,
		email: user.email,
		provider: user.provider,
		groups: user.groups,
		roles: user.roles,
		builtin: user.builtin,
	};
};

const settingsView = (resolved) => ({
	knownRoles: [...KNOWN_ROLES],
	enabled: resolved.enabled,
	issuerUrl: resolved.issuerUrl,
	clientId: resolved.clientId,
	hasClientSecret: resolved.clientSecret !== "",
	redirectUri: resolved.redirectUri,
	effectiveRedirectUri:
		resolved.redirectUri || `${resolved.publicKbUrl}/api/auth/callback`,
	scopes: resolved.scopes,
	groupsClaim: resolved.groupsClaim,
	adminGroup: resolved.adminGroup,
	bootstrapAdmins: resolved.bootstrapAdmins,
	sessionTtlMs: resolved.sessionTtlMs,
	sessionIdleMs: resolved.sessionIdleMs,
	cookieName: resolved.cookieName,
	roleManagerRoles: resolved.roleManagerRoles,
	groupRoleMappings: resolved.groupRoleMappings,
});

/***
 * MARK: buildAuthRoutes
 * @description Registers every `/auth/*` endpoint on a Fastify app:
 *   sign-in (`login`, `callback`, `logout`, `me`) plus the admin-only user,
 *   group-mapping, and settings APIs. Guards read the live config per
 *   request, so enabling access control needs no restart.
 * @example buildAuthRoutes({ authService })
 * @param {Object} args - Labelled inputs.
 * @param {Object} args.authService - Wired auth service (config, stores, guards).
 * @returns {Function} Fastify plugin registering the auth routes.
 ***/
export const buildAuthRoutes = ({ authService } = {}) => {
	const { authConfig, userStore, sessionStore, guards } = authService;
	const getConfig = () => authConfig.get();
	const managerOnly = async (request, reply) => {
		await guards.requireRole(getConfig().roleManagerRoles)(request, reply);
	};
	const actorOf = (request) =>
		request.user?.id || request.auth?.userId || "anonymous";

	return async (app) => {
		app.get("/auth/login", async (request, reply) => {
			const resolved = getConfig();
			if (resolved.enabled !== true) {
				return reply.code(404).send({
					error: "Access control is disabled",
					code: "auth_disabled",
				});
			}
			if (!resolved.issuerUrl || !resolved.clientId) {
				return reply.code(503).send({
					error: "Sign-in is not configured yet",
					code: "oidc_unconfigured",
				});
			}
			let discovery = null;
			try {
				discovery = await discoverOidcIssuer({
					issuerUrl: resolved.issuerUrl,
				});
			} catch (error) {
				return reply.code(502).send({
					error: `Identity provider unreachable: ${error.message}`,
					code: "oidc_unreachable",
				});
			}
			if (!issuersMatch(resolved.issuerUrl, discovery.issuer)) {
				return reply.code(502).send({
					error: "Identity provider issuer mismatch",
					code: "oidc_issuer_mismatch",
				});
			}
			const { verifier, challenge } = newCodeVerifier();
			const attempt = {
				state: newOpaqueToken(),
				nonce: newOpaqueToken(),
				verifier,
			};
			const redirectUri =
				resolved.redirectUri ||
				`${resolved.publicKbUrl}/api/auth/callback`;
			const authorizeUrl = buildAuthorizeUrl({
				authorizationEndpoint: discovery.authorizationEndpoint,
				clientId: resolved.clientId,
				redirectUri,
				scopes: resolved.scopes,
				state: attempt.state,
				nonce: attempt.nonce,
				codeChallenge: challenge,
			});
			const pending = Buffer.from(JSON.stringify(attempt), "utf8").toString(
				"base64url",
			);
			const secure = shouldUseSecureCookie(sameOrigin(request));
			reply.header(
				"Set-Cookie",
				`${PENDING_AUTH_COOKIE}=${pending}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PENDING_AUTH_MAX_AGE_MS / 1000}${secure ? "; Secure" : ""}`,
			);
			return reply.redirect(authorizeUrl);
		});

		app.get("/auth/callback", async (request, reply) => {
			const resolved = getConfig();
			const clearPending = `${PENDING_AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
			if (resolved.enabled !== true) {
				return reply.code(404).send({
					error: "Access control is disabled",
					code: "auth_disabled",
				});
			}
			// The provider itself can refuse (access_denied when the user
			// cancels): bounce back to the login page carrying the reason.
			const providerError =
				typeof request.query?.error === "string" ? request.query.error : "";
			if (providerError !== "") {
				const detail =
					typeof request.query?.error_description === "string"
						? request.query.error_description
						: "";
				reply.header("Set-Cookie", clearPending);
				const loginTarget = `/#/login?error=${encodeURIComponent(providerError)}${detail ? `&message=${encodeURIComponent(detail)}` : ""}`;
				return reply.redirect(loginTarget);
			}
			const attempt = readPendingAttempt(request);
			const { code, state } = request.query || {};
			if (
				typeof code !== "string" ||
				typeof state !== "string" ||
				!attempt ||
				!statesMatch(state, attempt.state)
			) {
				reply.header("Set-Cookie", clearPending);
				return reply.code(400).send({
					error: "This sign-in attempt expired or was already used",
					code: "invalid_state",
				});
			}
			let discovery = null;
			try {
				discovery = await discoverOidcIssuer({
					issuerUrl: resolved.issuerUrl,
				});
			} catch (error) {
				reply.header("Set-Cookie", clearPending);
				return reply.code(502).send({
					error: `Identity provider unreachable: ${error.message}`,
					code: "oidc_unreachable",
				});
			}
			const redirectUri =
				resolved.redirectUri ||
				`${resolved.publicKbUrl}/api/auth/callback`;
			let tokens = null;
			try {
				tokens = await exchangeCodeForTokens({
					tokenEndpoint: discovery.tokenEndpoint,
					clientId: resolved.clientId,
					clientSecret: resolved.clientSecret,
					code,
					redirectUri,
					codeVerifier: attempt.verifier,
				});
			} catch (error) {
				reply.header("Set-Cookie", clearPending);
				return reply.code(401).send({
					error: `Sign-in failed: ${error.message}`,
					code: "sign_in_failed",
				});
			}
			let claims = null;
			try {
				claims = await verifyIdToken({
					idToken: tokens.id_token,
					issuer: discovery.issuer,
					audience: resolved.clientId,
					jwksUri: discovery.jwksUri,
					nonce: attempt.nonce,
				});
			} catch (error) {
				reply.header("Set-Cookie", clearPending);
				return reply.code(401).send({
					error: `Sign-in failed: ${error.message}`,
					code: "sign_in_failed",
				});
			}
			if (!claims || typeof claims.sub !== "string" || claims.sub === "") {
				reply.header("Set-Cookie", clearPending);
				return reply.code(401).send({
					error: "Sign-in failed: the provider sent no subject",
					code: "sign_in_failed",
				});
			}
			const groups = readGroupsClaim(claims, resolved.groupsClaim);
			const user = userStore.provisionFromSignIn({
				sub: claims.sub,
				email: typeof claims.email === "string" ? claims.email : "",
				name: typeof claims.name === "string" ? claims.name : "",
				provider: discovery.issuer,
				groups,
				authConfig: resolved,
			});
			if (user.disabled === true) {
				reply.header("Set-Cookie", clearPending);
				return reply.code(403).send({
					error: "This account is disabled",
					code: "account_disabled",
				});
			}
			const created = sessionStore.createSession({
				userId: user.id,
				ip: request.ip,
				userAgent: request.headers?.["user-agent"] || "",
				ttlMs: resolved.sessionTtlMs,
			});
			recordAuthAudit({
				stateDir: authConfig.stateDir,
				actor: user.id,
				action: "auth.sign_in",
				detail: { provider: discovery.issuer },
			});
			const secure = shouldUseSecureCookie(sameOrigin(request));
			reply.header("Set-Cookie", [
				clearPending,
				buildSessionCookie({
					sessionId: created.sessionId,
					cookieName: resolved.cookieName,
					secure,
					maxAgeMs: resolved.sessionTtlMs,
				}),
			]);
			return reply.redirect("/");
		});

		app.post("/auth/logout", async (request, reply) => {
			const resolved = getConfig();
			const sessionId = readSessionIdFromHeader(
				request.headers?.cookie,
				resolved.cookieName,
			);
			if (sessionId) sessionStore.destroySession(sessionId);
			recordAuthAudit({
				stateDir: authConfig.stateDir,
				actor: actorOf(request),
				action: "auth.sign_out",
				detail: {},
			});
			reply.header(
				"Set-Cookie",
				buildClearedCookie(resolved.cookieName),
			);
			return { ok: true };
		});

		app.get("/auth/me", async (request) => {
			const resolved = getConfig();
			if (resolved.enabled !== true) {
				return {
					authEnabled: false,
					user: {
						id: "admin",
						name: "admin",
						roles: ["admin"],
						builtin: true,
					},
					roles: ["admin"],
				};
			}
			if (!request.user) {
				return { authEnabled: true, user: null, roles: [] };
			}
			return {
				authEnabled: true,
				user: publicUserShape({
					...request.user,
					roles: request.auth?.roles || [],
				}),
				roles: request.auth?.roles || [],
			};
		});

		app.get(
			"/auth/users",
			{ preHandler: managerOnly },
			async () => ({ users: userStore.listUsers() }),
		);

		app.put(
			"/auth/users/:id/roles",
			{ preHandler: managerOnly },
			async (request, reply) => {
				const updated = userStore.setDirectRoles(
					request.params.id,
					request.body?.roles,
				);
				if (!updated) {
					return reply.code(404).send({
						error: "User not found",
						code: "user_not_found",
					});
				}
				recordAuthAudit({
					stateDir: authConfig.stateDir,
					actor: actorOf(request),
					action: "user.role.set",
					detail: { userId: updated.id, roles: updated.directRoles },
				});
				return { user: updated };
			},
		);

		app.put(
			"/auth/users/:id/projects/:projectId/roles",
			{ preHandler: managerOnly },
			async (request, reply) => {
				const updated = userStore.setProjectRoles(
					request.params.id,
					request.params.projectId,
					request.body?.roles,
				);
				if (!updated) {
					return reply.code(404).send({
						error: "User not found",
						code: "user_not_found",
					});
				}
				recordAuthAudit({
					stateDir: authConfig.stateDir,
					actor: actorOf(request),
					action: "user.project_role.set",
					detail: {
						userId: updated.id,
						projectId: request.params.projectId,
						roles: updated.projectRoles[request.params.projectId] || [],
					},
				});
				return { user: updated };
			},
		);

		app.put(
			"/auth/users/:id/disabled",
			{ preHandler: managerOnly },
			async (request, reply) => {
				if (request.body?.disabled !== true && request.body?.disabled !== false) {
					return reply.code(400).send({
						error: "Body needs { disabled: true | false }",
						code: "invalid_body",
					});
				}
				if (request.body.disabled === true && request.params.id === actorOf(request)) {
					return reply.code(400).send({
						error: "You cannot disable your own account",
						code: "cannot_disable_self",
					});
				}
				const updated = userStore.setDisabled(
					request.params.id,
					request.body.disabled,
				);
				if (!updated) {
					return reply.code(404).send({
						error: "User not found",
						code: "user_not_found",
					});
				}
				recordAuthAudit({
					stateDir: authConfig.stateDir,
					actor: actorOf(request),
					action: "user.disabled.set",
					detail: { userId: updated.id, disabled: updated.disabled },
				});
				return { user: updated };
			},
		);

		app.get(
			"/auth/group-mappings",
			{ preHandler: managerOnly },
			async () => ({ mappings: getConfig().groupRoleMappings }),
		);

		app.put(
			"/auth/group-mappings",
			{ preHandler: managerOnly },
			async (request, reply) => {
				if (
					!request.body ||
					typeof request.body.mappings !== "object" ||
					Array.isArray(request.body.mappings)
				) {
					return reply.code(400).send({
						error: "Body needs { mappings: { group: [role] } }",
						code: "invalid_body",
					});
				}
				authConfig.save({ groupRoleMappings: request.body.mappings });
				const mappings = getConfig().groupRoleMappings;
				recordAuthAudit({
					stateDir: authConfig.stateDir,
					actor: actorOf(request),
					action: "access.group_mappings.set",
					detail: { mappings },
				});
				return { mappings };
			},
		);

		app.get(
			"/auth/settings",
			{ preHandler: managerOnly },
			async () => settingsView(getConfig()),
		);

		app.put(
			"/auth/settings",
			{ preHandler: managerOnly },
			async (request, reply) => {
				const body =
					request.body && typeof request.body === "object" ? request.body : {};
				const partial = {};
				for (const key of SETTINGS_BODY_KEYS) {
					if (!Object.hasOwn(body, key)) continue;
					// eslint-disable-next-line security/detect-object-injection -- key comes from the SETTINGS_BODY_KEYS allowlist above
					partial[key] = body[key];
				}
				if (
					Object.hasOwn(partial, "authEnabled") &&
					typeof partial.authEnabled !== "boolean"
				) {
					return reply.code(400).send({
						error: "authEnabled must be true or false",
						code: "invalid_body",
					});
				}
				for (const key of ["authSessionTtlMs", "authSessionIdleMs"]) {
					if (
						Object.hasOwn(partial, key) &&
						// eslint-disable-next-line security/detect-object-injection -- key comes from the fixed pair above
						!(Number.isFinite(Number(partial[key])) && Number(partial[key]) > 0)
					) {
						return reply.code(400).send({
							error: `${key} must be a positive number of milliseconds`,
							code: "invalid_body",
						});
					}
				}
				authConfig.save(partial);
				const resolved = getConfig();
				recordAuthAudit({
					stateDir: authConfig.stateDir,
					actor: actorOf(request),
					action: "access.settings.set",
					detail: { keys: Object.keys(partial) },
				});
				return settingsView(resolved);
			},
		);
	};
};
