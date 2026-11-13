// Role: OIDC dialogue — discovery, authorize URLs, code exchange, ID checks.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import crypto from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";

/***
 * MARK: CODE_VERIFIER_BYTES
 * @description Randomness behind each PKCE verifier (256 bits, plenty for a
 *   single sign-in attempt).
 * @example CODE_VERIFIER_BYTES => 32
 ***/
export const CODE_VERIFIER_BYTES = 32;

/***
 * MARK: CLOCK_SKEW_SECONDS
 * @description Leeway accepted around the ID token's expiry/issued times so
 *   normal IdP clock drift never fails a genuine sign-in.
 * @example CLOCK_SKEW_SECONDS => 60
 ***/
export const CLOCK_SKEW_SECONDS = 60;

/***
 * MARK: newCodeVerifier
 * @description Mints one PKCE pair: a high-entropy verifier kept in the
 *   short-lived sign-in cookie, and its `S256` challenge sent to the IdP.
 * @example newCodeVerifier().challenge.length > 0 => true
 * @returns {{ verifier: string, challenge: string }} PKCE pair.
 ***/
export const newCodeVerifier = () => {
	const verifier = crypto
		.randomBytes(CODE_VERIFIER_BYTES)
		.toString("base64url");
	const challenge = crypto
		.createHash("sha256")
		.update(verifier)
		.digest("base64url");
	return { verifier, challenge };
};

/***
 * MARK: newOpaqueToken
 * @description Mints one unguessable `state`/`nonce` value for the sign-in
 *   round trip (replay and cross-site-request-forgery protection).
 * @example newOpaqueToken().length => 43
 * @returns {string} Fresh random token.
 ***/
export const newOpaqueToken = () => crypto.randomBytes(32).toString("base64url");

/***
 * MARK: discoverOidcIssuer
 * @description Fetches the provider's discovery document
 *   (`<issuer>/.well-known/openid-configuration`) and keeps the three
 *   endpoints the code flow needs. Throws a plain error naming the issuer
 *   when discovery fails, so routes can answer 502 with context.
 * @example discoverOidcIssuer({ issuerUrl: 'https://idp.example.com' }).issuer => 'https://idp.example.com'
 * @param {Object} args - Labelled inputs.
 * @param {string} args.issuerUrl - Provider base URL.
 * @param {Function} [args.fetchImpl] - Fetch implementation (tests inject a stub).
 * @returns {Promise<Object>} `{ issuer, authorizationEndpoint, tokenEndpoint, jwksUri }`.
 ***/
export const discoverOidcIssuer = async ({ issuerUrl, fetchImpl } = {}) => {
	if (typeof issuerUrl !== "string" || issuerUrl.trim() === "") {
		throw new Error("discoverOidcIssuer needs an issuerUrl");
	}
	const base = issuerUrl.replace(/\/+$/, "");
	const fetchFn = fetchImpl || fetch;
	let response = null;
	try {
		response = await fetchFn(`${base}/.well-known/openid-configuration`);
	} catch (error) {
		throw new Error(
			`OIDC discovery failed for ${base}: ${error?.message || error}`,
		);
	}
	if (!response || response.ok !== true) {
		throw new Error(
			`OIDC discovery failed for ${base}: HTTP ${response?.status || "unknown"}`,
		);
	}
	const document = await response.json();
	const endpoints = {
		issuer:
			typeof document?.issuer === "string" ? document.issuer : base,
		authorizationEndpoint:
			typeof document?.authorization_endpoint === "string"
				? document.authorization_endpoint
				: "",
		tokenEndpoint:
			typeof document?.token_endpoint === "string"
				? document.token_endpoint
				: "",
		jwksUri:
			typeof document?.jwks_uri === "string" ? document.jwks_uri : "",
	};
	if (!endpoints.authorizationEndpoint || !endpoints.tokenEndpoint || !endpoints.jwksUri) {
		throw new Error(
			`OIDC discovery for ${base} is missing authorization, token, or JWKS endpoints`,
		);
	}
	return endpoints;
};

/***
 * MARK: buildAuthorizeUrl
 * @description Renders the IdP sign-in URL: response code flow with PKCE
 *   (`S256`), `openid` always requested, plus caller-supplied `state` and
 *   `nonce` for the round trip.
 * @example buildAuthorizeUrl({ authorizationEndpoint: 'https://idp.example.com/authorize', clientId: 'c', redirectUri: 'https://app.example.com/api/auth/callback', scopes: 'openid profile', state: 's', nonce: 'n', codeChallenge: 'cc' })
 * @param {Object} args - Labelled inputs.
 * @param {string} args.authorizationEndpoint - Provider authorize URL.
 * @param {string} args.clientId - OIDC client id.
 * @param {string} args.redirectUri - Registered callback URI.
 * @param {string} args.scopes - Space-separated scopes.
 * @param {string} args.state - Round-trip state token.
 * @param {string} args.nonce - Round-trip nonce.
 * @param {string} args.codeChallenge - PKCE `S256` challenge.
 * @returns {string} Full authorize URL.
 ***/
export const buildAuthorizeUrl = ({
	authorizationEndpoint,
	clientId,
	redirectUri,
	scopes,
	state,
	nonce,
	codeChallenge,
} = {}) => {
	const url = new URL(authorizationEndpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", scopes);
	url.searchParams.set("state", state);
	url.searchParams.set("nonce", nonce);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
};

/***
 * MARK: exchangeCodeForTokens
 * @description Swaps the callback `code` for tokens at the provider's token
 *   endpoint (authenticating with the client secret). Throws naming the
 *   provider's error description when the exchange is refused.
 * @example exchangeCodeForTokens({ tokenEndpoint: 'https://idp.example.com/token', clientId: 'c', clientSecret: 's', code: 'code', redirectUri: 'https://app.example.com/api/auth/callback', codeVerifier: 'v' })
 * @param {Object} args - Labelled inputs.
 * @param {string} args.tokenEndpoint - Provider token URL.
 * @param {string} args.clientId - OIDC client id.
 * @param {string} args.clientSecret - OIDC client secret.
 * @param {string} args.code - Authorization code from the callback.
 * @param {string} args.redirectUri - Same redirect URI as the authorize call.
 * @param {string} args.codeVerifier - PKCE verifier from the sign-in cookie.
 * @param {Function} [args.fetchImpl] - Fetch implementation (tests inject a stub).
 * @returns {Promise<Object>} Token response (`id_token` plus provider extras).
 ***/
export const exchangeCodeForTokens = async ({
	tokenEndpoint,
	clientId,
	clientSecret,
	code,
	redirectUri,
	codeVerifier,
	fetchImpl,
} = {}) => {
	const fetchFn = fetchImpl || fetch;
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code: code || "",
		redirect_uri: redirectUri || "",
		client_id: clientId || "",
		client_secret: clientSecret || "",
		code_verifier: codeVerifier || "",
	});
	let response = null;
	try {
		response = await fetchFn(tokenEndpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: body.toString(),
		});
	} catch (error) {
		throw new Error(`OIDC token exchange failed: ${error?.message || error}`);
	}
	const payload = await response.json().catch(() => ({}));
	if (!response || response.ok !== true) {
		const reason =
			typeof payload?.error_description === "string"
				? payload.error_description
				: typeof payload?.error === "string"
					? payload.error
					: `HTTP ${response?.status || "unknown"}`;
		throw new Error(`OIDC token exchange refused: ${reason}`);
	}
	if (!payload || typeof payload.id_token !== "string") {
		throw new Error("OIDC token exchange returned no ID token");
	}
	return payload;
};

/***
 * MARK: verifyIdToken
 * @description Verifies an ID token end to end: signature against the
 *   provider JWKS, then issuer, audience, expiry (with skew leeway), and the
 *   round-trip nonce. Returns the claims for provisioning. Any failure
 *   throws naming what did not check out.
 * @example verifyIdToken({ idToken: '<signed>', issuer: 'https://idp.example.com', audience: 'c', jwksUri: 'https://idp.example.com/jwks', nonce: 'n' })
 * @param {Object} args - Labelled inputs.
 * @param {string} args.idToken - Raw ID token.
 * @param {string} args.issuer - Expected `iss` (the configured issuer URL).
 * @param {string} args.audience - Expected `aud` (our client id).
 * @param {string} args.jwksUri - Provider JWKS URL.
 * @param {string} [args.nonce] - Expected `nonce` (skipped when empty).
 * @param {Function} [args.fetchImpl] - Fetch implementation (tests inject a stub).
 * @returns {Promise<Object>} Verified token claims.
 ***/
export const verifyIdToken = async ({
	idToken,
	issuer,
	audience,
	jwksUri,
	nonce,
	fetchImpl,
} = {}) => {
	if (typeof idToken !== "string" || idToken === "") {
		throw new Error("verifyIdToken needs an ID token");
	}
	const fetchFn = fetchImpl || fetch;
	let jwksResponse = null;
	try {
		jwksResponse = await fetchFn(jwksUri);
	} catch (error) {
		throw new Error(`OIDC JWKS fetch failed: ${error?.message || error}`);
	}
	if (!jwksResponse || jwksResponse.ok !== true) {
		throw new Error(
			`OIDC JWKS fetch failed: HTTP ${jwksResponse?.status || "unknown"}`,
		);
	}
	const jwks = await jwksResponse.json().catch(() => null);
	if (!jwks || typeof jwks !== "object") {
		throw new Error("OIDC JWKS document is not JSON");
	}
	let verified = null;
	try {
		const keySet = createLocalJWKSet(jwks);
		verified = await jwtVerify(idToken, keySet, {
			issuer,
			audience,
			clockTolerance: CLOCK_SKEW_SECONDS,
		});
	} catch (error) {
		throw new Error(`ID token verification failed: ${error?.message || error}`);
	}
	if (typeof nonce === "string" && nonce !== "") {
		if (verified.payload?.nonce !== nonce) {
			throw new Error("ID token nonce does not match this sign-in attempt");
		}
	}
	return verified.payload;
};

/***
 * MARK: readGroupsClaim
 * @description Reads group membership from verified claims under the
 *   configured claim name. Non-array claims (a common provider quirk) read
 *   as no groups rather than crashing the sign-in.
 * @example readGroupsClaim({ groups: ['team'] }, 'groups') => ['team']
 * @param {Object} [claims] - Verified ID token claims.
 * @param {string} [claimName] - Claim holding the groups.
 * @returns {string[]} Group names.
 ***/
export const readGroupsClaim = (claims = {}, claimName = "groups") => {
	const value = claims?.[claimName];
	if (!Array.isArray(value)) return [];
	return value.filter((entry) => typeof entry === "string" && entry !== "");
};
