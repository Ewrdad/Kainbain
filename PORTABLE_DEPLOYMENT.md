# Portable Deployment Guide

Cold-start KainBain on a machine that has never seen it — no homelab
services, no uncommitted notes, no author on call. Pick one scenario:

| | Scenario | Time | You get |
|---|---|---|---|
| **A** | [5-minute Docker](#scenario-a-5-minute-docker) | ~5 min | Production-shaped instance in containers |
| **B** | [Native dev](#scenario-b-native-dev-macoswindowslinux) | ~15 min | API + hot-reload frontend from source |
| **C** | [Work / corporate laptop](#scenario-c-workcorporate-laptop) | varies | Scenario A or B behind a proxy / custom CA / offline fonts |

Prerequisites for every scenario: `git`, and for Scenario A a working
Docker (`docker info` answers); for B/C, Node.js **≥ 20.19**
(`node --version` — the `engines` floor `^20.19.0 || >=22.12.0`;
`.nvmrc` pins 24 for development).

Every scenario ends with the [storage-sanity checklist](#storage-sanity-checklist).
Do not skip it: it is the tripwire for the 2026-10-02 incident class, where a
missing storage link silently degraded into a one-task shadow directory and the
UI showed 1 of 134 tasks. A future storage regression must fail the checklist,
never present an empty board.

> **Clone URL.** The canonical remote is GitHub at
> `https://github.com/Ewrdad/Kainbain.git`. If you are reading
> this in a private mirror, substitute that mirror's URL in the `git clone`
> line — everything after the clone is identical.

## Scenario A — 5-minute Docker

Production-shaped, self-contained, no credentials needed (harness calls
degrade honestly until you provide keys).

```bash
git clone https://github.com/Ewrdad/Kainbain.git
cd KainBain
docker compose up -d
curl http://localhost:3100/status
```

Open **http://localhost:3100** — the API serves the built UI from the same
port, so there is only one URL.

What just happened: the image builds (`Dockerfile`: api + frontend trees,
frontend compiled with same-origin API URLs), the entrypoint verifies the
task-storage mounts *refuse-to-boot* style (an unreachable or unwritable
projects root exits 1 rather than serving an empty list), and compose mounts
`./projects` (your tasks, on the host, survive rebuilds) plus a named volume
for container state.

Useful follow-ups (all optional):

```bash
docker compose logs -f            # watch the boot log
KAINBAIN_PORT=3200 docker compose up -d   # move the host port on clash
cp .env.example .env              # then fill in ONLY secrets (API keys,
                                  # Ollama/LiteLLM URLs) — container paths
                                  # always win over .env
docker compose down               # stop (tasks stay in ./projects)
```

To enable real agent runs, set `KAINBAIN_DEFAULT_HARNESS=mock` in `.env`
for zero-credential evaluation, or add provider keys / a LiteLLM URL
(see [Scenario C](#scenario-c-workcorporate-laptop)) and recreate
(`docker compose up -d` again).

If this instance runs its own KainBain pipeline and deploys itself (a `ci`
stage whose command runs `./deploy.sh --prod` — an ordinary `ci` stage to
the generic pipeline), set `KAINBAIN_SELF_DEPLOY_CONTINUITY=1` in `.env`.
That implementation-specific flag enables the cross-restart continuity
plugin (`api/continuity/`) so the app survives its own redeploy; it is off
by default and generic projects never load that code.

Then run the [storage-sanity checklist](#storage-sanity-checklist).

## Scenario B — Native dev (macOS/Windows/Linux)

From-source dev: API on `:3100` with the Vite frontend on `:5173`.

**1. Install Node.js ≥ 20.19**, then verify:

```bash
node --version   # want v20.19.0 or newer (or v22.12.0+)
npm --version    # want 10 or newer
```

| OS | Install path |
|---|---|
| macOS | `brew install node@22`, or the LTS pkg from nodejs.org, or `nvm install 24` |
| Windows | The LTS `.msi` from nodejs.org, or `winget install OpenJS.NodeJS.LTS` |
| Linux | The NodeSource distros, `nvm install 24`, or your package manager's ≥ 20.19 build |

(`.nvmrc` / `.node-version` pin 24 — `nvm use` just works. CI proves the
20.x floor and 22.x on all three OSs on every push.)

**2. Clone and install** (one command installs root + api + frontend +
canary trees, then Playwright Chromium — Linux additionally tries the
browser system deps and falls back with a warning without root):

```bash
git clone https://github.com/Ewrdad/Kainbain.git
cd KainBain
npm run setup
```

**3. Configure (optional — defaults boot clean).** No `.env` is needed to
start: every knob has a default. When you need secrets or non-defaults:

```bash
cp .env.example .env   # fill in ONLY what you change; it is gitignored
```

Note the API does **not** auto-load `.env` — either export what you need
(`export KAINBAIN_DEFAULT_HARNESS=mock`) or start the API as
`node --env-file=.env api/index.js` (from the repo root). Every knob the
API reads is declared once in `api/config/schema.js`, validated at boot
(a malformed value fails the boot with a `CONFIG <VAR>: …` diagnostic —
fix the value), and documented in the generated `.env.example`.

If your API is not on `:3100`, tell the frontend where it lives (Vite
inlines these at dev start):

```bash
cp frontend/.env.example frontend/.env   # then set VITE_API_BASE / VITE_WS_URL
```

**4. Start both servers:**

```bash
npm run dev
```

`npm run dev` frees `:3100`/`:5173` (override with `PORT` / `VITE_PORT`),
then supervises the API (`node index.js` in `api/`) and Vite together —
Ctrl-C stops both. Prefer separate terminals:

```bash
(cd api && PORT=3100 node index.js)
(cd frontend && npm run dev)
```

Open **http://localhost:5173** (dev UI) — it talks to the API on `:3100`.

Then run the [storage-sanity checklist](#storage-sanity-checklist).

## Scenario C — Work/corporate laptop

Start from Scenario A (Docker) or B (native), then apply the corporate
adjustments you need. Each is independent.

**Proxy.** Install-time tooling honors the standard variables — set them
before `npm run setup` / `docker compose`:

```bash
export HTTP_PROXY=http://proxy.corp:8080 HTTPS_PROXY=http://proxy.corp:8080
export NO_PROXY=localhost,127.0.0.1
```

(`npm`, `git`, and Docker all read these; `NO_PROXY` keeps the local API,
Vite, and any same-machine LiteLLM direct.) Known gap, stated plainly:
the API's own outbound model calls do not currently route through
`HTTP_PROXY` — in a proxy-only network, point the box at an in-network
[local LiteLLM](#local-litellm-or-mock-harness) or run the
[mock harness](#local-litellm-or-mock-harness) instead of reaching clouds
directly.

**Custom CA.** Corporate TLS interception works with one variable — Node
honors it natively, and the server reads no other CA path, so boxes
without the homelab CA boot identically:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/corp-ca.pem
```

Set it before `npm run setup` (npm/fetch trust) and before `npm run dev`
/ `docker compose up` (API trust). There is no implicit fallback: unset
means the OS default store only.

**Offline / blocked fonts.** The UI hard-links Google Fonts
(`fonts.googleapis.com` / `fonts.gstatic.com`) but loads them
asynchronously with system fallbacks (`Hanken Grotesk` →
`ui-sans-serif, system-ui`; `JetBrains Mono` → `ui-monospace, Menlo,
Consolas, monospace`): on a blocked network the app is fully usable in
fallback fonts, icon glyphs may show as text until the font arrives, and
nothing hangs waiting. No configuration needed.

**Git author.** Fresh machines often have no git identity — engine commits
would fail. Either set yours:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@corp.example"
```

or do nothing: the API provisions a repo-local fallback
(`KAINBAIN_GIT_AUTHOR_NAME` / `KAINBAIN_GIT_AUTHOR_EMAIL`, defaulting to
`KainBain Agent <kainbain@local>`) the first time a project needs to
commit, never touching your global config.

**Local LiteLLM or mock harness.** Real agent runs need a model path —
pick one:

```bash
# Option 1: local LiteLLM (same machine or in-network; no cloud egress).
# The health probe tries, in order: LITELLM_URL, LITELLM_HOST,
# https://litellm.local, http://localhost:4000.
export LITELLM_URL=http://localhost:4000

# Option 2: zero-credential evaluation — deterministic echo sessions,
# no CLIs, no keys, no network. Explicit selection only; it never
# engages silently, so synthetic output can't mask a real outage.
export KAINBAIN_DEFAULT_HARNESS=mock
```

(Ollama Cloud follows the same shape: `OLLAMA_CLOUD_URL`, else
`https://ollama.com`, else `https://ollama.ai`. All three are optional —
unset means "not configured", honestly reported in health.)

Then run the [storage-sanity checklist](#storage-sanity-checklist).

## Scenario D — bring your existing repositories (multi-project)

Start from Scenario A (Docker) or B (native). This scenario points KainBain at
repositories you already have, across one or more directories, and optionally
gives a project its own state-folder name.

**1. Point at the roots that hold your repos.** `PROJECTS_ROOT` is the primary
root (one project per direct child directory); `PROJECTS_ROOTS` adds more.
Projects must be direct children of a root, or adopted explicitly (step 3).

```bash
# Linux/macOS (os path-list separator is ':'):
export PROJECTS_ROOT="$HOME/projects"
export PROJECTS_ROOTS="$HOME/work:/mnt/nas/repos"
# Windows (separator is ';'):
# set PROJECTS_ROOTS=%USERPROFILE%\work;D:\repos
```

Restart the API. Every direct child carrying a KainBain config file
(`<dir>/.kainbain/project.json`, or the project's custom state folder) appears
on the board. Stray directories are ignored, never turned into projects.

**2. Adopt a repo that lives outside every root.** Use the UI (**Project menu →
“+ Add Existing Project…”**) or the API:

```bash
curl -X POST http://localhost:3100/projects/register \
  -H 'Content-Type: application/json' \
  -d '{"path":"/home/me/repos/one-off","name":"One Off","kainbainDirName":".kb"}'
```

Adopted directories outside every root are recorded in
`~/.kainbain/projects.json` (`KAINBAIN_PROJECTS_REGISTRY_FILE`) and re-discovered
after a restart. The call is idempotent. Repos inside a configured root need no
registry entry.

**3. Custom state folder (optional).** A project whose repo already owns
`.kainbain`, or that wants `.kb`, sets its state-folder name in **Project
Settings → KainBain Folder Name** (or `kainbainDirName` on the register/create
payload). Existing state is never moved automatically. Preferred flow: stop
the API, rename the folder, restart — the config is self-describing, so the
project re-scans from the new name with its state intact:

```bash
# stop the API first
cd /home/me/repos/one-off
mv .kainbain .kb   # only if you already had state under .kainbain
# start the API again
```

Changing the setting in the UI writes the new config and removes the superseded
one (a restart can never revert the setting or split state across two folders),
but `sessions/`, `worktrees/`, and `quarantine/` stay in the old folder — move
them across by hand.

Then run the [storage-sanity checklist](#storage-sanity-checklist).

## Storage-sanity checklist

Run this after every scenario, and again after any restore, migration, or
unclean shutdown. It takes two minutes and is the tripwire for the
empty-board incident class.

**1. The server answers.**

```bash
curl http://localhost:3100/status
```

Want: HTTP 200 with `"status":"ok"` JSON (Docker serves UI + API on
`:3100`; native dev serves the API on `:3100` and the UI on `:5173` —
use your `PORT` if you overrode it).

**2. The board is non-empty after a restore.** Create a project and a task
(substitute your port), restart the server, and count — the count must
survive the restart:

```bash
PID=$(curl -s -X POST http://localhost:3100/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sanity"}' | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).id))")
curl -s -X POST http://localhost:3100/tasks \
  -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PID\",\"title\":\"sanity\",\"goal\":\"prove restore\"}" > /dev/null
# ... restart the server (Ctrl-C + npm run dev, or docker compose restart) ...
curl -s "http://localhost:3100/tasks?projectId=$PID" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log('task count after restart:',JSON.parse(s).length))"
```

Want: `task count after restart: 1` (or your pre-restart count — the
invariant is *unchanged and non-zero*, never silently zero).

**3. The automated form passes.** From the repo root:

```bash
node scripts/storage-sanity.mjs
```

Want: `storage-sanity: PASS (restore non-empty, shadow detector armed)`.
It boots fixture storage through the same `ensureDocsLink` + `scanTasks`
path the UI reads, asserts a 3-task restore is complete, and proves the
shadow detector fires. This is also a CI step on all six matrix legs.

**4. Know the diagnostic.** If the count ever drops unexpectedly, the
storage link is the first suspect. `ProjectStore.ensureDocsLink` reports
one state per project at startup (and `deploy.sh check_docs_link` echoes
the same warning on the deploy path):

| State | Meaning | Action |
|---|---|---|
| `ok` | Link points at the configured notes space | none |
| `repaired` / `repaired-broken-link` | Missing/dangling link recreated | none (self-healed; in the log) |
| `shadowed` | Real `docs/` dir hides a populated notes space — the incident shape | **Stop.** Merge newer files from `docs/tasks/` into the notes space, then replace `docs` with a symlink to it. Never delete either side blind. |
| `foreign-link` | Link points at a different existing space | Point it at the configured notes space, or fix the config |
| `link-missing` / `broken-link` | Repair was attempted and failed (permissions?) | Fix the filesystem permission, restart |
| `notes-missing` | No notes space at all (fresh clone) | none on first boot; on an old box, restore the space |
| `local-dir` | Real dir, empty notes space (future local backend) | none |
| `no-cwd` | Project record has no working directory (corrupt `project.json`) | Fix or re-create the project record |
| `unexpected` | `docs` is neither a symlink nor a directory | Inspect it by hand; then re-run this checklist |

The `shadowed` log line quotes the merge procedure verbatim — follow it,
then re-run this checklist.

**5. A fresh boot has no junk projects.** On a clean machine the board starts
empty: sample projects (`Project A`–`Project D`) are **not** seeded unless you
set `KAINBAIN_SEED_SAMPLE_PROJECTS=1`. If you see them, the flag is on or they
are genuinely on disk from an older run — remove the directories under
`PROJECTS_ROOT`, or hide them with the project switcher’s *Hide* action.

**6. Every configured root is discovered.** Adopt a repo outside every root
(`POST /projects/register`), restart, and confirm it is still on the board:

```bash
curl -s http://localhost:3100/projects \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
      const p=JSON.parse(s).map(x=>x.cwd).sort();console.log(p.join('\\n'));})"
```

Want: every root’s projects plus the adopted path. A missing adopted project
means the registry file (`~/.kainbain/projects.json`) is unreadable — check
permissions and re-run the register call.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run dev` says a port is taken | `PORT=3210 VITE_PORT=5210 npm run dev` (and point `frontend/.env` at the API port) |
| `docker compose up` port clash | `KAINBAIN_PORT=3200 docker compose up -d` |
| `engines` / `EBADENGINE` on install | Upgrade Node to ≥ 20.19 on the 20.x line, or ≥ 22.12 (`node --version`) |
| Playwright system-deps warning on Linux | Harmless without root — the browser installs alone; install OS packages only if Chromium fails to launch |
| `CONFIG <VAR>: …` boot failure | The named variable is malformed — fix its value (missing/empty still falls back to the default silently) |
| Windows symlink privilege error | Enable Developer Mode (or run elevated once) — project creation symlinks `docs/`; the failure is loud, never silent |
| Board shows fewer tasks than expected | Storage-sanity checklist step 4 — check for `shadowed` before anything else |

## What this guide does not cover

The author's homelab production deployment (systemd user unit, nginx,
`https://kainbain.home`) is documented in the root `README.md` under
"Author's homelab production setup" — it is one specific production
instance, not a procedure. Everything above stands without it.
