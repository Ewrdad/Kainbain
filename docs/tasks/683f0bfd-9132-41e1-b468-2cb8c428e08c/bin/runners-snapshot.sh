#!/usr/bin/env bash
# runners-snapshot.sh <outdir> [--require-converged] — record the fleet matrix
# (GET /runners + GET /deploy/status) and a per-runner convergence verdict.
# READ-ONLY against the backend; safe to run any time, any number of times.
#
# Outputs in <outdir>:
#   runners-<stamp>.json        raw GET /runners payload (evidence)
#   runners-<stamp>.tsv         flat fleet table incl. build sha/builtAt
#   deploy-status-<stamp>.json  raw GET /deploy/status payload
#   verdict-<stamp>.txt         one line per named runner: CONVERGED or the reasons why not
#
# Convergence rule (S5 success criterion 1): runnerVersion >= 0.2.x AND the
# running build's reported git sha contains the fix commit — verified locally
# with `git merge-base --is-ancestor <fixCommit> <buildSha>`, because a version
# string alone cannot prove which code is running. If the runner reports no
# build sha, the verdict says so instead of guessing.
#
# Knobs (env):
#   KAINBAIN_API_BASE            default http://192.168.1.206:3100
#   KAINBAIN_S5_NAMED_RUNNERS    default "local-alpha,server2-alpha"
#   KAINBAIN_S5_FIX_COMMIT       default 046a63917d52181d00efbd4a6624bd1c53131fa4 (the 046a6391 deterministic-git-failure change)
#
# Exit codes: 0 snapshot written (converged or not — read verdict-<stamp>.txt);
#   1 setup or API failure (nothing trustworthy written);
#   3 snapshot written, --require-converged given, but not all named runners converged.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

# fix_in_build <buildSha|""|null> — prints true/false/null. null = cannot tell
# (no sha reported, or sha unknown to the local repo). Uses the local Kainbain
# checkout as the commit database — read-only git queries only.
fix_in_build() {
  local sha="$1" repo_root="$2" fix_commit="$3"
  if [ -z "$sha" ] || [ "$sha" = "null" ]; then
    echo null
    return 0
  fi
  if ! git -C "$repo_root" cat-file -e "$sha^{commit}" 2>/dev/null; then
    echo null
    return 0
  fi
  if git -C "$repo_root" merge-base --is-ancestor "$fix_commit" "$sha" 2>/dev/null; then
    echo true
  else
    echo false
  fi
}

# verdict_for <runners.json> <runnerId> — prints the verdict JSON object for one
# runner (jq/runner-verdict.jq + the git ancestry check).
verdict_for() {
  local runners_json="$1" runner_id="$2" repo_root="$3" fix_commit="$4"
  local runner sha fix
  runner="$(jq -c --arg id "$runner_id" '.[] | select(.runnerId == $id) // empty' "$runners_json")"
  if [ -z "$runner" ]; then
    printf '{"runnerId":"%s","converged":false,"reasons":["runner not present in GET /runners (offline/revoked?)"]}\n' "$runner_id"
    return 0
  fi
  sha="$(printf '%s' "$runner" | jq -r '.facts.versions.build.sha // ""')"
  fix="$(fix_in_build "$sha" "$repo_root" "$fix_commit")"
  jq -n -f "$SCRIPT_DIR/jq/runner-verdict.jq" --argjson runner "$runner" --argjson fixInBuild "$fix"
}

main() {
  require_commands curl jq git date mktemp
  local outdir="${1:-}"
  [ -n "$outdir" ] || die "usage: runners-snapshot.sh <outdir> [--require-converged]"
  local require_converged=0
  if [ -n "${2:-}" ]; then
    [ "$2" = "--require-converged" ] || die "usage: runners-snapshot.sh <outdir> [--require-converged] — unexpected argument '$2'"
    require_converged=1
  fi
  [ $# -le 2 ] || die "usage: runners-snapshot.sh <outdir> [--require-converged] — unexpected extra argument '$3'"

  local api_base="${KAINBAIN_API_BASE:-http://192.168.1.206:3100}"
  local named="${KAINBAIN_S5_NAMED_RUNNERS:-local-alpha,server2-alpha}"
  [ -n "${named//[[:space:],]/}" ] || die "no named runners to check (KAINBAIN_S5_NAMED_RUNNERS is empty) — nothing to do"
  local fix_commit="${KAINBAIN_S5_FIX_COMMIT:-046a63917d52181d00efbd4a6624bd1c53131fa4}"
  local task_dir repo_root stamp
  task_dir="$(cd "$SCRIPT_DIR/.." && pwd)"
  repo_root="$(git -C "$task_dir" rev-parse --show-toplevel)"
  # Second precision: two snapshots in the same minute must not overwrite each other.
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$outdir"

  log "runners-snapshot api=$api_base outdir=$outdir named=$named fix=$fix_commit"

  local runners_json="$outdir/runners-$stamp.json" deploy_json="$outdir/deploy-status-$stamp.json"
  api_get_json "$api_base/runners" "$runners_json" \
    || die "GET $api_base/runners failed — nothing written to $outdir"
  # /runners must be an array of runner objects; anything else (an error
  # envelope, an HTML page that slipped through) would make every downstream
  # verdict meaningless, so stop here with a clear message.
  if ! jq -e 'type == "array"' "$runners_json" >/dev/null 2>&1; then
    rm -f "$runners_json"
    die "GET $api_base/runners returned valid JSON that is not an array — refusing to build a verdict from it"
  fi
  local deploy_ok=1
  api_get_json "$api_base/deploy/status" "$deploy_json" \
    || { log "WARN: GET /deploy/status failed — continuing with /runners only"; rm -f "$deploy_json"; deploy_ok=0; }

  jq -r -f "$SCRIPT_DIR/jq/runners-tsv.jq" "$runners_json" > "$outdir/runners-$stamp.tsv"

  local verdict_json="$outdir/verdict-$stamp.json" verdict_txt="$outdir/verdict-$stamp.txt"
  local verdict_body
  verdict_body="$(mktemp)"
  : > "$verdict_json.tmp.$$"
  local IFS=',' r all_converged=1 v
  # Named runners come from env, so tolerate "a, b" spacing and stray commas.
  # shellcheck disable=SC2086
  for r in $named; do
    r="${r//[[:space:]]/}"
    [ -n "$r" ] || continue
    v="$(verdict_for "$runners_json" "$r" "$repo_root" "$fix_commit")"
    printf '%s\n' "$v" >> "$verdict_json.tmp.$$"
    if printf '%s' "$v" | jq -e '.converged == true' >/dev/null; then
      printf 'CONVERGED    %s\n' "$(printf '%s' "$v" | jq -r '[.runnerId, .runnerVersion, (.buildSha // "no-sha")] | join(" ")')" >> "$verdict_body"
    else
      all_converged=0
      printf 'NOT-CONVERGED %s — %s\n' "$r" "$(printf '%s' "$v" | jq -r '.reasons | join("; ")')" >> "$verdict_body"
    fi
  done
  jq -s '.' "$verdict_json.tmp.$$" > "$verdict_json" && rm -f "$verdict_json.tmp.$$"

  {
    echo "# runner convergence verdict — $(date -u +%FT%TZ) — fix commit $fix_commit"
    echo "# converged = runnerVersion >= 0.2.x AND running build sha contains the fix commit"
    cat "$verdict_body"
  } > "$verdict_txt" && rm -f "$verdict_body"

  if [ "$deploy_ok" = 1 ]; then
    echo "wrote $outdir/runners-$stamp.{json,tsv} $outdir/deploy-status-$stamp.json $outdir/verdict-$stamp.{json,txt}"
  else
    echo "wrote $outdir/runners-$stamp.{json,tsv} $outdir/verdict-$stamp.{json,txt} (no deploy-status: GET /deploy/status failed)"
  fi
  cat "$outdir/runners-$stamp.tsv"
  echo "--- verdict:"
  cat "$verdict_txt"

  if [ "$require_converged" = 1 ] && [ "$all_converged" = 0 ]; then
    log "--require-converged: not all named runners converged (see $verdict_txt)"
    exit 3
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
