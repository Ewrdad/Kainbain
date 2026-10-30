/**
 * MARK: redactSecrets
 * @description Single content-redaction choke point for every log surface
 *   (embedded agent stream, runner ingest, committed task markdown, live
 *   socket payloads, report output tails). The only secret knowledge the
 *   engine previously had was the child-env name pattern
 *   (`SECRET_NAME_PATTERN` in `api/agent/harnesses/shared/harnessScaffold.js`,
 *   which drops secret-shaped env vars before spawning); anything a model,
 *   tool, or vendor echoed back into log TEXT was stored verbatim. This
 *   module redacts secret and PII shapes inside already-rendered text, so
 *   producers keep their grammar and clean inputs pass through byte-identical.
 *
 *   Pure module: zero dependencies, no harness imports — safe to import from
 *   the runner bundle, the log processor, and the UI.
 */

/***
 * MARK: REDACTED
 * @description Replacement markers. Each category keeps its own marker so a
 *   redacted log still tells the reader WHAT kind of value was hidden (a
 *   token vs an email vs a home directory) without revealing any of it.
 * @example REDACTED.TOKEN => '[REDACTED]'
 ***/
export const REDACTED = Object.freeze({
	SECRET: "[REDACTED]",
	TOKEN: "[REDACTED]",
	EMAIL: "[REDACTED EMAIL]",
	PHONE: "[REDACTED PHONE]",
	CARD: "[REDACTED CARD]",
	PATH: "[REDACTED]",
	KEY: "[REDACTED PRIVATE KEY]",
});

/***
 * MARK: redactSecretsText
 * @description Redacts secret and PII shapes inside one text value.
 *   Non-strings return "" (mirrors `stripAnsiText`); clean text returns
 *   unchanged (same reference semantics as String.replace with no match —
 *   callers can rely on byte-identical output for secret-free inputs).
 * @example redactSecretsText('hi') => 'hi'
 * @example redactSecretsText('Bearer abcdefgh1234') => 'Bearer [REDACTED]'
 * @param {string} text - Rendered log text that may carry secrets.
 * @returns {string} The text with secret/PII shapes replaced.
 ***/
export const redactSecretsText = (text) => {
	if (typeof text !== "string" || !text) return "";
	let out = text;
	// Private key blocks first: they span lines and contain base64 that
	// later patterns would only partially redact.
	out = out.replace(
		/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
		REDACTED.KEY,
	);
	// Bearer / Basic authorization headers.
	out = out.replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED.SECRET}`);
	out = out.replace(/(basic\s+)[A-Za-z0-9._~+/=]{8,}/gi, `$1${REDACTED.SECRET}`);
	// Vendor token shapes.
	out = out.replace(/sk-(?:live|test|proj)-[A-Za-z0-9]{8,}/g, "sk-[REDACTED]");
	out = out.replace(/xox[baprs]-[A-Za-z0-9-]{8,}/g, "xox-[REDACTED]");
	out = out.replace(/\bgh[pousr]_[A-Za-z0-9]{8,}/g, "gh_[REDACTED]");
	out = out.replace(/AIza[0-9A-Za-z_-]{35}/g, "AIza[REDACTED]");
	out = out.replace(/AKIA[0-9A-Z]{16}/g, "AKIA[REDACTED]");
	// Connection strings and embedded-credential URLs: keep the scheme so
	// the reader still knows the backend kind, drop everything secret.
	out = out.replace(
		/(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?|amqp(?:s)?):\/\/[^\s"'`]+/gi,
		`$1://${REDACTED.SECRET}`,
	);
	out = out.replace(/(\w+:\/\/[^/\s:]+:)[^@\s/]+@/g, `$1${REDACTED.SECRET}@`);
	// AWS-style secret access keys inside JSON credential blobs.
	out = out.replace(
		/("(?:aws_secret|secret_access_key|session_token)"\s*:\s*")[^"]*(")/gi,
		`$1${REDACTED.SECRET}$2`,
	);
	// Labeled key/value pairs: api_key=..., "password": "...", CLIENT_SECRET: ...
	// The key list mirrors SECRET_NAME_PATTERN plus wire formats (apiKey,
	// client_secret, authToken). A real `:`/`=` separator is required — bare
	// prose ("secret reasoning step one") must never redact — and the value
	// needs at least 6 chars so short words after a colon survive.
	out = out.replace(
		/\b(api[_-]?key|auth[_-]?token|client[_-]?secret|credential(?:s)?|passwd|password|pwd|secret|token)\b(\s*["']?\s*[:=][=>]?\s*["']?)([A-Za-z0-9._~+/=:@-]{6,})/gi,
		`$1$2${REDACTED.SECRET}`,
	);
	// ENV-style assignments with secret-shaped names: FOOBAR_API_KEY="...".
	out = out.replace(
		/\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|API[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s,;}\]]+)/g,
		`$1=${REDACTED.SECRET}`,
	);
	// PII: emails, home directories (never /tmp or repo-relative paths),
	// phone shapes, and spaced/dashed 16-digit card runs.
	out = out.replace(
		/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
		REDACTED.EMAIL,
	);
	out = out.replace(/\/(home|Users)\/[^\s/"'`:\n]+/g, `/$1/${REDACTED.PATH}`);
	out = out.replace(
		/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
		REDACTED.PHONE,
	);
	out = out.replace(/\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g, REDACTED.CARD);
	return out;
};

/***
 * MARK: SECRET_KEY_PATTERN
 * @description Secret-shaped object key names (mirrors `SECRET_NAME_PATTERN`
 *   in `api/agent/harnesses/shared/harnessScaffold.js`, extended to wire
 *   spellings like `apiKey`/`client_secret`). A string value under one of
 *   these keys is a secret by position even when the value itself carries no
 *   recognizable shape — the same rule the child-env seam already enforces.
 * @example SECRET_KEY_PATTERN.test("apiKey") => true
 * @example SECRET_KEY_PATTERN.test("model") => false
 ***/
export const SECRET_KEY_PATTERN =
	/secret|token|password|passwd|pwd|credential|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|auth/i;

/***
 * MARK: redactDeepStrings
 * @description Deep-clones a JSON-ish value while redacting every string it
 *   contains. Used for structured payloads (tool args/results, permission
 *   targets, raw evidence) where a secret may sit in a nested field, not in
 *   rendered text. A string under a secret-shaped key (`SECRET_KEY_PATTERN`)
 *   is redacted by position even when the value looks innocent; numbers,
 *   booleans, null, and undefined pass through untouched (so usage token
 *   counts survive); circular values degrade to "[Unserializable]" instead of
 *   throwing.
 * @example redactDeepStrings({ a: 'Bearer abcdefgh1234' }) => { a: 'Bearer [REDACTED]' }
 * @param {*} value - Any JSON-ish value.
 * @returns {*} A redacted deep clone.
 ***/
export const redactDeepStrings = (value) => {
	// Ancestor set only: a reference shared between siblings is cloned twice,
	// while a true cycle (an object reachable from itself) degrades safely.
	const ancestors = new Set();
	const walk = (node) => {
		if (typeof node === "string") return redactSecretsText(node);
		if (!node || typeof node !== "object") return node;
		if (ancestors.has(node)) return "[Unserializable]";
		ancestors.add(node);
		try {
			if (Array.isArray(node)) return node.map(walk);
			const out = {};
			for (const key of Object.keys(node)) {
				// eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys of the walked object
				const child = node[key];
				if (typeof child === "string" && SECRET_KEY_PATTERN.test(key)) {
					// eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys of the walked object
					out[key] = REDACTED.SECRET;
				} else {
					// eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys of the walked object
					out[key] = walk(child);
				}
			}
			return out;
		} finally {
			ancestors.delete(node);
		}
	};
	return walk(value);
};
