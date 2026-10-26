/***
 * MARK: routeCoverageHelpers
 * @description Shared route-introspection helpers for API documentation and
 *   agent guide coverage suites.
 ***/

/***
 * MARK: listRegisteredRoutePaths
 * @description Reconstructs full route paths from `app.printRoutes()` by
 *   tracking indentation depth. Merged param alternatives (`:id|:projectId`)
 *   collapse to the first name; callers match params loosely.
 * @param {object} fastifyApp - Ready Fastify instance.
 * @returns {Array<{ path: string, methods: Array<string> }>}
 * @example listRegisteredRoutePaths(app) => [{ path: '/status', methods: ['GET'] }]
 ***/
export function listRegisteredRoutePaths(fastifyApp) {
	const tree = fastifyApp.printRoutes();
	const stack = [{ depth: -1, path: "" }];
	const byPath = new Map();
	for (const line of tree.split("\n")) {
		const leading = (line.match(/^[│\s├└─]*/)?.[0] ?? "").length;
		const rest = line.slice(leading).trim();
		if (!rest) continue;
		// Root marker (`(empty root node)`) carries no path fragment.
		if (rest.startsWith("(")) {
			stack.length = 0;
			stack.push({ depth: leading / 4, path: "" });
			continue;
		}
		const withMethods = rest.match(/^(.*) \(([A-Z, ]+)\)$/);
		const fragment = (withMethods?.[1] ?? rest).trim();
		const methods = withMethods
			? withMethods[2]
					.split(",")
					.map((m) => m.trim())
					.filter((m) => m !== "HEAD" && m !== "OPTIONS")
			: [];
		const depth = leading / 4;
		while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
			stack.pop();
		}
		const full = `${stack[stack.length - 1].path}${fragment}`;
		stack.push({ depth, path: full });
		if (methods.length > 0 && full) {
			const entry = byPath.get(full) ?? { path: full, methods: [] };
			for (const m of methods) {
				if (!entry.methods.includes(m)) entry.methods.push(m);
			}
			byPath.set(full, entry);
		}
	}
	return [...byPath.values()];
}

/***
 * MARK: isExcludedInfraPath
 * @description Whether a registered path needs no prose docs.
 *   - `/documentation*`: @fastify/swagger-ui static assets + JSON/YAML spec
 *     endpoints. Machine-readable surface, not REST API; the article links to
 *     it instead of duplicating it.
 *   - `*` or `/*`: fastifyStatic SPA fallback / 404 catch-all, not an API route.
 * @param {string} routePath
 * @returns {boolean}
 * @example isExcludedInfraPath('/documentation/json') => true
 ***/
export function isExcludedInfraPath(routePath) {
	return (
		routePath === "*" ||
		routePath === "/*" ||
		routePath.startsWith("/documentation")
	);
}

/***
 * MARK: routePathPattern
 * @description Builds a regex matching a registered path in prose, where any
 *   `:param` segment matches any `:name` spelling (route files use `:id` in
 *   some modules and `:projectId` in others for the same position).
 * @param {string} routePath
 * @returns {RegExp}
 * @example routePathPattern('/projects/:id') => /\/projects\/:[A-Za-z]+/
 ***/
export function routePathPattern(routePath) {
	const source = routePath
		.split("/")
		.map((seg) =>
			seg.startsWith(":")
				? ":[A-Za-z]+"
				: seg
						.split("|")
						.map((alt) => alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
						.join("|"),
		)
		.join("/");
	// eslint-disable-next-line security/detect-non-literal-regexp -- source is built from our own route table with every literal segment escaped
	return new RegExp(source); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- test-only helper; pattern source is our own route table with every literal segment escaped, never user input
}
