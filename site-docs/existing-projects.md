---
title: Load Existing Projects
section: working-with
order: 28
slug: existing-projects
---

# Load Existing Projects

Already have a code repository you want KainBain to work on? Adopt it in
place. **Nothing is moved or deleted** — KainBain only writes its own state
folder inside the repo and remembers where the repo lives.

## Adopt a repo (UI)

1. Open the **Project menu** (top bar, current project name).
2. Choose **+ Add Existing Project…**.
3. Enter the repo's **absolute path** (for example `/home/me/repos/my-app`).
4. Optionally set a display name and a **KainBain Folder Name** if the repo already owns `.kainbain` or you want a different state-folder name (see Custom state folder below).
5. Confirm. The project appears in the menu and becomes selectable.

## Adopt a repo (API)

`POST /projects/register` with `{ "path": "/abs/path" }` (`name` and
`kainbainDirName` optional):

```bash
curl -X POST http://localhost:3100/projects/register \
  -H 'Content-Type: application/json' \
  -d '{"path": "/home/me/repos/my-app"}'
```

The call is **idempotent**: the first adoption returns `201` with the new
project; re-registering a known directory returns the existing project
with `200` instead of creating a duplicate. A missing or invalid path
returns `400` naming the problem.

## Where adopted projects are remembered

- **Inside a configured project root:** projects that are direct children of a root are found by scanning — no record needed.
- **Outside every root:** the repo is remembered in `~/.kainbain/projects.json` (`{ roots: […], projects: […] }`) and re-discovered after a restart. The file is advisory: if it is missing or corrupt, the app still boots, it just forgets the registrations. Override its location with `KAINBAIN_PROJECTS_REGISTRY_FILE`.

To scan whole directories of repos at once, set `PROJECTS_ROOT`
(primary) and `PROJECTS_ROOTS` (extra roots, path-list separated with
`:` on Unix/macOS, `;` on Windows). Projects must be direct children
of a root — anything deeper must be adopted explicitly.

## Custom KainBain state folder

Per-project engine state (`project.json`, `sessions/`, `worktrees/`,
`quarantine/`) lives under `<repo>/.kainbain` by default. A repo that
already owns `.kainbain`, or that wants a different name, sets **Project
Settings → Files & Repos → KainBain Folder Name** (or `kainbainDirName`
on the register/create payload), e.g. `.kb`.

Changing the setting does not move existing state. The safe flow is to
stop the API, rename the folder, then restart — the config is
self-describing, so the project re-scans from the new folder with its
sessions and worktrees:

```bash
# stop the API first
cd /home/me/repos/my-app
mv .kainbain .kb   # only if state already existed under .kainbain
# start the API again
```

If you change the setting in the UI instead, KainBain writes the new
config and removes the superseded one (so a restart cannot revert the
setting), but the old `sessions/`, `worktrees/`, and `quarantine/`
stay on disk — move them across by hand.

The generated `.gitignore` and the git cleanliness guard follow the
same name, so the custom folder stays ignored exactly like `.kainbain/`.

## After adopting

- Shape the pipeline (one agent stage plus a human review is enough to start) in Your First Project & Workflow (`#/docs/first-project`).
- Run work on more machines with Adding a New Runner (`#/docs/add-new-runner`).
- If the repo lives somewhere unusual, check Ports & Environment (`#/docs/ports-env`) for the storage knobs.

(Formerly in `first-project`, removed — adoption and the state-folder
flow now live here as the canonical guide.)
