# Shared helper for runner-bundle transfer receipts (sourced, not executed).
# Prints the two facts an installer/operator must be able to verify on the
# far side of a transfer:
#   sha256: <hex>            — re-hash the tarball and compare
#   stamped build.sha: <sha> — the build identity the booted runner will
#                              report as versions.build.sha (never the REF
#                              in the filename; see scripts/package-runner.sh)
#
# Usage:
#   . "$LIB_DIR/bundle-receipt.sh"
#   print_bundle_receipt <tarball>   # returns 1 (message on stderr) when the
#                                    # tarball or its root version.json cannot
#                                    # be read back — a bundle that cannot prove
#                                    # its own identity is not shippable
#
# Portability: hashing and JSON parsing go through node (guaranteed present —
# package-runner.sh reads runner/version.json with node), never through
# sha256sum, which does not exist on macOS hosts where `uname -s` is Darwin.

# print_bundle_receipt <tarball>
# Prints the sha256 and the stamped build.sha of one runner tarball. The
# archive-root version.json is located by matching its exact entry shape
# (`<bundle-root>/version.json`) instead of trusting tar's first listing
# entry, so entry order can never select the wrong file. Every failure names
# what is missing and returns 1, so a caller with `set -e` stops loudly.
print_bundle_receipt() {
	_receipt_tarball="${1:-}"
	if [ -z "$_receipt_tarball" ] || [ ! -f "$_receipt_tarball" ]; then
		echo "bundle-receipt.sh: no readable tarball at '${_receipt_tarball:-<empty arg>}'" >&2
		return 1
	fi
	if ! node -e '
		const fs = require("fs");
		const crypto = require("crypto");
		try {
			const bytes = fs.readFileSync(process.argv[1]);
			console.log("sha256: " + crypto.createHash("sha256").update(bytes).digest("hex"));
		} catch (err) {
			console.error("bundle-receipt.sh: cannot hash " + process.argv[1] + ": " + (err && err.message ? err.message : err));
			process.exit(1);
		}
	' "$_receipt_tarball"; then
		return 1
	fi
	_receipt_entry="$(tar tzf "$_receipt_tarball" 2>/dev/null | grep -E '^[^/]+/version\.json$' | head -n 1)"
	if [ -z "$_receipt_entry" ]; then
		echo "bundle-receipt.sh: '$_receipt_tarball' has no archive-root version.json (<bundle-root>/version.json) — not a runner bundle" >&2
		return 1
	fi
	if ! _receipt_json="$(tar xzOf "$_receipt_tarball" "$_receipt_entry" 2>/dev/null)"; then
		echo "bundle-receipt.sh: cannot extract '$_receipt_entry' from '$_receipt_tarball' (corrupt archive?)" >&2
		return 1
	fi
	printf '%s' "$_receipt_json" | node -e '
		let stdinText = "";
		process.stdin.on("data", (chunk) => { stdinText += chunk; }).on("end", () => {
			try {
				const parsed = JSON.parse(stdinText);
				const sha = parsed && parsed.build && typeof parsed.build.sha === "string" && parsed.build.sha
					? parsed.build.sha
					: "(unknown — no git checkout at build time)";
				console.log("stamped build.sha: " + sha);
			} catch {
				console.error("bundle-receipt.sh: version.json inside the bundle is not parseable JSON");
				process.exit(1);
			}
		});
	' || return 1
}
