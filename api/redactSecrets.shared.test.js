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
	it("keeps shared (non-circular) references instead of marking them unserializable", () => {
		const shared = { path: "src/index.js" };
		expect(redactDeepStrings({ first: shared, second: shared })).toEqual({
			first: { path: "src/index.js" },
			second: { path: "src/index.js" },
		});
	});
});

describe("redactDeepStrings — non-plain values stay safe", () => {
	it("keeps dates as readable text", () => {
		expect(
			redactDeepStrings({ at: new Date("2026-01-01T00:00:00.000Z") }),
		).toEqual({ at: "2026-01-01T00:00:00.000Z" });
	});
	it("converts maps and sets instead of dropping them", () => {
		expect(
			redactDeepStrings({
				m: new Map([["token", "abcdefgh1234"]]),
				s: new Set(["clean"]),
			}),
		).toEqual({ m: { token: "[REDACTED]" }, s: ["clean"] });
	});
	it("hides binary bytes behind a marker", () => {
		expect(redactDeepStrings({ blob: new Uint8Array([1, 2, 3]) })).toEqual({
			blob: "[Binary]",
		});
	});
	it("never copies secret-shaped prototype fields", () => {
		const hostile = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
		const cleaned = redactDeepStrings(hostile);
		expect(cleaned.ok).toBe(1);
		expect(Object.prototype.hasOwnProperty.call(cleaned, "__proto__")).toBe(
			false,
		);
		expect({}.polluted).toBe(undefined);
	});
});

describe("redactDeepStrings — never throws, never loses the log", () => {
	it("degrades throwing values to a marker instead of throwing", () => {
		const hostile = { ok: 1 };
		Object.defineProperty(hostile, "boom", {
			enumerable: true,
			get() {
				throw new Error("getter exploded");
			},
		});
		expect(() => redactDeepStrings(hostile)).not.toThrow();
		expect(redactDeepStrings(hostile)).toEqual({
			ok: 1,
			boom: "[Unserializable]",
		});
	});
	it("degrades hostile map keys without losing sibling entries", () => {
		const hostileKey = {
			toString() {
				throw new Error("key exploded");
			},
		};
		const cleaned = redactDeepStrings(
			new Map([
				[hostileKey, "kept"],
				["ok", "clean"],
			]),
		);
		expect(cleaned).toEqual({ "[Unserializable]": "kept", ok: "clean" });
	});
	it("degrades unlistable objects to a marker instead of throwing", () => {
		const opaque = new Proxy(
			{ ok: 1 },
			{
				ownKeys() {
					throw new Error("keys exploded");
				},
			},
		);
		expect(() => redactDeepStrings({ nested: opaque })).not.toThrow();
		expect(redactDeepStrings({ nested: opaque })).toEqual({
			nested: "[Unserializable]",
		});
	});
	it("stringifies bigints so downstream JSON never throws", () => {
		expect(redactDeepStrings({ count: 10n })).toEqual({ count: "10" });
		expect(redactDeepStrings(10n)).toBe("10");
	});
});
