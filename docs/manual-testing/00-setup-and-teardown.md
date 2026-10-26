# 00 — Setup, safety gate, and teardown

All mutating tests run on this disposable stack. It mirrors the canary-e2e
scratch design: isolated project/notes roots, isolated circuit-breaker file,
scheduler disabled, mock harness (no credentials, no real model calls).

## MT-SETUP-01 — Start the isolated scratch stack

**Type:** Setup (required before files 02–08). **Priority:** P0.

Preconditions: source checkout at `~/projects/kainbain`
(adjust `KB_SRC` if yours differs); Node `^20.19 || >=22.12`; ports
3417 and 5417 free (`ss -tlnp | grep -E '3417|5417'` shows nothing).

```bash
export KB_SRC=~/projects/kainbain
export RUN_ID=$(date +%Y%m%d)-a1          # reuse this exact value all run
export MT_ROOT=/tmp/kb-manual-$RUN_ID
export BASE=http://localhost:3417
export UI=http://localhost:5417
mkdir -p "$MT_ROOT/projects" "$MT_ROOT/notes" "$MT_ROOT/engine"

setsid -f env PORT=3417 \
  PROJECTS_ROOT="$MT_ROOT/projects" \
  NOTES_SPACE_ROOT="$MT_ROOT/notes" \
  KAINBAIN_DISABLE_SCHEDULER=true \
  KAINBAIN_CIRCUIT_STATE_FILE="$MT_ROOT/engine/circuit.json" \
  KAINBAIN_DEFAULT_HARNESS=mock \
  KAINBAIN_SEED_SAMPLE_PROJECTS=true \
  KAINBAIN_VIBE_ACP=off KAINBAIN_MUSE_MSP=off \
  node "$KB_SRC/api/index.js" </dev/null >>"$MT_ROOT/api.log" 2>&1

# UI (only needed for file 05; skip for API-only runs)
setsid -f env VITE_API_BASE=$BASE VITE_WS_URL=ws://localhost:3417 \
  npm run dev --prefix "$KB_SRC/frontend" -- --port 5417 --strictPort \
  </dev/null >>"$MT_ROOT/ui.log" 2>&1

sleep 4
curl -s -o /dev/null -w "api %{http_code}\n" $BASE/status
curl -s $BASE/status | head -c 300; echo
[ -n "$UI" ] && curl -s -o /dev/null -w "ui %{http_code}\n" $UI/
ss -tlnp | grep -E '3417|5417'   # record both PIDs in the run log
```

Expected:

- API returns `200` with `"status":"ok"` and `engine.status:"idle"`,
  `openQueueDepth:0`. Seeded projects `Project A`–`Project D` exist
  (`curl -s $BASE/projects`).
- UI (if started) returns `200` and shows the KainBain board for a seeded
  project. Title matches `KainBain`.

Cleanup: none yet — teardown is MT-SETUP-03. If startup fails, run
MT-SETUP-03 anyway, then check `$MT_ROOT/api.log`.

## MT-SETUP-02 — Prove isolation from live data (safety gate)

**Type:** Safety. **Priority:** P0. Run once, before any mutating test.

Steps:

1. `curl -s http://localhost:3100/projects` — note the live project names.
2. `curl -s $BASE/projects` — scratch names must be only the seeded set.
3. Create nothing yet. Confirm scratch roots are under `/tmp`:
   the seeded project's `cwd`/`notesPath` in step 2 start with `$MT_ROOT`.

Expected: no live project name appears in scratch, and no scratch path
points into `~/projects`, the live notes space, or `~/.kainbain`.

Cleanup: none. If this fails, **stop** — do not run mutating tests;
fix the env vars in MT-SETUP-01 and restart via MT-SETUP-03 + MT-SETUP-01.

## MT-SETUP-03 — Teardown and "no leftovers" proof

**Type:** Teardown (required at end of run, and after any failed setup).
**Priority:** P0.

```bash
# Stop ONLY the PIDs you recorded in MT-SETUP-01 (verify cmdline first):
ps -o pid,cmd -p <API_PID> <UI_PID>
kill <API_PID> <UI_PID> 2>/dev/null; sleep 2
curl -s -m 2 $BASE/status || echo "scratch api stopped OK"
curl -s -m 2 $UI/        || echo "scratch ui stopped OK"

# Live service must be untouched:
curl -s -o /dev/null -w "live %{http_code}\n" http://localhost:3100/status/health

# Remove disposable state (all under /tmp, created by this run only):
rm -rf "$MT_ROOT"
ls /tmp | grep "kb-manual-$RUN_ID" || echo "no leftovers in /tmp"
```

Expected: scratch ports refuse connections; live `:3100` still `200`;
no `MT $RUN_ID` projects/tasks remain anywhere (they lived only in
`$MT_ROOT`); `git -C $KB_SRC status --short` shows no new changes
attributable to the test run (stage reports created by mock runs live
under the scratch project cwd, already deleted).

Cleanup: this is the cleanup. If a PID's cmdline is not your scratch
`node …/api/index.js` / vite on 3417/5417, do **not** kill it — record it
in the run log and leave it running.
