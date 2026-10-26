/**
 * @description Whether a browser `Origin` header is allowed to call the API.
 *   Allows origin-less requests (curl, same-origin SPA, server-to-server),
 *   loopback (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`), and exact
 *   matches from `CORS_ALLOWED_ORIGINS` (comma-separated, e.g.
 *   `CORS_ALLOWED_ORIGINS=https://kainbain.home,https://app.example.com`).
 *   Network-agnostic by design: no implicit `.home`, LAN, Tailscale CGNAT
 *   (`100.x`), or tailnet allowances — non-loopback origins must be listed
 *   explicitly (audit §2.1).
 * @param {string|undefined} origin
 * @returns {boolean} True when the origin may call the API.
 * @example isAllowedCorsOrigin('http://localhost:3100') => true
 */
export function isAllowedCorsOrigin(origin) {
	if (!origin) return true;
	if (
		/^https?:\/\/(\[::1\]|localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(
			origin,
		)
	) {
		return true;
	}
	// Live-read so tests and reconfigured processes see the current value;
	// parsing matches the schema's `csv` type (split, trim, drop empties).
	const allowList = (process.env.CORS_ALLOWED_ORIGINS || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return allowList.includes(origin);
}
