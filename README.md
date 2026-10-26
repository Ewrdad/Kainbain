# KainBain

An AI task orchestrator. Define a multi-stage workflow pipeline, submit tasks,
and watch an AI agent execute each stage while you review, reject, or re-route
work through a kanban board.

## Architecture

- **`api/`** — Fastify backend. Thin HTTP + WebSocket layer over a set of
  domain stores (`ProjectStore`, `TaskStore`, `SessionStore`, `TaskQueue`) and
  the PI Agent SDK. Sessions are disk-persisted and isolated per project.
- **`frontend/`** — React (Vite) UI. State is centralized in a context
  composed from domain hooks; components stay thin.
- **`canary-e2e/`** — Playwright smoke tests that drive a live backend and
  assert no major errors across the main screens.

## Documentation ownership during the hackathon

- **Docs Steward (rotating role):** the reviewer of any PR touching top-level docs
  (`README.md`, `AGENTS-MAP.md`, `agents.md`, `DEPRECATIONS.md`, `site-docs/`). No
  dedicated individual is assigned; if no volunteer steps forward, the domain reviewer
  for the most-affected area (Work / Flow / Crew / Watch / House) fills it by default.
  Role titles only — no person's name is recorded here (audit WP-10, survey q1).
- **Owner roster:** Work reviewer (`api/work/`, `api/taskStore.js` facade,
  `frontend/src/components/tasks/`); Flow reviewer (`api/flow/`, `api/workflowRegistry.js`,
  `frontend/src/components/workflow/`); Crew reviewer (`api/crew/`, `api/agent/`,
  `api/models.js`, `api/sessionStore.js`, `shared/modelKeys.js`); Watch reviewer
  (`api/watch/`, `api/agent/logStream/`, log/report surfaces); House reviewer
  (`api/house/`, `api/projectStore.js`, `api/config.js`, `api/index.js`, settings
  components); Docs Steward (top-level docs). Full table: `AGENTS-MAP.md` and
  `docs/ARCHITECTURE_DOMAINS.md`.
- **PR checklist for doc-touching changes:**
  - `npm run docs:check` is green locally.
  - New/changed backticked paths resolve to real files.
  - `AGENTS-MAP.md` updated if a module moved or a new module was added.
  - `shared/` public constants unchanged unless the change is intentional and cross-cited.

## Quickstart (pick one)

Every path below cold-starts from a fresh public clone with no homelab
access and no credentials — pick the one that fits your machine:

- **Docker (fastest, no credentials needed):**
  `docker compose up -d` → UI at <http://localhost:3100>.
- **Native dev (macOS/Windows/Linux):**
  `npm run setup` once, then `npm run dev` → UI at
  <http://localhost:5173>, API on `:3100`.
- **Work/corporate laptop:** either of the above, plus proxy/CA/offline
  notes — see the guide.

Full step-by-step for all three (clone → run → verify, including the
storage-sanity checklist that guards against the empty-board incident
class): [`PORTABLE_DEPLOYMENT.md`](PORTABLE_DEPLOYMENT.md). New here? The
in-app First-Time Setup guide (`#/docs/first-time-setup`, also served as
`GET /docs/first-time-setup`) walks the full ordered path: install →
configure → run → verify → first project.

## Getting started

Requires Node `^20.19.0 || >=22.12.0` (Node 24 in `.nvmrc` and the
`Dockerfile` base image; see `DEPRECATIONS.md` row 20). npm warns when the
running Node falls below the `engines` floor.

```bash
npm install            # root (playwright)
npm install --prefix api
npm install --prefix frontend
npm install --prefix canary-e2e
```

## Running

```bash
npm run setup          # install all deps + both Playwright Chromium builds (root + canary-e2e; first clone)
npm run build          # build api + frontend
npm run deploy         # ./deploy.sh (tests + build, idempotent)
npm run dev            # start API + frontend dev servers (any OS)
./deploy.sh --prod     # build + deploy the production "master" build (Linux)
```

**Ports.** KainBain uses a dedicated API
port. The API defaults to `http://localhost:3100` (override with `PORT`); the
frontend is told where the API lives via `frontend/.env`
(`VITE_API_BASE` / `VITE_WS_URL`, default `:3100`), which Vite inlines at dev
start and at `vite build`. If you deploy KainBain elsewhere, point those at
your API origin.

### Docker quickstart

```bash
docker compose up -d          # build + start; UI at http://localhost:3100
curl http://localhost:3100/status
```

No credentials needed: the container boots self-contained and harness calls
degrade honestly until you provide keys. To enable real agent runs, copy
[`.env.example`](.env.example) to `.env` and fill in secrets only (API keys,
Ollama/LiteLLM URLs) — container paths always win over `.env`. Set
`KAINBAIN_PORT` to move the host port (e.g.
`KAINBAIN_PORT=3200 docker compose up -d`). Container verification lives in
`tests/docker.test.mjs`: static Dockerfile/compose assertions run in every
`npm test`; the full image build + boot suite is opt-in via
`KAINBAIN_CONTAINER_TESTS=live node --test tests/docker.test.mjs`.

### Tunables (environment variables)

Every knob the API reads is declared once in the config schema
(`api/config/schema.js`), validated at boot, and documented in the generated
root [`.env.example`](.env.example) (grouped by concern — copy it to `.env`
and adjust). Rule going forward: *tunables are documented exactly once (the
schema); everything else links.* The most-changed knobs:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3100` | API listen port |
| `KAINBAIN_DEFAULT_MODEL` | `deepseek-v4-flash:0731-cloud` | Default model for new projects/stages |
| `KAINBAIN_DEFAULT_HARNESS` | `pi` | Agent harness when a project does not select one |
| `KAINBAIN_AGENT_TIMEOUT_MS` | `1800000` | Max wall-clock for one agent stage (30 min) |
| `KAINBAIN_CI_TIMEOUT_MS` | `600000` | Max wall-clock for a CI/script stage (10 min; `npm run test` includes the ~7-min canary E2E suite) |
| `KAINBAIN_AUTO_ITERATION_ENABLED` | `true` | Auto re-run a task after a stage fails (fix → re-test → re-review) |
| `KAINBAIN_MAX_AUTO_ITERATIONS` | `8` | Max automatic failback→re-execute cycles before a task is parked as `failed` for a human |
| `KAINBAIN_MAX_TRANSIENT_RETRIES` | `5` | Same-stage retries for timeouts/infra errors before parking |
| `KAINBAIN_TOOL_LOOP_STRIKES` | `3` | Consecutive tool failures before the agent tool-loop guard aborts the stage |
| `KAINBAIN_SCHEDULER_INTERVAL_MS` | `3000` | Autonomous scheduler tick interval |
| `KAINBAIN_SESSION_TTL_MS` | `1800000` | Idle time before a session is disposed |
| `KAINBAIN_SESSION_CLEANUP_MS` | `60000` | Session cleanup sweep interval |
| `KAINBAIN_WORKFLOW_RUN_TTL_MS` | `86400000` | Workflow-run TTL |
| `KAINBAIN_WORKFLOW_SWEEP_MS` | `3600000` | Workflow-run TTL sweep interval |
| `KAINBAIN_MODEL_CACHE_TTL_MS` | `30000` | Model discovery cache TTL |
| `KAINBAIN_HEALTH_CACHE_TTL_MS` | `15000` | Health-check aggregate cache TTL |
| `KAINBAIN_HEALTH_LITELLM_TIMEOUT_MS` | `3000` | LiteLLM probe timeout |
| `KAINBAIN_HEALTH_OLLAMA_TIMEOUT_MS` | `4000` | Ollama Cloud probe timeout |
| `KAINBAIN_HEALTH_MEM_CRITICAL_PCT` | `95` | Memory % → device health `error` |
| `KAINBAIN_HEALTH_MEM_WARN_PCT` | `85` | Memory % → device health `warning` |
| `KAINBAIN_HEALTH_LOAD_CRITICAL_PER_CORE` | `4.0` | Load-per-core → device health `error` |
| `KAINBAIN_HEALTH_LOAD_WARN_PER_CORE` | `2.5` | Load-per-core → device health `warning` |
| `KAINBAIN_MUSE_BIN` | `muse` | Muse Code CLI binary (pin a versioned binary to opt out of auto-update) |
| `KAINBAIN_MUSE_APPROVAL_MODE` | `never` | Muse `--approval-mode` (sandbox stays ON, unlike `--yolo`) |
| `KAINBAIN_MUSE_YOLO` | `1` | Muse `--yolo` by default (no approval UI yet); `0` restores sandbox-on |
| `KAINBAIN_MUSE_TRUST_WORKSPACE` | `0` | Muse `--trust-workspace` (loads project skills/rules) |
| `KAINBAIN_MUSE_NO_SESSION_LOG` | `0` | Muse `--no-session-log` (privacy vs. resume/trace trade-off) |
| `KAINBAIN_MUSE_TIMEOUT_MS` | agent-stage timeout | Engine-side watchdog for one muse run |
| `KAINBAIN_MUSE_ARGS` | `""` | Extra validated muse argv (e.g. `--max-model-steps 200`) |
| `KAINBAIN_VIBE_BIN` | `vibe` | Mistral Vibe CLI binary (PATH name or absolute path; `~/.local/bin` is also searched) |
| `KAINBAIN_VIBE_CLI` | `python` | Vibe CLI implementation pinned via `VIBE_CLI`: `python` (classic CLI, flag contract the harness uses), `rust` (Rust TUI, only if it advertises the same flags), `auto` (follow the upstream rollout) |
| `KAINBAIN_VIBE_AUTO_APPROVE` | `true` | Vibe `--auto-approve` by default (no approval UI yet); `0` restores per-agent approvals |
| `KAINBAIN_VIBE_AGENT` | *(unset)* | Vibe `--agent` profile; unset follows the Vibe `default_agent` config |
| `KAINBAIN_VIBE_TIME_LIMIT` | *(unset)* | Vibe `--time-limit` per run in seconds (the engine watchdog still applies) |
| `KAINBAIN_VIBE_TRUST` | `true` | Vibe `--trust` (invocation-only trust-prompt skip for headless runs) |
| `KAINBAIN_VIBE_ENABLED_TOOLS` | *(unset)* | Comma-separated Vibe `--enabled-tools` filters |
| `KAINBAIN_VIBE_DISABLED_TOOLS` | *(unset)* | Comma-separated Vibe `--disabled-tools` filters |
| `KAINBAIN_VIBE_TIMEOUT_MS` | agent-stage timeout | Engine-side watchdog for one vibe run |
| `KAINBAIN_VIBE_ARGS` | `""` | Extra validated vibe argv (e.g. `--smart-approve`) |
| `KAINBAIN_OPENCODE_BIN` | `opencode` | opencode CLI binary for availability detection (`~/.opencode/bin` is also searched; `OPENCODE_URL` skips the binary entirely) |
| `KAINBAIN_TASK_IMAGE_MAX_BYTES` | `10485760` | Max bytes for one uploaded task image (10 MB) |
| `KAINBAIN_TASK_IMAGE_MAX_PER_TASK` | `20` | Max image assets stored per task folder |
| `KAINBAIN_TASK_IMAGE_MAX_PROMPT_REFS` | `10` | Max image paths injected into one curated stage prompt |
| `KAINBAIN_TASK_IMAGE_MAX_ATTACH_BYTES` | `10485760` | Max total image bytes attached to one vision-capable dispatch |
| `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS` | `0` | Opt-in ceiling for one retrospective chat turn in ms; `0` disables it so the turn runs until the model answers or you cancel it |
| `KAINBAIN_SERVER_REQUEST_TIMEOUT_MS` | `0` | Node HTTP requestTimeout for the API server in ms; `0` disables it so long chat turns are never killed with a bare 408 |
| `KAINBAIN_GIT_REMOTE_TEMPLATE` | *(unset)* | Default git remote for new projects (`${SLUG}`/`${NAME}`/`${USER}` placeholders); blank = no remote, `gitUrl` stays null |
| `KAINBAIN_GIT_AUTHOR_NAME` | `KainBain Agent` | Repo-local git `user.name` provisioned when the machine has no identity |
| `KAINBAIN_GIT_AUTHOR_EMAIL` | `kainbain@local` | Repo-local git `user.email` provisioned when the machine has no identity |
| `CORS_ALLOWED_ORIGINS` | *(unset)* | Comma-separated exact origins allowed past CORS (loopback is always allowed) |
| `NODE_EXTRA_CA_CERTS` | *(unset)* | Custom CA bundle path, honored only when explicitly set (no implicit default) |
| `VITE_NOTES_VIEWER_URL` | *(unset)* | External notes-viewer base URL for report deep links; unset = in-app `#/explorer` fallback |

Fail-fast policy: a missing/empty variable falls back to its default silently,
but a malformed value (e.g. `KAINBAIN_AGENT_TIMEOUT_MS=invalid_number`) fails
the boot with a `CONFIG <VAR>: <reason> (got "<value>", want <constraint>)`
diagnostic — fix the value instead of getting a silent default. Deprecated
unprefixed aliases (`AGENT_TIMEOUT_MS`, …) still work but warn at boot; prefer
the `KAINBAIN_*` names. The live configuration (values, defaults, sources) is
introspectable with secrets redacted:

```bash
curl http://localhost:3100/status/config | jq '.entries[] | {env, value, source}'
```

Note: the API does not auto-load a `.env` file — provide variables via the
shell or systemd, or in dev run `node --env-file=.env api/index.js`.

## Multiple projects & custom state folders

KainBain runs any number of projects side by side. Discovery is **file-driven**: a
directory becomes a project only when it carries a KainBain config file
(`<dir>/<kainbainDirName>/project.json`), or when it is explicitly created or
adopted. Stray directories are never turned into projects.

### Where projects are discovered

1. The **primary root** — `PROJECTS_ROOT` (default `/home/server/projects`),
   scanned one level deep.
2. **Extra roots** — `PROJECTS_ROOTS`, an OS path-list separated list (e.g.
   `/mnt/nas/projects:~/work` on POSIX). Projects must be direct children of a
   root.
3. The **adopted-projects registry** — `~/.kainbain/projects.json`
   (`KAINBAIN_PROJECTS_REGISTRY_FILE`), an engine-global file holding
   `{ "roots": [...], "projects": ["/abs/path", ...] }`. It is written when a
   project outside every root is adopted and read on every boot, so adopted
   projects survive a restart. The file is advisory: missing or corrupt reads
   as empty and never breaks boot.

Results dedupe by resolved `cwd`.

### Adopting an existing repository

Use **Project menu → “+ Add Existing Project…”** (path + optional display name
+ optional state-folder name), or the API directly:

```bash
curl -X POST http://localhost:3100/projects/register \
  -H 'content-type: application/json' \
  -d '{"path":"/home/me/repos/my-app","kainbainDirName":".kb"}'
```

The call is idempotent: registering an already-known directory returns the
existing project (`200`) instead of creating a duplicate (`201` on first
adoption). Adopted directories outside every root are recorded in the registry;
repos inside a configured root need no registry entry.

### Custom KainBain state folder

Every per-project engine artifact (`project.json`, `sessions/`, `worktrees/`,
`quarantine/`, opencode transcripts) lives under `<project cwd>/<kainbainDirName>`.
The default is `.kainbain`; a project can set a bare folder name (e.g. `.kb`) in
**Project Settings → KainBain Folder Name** or via `kainbainDirName` on
`POST /projects` / `PATCH /projects/:id` / `POST /projects/register`. The name
must be 1–64 characters of `[A-Za-z0-9._-]`, may not be `.`/`..`/`.git`/
`node_modules`, and may not collide with the project's docs link folder
(`docsDirName`, default `docs`). The two folders can never be swapped onto
each other's current name in a single change (rejected with a 400) — rename
one first, then the other.

Changing the setting **does not move existing state**. Two safe options:

**Rename the folder (preferred, nothing is lost).** Stop the API, rename the
state folder, then restart — a folder whose config names itself is adopted
automatically, so the project re-scans from the new location with its sessions
and worktrees intact:

```bash
# stop the API first (systemctl stop / Ctrl-C)
cd /path/to/project
mv .kainbain .kb
# start the API again
```

**Or change it in the settings UI.** KainBain writes a fresh config under the
new name and **removes the superseded config** so a restart can never revert the
setting or split state across two folders. Existing `sessions/`, `worktrees/`,
and `quarantine/` stay in the old folder — move them across by hand:

```bash
cd /path/to/project
mv .kainbain/sessions   .kb/sessions   # and worktrees/, quarantine/, as needed
```

The git cleanliness guard and generated `.gitignore` entries follow the same
resolver, so a custom state folder is ignored exactly like `.kainbain/`.

### Sample projects (Project A–D)

Sample projects are **not** seeded by default — a fresh machine boots with an
empty board. Set `KAINBAIN_SEED_SAMPLE_PROJECTS=1` to restore the old behaviour.
Projects already on disk (including `project-a`…`project-d`) still scan; hide
them with the existing *Hide* action in the project switcher instead.

### Behaviour changes

- Directories without a KainBain config file are **no longer auto-created** as
  projects.
- Sample projects are **no longer seeded unconditionally** at boot (opt in with
  `KAINBAIN_SEED_SAMPLE_PROJECTS=1`).

The `projectsRoot`/`notesSpaceRoot` defaults remain the author’s homelab paths
for backwards compatibility; a native boot against a missing `projectsRoot`
logs a loud warning naming the configured value (Docker already refuses to
boot).

## Author's homelab production setup (`--prod`)

This section documents one specific production instance (the author's
homelab) — it is not the portable procedure. Cold-starting elsewhere?
Follow [`PORTABLE_DEPLOYMENT.md`](PORTABLE_DEPLOYMENT.md) instead.

`./deploy.sh --prod` builds the frontend with **relative** API/WebSocket URLs
(so it works behind the reverse proxy), copies the API + built frontend to
`~/apps/kainbain`, installs production deps, restarts the `kainbain` systemd
user service, and reloads nginx. The app is then served at
**<https://kainbain.home>**.

- The API (Fastify) serves both the backend and the built frontend from one
  origin on port `3100` (via `@fastify/static`), so a single nginx upstream
  hosts the whole app.
- The service is a systemd **user** unit (`~/.config/systemd/user/kainbain.service`),
  enabled to start on boot. Manage it with:
  `systemctl --user status|restart|stop kainbain.service`. The unit sets
  `Environment=KAINBAIN_SELF_DEPLOY_CONTINUITY=1` — the implementation-specific
  opt-in for the self-deploy continuity plugin (`api/continuity/`) so the app
  survives its own redeploy; the generic pipeline never loads that code.
  After editing the unit: `systemctl --user daemon-reload` (the new environment
  applies from the next restart, i.e. the next deploy).
- nginx reverse-proxies `kainbain.local` → host `:3100` (see
  `~/apps/nginx-proxy/conf.d/default.conf`), including WebSocket upgrade for
  `/ws`. DNS for `kainbain.local` is a local-DNS record → `192.0.2.10`.

### Long chat turns and timeouts

Retrospective chat turns are agentic (the model may use tools for minutes),
so three timeout layers stack and must stay ordered **proxy > HTTP server >
chat prompt**:

| Layer | Knob | Default | Notes |
| --- | --- | --- | --- |
| Reverse proxy | `proxy_read_timeout` / `proxy_send_timeout` on the `kainbain.home` `location /` | nginx default 60s | Must be raised (e.g. `3600s`, matching `/ws`) or every turn past 60s dies as a bare proxy 504 |
| HTTP server | `KAINBAIN_SERVER_REQUEST_TIMEOUT_MS` | `0` (disabled) | Set a positive value only above the chat ceiling, or turns die with a bare 408 |
| Chat prompt | `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS` | `0` (disabled) | Opt-in ceiling; breaches surface as structured 504 JSON (`code: chat_prompt_timeout`) with partial output |

Troubleshooting mapping (2026-10-07 incident: the proxy layer still had the
60s default, so general-chat turns running multi-minute tool investigations
failed every time while the app log showed the turn still running): "The
server stopped waiting for the model" means the app's own ceiling fired;
"A proxy in front of the server timed out…" means the proxy gave up first
and the turn may still be running — wait, then Retry. "The server
connection timed out…" (bare 408) means the app HTTP ceiling fired below
the chat ceiling — raise `KAINBAIN_SERVER_REQUEST_TIMEOUT_MS` above
`KAINBAIN_CHAT_PROMPT_TIMEOUT_MS` (or leave both `0` = disabled). The app
debug log carries `promptChars` + `model` per turn for attribution.

To bring the app up for real use (dev):

```bash
npm run setup   # once per clone: installs root + api + frontend + canary-e2e deps and both Playwright Chromium builds
npm run dev     # API on :3100 + frontend dev server on :5173 (reads frontend/.env)
```

Manual equivalent (if you prefer separate terminals):

```bash
# API on :3100
(cd api && npm install && PORT=3100 node index.js)
# Frontend dev server on :5173 (reads frontend/.env)
(cd frontend && npm install && npm run dev)
```

## Self-deployment (the app deploys itself)

KainBain can deploy itself, which is how it develops itself: a CI stage in a
workflow (or a manual action) runs `./deploy.sh --prod`, and the app restarts
itself with the new build. Because a deploy restarts the very service that may
have triggered it, the deploy is hardened to be safe to run many times a day,
including overlapping and asymmetric runs:

- **`cd`s to its own directory** — works no matter how it is invoked (e.g.
  spawned detached by the API).
- **flock-based lock** — concurrent deploys serialize instead of corrupting
  `~/apps/kainbain`; a second deploy waits (or aborts) rather than racing.
- **`.prev` backup** — the current deployment is snapshotted to
  `~/apps/kainbain.prev` before the new build is swapped in, so a bad deploy
  can be rolled back atomically.
- **Health-check gate + auto-rollback** — after restarting the service, the
  script polls `/status`. If the new instance fails to come up, it
  **auto-rolls back** to `.prev` and restarts, so a small bug never leaves the
  app down.
- **Durable state** — deploy status/result/history are written to
  `~/.kainbain/deploy/` (JSON + JSONL), so the UI can report progress even
  though the triggering process is restarted mid-deploy.
- **Detached execution** — when the script detects it runs inside
  `kainbain.service`'s cgroup, it re-execs under a dedicated transient
  service unit (`kainbain-deploy-<pid>`), fully outside the restarted unit's
  lifetime, so the health check and auto-rollback survive the restart. The
  re-exec uses `systemd-run --wait` so the unit's real exit code propagates
  to the deploy CI stage that ran it (without it the stage would PASS on
  unit start while the deploy failed invisibly), plus `--setenv=PATH=` carrying
  the node bin dir (transient units inherit a minimal manager PATH with no
  nvm node).
- **Graceful restart** — the old instance gets SIGTERM first (in-flight
  requests drain; the shutdown hook persists stage state as `interrupted`),
  so the outage window is just the service swap itself. SIGKILL is only the
  last resort for a lingering port holder.
- **Pipeline-neutral deploy stage** — a stage whose command runs the deploy
  script is an ordinary `ci` stage to the generic pipeline: same timeout,
  stall, status (`running_ci`), heartbeat, and failback behaviour as any
  other CI stage. On failure it routes to its configured fallback like any
  other CI stage, so an agent can fix it. The generic engine never branches
  on command text.
- **Implementation-specific continuity (no resume loop)** — KainBain's own
  cross-restart deploy continuity lives outside the shared pipeline in
  `api/continuity/`, enabled only by `KAINBAIN_SELF_DEPLOY_CONTINUITY=1`.
  That plugin re-attaches the self-deploy semantics: per-attempt
  `KAINBAIN_DEPLOY_ATTEMPT_ID` environment, durable checkpoints
  (`~/.kainbain/deploy/attempt-<id>.json`), post-restart reconciliation,
  and once-only park/wait decisions — so a restart mid-deploy can no longer
  trigger `resume → second deploy → restart → resume …`. Generic projects
  never load this code. A merge stage interrupted by a restart still
  reconciles from the frozen `reviewBaseline` marker (or `merge-base
  --is-ancestor` proof): already-merged work never rewinds to "In Progress",
  and re-entering a merge whose branch is already on main skips the
  duplicate merge.
- **Autoincrementing build number** — each production deploy consumes the next
  number from a persisted counter (`~/.kainbain/deploy/build.txt`) and stamps it
  into the deployed app's `build.json` (with the deploy timestamp and git
  commit). The running instance, the `.prev` rollback copy, and the deploy
  history all carry the exact build that was live. The build number is shown
  in the header (`#B<number>`) and the Deployment panel.

### Deploy modes

```bash
./deploy.sh --prod          # full: tests + security scans + build + deploy
./deploy.sh --prod --fast   # skip tests/scans for rapid iteration (health gate still applies)
./deploy.sh --rollback      # restore the last known-good deployment (.prev)
npm run deploy:fast         # shorthand
npm run deploy:rollback     # shorthand
```

### Deploy API + UI

- **API**: `GET /deploy/status`, `POST /deploy` (`{ fast: true }`),
  `POST /deploy/rollback`, `GET /deploy/log`. The manager spawns the script
  **detached** so it survives the API restart.
- **UI**: a **Deployment** section in **Settings** shows live status, last
  result, rollback history, and the deploy log tail, with **Deploy Now**,
  **Fast Deploy**, and **Rollback** buttons.

Interactive API documentation (OpenAPI/Swagger) is served at
`http://localhost:3100/documentation` (JSON spec at `/documentation/json`).
The frontend dev server runs on `http://localhost:5173`.

### Optional harness capabilities & degradation

The agent harness exposes an optional capability surface (steering,
follow-up, manual compaction, context usage, session tree navigation and
forking — see `api/agent/harnessContract.js`). Compute/session routes call
these through a capability guard, so a harness without a capability degrades
with a meaningful status instead of a 500:

- **`501 { error, code: "unsupported_by_harness", capability }`** — the active
  harness does not support the requested optional capability (endpoints:
  `GET /compute/context`, `POST /compute/compact`, `POST /compute/steer`,
  `POST /compute/follow-up`, `POST /session/navigate`, `POST /session/fork`).
- **`404 { error, code: "entry_not_found", entryId }`** — navigate/fork was
  called with an entry id that does not exist in the session tree.

Two further boundary normalizations make these endpoints predictable across
harnesses: `GET /compute/context` always answers a `{current, limit}` pair,
and `POST /compute/compact` on a session too small to compact is an idempotent
success (`200 {status: "compacted"}`), not an error.

### Agent integration entry point

Non-KainBain AI agents integrate with the live service through a dedicated,
self-describing entry point. `GET /agent` returns a structured JSON guide
(endpoint catalog, task statuses, stage types, a recommended workflow, and
WebSocket event types); `GET /agent/guide` returns the same as readable
markdown; `GET /agent/schema` is a compact machine manifest. The advertised
API base adapts to the request origin (or `PUBLIC_KB_URL`). A sample agent
skill lives at `docs/Agent Integration Skill.md`.

## Stage Skills (per-stage skill injection)

Stages can attach reusable, user-authored **skills** — small packages of
markdown instructions plus an optional config — that are injected into the
curated prompt the stage agent receives. This keeps context lean: heavy
instructions ship only to the stages that need them.

```text
<kainbain repo>/skills/           # GLOBAL library (KAINBAIN_SKILLS_DIR override)
  <skill-name>/
    SKILL.md                      # YAML frontmatter (name, description) + markdown body
    KB_config.json                # OPTIONAL, tolerant config
<projectRoot>/skills/             # PROJECT overlay (shadows global by name)
```

Each stage attachment carries a delivery **mode**:

- **`direct`** — the skill body (with KB_config `context` prepended and every
  keyword resolved) is injected straight into the curated prompt under
  `# Stage Skills`; the agent always sees it.
- **`option`** — only a compact manifest entry (name, description, absolute
  `SKILL.md` path) is injected under `# Available Skills`; the agent may
  read/invoke the skill file itself when it decides it is relevant.

`KB_config.json` is non-declarative: unknown fields are preserved and ignored
by the engine. Known fields: `description` (UI override), `keywords`
(custom `{{...}}` definitions — usable in the skill body AND the stage prompt),
`context` (extra markdown prepended on direct injection), and `defaults.mode`.
Keyword precedence: `stage.skills[i].config[key]` > `KB_config.keywords[key].value`
> built-in keywords (`{{project}}`, `{{taskDocs}}`, …); unknown `{{...}}`
patterns are always preserved. Total injected skill text is capped by
`KAINBAIN_STAGE_SKILLS_MAX_CHARS` (default 16000); overflowing skills are
omitted with a visible marker. The stage editor's Skills panel (in the agent
stage settings) offers a searchable multi-add picker, mode toggle, keyword
config editor, preview modal, and a live context-size budget readout.

API: `GET /skills?projectId=<id>` lists the merged library;
`GET /skills/:name?projectId=<id>` returns one skill's raw markdown + config.
The PoC skill `skills/creating-new-tickets/` shows the full contract — it
teaches a stage agent to create follow-on KainBain tasks via `POST /tasks`
with injectable `{{targetProject}}` / `{{targetWorkflow}}` / `{{targetStage}}`
keywords.

Environment tunables: `KAINBAIN_SKILLS_DIR` (library location),
`KAINBAIN_STAGE_SKILLS_MAX_CHARS` (injection cap), `KAINBAIN_SKILLS_CACHE_TTL_MS`
(scan cache TTL).

### Question-me surveys (append-only `SURVEY.md` by default)

Attach the `question-me` skill to an agent stage and the agent generates its
whole questionnaire up front, writes it to `{{outputFile}}` (default
`SURVEY.md`) in the task folder, and parks the task for a human instead of
auto-advancing. The survey page (`/tasks/:taskId/survey`, mobile + desktop)
collects multiple-choice answers plus per-question notes; submitting advances
the task. The file is **append-only**: follow-up rounds after a failback are
added at the bottom and earlier answers are never rewritten. The output file
name is configurable per stage (`outputFile`, with backward-compatible aliases),
so multiple question stages can coexist (`FEEDBACK.md`,
`SECURITY_QUESTIONARY.md`, `INTENT_SURVEY.md`, ...). Conditional questions
use one simple `showIf` object form
(`{ "questionId": "q1", "value": "…" }`). See `site-docs/surveys.md` and
`skills/question-me/SKILL.md`.

## CI Stage Keywords

CI stage commands (including a stage whose command runs the deploy script —
an ordinary `ci` stage) support the same
`{{...}}` keyword tokens as agent prompts. Tokens are interpolated when the
command starts, from the same context the prompt engine uses; unknown tokens
stay literal so misconfiguration fails visible in logs instead of silently
expanding to an empty string. The stage report records both the configured
template and the expanded command whenever they differ.

Built-in tokens: `{{project}}`, `{{projectRoot}}`, `{{projectRepo}}` /
`{{taskRepo}}`, `{{taskGoal}}`, `{{taskDocs}}`, `{{taskId}}`, `{{stageName}}`,
`{{previousReports}}`, `{{latestReportPath}}`, and
`{{latestReportPath:<stageSlug>}}` (path of the most recent report from one
stage — the shell-safe way to check a prior stage produced its report).
Stage-skill custom keywords (`KB_config` + per-stage config) also resolve.

Quote tokens in shell commands, since interpolated paths may contain spaces:

```sh
test -f "{{taskDocs}}plan-"*.md || { echo "missing plan report"; exit 1; }
test -f "{{latestReportPath:plan}}" || { echo "no plan report yet"; exit 1; }
```

Scripts can read the same values without quoting concerns from `KAINBAIN_*`
environment variables: `KAINBAIN_PROJECT`, `KAINBAIN_PROJECT_ROOT`,
`KAINBAIN_TASK_ID`, `KAINBAIN_TASK_DOCS`, `KAINBAIN_STAGE_NAME`,
`KAINBAIN_TASK_GOAL`, `KAINBAIN_TASK_REPO`, `KAINBAIN_REPORTS`,
`KAINBAIN_LATEST_REPORT`.

Side-effecting macros (sending messages, writing logs) are deliberately out
of scope: keywords are pure string resolvers. A command that needs to log or
notify should call the relevant API or write to the paths above instead.

## Testing

```bash
npm test               # full verification gate (units, lints, build, security,
                       # depcheck, containers + canary E2E) — identical to what
                       # deploy.sh --prod gates on
npm test -- --no-canary  # the same gate without the ~7-min canary suite
npm run test:unit      # API + frontend unit suites only
npm run test:canary    # Playwright E2E alone, on an auto-provisioned scratch stack
npm run test:visual    # visual regression (screenshot) suite
npm run sec            # ./Security_scans.sh
```

Unit tests mock the AI agent layer; canary tests run against a real backend.
CI (`.github/workflows/ci.yml`) runs `setup` → `lint` → `test` plus the
storage-sanity cold-start gate on Ubuntu/macOS/Windows × Node 20.x/22.x on
every push and pull request.

### Canary E2E gate

The Playwright suite in `canary-e2e/` is the regression guard for UI and
integration behavior. It auto-provisions an isolated scratch stack (API
`:3399` + vite `:5299`, scheduler disabled), so a default run never touches
the live `:3100`/`:5173` pair — and the scratch ports are freed
(`scripts/canary-preflight.mjs`, which only terminates verified scratch
occupants) before the suite boots, so an orphaned process
cannot abort the run with a false port-collision failure.

- **In `npm test` (default):** the Canary Tests branch is part of the full
  gate, so `npm test` and `deploy.sh --prod` gate on the exact same suites
  and regressions surface in the earliest automated stage instead of the
  merge/deploy gate (the #KB-0417 incident). Skip it for fast sanity cycles
  with `npm test -- --no-canary` or `KAINBAIN_SKIP_CANARY=1`.
- **Pre-deploy (blocking):** `deploy.sh --prod` (non-fast) runs the fast
  branches as its `final-test-suite` gate (`./run-tests.sh --no-canary`)
  and then this suite once as its `canary-e2e` gate — identical coverage,
  no suite run twice. Emergency opt-out only: `KAINBAIN_SKIP_CANARY=1`.
- **One spec file:** `npx playwright test task-inspector` from `canary-e2e/`.

See `canary-e2e/README.md` for the stack model, helper API, the
regression→spec traceability table, and the "adding a regression spec"
checklist.

## Monitor view

The observability dashboard (`#/orchestrator`) shows the executing task's full dispatched prompt, harness, model (with provider and detail source), and duration. REST (`/status/observability`) stays the source of truth; socket events (`ENGINE_STATE`, `TASK_UPDATED` for the active task, `PROCESS_START`) trigger a debounced (~500 ms), coalesced fresh read so the card tracks the live run within about one cycle, while the 15 s poll remains the safety net. An unresolvable model renders honestly as "Unknown" — never a default harness name.

Monitor cache bypasses refresh task telemetry only; they reuse cached health and never force provider/harness probes. Explicit health refresh remains available separately. Model and dispatched-prompt reads use the live session's harness contract (`getActiveModel()` / `getMessages()`, with guarded legacy fallbacks), including async model accessors. Continuous socket traffic coalesces follow-up reads without suppressing every completed fresh snapshot.

The dashboard's widget catalog includes a **Harness Reliability** widget (off by default, on in the Executive Telemetry preset): one row per harness with the all-time success rate over counted runs, the recent-window rate (last 10 runs), infrastructure-failure count, and last-run time, sorted worst-first. A harness is flagged "Needs attention" once it has at least 5 counted runs and drops below 90% success all-time or over the recent window — the rule lives in `RELIABILITY_INTERVENTION_RULES` (`frontend/src/components/observability/reliabilityStatus.js`). Harnesses with no counted runs show an honest no-data line and are never flagged. Reliability comes from `GET /harnesses/reliability` (all projects, all time — deliberately not part of the project-filtered observability snapshot) and is polled on its own slow cycle (60 s plus socket-event/visibility refreshes) only while the widget is enabled. Counts exclude deliberate agent rejections, matching the Settings harness tab.

While the monitor is open and a task is running, KainBain holds a Screen Wake Lock so the screen does not dim or sleep on desktop or mobile — like a video player. It is on by default and can be turned off in UI Customization › Workspace ("Keep screen awake while monitoring", `keepScreenAwakeOnMonitor` in `kainbain_ui_preferences`). The lock needs a supporting browser and a secure context, so on plain-`http://` LAN installs the feature silently does nothing (the settings row says so); leaving the monitor, idling, or hiding the tab releases the lock immediately.

## Top header bar

On phone widths (below 640px) the header stacks into two rows: brand, project
pill, monitor, and system menu on top, with the tab strip and Go to App link in
a horizontally scrollable row beneath — every control stays reachable and nothing
paints underneath anything else. Between 640px and 1535px the single row shows
icon-only tabs; the full labeled row (wordmark, PROJECT label, tab labels, build
badge) appears at 1536px and above, or at 1280px and above when the project has
no app link crowding the row.

## Repository & Files explorer

The explorer (`#/explorer`) browses project files read-only with folder
navigation, search filter, breadcrumbs, and a Document Viewer pane. Selecting
an image file (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG) renders a visual
preview with name, path, size, and pixel dimensions; Markdown still renders
with a Preview/Raw toggle and code/text still shows with line numbers. Images
over 15 MB and non-previewable binaries show a download affordance instead of
a preview. SVG images render as `<img>` (scripts never execute) served with a
`sandbox` Content-Security-Policy.

## Persistent filters

Board search/status, the activity console filters, per-task Logs-tab feed/search,
review file filter, explorer search, task/review tabs, and the observability
project scope survive a page refresh via `localStorage` (shared
`frontend/src/hooks/usePersistentState.js` hook). Search text is debounced
(~800 ms) and flushed on unmount; chip/select/tab choices write synchronously.

| Key | Default |
| --- | --- |
| `kainbain:board:search` / `:statusFilter` | `''` / `'all'` |
| `kainbain:board:logTag` / `:logSearch` | `'ALL'` / `''` |
| `kainbain:taskLogs:<taskId>:feed` / `:search`, `kainbain:taskLogs:autoScroll` | `'ALL'` / `''` / `true` |
| `kainbain:review:fileFilter`, `kainbain:review:activeTab` | `''` / `'files'` |
| `kainbain:explorer:search` | `''` |
| `kainbain:taskDetail:activeTab` | `'details'` |
| `kainbain:taskOverlay:activeTab` | `'details'` |
| `kainbain:observability:projectId` | `'all'` |
| `kainbain:board:stageTagFilter` / `:stageTagFilterMode` | *(unset)* / `'any'` |

Missing, corrupt, oversized, or unreadable (private-mode/quota) storage falls
back to the defaults without breaking render. Pre-existing keys
(`kainbain:showCompleted`, `kainbain_ui_preferences`, …) are unchanged. To reset
filters, clear site data or remove the `kainbain:` keys in devtools.

## Filtering stages by tags

Each pipeline stage can carry free-text **tags** (e.g. `PO`, `Dev`, `Review`),
edited as chips in the stage's settings drawer (⚙️ Stage Settings → Tags).
The board toolbar has a single unified search bar: type plain text to filter
tasks, and type `#` followed by a tag name to filter stages by tag (e.g.
`auth #Dev` shows `Dev` stages with their `auth` tasks). A `#tag` becomes a
removable chip as soon as you press Space or Enter, leaving the text field
clear; suggestions narrow as you type, and Backspace on an empty field removes
chips last-first. Selecting one or more tags collapses every run of
non-matching stages into a slim vertical bar ("N stages hidden") so a long
pipeline can be split into subsets — tag the first half `PO` and the second
half `Dev`, filter on `PO`, and the Dev half collapses away. Click a bar to
expand its stages inline again.

- **Match mode:** `Any` (default) shows stages carrying at least one selected
  tag; `All` shows only stages carrying every selected tag.
- **Shareable views:** the selection lives in the URL query string —
  `?tags=PO,Dev` plus `&tagMode=all` when the mode is non-default. Copy the
  address to share the exact filtered view; the URL wins over the localStorage
  fallback on load.
- Tags are matched case-insensitively, capped at 12 tags per stage and 24
  characters per tag, and are additive: stages without tags behave exactly as
  before (no collapsed bars unless a filter is active).

## Documentation

- **Site docs (onboarding knowledge base):** the in-app **Docs** tab (`#/docs`, keyboard `5`) renders markdown from `site-docs/` — *How KainBain works* and *How to work with KainBain*. Agents fetch the same articles as raw markdown via `GET /docs` (index) and `GET /docs/:slug`; see `site-docs/README.md` for the authoring guide.
- **Git Branch Support & Merge Stage:** See [docs/git-branch-support.md](docs/git-branch-support.md) for task branch lifecycle, merge conflict handling, and configuration.
- **Architecture & Standards:** Design and standards live in the project's SilverBullet space (see `docs/` symlink): `KB Architecture.md`, `KB Code Standards.md`, and the `Phase1`/`Phase2` plans.
- **Curated changelog:** `CHANGELOG.md` at the repository root is human-curated
  (Keep-a-Changelog) and is updated only at release time. The in-app **Changelog** dialog
  continues to read the baked commit history via `GET /deploy/changelog`
  (`scripts/generate-changelog.mjs`); the two channels are intentionally not wired
  together.
