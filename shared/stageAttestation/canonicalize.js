/***
 * MARK: canonicalize
 * @description Deterministic JSON serialization for attestation hashing:
 *   object keys sorted recursively (UTF-16 code-unit order), arrays kept in
 *   order, primitives rendered exactly as `JSON.stringify` renders them.
 *   Strict by design — `undefined`, functions, symbols, bigints, class
 *   instances (including `Date`), and circular references throw instead of
 *   silently hashing something other than the caller's value (the
 *   `ingestLogEvents` JSON-safety stance). Producers hash through
 *   `buildStageConfigInput`, which sanitizes first; direct callers must pass
 *   plain JSON only. Shared verbatim by the backend and the Runner so both
 *   paths hash byte-identical inputs.
 * @example canonicalize({ b: 1, a: { d: 4, c: 3 } }) => '{"a":{"c":3,"d":4},"b":1}'
 * @param {*} value - Plain-JSON value to serialize.
 * @returns {string} Canonical UTF-8 JSON text (no whitespace).
 ***/
export function canonicalize(value) {
	return stringifyNode(value, new Set());
}

const isPlainObject = (value) => {
	if (value === null || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

const stringifyNode = (value, ancestors) => {
	if (value === null || typeof value === "string" || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (typeof value === "number") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		if (ancestors.has(value)) {
			throw new Error("canonicalize: circular reference");
		}
		ancestors.add(value);
		try {
			return `[${value.map((item) => stringifyNode(item, ancestors)).join(",")}]`;
		} finally {
			ancestors.delete(value);
		}
	}
	if (isPlainObject(value)) {
		if (ancestors.has(value)) {
			throw new Error("canonicalize: circular reference");
		}
		ancestors.add(value);
		try {
			const parts = Object.keys(value)
				.sort()
				.map((key) => `${JSON.stringify(key)}:${stringifyNode(value[key], ancestors)}`);
			return `{${parts.join(",")}}`;
		} finally {
			ancestors.delete(value);
		}
	}
	throw new Error(
		`canonicalize: only plain JSON values are hashable (got ${Array.isArray(value) ? "array" : typeof value})`,
	);
};
