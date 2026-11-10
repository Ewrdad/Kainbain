// Domain: test support — a real OIDC provider over loopback HTTP for auth tests.
import http from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

/***
 * MARK: startMockOidcProvider
 * @description Starts a throwaway standards-shaped OIDC provider on
 *   loopback: discovery document, JWKS, and a one-time-code token endpoint
 *   signing real RS256 ID tokens. Auth integration tests drive the full
 *   code flow against it over real HTTP, so JWKS fetching, signature
 *   checks, and expiry handling run their production paths. Nothing here
 *   ever touches the network beyond loopback.
 * @example const provider = await startMockOidcProvider(); await provider.stop()
 * @param {Object} [args] - Labelled inputs.
 * @param {string} [args.subject] - Default `sub` claim for issued codes.
 * @param {string} [args.email] - Default `email` claim.
 * @param {string} [args.clientId] - Client id the token endpoint expects.
 * @param {string} [args.clientSecret] - Client secret the token endpoint expects.
 * @returns {Promise<{ issuerUrl: string, issueCode: Function, stop: Function }>} Running provider handle.
 ***/
export const startMockOidcProvider = async ({
	subject = "mock-subject",
	email = "mock@example.com",
	clientId = "kainbain",
	clientSecret = "topsecret",
} = {}) => {
	const { publicKey, privateKey } = await generateKeyPair("RS256");
	const publicJwk = await exportJWK(publicKey);
	publicJwk.kid = "mock-key-1";
	publicJwk.alg = "RS256";
	publicJwk.use = "sig";
	const codes = new Map();
	let baseUrl = "";

	const readBody = (request) =>
		new Promise((resolve) => {
			let text = "";
			request.on("data", (chunk) => {
				text += chunk;
			});
			request.on("end", () => resolve(text));
		});

	const sendJson = (response, status, payload) => {
		const text = JSON.stringify(payload);
		response.writeHead(status, {
			"content-type": "application/json",
			"content-length": Buffer.byteLength(text),
		});
		response.end(text);
	};

	const issueCode = async (overrides = {}) => {
		const issuedAt = Math.floor(Date.now() / 1000);
		const code = `mock-code-${codes.size + 1}-${Date.now()}`;
		const claims = {
			sub: overrides.sub ?? subject,
			email: overrides.email ?? email,
			name: overrides.name ?? "Mock User",
			groups: overrides.groups ?? [],
			iat: issuedAt,
			exp: issuedAt + 300,
			...(overrides.extraClaims || {}),
		};
		if (overrides.expiresInSeconds !== undefined) {
			claims.exp = issuedAt + overrides.expiresInSeconds;
		}
		if (overrides.noNonce !== true) {
			claims.nonce = overrides.nonce ?? "mock-nonce";
		}
		if (overrides.audience !== undefined) {
			claims.aud = overrides.audience;
		} else {
			claims.aud = clientId;
		}
		if (overrides.issuer !== undefined) {
			claims.iss = overrides.issuer;
		} else {
			claims.iss = baseUrl;
		}
		const signingKey = overrides.badSignature
			? (await generateKeyPair("RS256")).privateKey
			: privateKey;
		const idToken = await new SignJWT(claims)
			.setProtectedHeader({
				alg: "RS256",
				kid: overrides.unknownKid ? "unknown-key" : "mock-key-1",
			})
			.sign(signingKey);
		codes.set(code, { idToken, used: false });
		return { code, idToken, claims };
	};

	const server = http.createServer(async (request, response) => {
		const url = new URL(request.url || "/", "http://localhost");
		if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
			sendJson(response, 200, {
				issuer: baseUrl,
				authorization_endpoint: `${baseUrl}/authorize`,
				token_endpoint: `${baseUrl}/token`,
				jwks_uri: `${baseUrl}/jwks`,
			});
			return;
		}
		if (request.method === "GET" && url.pathname === "/jwks") {
			sendJson(response, 200, { keys: [publicJwk] });
			return;
		}
		if (request.method === "POST" && url.pathname === "/token") {
			const body = new URLSearchParams(await readBody(request));
			const code = body.get("code");
			const entry = code ? codes.get(code) : null;
			if (!entry || entry.used) {
				sendJson(response, 400, { error: "invalid_grant" });
				return;
			}
			if (
				body.get("client_id") !== clientId ||
				body.get("client_secret") !== clientSecret
			) {
				sendJson(response, 401, { error: "invalid_client" });
				return;
			}
			if (!body.get("code_verifier")) {
				sendJson(response, 400, { error_description: "missing PKCE verifier" });
				return;
			}
			entry.used = true;
			sendJson(response, 200, {
				id_token: entry.idToken,
				token_type: "Bearer",
				expires_in: 300,
			});
			return;
		}
		sendJson(response, 404, { error: "not_found" });
	});

	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	baseUrl = `http://127.0.0.1:${address.port}`;

	const stop = () =>
		new Promise((resolve) => {
			server.close(() => resolve());
		});

	return { issuerUrl: baseUrl, issueCode, stop };
};
