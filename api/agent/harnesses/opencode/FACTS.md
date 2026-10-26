# OpenCode harness — verified facts

Facts about the OpenCode server/SDK this harness is built on, verified against
`@opencode-ai/sdk` 1.18.34 (bundled in this repo as
`opencode-ai-sdk-1.18.34.tgz`, installed into `api/`). Anything we could not
verify against a live `opencode` binary is marked UNVERIFIED-LIVE — the
behavior degrades safely either way.

## Server lifecycle

- The harness **spawns** `opencode serve` via the SDK's
  `createOpencodeServer({ hostname, port, timeout })` (which parses
  `opencode server listening on <url>` from the child's stdout) **or
  connects** to an already-running server when `OPENCODE_URL` is set.
- **One server per project** (`api/agent/harnesses/opencode/OpencodeServerManager.js`,
  registry keyed by `project.cwd`). Concurrent sessions for the same project
  reuse the server; `disposeAllOpencodeServers()` runs on engine shutdown
  (wired into `setupGracefulShutdown` in `api/index.js`).
- Readiness probe: `GET {baseUrl}/project/current` expecting **200**.
  UNVERIFIED-LIVE: OpenCode 1.18.x exposes no `/health` route in its OpenAPI
  spec (checked the bundled SDK's `types.gen.d.ts`), so the harness probes
  `/project/current`. If a future version ships `/health`, override with the
  manager's `healthPath` option.
- A spawned server that dies is detected on the next `ensureRunning()` (probe
  TTL 5 s) and respawned; the engine never blocks startup on OpenCode — the
  SDK is loaded lazily and only when a session or model list needs a server.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `OPENCODE_URL` | Connect to an already-running OpenCode server instead of spawning one per project. When set, an unreachable server is a hard error for session creation (the operator chose it). |
| `OPENCODE_SERVER_PASSWORD` | Sent as `Authorization: Bearer …` on every probe/request when set. UNVERIFIED-LIVE: whether `opencode serve` enforces this header on all routes. |
| `KAINBAIN_DEFAULT_HARNESS` | Engine-wide default harness (see `api/agent/harnessRegistry.js`); default `pi`. Projects opt into this harness with `project.harness = "opencode"`. |

## Endpoints used

| Endpoint | Use |
| --- | --- |
| `GET /project/current` | Readiness probe (200 expected). |
| `GET /config/providers` | Model discovery → `{ providers: Provider[], default: {providerID: modelID} }` (see `OpencodeModelDiscovery.js`). |
| `POST /session` | Create a server session (`{ id, title }`). |
| `GET /session/:id` | Verify a warm-start candidate still exists. |
| `GET /session/:id/message` | Authoritative message list after a turn (`[{ info, parts }]`). |
| `POST /session/:id/message` | One prompt turn; body `{ parts: [{type:"text",text}], model? }` where `model` is `{ providerID, modelID }` — the per-message model override. Returns the assistant message. |
| `POST /session/:id/prompt_async` | steer/follow-up turns: records the message and returns immediately. |
| `POST /session/:id/abort` | Stop the current run. |
| `GET /event` | SSE event stream, scoped to a project directory via `?directory=` (the SDK client rewrites the `x-opencode-directory` header). |

Directory isolation: the harness builds its SDK client with
`createOpencodeClient({ directory: project.cwd })`; the SDK sends
`x-opencode-directory` and rewrites GETs to `?directory=…`, scoping sessions
and events per project (verified in the bundled SDK's `client.js`).

## SSE event names (raw, 1.18.x `Event` union)

The harness consumes: `session.created`, `session.updated`, `session.deleted`,
`session.status`, `session.idle`, `session.error`, `session.compacted`,
`message.updated`, `message.removed`, `message.part.updated`,
`message.part.removed`. Everything else (permissions, todos, files, pty, tui)
is declined in translation.

Translation to the engine's normalized vocabulary
(`api/agent/harnesses/opencode/opencodeSessionEvents.js`):

| Normalized | OpenCode source |
| --- | --- |
| `run_started` | `session.status` (busy) |
| `message_started` | `message.updated` (assistant, not yet completed) |
| `assistant_delta` | `message.part.updated` text delta (`text_delta`) / reasoning delta (`thinking_delta`) |
| `tool_started` | `message.part.updated` tool part pending/running |
| `tool_finished` | `message.part.updated` tool part completed / error |
| `run_finished` | `session.idle` |
| `run_error` | `session.error` |

`session.status` retry is deliberately **declined** (transient; failing the
stage on a retriable model hiccup would be wrong). `session.created` and the
bookkeeping events are declined. Unknown events never pass through — raw
names must not leak past the harness boundary (enforced by
`api/agent/harnessBoundary.test.js`).

## Model selection semantics

- OpenCode models are **per-message**: the prompt body carries
  `model: { providerID, modelID }`. `switchModel(ref)` therefore stores the
  override and every later turn keeps using it (sticky, matching pi's
  `setModel` semantics) until changed.
- Stored references (`provider::id`) are resolved against the
  `/config/providers` list; unresolvable refs return `null` and the engine
  warns visibly instead of silently swapping models.
- Discovery caches with a TTL (30 s) and degrades to `[]`/`null` when the
  server is unreachable — never throws into session creation.

## Transcript persistence

- `<project cwd>/.kainbain/opencode_transcript.jsonl` — one JSON object per
  line: `{ ts, sessionId, message: { id, role, content } }`.
- Every user turn (prompt/steer/follow-up) and completed assistant turn is
  appended; `readHistoryFromDisk` reads it back without a live server.
- Interactive sessions warm-start: the last transcript session id is verified
  against the server (`GET /session/:id`) and reused; stage sessions
  (`taskId`/`stageId` present) always start fresh.

## Contract tests

`opencodeHarness.contract.test.js` runs the shared conformance suite
(`api/agent/sessionContract.test.js`) against the REAL SDK client talking HTTP
to the in-process stub (`opencodeMockServer.js`) — only the server is faked.
