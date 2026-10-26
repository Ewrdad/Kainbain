#!/bin/bash

# Security Scan Script for kainbain
# Runs Trivy and Semgrep scans, generates SBOM, and publishes results to SecObserve
#
# Idempotency: before uploading, existing observations for the product are fetched
# (all pages) and any finding whose title already exists is skipped. SecObserve
# Manual-parser observations carry no vulnerability_id, so identity is title-based.
#
# Optional flag:
#   --close-stale  After scanning, mark existing Open observations whose title is
#                  absent from the fresh scan results as "Resolved" via SecObserve's
#                  bulk_assessment endpoint (the only supported status-change API;
#                  status enum: Open/Affected/Resolved/Duplicate/False positive/
#                  In review/Not affected/Not security/Risk accepted).

set -u

# --- Configuration ---
PRODUCT_NAME="kainbain"
API_ENDPOINT="https://api.security.home/api"
API_KEY_FILE="${API_KEY_FILE:-/home/server/.secobserve_key}"
# Fallback locations for scanner binaries when not on PATH (overridable for testing)
TRIVY_FALLBACK_DIR="${TRIVY_FALLBACK_DIR:-/snap/bin}"
SEMGREP_FALLBACK_DIR="${SEMGREP_FALLBACK_DIR:-$HOME/.local/bin}"
CURL_MAX_TIME=30
CLOSE_STALE=0

for arg in "$@"; do
	case "$arg" in
	--close-stale) CLOSE_STALE=1 ;;
	*)
		echo "Usage: $0 [--close-stale]"
		exit 2
		;;
	esac
done

# --- Tool discovery (PATH-aware, with known fallback locations) ---
find_bin() {
	local name="$1"
	if command -v "$name" >/dev/null 2>&1; then
		command -v "$name"
		return 0
	fi
	case "$name" in
	trivy)
		if [[ -x "$TRIVY_FALLBACK_DIR/trivy" ]]; then
			echo "$TRIVY_FALLBACK_DIR/trivy"
			return 0
		fi
		;;
	semgrep)
		if [[ -x "$SEMGREP_FALLBACK_DIR/semgrep" ]]; then
			echo "$SEMGREP_FALLBACK_DIR/semgrep"
			return 0
		fi
		;;
	esac
	return 1
}

TRIVY_BIN=$(find_bin trivy || true)
SEMGREP_BIN=$(find_bin semgrep || true)

if [[ -z "$TRIVY_BIN" ]]; then
	echo "WARNING: trivy not found (PATH or $TRIVY_FALLBACK_DIR) — Trivy scan and SBOM generation will be SKIPPED." >&2
fi
if [[ -z "$SEMGREP_BIN" ]]; then
	echo "WARNING: semgrep not found (PATH or $SEMGREP_FALLBACK_DIR) — Semgrep scan will be SKIPPED." >&2
fi

# --- Work directory for scan state (cleaned up on exit) ---
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT
EXISTING_TITLES="$WORK_DIR/existing_titles.txt"
FRESH_TITLES="$WORK_DIR/fresh_titles.txt"
POSTED_TITLES="$WORK_DIR/posted_titles.txt"
: >"$EXISTING_TITLES"
: >"$FRESH_TITLES"
: >"$POSTED_TITLES"

# --- SecObserve upload gating (optional) ---
# Without a readable API key file, or when the endpoint/product is
# unreachable, the script still runs every local scan and only skips the
# upload step (exit 0). Uploads stay byte-identical when configured.
UPLOAD_ENABLED=1
SKIP_REASON=""
API_TOKEN=""
PRODUCT_ID=""
if [[ ! -f "$API_KEY_FILE" ]]; then
	UPLOAD_ENABLED=0
	SKIP_REASON="API key file $API_KEY_FILE not found"
elif [[ ! -r "$API_KEY_FILE" ]]; then
	UPLOAD_ENABLED=0
	SKIP_REASON="API key file $API_KEY_FILE is not readable"
else
	API_TOKEN=$(cat "$API_KEY_FILE")
	# Get Product ID from SecObserve (blank when the endpoint does not
	# resolve/respond or the product is unknown — all local-only cases).
	PRODUCT_ID=$(curl -s -k --max-time $CURL_MAX_TIME -H "Authorization: APIToken $API_TOKEN" "$API_ENDPOINT/products/" 2>/dev/null |
		jq -r ".results[]? | select(.name == \"$PRODUCT_NAME\") | .id" 2>/dev/null || true)
	if [[ -z "$PRODUCT_ID" || "$PRODUCT_ID" == "null" ]]; then
		UPLOAD_ENABLED=0
		SKIP_REASON="SecObserve endpoint $API_ENDPOINT unreachable or product '$PRODUCT_NAME' unknown"
	fi
fi

if [[ "$UPLOAD_ENABLED" -eq 0 ]]; then
	echo "SecObserve upload skipped (not configured): $SKIP_REASON. Running local scans only."
else
	echo "Product $PRODUCT_NAME found with ID: $PRODUCT_ID"
fi

# --- Fetch existing observations (all pages) for dedupe / stale closure ---
# (skipped when uploads are disabled — nothing to dedupe against)
EXISTING_RESULTS="$WORK_DIR/existing_results.json"
echo "[]" >"$EXISTING_RESULTS"
if [[ "$UPLOAD_ENABLED" -eq 1 ]]; then
	next_url="$API_ENDPOINT/observations/?product=$PRODUCT_ID&page_size=250"
	guard=0
	while [[ -n "$next_url" && "$next_url" != "null" && "$guard" -lt 20 ]]; do
		resp=$(curl -s -k --max-time $CURL_MAX_TIME -H "Authorization: APIToken $API_TOKEN" "$next_url" 2>/dev/null || true)
		if [[ -z "$resp" ]]; then break; fi
		if jq -s '.[0] + (.[1].results // [])' "$EXISTING_RESULTS" <(echo "$resp") >"$EXISTING_RESULTS.new" 2>/dev/null; then
			mv "$EXISTING_RESULTS.new" "$EXISTING_RESULTS"
		else
			rm -f "$EXISTING_RESULTS.new"
		fi
		next_url=$(echo "$resp" | jq -r '.next // empty' 2>/dev/null)
		guard=$((guard + 1))
	done
fi

jq -r '.[].title // empty' "$EXISTING_RESULTS" 2>/dev/null | sort -u >"$EXISTING_TITLES"
EXISTING_COUNT=$(grep -c . "$EXISTING_TITLES" || true)
echo "Found $EXISTING_COUNT existing observation title(s) — duplicate uploads will be skipped."

# --- 1. Trivy Scan (Filesystem) ---
if [[ -n "$TRIVY_BIN" ]]; then
	echo "Running Trivy filesystem scan..."
	TRIVY_RESULTS=$("$TRIVY_BIN" fs --format json --quiet --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL . 2>/dev/null || true)

	echo "$TRIVY_RESULTS" | jq -c '.Results[].Vulnerabilities[]?' 2>/dev/null >"$WORK_DIR/trivy_vulns.txt" || true

	while read -r vuln; do
		if [[ -z "$vuln" ]]; then continue; fi

		v_id=$(echo "$vuln" | jq -r '.VulnerabilityID')
		v_severity=$(echo "$vuln" | jq -r '.Severity')
		v_title=$(echo "$vuln" | jq -r '.Title')
		v_desc=$(echo "$vuln" | jq -r '.Description')
		v_pkg=$(echo "$vuln" | jq -r '.PkgName')
		v_version=$(echo "$vuln" | jq -r '.InstalledVersion')
		v_score=$(echo "$vuln" | jq -r '.CVSS.nvd.V3Score // .CVSS.ghsa.V3Score // .CVSS.redhat.V3Score // "0.0"')

		# Record title as freshly scanned (for --close-stale)
		echo "$v_title" >>"$FRESH_TITLES"

		# Dedupe: skip if this title already exists in SecObserve (any status) or was posted in this run
		if grep -Fxq -- "$v_title" "$EXISTING_TITLES" || grep -Fxq -- "$v_title" "$POSTED_TITLES"; then
			continue
		fi

		if [[ "$UPLOAD_ENABLED" -eq 1 ]]; then
			payload=$(jq -n \
				--arg pid "$PRODUCT_ID" \
				--arg vid "$v_id" \
				--arg sev "$v_severity" \
				--arg tit "$v_title" \
				--arg des "$v_desc" \
				--arg pkg "$v_pkg" \
				--arg ver "$v_version" \
				--arg score "$v_score" \
				'{
            product: ($pid | tonumber),
            external_id: $vid,
            severity: $sev,
            title: $tit,
            description: $des,
            component: $pkg,
            version: $ver,
            cvss3_score: $score
        }')

			if curl -s -k --max-time $CURL_MAX_TIME -X POST -H "Authorization: APIToken $API_TOKEN" \
				-H "Content-Type: application/json" \
				-d "$payload" "$API_ENDPOINT/observations/" >/dev/null; then
				echo "$v_title" >>"$POSTED_TITLES"
			fi
		fi
	done <"$WORK_DIR/trivy_vulns.txt"
	if [[ "$UPLOAD_ENABLED" -eq 1 ]]; then
		echo "Trivy results uploaded (deduplicated)."
	else
		trivy_count=$(grep -c . "$WORK_DIR/trivy_vulns.txt" 2>/dev/null || true)
		echo "Trivy scan complete: ${trivy_count:-0} finding(s) (upload skipped — not configured)."
	fi
fi

# --- 2. Semgrep Scan ---
if [[ -n "$SEMGREP_BIN" ]]; then
	echo "Running Semgrep scan..."
	SEMGREP_RESULTS=$("$SEMGREP_BIN" scan --config auto --json . 2>/dev/null || true)

	echo "$SEMGREP_RESULTS" | jq -c '.results[]?' 2>/dev/null >"$WORK_DIR/semgrep_findings.txt" || true

	while read -r finding; do
		if [[ -z "$finding" ]]; then continue; fi

		f_id=$(echo "$finding" | jq -r '.check.id')
		f_severity=$(echo "$finding" | jq -r '.extra.severity // "MEDIUM"')
		f_title=$(echo "$finding" | jq -r '.extra.message // .check.id')
		f_desc=$(echo "$finding" | jq -r '.extra.message // "No description provided"')
		f_file=$(echo "$finding" | jq -r '.path')
		f_line=$(echo "$finding" | jq -r '.start.line')

		# Record title as freshly scanned (for --close-stale)
		echo "$f_title" >>"$FRESH_TITLES"

		# Dedupe: skip if this title already exists in SecObserve (any status) or was posted in this run
		if grep -Fxq -- "$f_title" "$EXISTING_TITLES" || grep -Fxq -- "$f_title" "$POSTED_TITLES"; then
			continue
		fi

		if [[ "$UPLOAD_ENABLED" -eq 1 ]]; then
			payload=$(jq -n \
				--arg pid "$PRODUCT_ID" \
				--arg vid "$f_id" \
				--arg sev "$f_severity" \
				--arg tit "$f_title" \
				--arg des "File: $f_file, Line: $f_line. $f_desc" \
				'{
					product: ($pid | tonumber),
					external_id: $vid,
					severity: $sev,
					title: $tit,
					description: $des
				}')

			if curl -s -k --max-time $CURL_MAX_TIME -X POST -H "Authorization: APIToken $API_TOKEN" \
				-H "Content-Type: application/json" \
				-d "$payload" "$API_ENDPOINT/observations/" >/dev/null 2>&1; then
				echo "$f_title" >>"$POSTED_TITLES"
			fi
		fi
	done <"$WORK_DIR/semgrep_findings.txt"
	if [[ "$UPLOAD_ENABLED" -eq 1 ]]; then
		echo "Semgrep results uploaded (deduplicated)."
	else
		semgrep_count=$(grep -c . "$WORK_DIR/semgrep_findings.txt" 2>/dev/null || true)
		echo "Semgrep scan complete: ${semgrep_count:-0} finding(s) (upload skipped — not configured)."
	fi
fi

# --- 3. Close stale observations (optional; needs the upload API) ---
if [[ "$CLOSE_STALE" -eq 1 && "$UPLOAD_ENABLED" -eq 1 ]]; then
	sort -u "$FRESH_TITLES" | grep -v '^$' >"$FRESH_TITLES.uniq" || true
	if [[ ! -s "$FRESH_TITLES.uniq" ]]; then
		echo "NOTE: fresh scan produced no findings — every Open observation not matching a fresh title will be closed as Resolved."
	fi
	CLOSED=0
	FAILED=0
	total=$(jq 'length' "$EXISTING_RESULTS" 2>/dev/null || echo 0)
	STALE_IDS="$WORK_DIR/stale_ids.txt"
	: >"$STALE_IDS"
	for ((i = 0; i < total; i++)); do
		o_id=$(jq -r ".[$i].id // empty" "$EXISTING_RESULTS")
		o_title=$(jq -r ".[$i].title // empty" "$EXISTING_RESULTS")
		o_status=$(jq -r ".[$i].current_status // empty" "$EXISTING_RESULTS")

		if [[ -z "$o_id" || -z "$o_title" ]]; then continue; fi
		if [[ "$o_status" != "Open" ]]; then continue; fi
		if grep -Fxq -- "$o_title" "$FRESH_TITLES.uniq"; then continue; fi

		echo "$o_id" >>"$STALE_IDS"
	done

	if [[ -s "$STALE_IDS" ]]; then
		# SecObserve bulk assessment API: max 250 observation ids per call
		n_ids=$(wc -l <"$STALE_IDS" | tr -d ' ')
		chunk_size=250
		sent=0
		while [[ $sent -lt $n_ids ]]; do
			ids=$(sed -n "$((sent + 1)),$((sent + chunk_size))p" "$STALE_IDS" | paste -sd, -)
			http_code=$(curl -s -k --max-time $CURL_MAX_TIME -o /dev/null -w '%{http_code}' -X POST \
				-H "Authorization: APIToken $API_TOKEN" \
				-H "Content-Type: application/json" \
				-d "{\"observations\": [${ids}], \"status\": \"Resolved\", \"comment\": \"Closed by Security_scans.sh --close-stale: title not present in fresh scan results.\"}" \
				"$API_ENDPOINT/observations/bulk_assessment/" 2>/dev/null || true)

			if [[ "$http_code" == "200" || "$http_code" == "204" ]]; then
				CLOSED=$((CLOSED + $(echo "$ids" | awk -F, '{print NF}')))
			else
				FAILED=$((FAILED + $(echo "$ids" | awk -F, '{print NF}')))
				echo "WARNING: bulk_assessment for ids $ids — HTTP $http_code" >&2
			fi
			sent=$((sent + chunk_size))
			sleep 0.2
		done
	fi
	echo "Stale closure: $CLOSED observation(s) marked Resolved, $FAILED failure(s)."
else
	CLOSED=0
	if [[ "$CLOSE_STALE" -eq 1 ]]; then
		echo "Skipping stale closure (upload skipped — not configured)."
	fi
fi

# --- 4. SBOM Generation ---
if [[ -n "$TRIVY_BIN" ]]; then
	echo "Generating SBOM..."
	SBOM_FILE="sbom.cyclonedx.json"
	"$TRIVY_BIN" fs --format cyclonedx . >"$SBOM_FILE" 2>/dev/null || true

	if [[ -f "$SBOM_FILE" && -s "$SBOM_FILE" ]]; then
		if [[ "$UPLOAD_ENABLED" -eq 1 ]]; then
			B64_FILE="$WORK_DIR/sbom.b64"
			PAYLOAD_FILE="$WORK_DIR/sbom_payload.json"
			base64 -w 0 <"$SBOM_FILE" >"$B64_FILE"
			jq -n --rawfile content "$B64_FILE" '{"file": $content}' >"$PAYLOAD_FILE"

			curl -s -k --max-time $CURL_MAX_TIME -X POST -H "Authorization: APIToken $API_TOKEN" \
				-H "Content-Type: application/json" \
				--data-binary @"$PAYLOAD_FILE" "$API_ENDPOINT/products/$PRODUCT_ID/sbom/" >/dev/null 2>&1 || true

			echo "SBOM generated and upload attempted to /api/products/$PRODUCT_ID/sbom/."
		else
			echo "SBOM generated at $SBOM_FILE (upload skipped — not configured)."
		fi
	fi
fi

echo "Security scan complete (existing titles: $EXISTING_COUNT, new uploads: $(grep -c . "$POSTED_TITLES" || true), closed stale: $CLOSED)."
exit 0
