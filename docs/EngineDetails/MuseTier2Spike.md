# Muse Tier 2 Spike — `muse serve` (MSP) as the two-way transport

- **Status:** spike (probe-verified 2026-10-16 against `muse` 1.4.9, echo provider + schema export).
- **Question:** what lifts the `muse` harness from Tier 3 (one `muse exec` per turn) to Tier 2 (ACP / separate programmatic invocation with two-way steering)?
- **Answer in one line:** a long-lived `muse serve` MSP session host owned by the engine, kept behind an `auto/off` transport flag with the current `exec` path as rollback — the same rollout shape the `vibe` harness used for `vibe-acp`.
- **Companion docs:**
  - Tier definitions: [HarnessSupportTeirs.md](./HarnessSupportTeirs.md).
  - Current-vs-max table: [HarnessSupportLevels.md](./HarnessSupportLevels.md) (`muse`: current Tier 3, max Tier 2).
  - Current exec integration: [MuseHarness.md](./MuseHarness.md).
  - Closest in-repo precedent (serve-style Tier 2): `api/agent/harnesses/opencode/`.
  - Reusable supervision patterns (NOT the wire client): `api/agent/harnesses/acp/`.

## 1. What Tier 2 actually requires

From [HarnessSupportTeirs.md](./HarnessSupportTeirs.md), Tier 2 means ALL of:

- A dedicated interface designed for programmatic use (ACP, MCP server, or equivalent) — not `harness -p "prompt"` on stdio.
- Two-way communication between KainBain and the harness.
- KainBain can intervene in, steer, or otherwise interact with a RUNNING session (not just start one and read stdout).
- Config may live mostly in the harness, but the engine holds a live session handle.

Consequences for `muse`:

- Streaming JSONL output alone never qualifies (that is still Tier 3 — see the round-down calls in [HarnessSupportLevels.md](./HarnessSupportLevels.md)).
- Pre-authorising approvals (`--yolo` / `--approval-mode never`) never qualifies either — that is one-way policy, not interception.
- Multi-turn continuity alone (`exec --session-id` chaining) is necessary but NOT sufficient — without mid-turn steering and permission interception it is still Tier 3, just a better Tier 3.
- The bar is: persistent session + live steering + permission interception + model control, all over one supervised channel.

## 2. Where we are today (Tier 3)

```
Engine stage turn
  │
  │  ONE process per prompt(text)
  ▼
muse exec --workspace <cwd> --approval-mode never --json [--yolo] <prompt>
  │
  │  NDJSON exec stream (stdout only, fire-and-forget)
  │  run.output.delta  → assistant_delta
  │  tool.*            → tool_started/updated/finished
  │  run.terminal.*    → run_finished / run_error
  ▼
Process exits → settle → process reaped. Nothing persists
except the ~/.local/share/muse session log (which we only read
via `muse export`, and today we do not even do that).
```

- Today's strengths (keep all of these whatever we build):
  - Probe-verified wire fixtures (`api/agent/harnesses/muse/fixtures/`) that fail loudly on upstream drift.
  - Parser keys on `payload_type`, never `record_type` (the `run.output.delta`-is-`status` trap).
  - Terminal-record discipline (`run.terminal.*` only — `task.lifecycle.*` is noise).
  - Spawn-plan guard (`assertSafeMuseArgs`: `--workspace` always pinned, `--yolo` only from the explicit setting).
  - Redacted child env, engine-side watchdog, `[MUSE]` spawn/settle observability, no prompt text in logs.
  - Full harness-contract conformance suite.
- Today's Tier 2 gaps (one bullet per missing capability):
  - No persistent channel — every turn is a cold spawn; no notion of a live session the engine holds.
  - No mid-turn steering — `prompt()` while streaming throws ("already running a prompt").
  - No permission interception — approvals are pre-answered by flags, never decided per request.
  - No model catalogue — `listModels()` is `[]`, `switchModel()` is a warn-and-null no-op.
  - No history — `readHistoryFromDisk()` returns `{ messages: [], tree: [] }`.
  - No usage telemetry — only exit code + duration + stderr size.

## 3. Target shape (Tier 2 over `muse serve`)

```
KainBain project session
  │
  │  ONE host per project cwd (OpencodeServerManager pattern),
  │  or ONE host per KainBain session (vibe-acp pattern) —
  │  see open question O-1 below.
  ▼
muse serve --provider meta [--model <id>] [--trust-workspace]   (long-lived)
  │  ▲
  │  │  NDJSON JSON-RPC 2.0 over stdio (PROBE-VERIFIED, §5)
  │  │
  │  │  client → host : initialize / session/start / session/resume /
  │  │                  session/setModel / session/setApprovalMode /
  │  │                  model/list / turn/start / turn/steer /
  │  │                  turn/cancel / turn/interrupt / approval/decide
  │  │  host → client : item/delta+started+completed / turn/started+completed /
  │  │                  session/tokenUsage+contextUsage / approval/requested /
  │  │                  userInput/requested / session/statusChanged
  ▼  │
MspSessionRuntime (new; mirrors AcpSessionRuntime SUPERVISION only)
  │
  │  normalized agent events (reuse the existing museEventMapper SHAPE
  │  vocabulary: assistant_delta, tool_*, run_finished, run_error)
  ▼
Existing HarnessSession surface + newly-honest methods:
steer() → turn/steer · abort() → turn/interrupt · listModels() → model/list ·
switchModel() → session/setModel · approval policy ← approval/request
```

- What changes vs today:
  - `prompt()` becomes `turn/start` on a held session instead of a fresh spawn.
  - `steer()` stops throwing and issues `turn/steer` with `expectedTurnId` (race-safe by construction).
  - `abort()` becomes `turn/interrupt` (priority lane) instead of SIGTERM.
  - Approvals become per-request decisions (`approval/request` → policy → `approval/decide`) instead of pre-authorised flags.
  - Models become live (`model/list` → catalogue, `session/setModel` → pin), so `modelSelection` flips from `"none"` to `"list"`.
  - Telemetry becomes live (`session/tokenUsage`, `session/contextUsage`, `usage/read`) instead of exit-code only.
- What stays:
  - The exec path, untouched, as the `off` rollback.
  - Every Tier 3 safety property (workspace pin, redacted env, watchdog, no prompt text in logs).
  - The normalized event vocabulary — only the transport changes, not the engine contract.

## 4. Approaches compared

- Four approaches were considered:
  - **A. Full MSP client (recommended):** speak the `serve` protocol over stdio with a purpose-built client.
  - **B. Exec-plus (cheap, keeps Tier 3):** squeeze every incremental flag out of `muse exec` without a persistent channel.
  - **C. ACP-shim:** force MSP through the existing generic ACP core.
  - **D. Hybrid rollout (how A ships):** A behind an `auto/off` flag with B's cheap wins landing first.
- Approach A — full MSP client:
  - Build `api/agent/harnesses/muse/msp/` with:
    - `MspSessionRuntime.js` — spawn + supervise ONE `muse serve` host (detached process group, SIGTERM→SIGKILL, stderr ring, handshake ceiling — copy the SUPERVISION contract from `AcpSessionRuntime.js`, not its wire code).
    - `MspClientConnection.js` — NDJSON JSON-RPC 2.0 framing, pending-request map by `id`, server→client `approval/request` + `userInput/request` handler hooks.
    - `museMspSupport.js` — the flavor adapter (method names, capability quirks, event→normalized mapping), mirroring `vibeAcpSupport.js`.
    - `museMspEventMapper.js` — `item/delta` → `assistant_delta`, `turn/completed` → `run_finished`, `session/tokenUsage` → usage telemetry, `approval/requested` → policy decision.
  - Wire the harness with `selectMuseTransport()` (`auto`/`on`/`off`, mirroring `KAINBAIN_VIBE_ACP`), per-session `session/start`, `turn/start` per `prompt()`, `turn/steer` per `steer()`, `turn/interrupt` per `abort()`.
  - Prove it with the echo provider (`muse serve --provider echo` needs no credentials — hermetic contract tests, same role the mock plays for exec today).
- Approach B — exec-plus (do these ANYWAY, they are cheap and independent of A):
  - `--model` passthrough: `buildMuseSpawnPlan` ALREADY accepts `modelId`, but the harness always passes `null` — plumb the resolved model through and flip `modelSelection` when a catalogue exists.
  - `--session-id` chaining: `exec` accepts `--session-id` — reuse one id per KainBain session for continuity (multi-turn context without a persistent channel).
  - `readHistoryFromDisk` via `muse export --session <id> --redacted` (today a stub returning empty).
  - Image dispatch via `exec --image` (repeatable) — check against `api/agent/visionSupport.js`, which currently reports `false` for muse.
  - `session-message send` as a best-effort follow-up injector (note: it is NOT steering — it addresses a session, not a running turn).
  - Honest ceiling: B improves Tier 3 but NEVER reaches Tier 2 (no running-turn interaction, no interception) — ship it as "Tier 3+" and say so.
- Approach C — ACP-shim (NOT recommended):
  - Tempting because `api/agent/harnesses/acp/` already exists and vibe/antigravity share it.
  - Rejected on the wire facts: MSP is NOT ACP (different methods, different lifecycle, view-cursor subscriptions, UUIDv7 idempotency handles, closed approval-mode enum) — a shim would translate one structured protocol into another with impedance mismatch at every seam (steer semantics, approval races, turn dispositions).
  - Reuse from the ACP core should be limited to SUPERVISION patterns (process groups, kill escalation, stderr rings, handshake timeouts), copied — not imported.
- Approach D — hybrid rollout (the actual plan):
  - Phase 0: land B's cheap wins on the exec path (model passthrough, session-id chaining, export history) — each independently shippable and testable.
  - Phase 1: `MspSessionRuntime` + handshake + `session/start` + `turn/start` + event mapping behind `KAINBAIN_MUSE_MSP=off` default (echo-provider tests only).
  - Phase 2: flip default to `auto` (MSP when the binary supports `serve`, exec otherwise), keeping `off` as the documented rollback — exactly the `KAINBAIN_VIBE_ACP=auto/off` shape operators already know.
  - Phase 3: add `turn/steer`, `approval/request` interception, `model/list` catalogue, `session/resume` reconnect — then flip the registry `supportTier` to `"2"`.
  - The tier flip is LAST, after all four Tier 2 bullets in §1 hold — never before.

## 5. Probe evidence (the facts D rests on)

- Handshake (echo provider, no credentials needed):
  - `initialize` (NDJSON `{"jsonrpc":"2.0","id":…,"method":"initialize",…}` on stdin) → result with `serverInfo`, `schema.fingerprint`, `sandboxAvailability`, `sessionDurability`.
  - GOTCHA-1: after `initialize` you MUST send the `initialized` NOTIFICATION, or every later call fails with `notInitialized` — standard LSP-style two-step, easy to miss.
  - Fingerprint observed: `sha256:5d3b43e5ccdb7dc4f5a32c380f5f2cde0f10e3059b93610afb2e73f73b1d914c` (schema v1) — pin fixtures against `muse schema generate-json-schema`, same drift-fails-loudly role as the exec fixtures.
- Catalogue (works TODAY, no turn needed):
  - `model/list` → 3 live rows (`muse-wonder-1.0`, `muse-spark-1.3`, `muse-spark-1.2`, `source: "providerCatalog"`, context/output limits included).
  - This single call unblocks `listModels()` + `session/setModel` — the cheapest Tier 2 bullet.
- Session + turn lifecycle (echo round-trip observed end to end):
  - `session/start` → `{ session: { sessionId, workspaceRoot, approvalMode, status: "idle", … }, viewCursor }` + `session/started` notification.
  - GOTCHA-2: `commandId` MUST be UUIDv7 — a UUIDv4 is rejected with `invalid session/start commandId: expected UUIDv7` (needs a tiny generator; `crypto.randomUUID()` is v4 and will NOT do).
  - GOTCHA-3: the session key is `session.sessionId`, and the workspace param is `workspaceRoot` (not `--workspace`/`cwd`/`workdir` spellings).
  - `turn/start` → `{ disposition: "started", turnId, status: "accepted" }` (take `turnId` from the ACK, never derive it).
  - Stream: `session/statusChanged(running)` → `turn/started` → `item/*` (`userMessage`, then `agentMessage` via `item/started` + `item/delta` + `item/completed`) → `session/tokenUsage` + `session/contextUsage` → `turn/completed{terminal:"completed"}` → `session/statusChanged(idle)`.
  - Echo noise to expect in tests: `reminderChild` items (skill/goal/verify reminders) that fail harmlessly on the echo provider (`provider does not support base instructions`) — assert on the `agentMessage` + `turn/completed` spine, never on exact notification counts.
- Concurrency model (from schema, not yet live-probed — Phase 2 work):
  - `turn/start` takes `ifBusy: queue | steer | replace` (default `queue`) — maps directly onto the engine's queue-vs-steer semantics.
  - `turn/steer` takes `{ expectedTurnId, input }` — input for turn A can never leak into turn B (the race guard is server-side).
  - `turn/cancel` (normal lane) vs `turn/interrupt` (priority lane, optional retract) — `abort()` should use `interrupt`.
  - `approval/request` (server→client request while the turn stays open) + `approval/decide` (guarded by requirement id against the multi-stage race) — the interception primitive YOLO currently bypasses.
  - `session/setApprovalMode` selects from a CLOSED enum (`allowAll | promptUnmatched | onRequest | denyUnmatched`) — select-never-create, so the YOLO default becomes a per-session mode choice, not a spawn flag.
  - `usage/read`, `session/read`, `session/list`, `session/resume`, `session/compact`, `session/fork`, `media/upload`, `userInput/*` round out the surface — implement ONLY the §3 subset; the schema exports 69 methods and most are TUI surface, not engine needs.

## 6. Tradeoff matrix

- Legend: `++` clear win, `+` mild win, `~` neutral, `-` mild cost, `--` heavy cost.

```
Dimension                  │ A: MSP client │ B: exec-plus │ C: ACP-shim
───────────────────────────┼───────────────┼─────────────┼─────────────
Reaches Tier 2             │ ++ yes        │ -- no       │ + maybe, badly
Mid-turn steer             │ ++ turn/steer │ -- none     │ ~ via mistranslation
Permission interception    │ ++ per-request│ -- flags    │ - lossy mapping
Live model catalogue       │ ++ model/list │ + partial* │ + same as A
Multi-turn continuity      │ ++ session    │ + session-id│ ++ session
Usage/cost telemetry       │ ++ live rows  │ -- exit-only│ ++ live rows
Cold-start latency         │ + one host    │ - spawn/turn│ + one host
Blast radius of host crash │ - sessions die│ ++ isolated │ - sessions die
Implementation effort      │ -- new client │ ++ days     │ - shim+drift
Protocol drift risk        │ - fingerprint │ - flags     │ -- double drift
Test hermeticity           │ ++ echo prov. │ ++ mock bin │ + echo via shim
Fits existing ACP core     │ ~ patterns    │ ~ n/a       │ -- mismatch
Operator rollout risk      │ + auto/off    │ ++ trivial  │ - new+lossy
```

- Footnotes:
  - `*` B's model story caps out at `--model` passthrough plus whatever `model-profile show` can statically confirm — no live catalogue, no per-session switching.
  - A's host-crash row is mitigated by `session/resume` (durable `session.jsonl`) + a supervised restart — design for reconnect from day one, not as a v2.
  - Drift risk is NORMALISED by pinning the schema fingerprint in fixtures and re-exporting per muse upgrade — same discipline as today's exec fixtures.

## 7. Design constraints the implementation must respect

- Transport framing:
  - NDJSON JSON-RPC 2.0, stdout is protocol-only, stderr is diagnostics (same rule as the ACP core — never parse stderr as frames).
  - Every client→host command carries a UUIDv7 `commandId` (idempotency handle — deduped retries return the same result).
  - Server→client arrives as BOTH notifications (`item/delta`, `turn/completed`, …) AND requests (`approval/request`, `userInput/request`) — the client must answer requests while notifications stream (pending-request map + inbound-request hook, like `AcpClientConnection` but MSP-shaped).
- Security posture (non-negotiable, carried over from exec):
  - `workspaceRoot` pinned to the project cwd on `session/start` — never the daemon cwd.
  - Child env stays allowlisted + secret-redacted (muse authenticates from `~/.config/muse`).
  - Sandbox posture is fixed FOR THE HOST LIFETIME (`serve` flags) — unlike exec where each spawn chooses; the YOLO-vs-sandbox decision moves from per-turn argv to host construction + per-session approval mode. Record the escalation decision loudly if sandbox stays off.
  - No prompt text in logs (argv SHAPE discipline extends to method PARAM SHAPES — log method names + sizes, never input text).
  - Approval policy must default-deny on unknown option shapes (closed enums grow by deliberate protocol change — fail closed).
- Session lifecycle:
  - Prefer one host per project cwd (opencode pattern) with one MSP session per KainBain session; `session/resume` on reconnect; dispose the host when the project goes idle (TTL sweep, same as today).
  - `turn/start` response `disposition` is authoritative (`started` vs absorbed) — branch queue-vs-steer on it, not on local guesses.
  - `viewCursor` subscriptions survive reconnect — store the cursor per session and re-subscribe after resume.
- Backpressure and limits:
  - Keep the 64 KiB prompt-file habit for giant prompts (turn input parts carry the same bytes a spawn argv once did).
  - Keep the engine-side watchdog per turn AND add a handshake ceiling (30 s, ACP parity) — a host that never answers `initialize` is hung, not slow.
  - `item/delta` floods are the new stdout floods — bound, decode incrementally, never buffer a whole turn to parse at the end.

## 8. Test plan (mirrors the vibe ACP precedent)

- Unit:
  - Frame parser (split lines, 1 MiB line cap, garbage-line policy) — table-driven, no binary.
  - Event mapper (`item/*` → normalized vocabulary, `turn/completed{terminal}` → settle, reminder-child noise ignored) — seeded from captured echo transcripts.
  - UUIDv7 generator (version bits, monotonicity under burst).
  - Spawn-plan guard for `serve` (workspace pin required, `--disable-sandbox` only from the explicit setting — same provenance rule as `--yolo` today).
- Contract (hermetic, echo provider — no credentials, no network):
  - Handshake → `model/list` non-empty → `session/start` → `turn/start` → first `item/delta` → `turn/completed` → `session/statusChanged(idle)`.
  - `turn/steer` into a running turn lands in THAT turn (`expectedTurnId` mismatch is refused, never leaks).
  - `approval/request` answered by policy; unknown option shape default-denies.
  - Host kill → supervised restart → `session/resume` continues the session.
- Live (meta provider, logged-in box, nightly — never in the gate):
  - One real tool-using turn asserting `tool_*` events reach task logs (exec has this today via `tool-call.real.jsonl` — MSP needs the same proof).
  - Sandbox-on run proving workspace writes succeed under `onRequest` (the open R-07 item from [MuseHarness.md](./MuseHarness.md) transfers to MSP scope).
- Fixtures to capture:
  - `msp-handshake.echo.jsonl`, `msp-turn.echo.jsonl`, `msp-model-list.json`, schema fingerprint file — refreshed per muse upgrade, diff-reviewed like today's exec fixtures.

## 9. Open questions

- O-1: host scope — one `serve` per project cwd (opencode precedent, shares warm sessions across KainBain sessions) vs one per KainBain session (vibe-acp precedent, simpler lifecycle)? Recommendation: per-project host, per-KainBain-session MSP session — but confirm against memory budget on the homelab box first.
- O-2: who answers `approval/request` before the approval UI exists? Options: (a) keep today's operator-chosen YOLO semantic as `allowAll` per-session mode (fastest, preserves current risk posture explicitly); (b) default-deny with auto-retry as exec (safest, breaks tool-using stages until the UI lands). Recommendation: (a) with a per-decision log line, flipped when the UI lands — same deal as today's `KAINBAIN_MUSE_YOLO` default.
- O-3: `userInput/*` (question cards, clarifications) — answer `cancel` by policy in v1 and surface a log line, or plumb into stage failback? Recommendation: cancel-by-policy in v1; the turn completes without the answer and the stage judges the partial output like any short turn.
- O-4: does `session/setModel` mid-session break `session/resume` continuity (model recorded durably per session)? Probe on meta provider before advertising per-stage model switching.
- O-5: `media/upload` + turn image parts vs today's `visionSupport=false` — is vision within Tier 2 scope or a separate milestone? Recommendation: separate; note the `TurnInputPart` image shape exists when that work starts.
- O-6: schema experimental surface (`--experimental` export) — track or ignore? Recommendation: ignore until a needed capability (e.g. richer steer dispositions) is only there; record the fingerprint of stable only.

## 10. Recommendation

- Do D: land B's cheap wins first (each a small, reviewable diff that pays off even if A stalls), then build A in four gated phases with the exec rollback intact at every step, and flip `supportTier` to `"2"` only when §1's four bullets demonstrably hold.
- Do NOT do C (the ACP-shim) — shared supervision patterns, yes; shared wire client, no.
- Concretely, the first three diffs are:
  - Diff 1 (exec-plus): plumb model through `--model`, add `--session-id` chaining, implement `readHistoryFromDisk` via `muse export --redacted` — stays Tier 3, closes the embarrassment gap.
  - Diff 2 (MSP skeleton): `MspSessionRuntime` + handshake + `model/list` + `session/start` + echo-provider contract test behind `KAINBAIN_MUSE_MSP=off` — no behavior change, proves the channel.
  - Diff 3 (MSP turns): `turn/start` + event mapping + `turn/interrupt` abort + `auto` default with exec fallback — the point where the harness starts EARNING Tier 2.
- And fix the stale line in [MuseHarness.md](./MuseHarness.md) that calls the dedicated harness "Tier 1" (it is Tier 3 in code and in [HarnessSupportLevels.md](./HarnessSupportLevels.md)) — while writing this spike, that wording already confused one reader.
