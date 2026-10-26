# Custom command harness

How a project can run agent stages through ANY command-line AI agent (e.g. `claude -p`,
`muse exec --yolo`) without a dedicated harness integration.

## What it is

The custom harness is the documented **workaround for second/third-tier harnesses**: a
project selects **Custom command** in the Project Settings harness dropdown and enters a
free-text command line in `project.harnessCommand`. Agent stages then run that command
exactly like any other agent step, with the curated prompt (task goal + stage
instructions + skills + prior stage reports) appended as the FINAL argument:

```
claude -p        →  claude -p "<curated prompt>"
muse exec --yolo →  muse exec --yolo "<curated prompt>"
```

It does not replace dedicated harness support (pi) — it is the escape hatch for CLI
agents that have no dedicated integration yet.

## How it works

- Registered in `api/agent/harnessRegistry.js` under the id `custom`
  (`api/agent/harnesses/custom/customHarness.js` is the whole implementation).
- Project settings persist two fields (both only when explicitly set):
  - `project.harness = "custom"` — the harness selection.
  - `project.harnessCommand` — the free-text command line.
- Session resolution is unchanged: `resolveHarnessForProject(project)` → the custom
  harness → `createSession(project, { taskId, stageId })` → a FRESH session per stage
  run whose only context is the curated prompt.
- `session.prompt(curatedPrompt)` spawns the command with the prompt appended and
  streams the child's stdout as assistant deltas; stderr lines surface on the activity
  console through the event bridge (`[custom:stderr] …`).
- Exit code 0 → the stdout is the stage's assistant output. Non-zero → the stage fails
  with the CLI's own stderr diagnosis (classified by the runner like any other error).
- Stage timeout → the runner aborts → the whole child process group is killed.

## Command line grammar

The command line is tokenized shell-style (no expansion), then spawned WITHOUT a shell
(the `git.js` convention):

- Whitespace separates tokens; single/double quotes group arguments
  (`claude -p --model "sonnet 4"`).
- Leading `VAR=value` tokens become environment assignments for the child
  (`ANTHROPIC_API_KEY=sk-… claude -p`).
- The curated prompt is appended as the final argv element — never shell-interpolated,
  so quotes/newlines in the prompt travel verbatim.
- Shell operators (`|`, `;`, `&`, `>`, `<`, `$`, backtick, parens) OUTSIDE quotes are
  rejected with a clear error — wrap those in a script file instead
  (`./my-agent-wrapper.sh`).
- The child runs in `project.cwd` with the server's environment plus `PROJECT_CWD` and
  `TASK_ID`; stdin is closed (EOF).

## Deliberate limitations

- **No model control** — a free-text command has no model registry: `/harnesses/custom/models`
  serves the curated fallback list, and a stage requesting a model gets a visible
  `[WARN]` (no silent model swap).
- **No persisted history** — custom sessions are one-shot per stage; `readHistoryFromDisk`
  reports empty. Interactive chat with a custom project still works (one command run per
  message), but nothing is resumed from disk.
- **No steering/tree tools** — optional session capabilities are absent; the HTTP routes
  degrade with `501 unsupported_by_harness`.
- Stuck-check diagnosis keeps using the default harness (pi), independent of the
  project's harness choice.

## Security model

The command line is configured by the project owner (a trusted operator of this
self-hosted instance), the same trust level as CI/deploy stage commands. Two hard
guarantees:

1. The prompt NEVER passes through a shell — commands spawn as argument arrays, so
   prompt content cannot inject shell syntax.
2. Shell-operator syntax is rejected outright rather than interpreted; operators belong
   in a wrapper script the owner controls.

## Recipe: Muse Code today (Tier 0, no dedicated harness needed)

Verified live on the host (`muse` launcher installed):

1. Project Settings → Agent harness → **Custom command**.
2. Command line: `muse exec --yolo --workspace .` (the spawn cwd is
   `project.cwd`, so `.` pins the workspace root; `--yolo` trusts it for
   the run — verified with and without explicit `--workspace .`).
   Credentials beyond muse's own `~/.config/muse` cache can use leading
   `VAR=` assignments, e.g.
   `MUSE_API_KEY=… muse exec --yolo --workspace .`.
3. Behavior: the prompt arrives as the final argv element; exit 0 → stdout
   is the stage output; `--json` output arrives as undifferentiated text
   (fine for second/third-tier use); non-zero exit fails the stage with
   muse's stderr diagnosis; abort kills the process group.
4. Known limits: no model control (curated fallback + `[WARN]`), no
   persisted history, no steering; review stages with very large prompts
   should use the Tier 1 harness (`./MuseHarness.md`), which stages them
   via `--prompt-file` instead of a single argv element.

## Recipe: Mistral Vibe CLI today (Tier 0, no dedicated harness needed)

Verified live on the host (`vibe` 3.0.2 installed at `~/.local/bin/vibe`,
already logged in via its `~/.vibe/` session cache):

1. Project Settings → Agent harness → **Custom command**.
2. Command line: `VIBE_CLI=python vibe --prompt … --output streaming
   --auto-approve --trust --workdir .` (the spawn cwd is `project.cwd`, so
   `--workdir .` pins the workspace root; `--trust` skips the trust prompt
   headlessly; `--auto-approve` approves tool calls without prompting).
   **Prefix `VIBE_CLI=python`** (or export `KAINBAIN_VIBE_CLI=python`/
   `VIBE_CLI=python` in the service environment): on Vibe 2.26 the launcher
   could select a Rust TUI behind the same launcher whose `clap` parser
   REJECTS `--output-dir` (`error: unexpected argument '--output-dir' found`,
   exit 2) via an upstream rollout. On Vibe 3.0 the unified Rust TUI accepts
   the flag, so the pin is a harmless no-op — it is retained so 2.x installs
   keep working. Credentials beyond vibe's own login cache can use an
   env-provided `MISTRAL_API_KEY` as an optional override.
3. Behavior: the prompt arrives as the final argv element; exit 0 → stdout
   streams newline-delimited JSON message rows (answer text in the
   `assistant` rows); `--output-dir DIR` additionally writes `export.json`
   (`outcome`, `stop_reason`, `usage`, `cost_usd`, `steps`); non-zero exit
   fails the stage with vibe's stderr diagnosis; abort kills the process
   group.
4. Known limits: no model control (the CLI manages its own model), no
   persisted history, no steering; for the full event vocabulary
   (`assistant_delta`, `tool_started`/`tool_finished`, cost/usage settle
   lines) use the Tier 1 harness (`./VibeHarness.md`).

## Tests

- `api/agent/harnesses/custom/customHarness.contract.test.js` — contract conformance
  gate + parsing/spawn/abort/exit-code behavior against real processes.
- `api/customHarness.stageRun.integration.test.js` — full stage run through the real
  SessionStore + createAgentRunner (curated prompt appended, stdout becomes stage
  output, failures classified, model requests degraded loudly).
- `api/routes/harnesses.test.js`, `api/routes/projects.test.js`,
  `api/projectStore.test.js`, `api/sessionStore.lifecycle.test.js` — API + persistence.
- `frontend/src/components/settings/ProjectSettings.test.jsx` — dropdown, command input,
  save payload.
