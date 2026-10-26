import { describe, it, expect } from "vitest";
import {
	isLoopbackHostname,
	validateAppUrl,
	normalizeNetworkHost,
	resolveAppUrl,
	joinHealthUrl,
} from "../shared/appUrl.js";

/***
 * MARK: appUrl unit tests
 * @description Verifies the shared "Go to App" URL rules: only http(s) links
 *   are honored, loopback hosts rewrite to the network override (or the remote
 *   page host), and health endpoints join safely.
 ***/
describe("isLoopbackHostname", () => {
	it("matches localhost, 127.0.0.1, 0.0.0.0, and ::1", () => {
		expect(isLoopbackHostname("localhost")).toBe(true);
		expect(isLoopbackHostname("127.0.0.1")).toBe(true);
		expect(isLoopbackHostname("0.0.0.0")).toBe(true);
		expect(isLoopbackHostname("::1")).toBe(true);
		expect(isLoopbackHostname("  LOCALHOST ")).toBe(true);
	});

	it("rejects LAN names, public IPs, and non-strings", () => {
		expect(isLoopbackHostname("home.home")).toBe(false);
		expect(isLoopbackHostname("192.168.1.10")).toBe(false);
		expect(isLoopbackHostname("")).toBe(false);
		expect(isLoopbackHostname(null)).toBe(false);
		expect(isLoopbackHostname(123)).toBe(false);
	});
});

describe("validateAppUrl", () => {
	it("accepts http and https URLs", () => {
		expect(validateAppUrl("http://localhost:5173")).toBe(
			"http://localhost:5173",
		);
		expect(validateAppUrl("https://home.home:8443/app?x=1#y")).toBe(
			"https://home.home:8443/app?x=1#y",
		);
		expect(validateAppUrl("  http://127.0.0.1:3000/  ")).toBe(
			"http://127.0.0.1:3000/",
		);
	});

	it("rejects dangerous and malformed links", () => {
		expect(validateAppUrl("javascript:alert(1)")).toBeNull();
		expect(validateAppUrl("file:///etc/passwd")).toBeNull();
		expect(validateAppUrl("data:text/html,<h1>x</h1>")).toBeNull();
		expect(validateAppUrl("ftp://home.home/x")).toBeNull();
		expect(validateAppUrl("/relative/path")).toBeNull();
		expect(validateAppUrl("not a url")).toBeNull();
		expect(validateAppUrl("")).toBeNull();
		expect(validateAppUrl(null)).toBeNull();
		expect(validateAppUrl(undefined)).toBeNull();
		expect(validateAppUrl(5173)).toBeNull();
	});
});

describe("normalizeNetworkHost", () => {
	it("accepts a bare LAN hostname", () => {
		expect(normalizeNetworkHost("home.home")).toEqual({
			host: "home.home",
			port: "",
		});
		expect(normalizeNetworkHost("  HOME.home ")).toEqual({
			host: "home.home",
			port: "",
		});
	});

	it("accepts a bare host with an explicit port", () => {
		expect(normalizeNetworkHost("home.home:8080")).toEqual({
			host: "home.home",
			port: "8080",
		});
		expect(normalizeNetworkHost("192.168.1.10:3000")).toEqual({
			host: "192.168.1.10",
			port: "3000",
		});
	});

	it("tolerates a pasted URL, keeping host and explicit port only", () => {
		expect(normalizeNetworkHost("http://home.home:8080/some/path")).toEqual({
			host: "home.home",
			port: "8080",
		});
		expect(normalizeNetworkHost("https://home.home/")).toEqual({
			host: "home.home",
			port: "",
		});
	});

	it("rejects blank, spaced, pathed, and credentialed values", () => {
		expect(normalizeNetworkHost("")).toBeNull();
		expect(normalizeNetworkHost("   ")).toBeNull();
		expect(normalizeNetworkHost(null)).toBeNull();
		expect(normalizeNetworkHost(undefined)).toBeNull();
		expect(normalizeNetworkHost("not a host")).toBeNull();
		expect(normalizeNetworkHost("home.home/app")).toBeNull();
		expect(normalizeNetworkHost("user@home.home")).toBeNull();
		expect(normalizeNetworkHost("http://user:pass@home.home/")).toBeNull();
		expect(normalizeNetworkHost("home.home:99999")).toBeNull();
	});
});

describe("resolveAppUrl", () => {
	it("rewrites localhost to the network host, preserving port and path", () => {
		expect(resolveAppUrl("http://localhost:5173", "home.home", "")).toBe(
			"http://home.home:5173/",
		);
		expect(
			resolveAppUrl("http://localhost:8080/app?x=1#y", "home.home", ""),
		).toBe("http://home.home:8080/app?x=1#y");
	});

	it("rewrites the IPv4 loopback too", () => {
		expect(resolveAppUrl("http://127.0.0.1:3000", "home.home", "")).toBe(
			"http://home.home:3000/",
		);
	});

	it("preserves the https scheme", () => {
		expect(resolveAppUrl("https://localhost:8443/a", "home.home", "")).toBe(
			"https://home.home:8443/a",
		);
	});

	it("lets an explicit override port win over the stored port", () => {
		expect(
			resolveAppUrl("http://localhost:5173", "home.home:8080", ""),
		).toBe("http://home.home:8080/");
	});

	it("self-heals to the remote page host when no override is set", () => {
		expect(resolveAppUrl("http://127.0.0.1:3000/a?b=1", null, "192.0.2.10")).toBe(
			"http://192.0.2.10:3000/a?b=1",
		);
	});

	it("keeps loopback when the page is local and no override is set", () => {
		expect(resolveAppUrl("http://localhost:5173", null, "")).toBe(
			"http://localhost:5173/",
		);
		expect(resolveAppUrl("http://localhost:5173", null, "localhost")).toBe(
			"http://localhost:5173/",
		);
	});

	it("prefers the explicit override over the page host", () => {
		expect(
			resolveAppUrl("http://localhost:5173", "home.home", "192.0.2.10"),
		).toBe("http://home.home:5173/");
	});

	it("passes non-loopback URLs through untouched", () => {
		expect(
			resolveAppUrl("http://home.home:3000/app", "other.home", "192.0.2.10"),
		).toBe("http://home.home:3000/app");
	});

	it("resolves malicious links to no link", () => {
		expect(resolveAppUrl("javascript:alert(1)", "home.home", "")).toBe("");
		expect(resolveAppUrl("file:///etc/passwd", null, "")).toBe("");
		expect(resolveAppUrl("", "home.home", "")).toBe("");
		expect(resolveAppUrl(null, "home.home", "")).toBe("");
	});
});

describe("joinHealthUrl", () => {
	it("joins an endpoint path onto an http(s) base", () => {
		expect(joinHealthUrl("http://localhost:3000", "/health")).toBe(
			"http://localhost:3000/health",
		);
		expect(joinHealthUrl("http://localhost:3000/app/", "health")).toBe(
			"http://localhost:3000/health",
		);
		expect(joinHealthUrl("http://localhost:3000", "/")).toBe(
			"http://localhost:3000/",
		);
	});

	it("defaults a blank endpoint to the app root", () => {
		expect(joinHealthUrl("http://localhost:3000", "")).toBe(
			"http://localhost:3000/",
		);
		expect(joinHealthUrl("http://localhost:3000")).toBe("http://localhost:3000/");
	});

	it("refuses non-http(s) bases", () => {
		expect(joinHealthUrl("javascript:alert(1)", "/health")).toBe("");
		expect(joinHealthUrl("not a url", "/health")).toBe("");
	});
});
