---
title: Your First Project & Workflow
section: working-with
order: 30
slug: first-project
---

# Your First Project & Workflow

## Create a project

In the UI, create a project with a name and a working directory (`cwd`) — the sandbox root the agent's file tools and the Files & Repo explorer are confined to. Or via API:

```bash
curl -X POST http://localhost:3100/projects \
  -H 'Content-Type: application/json' \
  -d '{"name": "My app", "cwd": "/home/user/projects/my-app"}'
```

`POST /projects/:id/activate` marks the default project used when calls omit `projectId`.

## Adopt an existing repository

Already have a repository you want KainBain to work on? Adopt it in place —
nothing is moved or deleted:

- UI: **Project menu → “+ Add Existing Project…”**, then enter the absolute
  path (optionally a display name and a state-folder name).
- API: `POST /projects/register` with `{ "path": "/abs/path", "name"?, "kainbainDirName"? }`.

```bash
curl -X POST http://localhost:3100/projects/register \
  -H 'Content-Type: application/json' \
  -d '{"path": "/home/me/repos/my-app"}'
```

The call is idempotent (re-registering returns the existing project). A repo
that lives outside every configured project root is remembered in
`~/.kainbain/projects.json` and re-discovered after a restart. To scan a whole
directory of repos, set `PROJECTS_ROOTS` (path-list separated) alongside the
primary `PROJECTS_ROOT` — projects must be direct children of a root, or
adopted explicitly.

## Custom KainBain state folder

Per-project engine state (`project.json`, `sessions/`, `worktrees/`,
`quarantine/`) lives under `<cwd>/.kainbain` by default. A repo that already owns
`.kainbain`, or that wants a different name, sets **Project Settings → KainBain
Folder Name** (or `kainbainDirName` on the register/create payload), e.g. `.kb`.

Changing the setting does not move existing state. The safe flow is to stop
the API, rename the folder, then restart — the config is self-describing, so
the project re-scans from the new folder with its sessions and worktrees:

```bash
# stop the API first
cd /home/me/repos/my-app
mv .kainbain .kb   # only if state already existed under .kainbain
# start the API again
```

If you change the setting in the UI instead, KainBain writes the new config and
removes the superseded one (so a restart cannot revert the setting), but the old
`sessions/`, `worktrees/`, and `quarantine/` stay on disk — move them across by
hand.

The generated `.gitignore` and the git cleanliness guard follow the same name,
so the custom folder stays ignored exactly like `.kainbain/`.

## Shape the pipeline

Each project owns an ordered stage list. Start simple — one agent stage plus a human review:

- `GET /projects/:id/workflow` — inspect stages, `currentStageId`, named workflows.
- `PUT /projects/:id/workflow` — replace the stage list (`{ stages: [...] }`).
- `POST /projects/:id/workflows` — save a named variant; `GET` the collection to list them.

Keep stage instructions short and verifiable ("implement X, prove with `npm test`"), and attach a **stage skill** when one stage needs heavy domain instructions.

## Explore

The **Files & Repo** tab (keyboard `2`) browses the project's sandboxed filesystem with markdown/code preview and links out to notes and git. It is read-only exploration — real changes happen through tasks.
