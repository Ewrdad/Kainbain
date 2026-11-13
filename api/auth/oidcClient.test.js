import { describe, it, expect, afterAll } from "vitest";
import {
	discoverOidcIssuer,
	buildAuthorizeUrl,
	exchangeCodeForTokens,
	verifyIdToken,
	newCodeVerifier,
	newOpaqueToken,
	readGroupsClaim,
	CLOCK_SKEW_SECONDS,
} from "./oidcClient.js";
import { startMockOidcProvider } from "../test-helpers/mockOidcProvider.js";

/***
 * MARK: oidcClient tests
 * @description Locks the OIDC dialogue against a real mock provider over
 *   loopback HTTP: discovery, authorize-URL shape, code exchange, and every
 *   ID-token rejection (expired, wrong nonce, wrong audience, bad
 *   signature, unknown key), plus PKCE and groups-claim helpers.
 ***/

const provider = await startMockOidcProvider({
	clientId: "kainbain",
	clientSecret: "topsecret",
});

afterAll(async () => {
	await provider.stop();
});

describe("discoverOidcIssuer", () => {
	it("reads the three flow endpoints from discovery", async () => {
		const found = await discoverOidcIssuer({ issuerUrl: provider.issuerUrl });
		expect(found.issuer).toBe(provider.issuerUrl);
		expect(found.authorizationEndpoint).toContain("/authorize");
		expect(found.tokenEndpoint).toContain("/token");
		expect(found.jwksUri).toContain("/jwks");
	});

	it("fails loudly when discovery is unreachable or incomplete", async () => {
		await expect(
			discoverOidcIssuer({ issuerUrl: "http://127.0.0.1:1" }),
		).rejects.toThrow(/discovery failed/);
		await expect(discoverOidcIssuer({ issuerUrl: "" })).rejects.toThrow(
			/issuerUrl/,
		);
	});
});

describe("newCodeVerifier and newOpaqueToken", () => {
	it("mints a verifier/challenge pair and unique tokens", () => {
		const pair = newCodeVerifier();
		expect(pair.verifier.length).toBeGreaterThan(20);
		expect(pair.challenge.length).toBeGreaterThan(20);
		expect(pair.challenge).not.toBe(pair.verifier);
		expect(newOpaqueToken()).not.toBe(newOpaqueToken());
		expect(CLOCK_SKEW_SECONDS).toBe(60);
	});
});

describe("buildAuthorizeUrl", () => {
	it("renders the code flow with PKCE S256, state, and nonce", () => {
		const url = new URL(
			buildAuthorizeUrl({
				authorizationEndpoint: `${provider.issuerUrl}/authorize`,
				clientId: "kainbain",
				redirectUri: "https://app.example.com/api/auth/callback",
				scopes: "openid profile email groups",
				state: "state-1",
				nonce: "nonce-1",
				codeChallenge: "challenge-1",
			}),
		);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("state")).toBe("state-1");
		expect(url.searchParams.get("nonce")).toBe("nonce-1");
		expect(url.searchParams.get("scope")).toContain("openid");
	});
});

describe("exchangeCodeForTokens", () => {
	it("swaps a one-time code for the ID token", async () => {
		const found = await discoverOidcIssuer({ issuerUrl: provider.issuerUrl });
		const { code } = await provider.issueCode({ nonce: "n1" });
		const tokens = await exchangeCodeForTokens({
			tokenEndpoint: found.tokenEndpoint,
			clientId: "kainbain",
			clientSecret: "topsecret",
			code,
			redirectUri: "https://app.example.com/api/auth/callback",
			codeVerifier: "verifier-1",
		});
		expect(typeof tokens.id_token).toBe("string");
	});

	it("refuses replayed codes and wrong credentials", async () => {
		const found = await discoverOidcIssuer({ issuerUrl: provider.issuerUrl });
		const base = {
			tokenEndpoint: found.tokenEndpoint,
			clientId: "kainbain",
			clientSecret: "topsecret",
			redirectUri: "https://app.example.com/api/auth/callback",
			codeVerifier: "verifier-1",
		};
		const { code } = await provider.issueCode({ nonce: "replay" });
		await exchangeCodeForTokens({ ...base, code });
		await expect(exchangeCodeForTokens({ ...base, code })).rejects.toThrow(
			/invalid_grant/,
		);
		const fresh = await provider.issueCode({ nonce: "replay-2" });
		await expect(
			exchangeCodeForTokens({ ...base, code: fresh.code, clientSecret: "wrong" }),
		).rejects.toThrow(/invalid_client/);
		await expect(
			exchangeCodeForTokens({ ...base, code: "no-such-code" }),
		).rejects.toThrow(/refused/);
	});
});

describe("verifyIdToken", () => {
	it("accepts a well-formed token and returns its claims", async () => {
		const found = await discoverOidcIssuer({ issuerUrl: provider.issuerUrl });
		const { idToken } = await provider.issueCode({
			nonce: "round-1",
			groups: ["team"],
		});
		const claims = await verifyIdToken({
			idToken,
			issuer: provider.issuerUrl,
			audience: "kainbain",
			jwksUri: found.jwksUri,
			nonce: "round-1",
		});
		expect(claims.sub).toBe("mock-subject");
		expect(claims.groups).toEqual(["team"]);
	});

	it("rejects expired tokens, wrong nonces, audiences, and signatures", async () => {
		const found = await discoverOidcIssuer({ issuerUrl: provider.issuerUrl });
		const base = {
			issuer: provider.issuerUrl,
			audience: "kainbain",
			jwksUri: found.jwksUri,
		};
		const expired = await provider.issueCode({
			nonce: "e1",
			expiresInSeconds: -300,
		});
		await expect(
			verifyIdToken({ ...base, idToken: expired.idToken, nonce: "e1" }),
		).rejects.toThrow(/verification failed/i);

		const wrongNonce = await provider.issueCode({ nonce: "actual" });
		await expect(
			verifyIdToken({ ...base, idToken: wrongNonce.idToken, nonce: "other" }),
		).rejects.toThrow(/nonce/);

		const wrongAudience = await provider.issueCode({
			nonce: "a1",
			audience: "someone-else",
		});
		await expect(
			verifyIdToken({ ...base, idToken: wrongAudience.idToken, nonce: "a1" }),
		).rejects.toThrow(/verification failed/i);

		const badSignature = await provider.issueCode({
			nonce: "s1",
			badSignature: true,
		});
		await expect(
			verifyIdToken({ ...base, idToken: badSignature.idToken, nonce: "s1" }),
		).rejects.toThrow(/verification failed/i);

		const unknownKid = await provider.issueCode({
			nonce: "k1",
			unknownKid: true,
		});
		await expect(
			verifyIdToken({ ...base, idToken: unknownKid.idToken, nonce: "k1" }),
		).rejects.toThrow(/verification failed/i);
	});
});

describe("readGroupsClaim", () => {
	it("reads string arrays and ignores anything else", () => {
		expect(readGroupsClaim({ groups: ["a", 1, "b"] }, "groups")).toEqual([
			"a",
			"b",
		]);
		expect(readGroupsClaim({ groups: "team" }, "groups")).toEqual([]);
		expect(readGroupsClaim({}, "groups")).toEqual([]);
		expect(readGroupsClaim({ memberOf: ["x"] }, "memberOf")).toEqual(["x"]);
	});
});
