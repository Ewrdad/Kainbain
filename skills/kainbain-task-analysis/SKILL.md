---
name: kainbain-task-analysis
description: How to analyse live and past KainBain tasks in production — where task folders live, where every log lives (systemd journal, deploy log, session transcripts, per-task process logs), and how to inspect a task's state, history, reports, and failure reasons via the filesystem and the live API/WebSocket. Use when asked to investigate a task, debug a failed stage, trace a deploy, or audit what an agent did.
lastUpdated: 2026-08-27
---

# KainBain Task Analysis (production)

This skill teaches an agent how to investigate **live** and **past** KainBain
tasks in a production deployment. It covers the two things you almost always
need first: **where the task folder is** and **where the logs are**. Everything
else is reading those artifacts.

KainBain is an AI task orchestrator. Tasks are created into a project's
workflow, advance through stages (`agent`, `human`, `ci`, `deploy`), and are
persisted as markdown on disk. The API is Fastify; the frontend is served from
the same origin. In a typical deployment the app runs as a systemd **user**
service and is reachable at `https://<app-host>`.

---

## 1. Example deployment profiles (illustrative, optional)

| | Dev | Production |
| --- | --- | --- |
| Repo / project cwd | `{{projectCwd}}` | same repo, but the *deployed* copy is `{{deployDir}}` |
| API base | `{{kbApiBase}}` (or `PORT` env) | `{{kbApiBase}}` (fixed by service unit) |
| Service | none (run manually) | `<service-unit>` (systemd **user** unit) |
| App URL | `{{kbApiBase}}` | `https://<app-host>` |
| Task folders | `<project cwd>/docs/tasks/<taskId>/` | same layout, under the project's `cwd` |

**Key fact:** task folders are written under the **project's `cwd`**, not under
`{{deployDir}}`. The project's `cwd` is recorded in
`<project cwd>/.kainbain/project.json` (e.g. `"cwd": "{{projectCwd}}"`).
Tasks live at:

```text
{{projectCwd}}/docs/tasks/<taskId>/
```

`{{deployDir}}` is only the *deployed build* (api + frontend/dist + build.json);
it does **not** hold task data. Don't look for tasks there.

---

## 2. The task folder (the single most important artifact)

Every task is a directory under `<project cwd>/docs/tasks/<taskId>/`:

```text
docs/tasks/<taskId>/
├── task.md                      # canonical task entity (frontmatter + body)
├── IMPLEMENTATION_PLAN.md       # plan written by the Plan stage (if used)
├── plan-<timestamp>.md          # stage report: Plan (only if the stage opted in)
├── <stage-slug>-failure-<timestamp>.md  # failure report (ALWAYS written on stage failure)
├── automated-tests-<timestamp>.md # CI / deploy / human-checkpoint report (always written)
└── ...                          # one report per stage run that produced one
```

**Reporting is opt-in for agent stages.** A default agent stage writes NO
report on success — no agent-authored summary file and no engine-generated
one. A stage opts in via `report: true` on the stage config or by attaching
the `stage-report` skill. Failure reports (`<stage-slug>-failure-<timestamp>.md`)
are always written on stage failure, and CI / script / deploy stages and
human checkpoints always write their own reports.

### `task.md` — the canonical record

`task.md` is the authoritative, server-written snapshot of the task. Read it
first. It has YAML frontmatter and a markdown body:

- **Frontmatter:** `id`, `projectId`, `workflowId`, `title`, `status`,
  `currentStageId`, `createdAt`, `updatedAt`, `enteredStageAt`, `timeInStage`,
  `outputReport`, `feedback`, `blockedBy`.
- **`# Goal`** — the task's goal/title.
- **`# History`** — an append-only audit trail, one line per event:
  `- <ISO timestamp>: <action>` (created, edited, stage advanced, failed, etc.).
  This is the fastest way to reconstruct what happened and when.
- **`# Process Logs`** — the in-memory process log (agent/tool/CI output),
  capped at `KAINBAIN_PROCESS_LOG_MAX_BYTES` (default 200000). Older lines are
  truncated with a `[... earlier process logs truncated ...]` marker.

### Stage report files (`<stage-slug>-<timestamp>.md`, `<stage-slug>-failure-<timestamp>.md`)

Agent-stage success reports are **opt-in** (stage `report: true` or the
`stage-report` skill). Failure reports always exist and carry the `-failure-`
filename infix. Auto-generated reports carry the marker
`<!-- KAINBAIN AUTO-GENERATED REPORT -->` (hidden in most renderers).
A report contains: task, stage type, model, duration, status (PASSED/FAILED),
summary of changes, execution output, modified files, and verification status.
On failure it includes the error and notes the fallback routing.

### `docs/tasks/active/`

A separate, manually-maintained scratch area (`docs/tasks/active/<taskId>/N.md`)
holds working notes per stage. It is **not** written by the API — treat it as
human scratch, not authoritative.

---

## 3. Where the logs live

There are **four** distinct log sources. Match the question to the source.

### 3a. Service / request logs — systemd journal

The production API logs to the systemd **user** journal (Fastify structured
JSON: `level`, `time`, `pid`, `req`, `res`, `msg`).

```bash
# Tail live service logs
journalctl --user -u <service-unit> -f

# Last N lines
journalctl --user -u <service-unit> -n 200

# Since a time
journalctl --user -u <service-unit> --since "2026-08-27 08:00:00"

# Filter to errors only
journalctl --user -u <service-unit> -p err -n 100

# Service status / restart / stop
systemctl --user status <service-unit>
systemctl --user restart <service-unit>
```

Use this for: request failures, startup crashes, unhandled errors, and
confirming the service is up. The unit file is typically at
`~/.config/systemd/user/<service-unit>` (WorkingDirectory `{{deployDir}}/api`,
`PORT` set to the API port, `NODE_ENV=production`).

### 3b. Deploy logs — `<deploy-state-dir>/`

Self-deployment state and logs live under the deploy state directory
(typically `~/.kainbain/deploy/` when self-hosting KainBain):

```text
<deploy-state-dir>/
├── deploy.log        # full deploy script output (append-only)
├── state.json        # current deploy state
├── last-result.json  # last deploy result
├── history.jsonl     # append-only deploy history (one JSON per line)
├── build.txt         # autoincrementing build counter
├── deploy.lock       # flock lock file
└── releases/         # per-build release snapshots
```

The live build number is stamped into `{{deployDir}}/build.json`
(`{ buildNumber, deployedAt, commit }`). The header shows `#B<number>` — clicking
it opens the KainBain changelog baked into the deploy (`{{deployDir}}/changelog.json`,
latest 200 commits of `master` plus `totalCount`).

```bash
tail -n 200 <deploy-state-dir>/deploy.log
cat <deploy-state-dir>/last-result.json
cat <deploy-state-dir>/state.json
cat {{deployDir}}/build.json
```

Use this for: "did the deploy succeed / what build is live / why did it roll
back". The API also exposes these via `GET /deploy/status`, `GET /deploy/log`,
`POST /deploy`, `POST /deploy/rollback`, plus `GET /deploy/changelog` for the
baked history (`{ changelog: null, reason: "not-baked" }` before the first
deploy that bakes it).

### 3c. Agent session transcripts — `<project cwd>/.kainbain/sessions/`

Each project owns a session directory at `<project cwd>/.kainbain/sessions/`.
Files are JSONL transcripts of the agent session (one JSON object per line):
`session`, `model_change`, `thinking_level_change`, and message/tool events.
They survive restarts and are resumed via the SDK's `SessionManager`.

```bash
ls -lt {{projectCwd}}/.kainbain/sessions/
head -5 {{projectCwd}}/.kainbain/sessions/*.jsonl
```

Use this for: the raw agent conversation / model used / thinking level for a
project. Note: `.kainbain/` is gitignored, so these are local-only.

### 3d. Per-task process logs — inside `task.md`

The live agent/tool/CI output for a task is captured in the task's
`# Process Logs` section (see §2). This is the most task-specific log and is
what the UI's Live Console shows. It is capped and truncated for performance.

---

## 4. Analysing a **live** task

A "live" task is one currently executing or queued. The engine is a single
global executor (`ExecutionQueue`) with an `engineState` snapshot.

### 4a. Via the API (fastest, no filesystem)

```bash
# Engine state: what is running right now
curl -s "{{kbApiBase}}/status/observability" | jq '.engine'

# Full observability: engine + health + build + task metrics
curl -s "{{kbApiBase}}/status/observability?projectId=<projectId>" | jq

# Health
curl -s "{{kbApiBase}}/status/health" | jq

# List tasks for a project (projectId optional → active project)
curl -s "{{kbApiBase}}/tasks?projectId=<projectId>" | jq

# Single task (full state incl. history, reports, processLogs)
curl -s "{{kbApiBase}}/tasks/<taskId>?projectId=<projectId>" | jq

# Task queue
curl -s "{{kbApiBase}}/tasks/queue?projectId=<projectId>" | jq

# Session status (active, streaming, message count, disk session)
curl -s "{{kbApiBase}}/session/status?projectId=<projectId>" | jq
```

`GET /status/observability` returns `engine` (status, activeTaskId,
activeStageId, activeStageName, activeStageType), `build`, `health`, and
`observability` (totals: completed/failed/running/waitingHuman/paused/blocked,
plus recent completed/failed lists with failure reasons).

### 4b. Via WebSocket (live streaming)

The frontend subscribes to `GET /ws?projectId=<projectId>` (WebSocket upgrade).
Events are JSON `{ type, sessionId, payload, timestamp }`. Key types:
`CONNECTED`, `ENGINE_STATE`, `TASK_UPDATED`, `TASK_DELETED`, `NOTIFICATION`,
`PROCESS_STDOUT` / `process:stdout`, and agent events (`agent_start`,
`tool_execution_start`, `tool_execution_update`, `tool_execution_end`,
`message_update`, `error`). The UI's **Live Console** (Observability dashboard)
renders these with severity tags (`AGENT`, `CI`, `ERROR`, `HUMAN`, `TOOL`).

To watch live from a script, connect to the WebSocket endpoint at
`{{kbApiBase}}/ws?projectId=<id>` (upgrade `http`→`ws` / `https`→`wss`) and log
incoming frames.

### 4c. Via the filesystem

For a live task, `task.md` is rewritten on every state change, so
`tail -f docs/tasks/<taskId>/task.md` shows the `# Process Logs` growing in
near-real-time. The `status` frontmatter tells you where it is:
`running_agent`, `running_ci`, `running_deploy`, `advancing`, `in_stage`,
`waiting_human`, `paused`, `failed`, `completed`.

---

## 5. Analysing a **past** task

A "past" task is one that completed, failed, or was parked. Everything you need
is on disk — no live service required.

1. **Find the task folder.** List task dirs, newest first:

   ```bash
   ls -lt {{projectCwd}}/docs/tasks/
   ```

   Or find by title/status:

   ```bash
   grep -rl "status: \"failed\"" {{projectCwd}}/docs/tasks/*/task.md
   ```

2. **Read `task.md`** — frontmatter gives status, current stage, timestamps;
   `# History` gives the full event timeline; `# Process Logs` gives output.

3. **Read the stage reports** in the same folder — one per stage run that
   produced one (opt-in agent stages + all failure reports), in
   filename-timestamp order. They tell you what each stage produced and
   whether it passed or failed. Failure reports use the `-failure-` infix.
   For stages that did NOT opt in, reconstruct from `# Process Logs`, the
   session JSONL transcript (`.kainbain/sessions/`), and the git history.

4. **Reconstruct the failure.** For a failed task, check:
   - `status: "failed"` in frontmatter.
   - The last `# History` entries (e.g. `Stage failed: <reason>`).
   - The FAILED stage report (`<stage-slug>-failure-<timestamp>.md`; contains
     the error and fallback routing).
   - `# Process Logs` tail for the actual error output.
   - The API's observability `recentFailed` list (if the service is up) for
     `failureReason` / `lastError`.

5. **Cross-check the deploy** (if the task reached a deploy stage): see
   `<deploy-state-dir>/history.jsonl` and `last-result.json` for whether the
   deploy succeeded and which build went live.

---

## 6. Common analysis recipes

### "Why did this task fail?"

```bash
TASK={{projectCwd}}/docs/tasks/<taskId>
grep -E "status|currentStageId" "$TASK/task.md"          # where it ended
grep -E "^- " "$TASK/task.md" | tail -20                 # last history events
grep -rl "FAILED" "$TASK"/*-failure-*.md                  # failed stage reports
tail -n 40 "$TASK/task.md"                               # process log tail
```

### "What is running right now?"

```bash
curl -s "{{kbApiBase}}/status/observability" | jq '.engine'
```

### "Did the last deploy work / what build is live?"

```bash
cat {{deployDir}}/build.json
cat <deploy-state-dir>/last-result.json
tail -n 50 <deploy-state-dir>/deploy.log
```

### "What did the agent actually do in stage X?"

Read any stage report `<stage-slug>-<timestamp>.md` or
`<stage-slug>-failure-<timestamp>.md` (summary, output, modified files) plus
the `# Process Logs` section of `task.md`. Agent stages that did not opt into
reporting leave no success report — use the session transcript and git log.

### "Is the service healthy?"

```bash
curl -s "{{kbApiBase}}/status/health" | jq
journalctl --user -u <service-unit> -p err -n 50
```

---

## 7. Gotchas

- **Task data is under the project `cwd`, not `{{deployDir}}`.** The deployed
  build dir only holds code + `build.json`.
- **`task.md` is a snapshot, not a full transcript.** Long process logs are
  truncated (cap `KAINBAIN_PROCESS_LOG_MAX_BYTES`, default 200000). For the full
  agent conversation use the session JSONL in `.kainbain/sessions/`.
- **`.kainbain/` is gitignored** — session transcripts and deploy state are
  local-only, not in the repo.
- **`docs/tasks/active/` is human scratch**, not API-written. Don't treat it as
  authoritative.
- **Auto-generated reports** are marked with
  `<!-- KAINBAIN AUTO-GENERATED REPORT -->`; distinguish them from manual ones.
- **Agent-stage success reports are opt-in.** A default agent stage that
  succeeded leaves NO report file — absence of a `<stage-slug>-<timestamp>.md`
  is expected, not data loss. Failure reports (`<stage-slug>-failure-<timestamp>.md`)
  are always written.
- **The engine is single-threaded** (one global `ExecutionQueue`). Only one
  task executes at a time; others queue. `engine.status` is `idle` when nothing
  runs.
- **Interrupted tasks** (server restart mid-run) are rehydrated with status
  `interrupted` and a history entry "Execution recovered after server restart".
- **Auto-iteration:** a failed stage may auto re-run (fix → re-test → re-review)
  up to `KAINBAIN_MAX_AUTO_ITERATIONS` (default 8) before being parked as
  `failed`. Each failed attempt leaves a `<stage-slug>-failure-<timestamp>.md`
  report; multiple failure files for the same stage = auto-iteration attempts.
