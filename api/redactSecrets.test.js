import { describe, it, expect } from "vitest";
import {
	redactSecretsText,
	redactDeepStrings,
} from "../shared/redactSecrets.js";

/**
 * MARK: redactSecrets (content choke point)
 * @description Secrets and PII must never reach stored log entries, the live
 *   socket, or committed task markdown — while clean log grammar passes
 *   through byte-identical so existing renderer tests keep holding.
 */
describe("redactSecretsText — clean log grammar passes through", () => {
	const clean = [
		"[USAGE] tokens=1200/300/1500",
		"[PERM] request bash rm -rf /tmp/x",
		"[PERM] deny: bash rm -rf /tmp/x",
		"[TOOL] bash(ls)",
		'[RESULT] { "ok": true }',
		"[INFO] session: model=gemini-3 sandbox=on",
		"[AGY] run done: status=SUCCESS in 12.3s · 1500 tokens",
		"[VIBE] spawn: vibe --prompt",
		"answer",
		"opencode-ai-sdk-1.18.34",
		"2026-10-30T13:01:41.000Z",
		"[ERROR] Tool bash failed: exit code 1",
	];
	for (const line of clean) {
		it(`leaves ${JSON.stringify(line.slice(0, 40))} untouched`, () => {
			expect(redactSecretsText(line)).toBe(line);
		});
	}
	it("never redacts bare prose without a separator", () => {
		expect(redactSecretsText("secret reasoning step one. step two.")).toBe(
			"secret reasoning step one. step two.",
		);
		expect(redactSecretsText("set a password blah")).toBe(
			"set a password blah",
		);
	});
	it("returns empty string for non-strings", () => {
		expect(redactSecretsText(null)).toBe("");
		expect(redactSecretsText(undefined)).toBe("");
		expect(redactSecretsText(42)).toBe("");
		expect(redactSecretsText("")).toBe("");
	});
});

describe("redactSecretsText — secret shapes", () => {
	it("redacts bearer and basic credentials", () => {
		expect(redactSecretsText("Authorization: Bearer abcdefgh123456")).toBe(
			"Authorization: Bearer [REDACTED]",
		);
		expect(redactSecretsText("basic dXNlcjpwYXNzd29yZA==")).toBe(
			"basic [REDACTED]",
		);
	});
	it("redacts vendor tokens", () => {
		expect(redactSecretsText("key sk-live-abcdefgh12345678 rest")).toBe(
			"key sk-[REDACTED] rest",
		);
		expect(redactSecretsText("token xoxb-12345678-abcdef rest")).toBe(
			"token xox-[REDACTED] rest",
		);
		expect(redactSecretsText("push ghp_abcdefgh12345678")).toBe(
			"push gh_[REDACTED]",
		);
		expect(redactSecretsText("AKIAIOSFODNN7EXAMPLE leaked")).toBe(
			"AKIA[REDACTED] leaked",
		);
	});
	it("redacts labeled key/value pairs and env assignments", () => {
		expect(redactSecretsText('api_key="supersecret123"')).toBe(
			'api_key="[REDACTED]"',
		);
		expect(redactSecretsText("password: hunter2hunter")).toBe(
			"password: [REDACTED]",
		);
		expect(redactSecretsText("OPENAI_API_KEY=sk-abcdefgh rest")).toBe(
			"OPENAI_API_KEY=[REDACTED] rest",
		);
	});
	it("redacts connection strings and credentialed URLs", () => {
		expect(
			redactSecretsText("connect postgres://bob:hunter2hunter@db:5432/app"),
		).toBe("connect postgres://[REDACTED]");
		expect(
			redactSecretsText('{"aws_secret": "wJalrXUtnFEMI/K7MDENG"}'),
		).toBe('{"aws_secret": "[REDACTED]"}');
	});
	it("redacts private key blocks", () => {
		const key = [
			"-----BEGIN RSA PRIVATE KEY-----",
			"MIIBogusKeyMaterial",
			"-----END RSA PRIVATE KEY-----",
		].join("\n");
		expect(redactSecretsText(`saw ${key} here`)).toBe(
			"saw [REDACTED PRIVATE KEY] here",
		);
	});
});

describe("redactSecretsText — PII shapes", () => {
	it("redacts emails and home directories", () => {
		expect(redactSecretsText("contact alice@example.com now")).toBe(
			"contact [REDACTED EMAIL] now",
		);
		expect(redactSecretsText("read /home/alice/notes.md")).toBe(
			"read /home/[REDACTED]/notes.md",
		);
		expect(redactSecretsText("read /Users/bob/notes.md")).toBe(
			"read /Users/[REDACTED]/notes.md",
		);
		expect(redactSecretsText("read /tmp/work/file.md")).toBe(
			"read /tmp/work/file.md",
		);
	});
	it("redacts phone and card shapes", () => {
		expect(redactSecretsText("call 415-555-0132 now")).toBe(
			"call [REDACTED PHONE] now",
		);
		expect(redactSecretsText("card 4111-1111-1111-1111 used")).toBe(
			"card [REDACTED CARD] used",
		);
	});
});

describe("redactDeepStrings — structured payloads", () => {
	it("redacts nested strings and keeps scalars", () => {
		expect(
			redactDeepStrings({
				args: { token: "abcdefgh1234", count: 3, flag: true },
				tags: ["Bearer abcdefgh123456", "clean"],
			}),
		).toEqual({
			args: { token: "[REDACTED]", count: 3, flag: true },
			tags: ["Bearer [REDACTED]", "clean"],
		});
	});
	it("never throws on circular values", () => {
		const circular = { a: 1 };
		circular.self = circular;
		expect(() => redactDeepStrings(circular)).not.toThrow();
	});
});
