#!/usr/bin/env bash
# lib.sh — shared helpers for the S5 ops scripts in this folder (bin/).
# Sourced, never executed directly. Shared because every script here needs
# the same three things: loud logging, loud death, and a validated HTTP GET.
#
# Rule for this task folder: an ops evidence script must never silently
# degrade. Every helper below either succeeds completely or reports a clear
# error and returns non-zero, so a baseline built from these scripts is
# trustworthy.

# log <message...> — timestamped progress line on stderr. stdout stays clean
# because the scripts print evidence tables (jsonl/tsv) on stdout.
log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >&2
}

# die <message...> — report a clear, fatal setup/usage error and exit 1.
# Used where there is nothing to salvage (missing tool, unreachable API,
# bad arguments). Runtime per-item failures are handled by the callers
# (recorded, counted, non-zero exit at the end) — see fleet-recount.sh.
die() {
  log "FATAL: $*"
  exit 1
}

# require_commands <cmd...> — fail before touching anything if a tool is
# missing, so the failure is about the environment, not about half-written
# evidence files.
require_commands() {
  local missing=() cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    die "missing required commands: ${missing[*]} — install them or run on the runner host"
  fi
}

# write_atomic <dest> <src-file> — copy src-file next to dest and rename over
# it, so a crashed run never leaves a half-written evidence file that looks
# complete. Same directory => the final mv is an atomic rename.
# Returns non-zero (and leaves dest untouched) when either step fails.
write_atomic() {
  # NOTE: tmp gets its own statement on purpose. `local dest="$1" ...
  # tmp="$dest.tmp.$$"` in ONE declaration does NOT see the just-assigned
  # dest — bash expands it from the caller's scope, so it only worked while
  # every caller happened to have its own $dest (and died with
  # `dest: unbound variable` otherwise). Separate statements, no surprise.
  local dest="$1" src="$2" tmp
  tmp="$dest.tmp.$$"
  if ! cp "$src" "$tmp"; then
    rm -f "$tmp"
    log "ERROR: cannot write $dest (copy step failed)"
    return 1
  fi
  if ! mv "$tmp" "$dest"; then
    rm -f "$tmp"
    log "ERROR: cannot write $dest (rename step failed)"
    return 1
  fi
}

# api_get_json <url> <dest> — GET url into dest as validated JSON.
#   - retries transient network failures (curl --retry-connrefused)
#   - fails on any HTTP error status (curl -f, so a 500/404 body is NOT kept)
#   - refuses to store a 200 body that is not valid JSON (an HTML error page
#     must never end up in the evidence store)
#   - writes dest atomically
# Returns non-zero with a clear stderr line on any failure.
api_get_json() {
  local url="$1" dest="$2" tmp
  tmp="$(mktemp)"
  if ! curl -sfS -m 60 --retry 3 --retry-connrefused --retry-delay 2 -o "$tmp" "$url"; then
    rm -f "$tmp"
    log "ERROR: GET $url failed (HTTP error or host unreachable after retries)"
    return 1
  fi
  if ! jq -e 'type == "object" or type == "array"' "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"
    log "ERROR: GET $url returned a body that is not valid JSON — refusing to store it in $dest"
    return 1
  fi
  # Propagate the write result explicitly: without this, the status of the
  # `rm` below would mask a failed store and the caller would trust a file
  # that was never written.
  local write_rc=0
  write_atomic "$dest" "$tmp" || write_rc=$?
  rm -f "$tmp"
  return "$write_rc"
}

# validate_label <label> — recount/snapshot labels become file- and directory
# names (recount-<label>.jsonl, raw/<label>/...), so they must be a single
# safe path segment. Without this a label like "../../x" would write evidence
# outside the task folder.
validate_label() {
  local label="$1"
  if ! [[ "$label" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    die "bad label '$label' — use letters, digits, dot, dash, underscore only, starting with a letter or digit (e.g. before, mid-1431)"
  fi
}

# validate_task_prefix <prefix...> — task ids/prefixes get interpolated into
# shell commands (locally and over ssh) by e5-sweep.sh, so they must be hex
# and dashes only. Accepts a short prefix (8 hex chars) or a full UUID.
# This is the injection guard for the sweep: anything else is rejected before
# any command runs.
validate_task_prefix() {
  local p
  for p in "$@"; do
    if ! [[ "$p" =~ ^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4,12})*$ ]]; then
      die "bad task id prefix '$p' — expected 8 hex chars plus optional -hex groups (e.g. 7f6220c3 or the full UUID)"
    fi
  done
}
