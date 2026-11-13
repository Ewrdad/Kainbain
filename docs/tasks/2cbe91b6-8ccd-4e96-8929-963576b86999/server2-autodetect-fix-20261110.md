# server2 auto-detect fix — verification record (2026-11-10)

## Root cause of the human-reported failure

server2's runner env (`~/.kainbain/runner-server2-alpha.env`) pinned
`KAINBAIN_RUNNER_HARNESS=muse`, so the daemon's harness list was
`['muse']` and the discovery round only ran the muse leg — journal showed
`Model discovery: 0 model(s) (muse:0)` on every Re-detect, even with the
latest runner code deployed. On top of that, the Runner's harness
auto-detect probed only PATH, and server2's systemd PATH
(`/usr/bin:/usr/local/bin:/usr/bin:/bin`) does not include
`~/.local/bin` or `~/.pi/agent/bin`, so even `auto` would have missed pi
(the backend's own `discoverHarnesses` detects pi via the
`~/.pi/agent/models.json` snapshot, not PATH).

## Fix

- `runner/daemon.js` `detectAvailableHarnesses` now probes PATH + standard
  install dirs (`~/.local/bin`, `~/bin`) + per-harness install dirs
  (pi: `~/.pi/agent/bin`, `$PI_AGENT_DIR/bin`) + `KAINBAIN_*_BIN` overrides,
  and pi additionally via its `models.json` snapshot — reusing
  `standardSearchDirs`/`piSnapshotPath`/`DISCOVERY_ENV_VARS` from
  `api/agent/harnessDiscovery.js` so Runner and backend detect the same
  harnesses on the same host. `probeHarnessVersions` resolves binaries
  through the same dirs (pi now reports a real version, not "unknown").
- `startRunner.sh` `detect_harnesses` probes the same set at install time.
- server2 ops: env switched to `KAINBAIN_RUNNER_HARNESS=auto` (backup kept
  beside it), updated `runner/daemon.js` + `startRunner.sh` copied to the
  deployed bundle (md5-verified identical), `systemctl --user restart
  kainbain-runner-server2-alpha.service`.

## Live verification on server2 (backend http://192.168.1.206:3100)

Boot seed (journal, 16:31:33):

```
Model discovery: 77 model(s) (pi:77, muse:0); next refresh per modelDiscoveryIntervalMs.
```

`GET /runners` → server2-alpha `status: active`,
`capabilities.harnesses: [{id: pi, version: 1.5.0}, {id: muse, version: Muse Code 1.4.15 ...}]`,
`capabilities.models`: 77 `pi::…` ids,
`capabilities.discoveryStatus: {pi: {ok: true, count: 77, ...}, muse: {ok: true, count: 0, ...}}`.

Refresh-button path (the UI "Re-detect models" → `requestModelRediscovery`):

```
POST /runners/server2-alpha/commands {"command":"requestModelRediscovery"} → 202 queued
journal 16:32:48: Runner command: re-detecting models
                 Model discovery: 77 model(s) (pi:77, muse:0)
GET /runners → commands.results.requestModelRediscovery:
  { ok: true, detail: "discovered 77 model(s) (pi:77, muse:0)" }
  (rendered by RunnerConfigurationSection as the last re-detection line)
```

Fleet catalogue: `GET /runners/models/catalogue` → 82 `pi::` entries with
`runnerIds: ["server2-alpha"]` — the picker shows them as normal fleet
choices with the runner-count badge.

Unit tests: `node --test runner/daemon.test.js` 105 pass (incl. 7 new
detection cases: standard dirs off PATH, `~/.pi/agent/bin`, pi snapshot,
`$PI_AGENT_DIR` snapshot, `KAINBAIN_*_BIN` direct path + bare name,
synthetic-mode isolation from the real `~/.pi`); full runner suite
300 pass.
