/***
 * MARK: harnessRetryableBlips
 * @description Narrow WP3 allowlist of non-infrastructure harness blips that
 *   are still worth a same-stage retry (malformed harness JSON, ephemeral
 *   tool-execution errors, harness runner crashes). These classify as
 *   `logical` under WP2, so without this list they would bypass Tier-2
 *   retry and fail the stage on a transient runner hiccup. The deny-list
 *   in `resolveRetryable` is checked FIRST, so a blip string that also
 *   mentions auth/quota/abort wording is never retried.
 * @example harnessRetryableBlips.length => 3
 ***/
export const harnessRetryableBlips = [
	{
		re: /harness.*(malformed|invalid).*json|malformed harness.*json|failed to parse harness output|unexpected token.*json.*harness|harness.*unexpected token/i,
		signal: "harness-json-blip",
	},
	{
		re: /ephemeral tool|tool execution (failed|timed out|error).*transient|tool .*temporarily unavailable|tool runner .* (crashed|restarted)/i,
		signal: "tool-execution-blip",
	},
	{
		re: /harness (runner )?(crashed|was killed|exited unexpectedly|lost heartbeat)|harness heartbeat lost/i,
		signal: "harness-crash-blip",
	},
];
