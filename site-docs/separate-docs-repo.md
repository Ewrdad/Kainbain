---
title: Separate Docs Repo (Stealth Mode)
section: workflows
order: 56
slug: separate-docs-repo
---

# Separate Docs Repo (Stealth Mode)

By default a project keeps all KainBain-specific information inside its own repo: `docs/tasks/*` (plans, reports, surveys) and the `.kainbain/` state folder. On a shared or public repo you may not want any of that visible — to other team members, or to the public.

A project can instead store **everything KainBain** in a separate, private git repo (the *docs repo*). The main repo then stays completely free of KainBain traces: no `docs/tasks/`, no `.kainbain/`, no `.gitignore` entries, no pointer file.

## When to use it

- The main repo is public or shared with people who do not use KainBain.
- The project is large and its KainBain task history would bloat the repo.
- You want to use KainBain at work without the rest of the team opting in.

## Setting it up

**On create or import** (recommended, especially on import): both the New Project and the Add Existing Project dialogs show **Docs Repository URL** and **Docs Repo Local Path** right in the form — the *Advanced options: separate docs repo* section is expanded by default. The local path is the absolute path where the docs repo is (or will be) checked out on this machine; when left blank, KainBain provisions a sibling `<project-dir>-kainbain-docs` directory. The first-run one-click adopt (Found on disk) registers with no docs repo — use Adopt Existing… instead when you need one at import time.

**On an existing project**: Project Settings → Files & Repositories carries the same fields in a *Separate Docs Repository* block (with an Enabled/Disabled status line); the Project tab shows a compact summary row with a jump button, and typing "separate docs repo" in the settings search jumps straight to the fields. System Settings itself has no docs-repo setting (it is per-project) — a pointer at the top of System Settings routes you there. Saving provisions the docs repo and moves all *new* KainBain docs/state into it.

The docs repo URL is stored credential-redacted; authentication uses the same login as the main repo (ambient git credentials — same host, same credential helper). One docs repo per project; a second project claiming the same URL or path is refused with a 409.

## How it works

- The backend treats the docs-repo checkout as the project's *KainBain home*: `project.json`, sessions, and `docs/tasks/*` all live there. Every docs path resolver maps through one seam (`resolveKainbainHome`), so nothing is written into the main repo.
- Runners check out the docs repo **adjacent** to the main repo (`<workRoot>/kb-<taskId>-docs` next to `kb-<taskId>`, each from its own mirror) and keep the **same `kb/<taskId>` task branches synced** in both repos. At stage handoff the docs worktree is committed and pushed *first*, so a code branch never appears on the shared remote without its docs twin.
- Task prompts keep working unchanged: absolute `.../docs/tasks/<id>` paths in curated prompts are retargeted to the runner's docs worktree automatically.
- The engine rediscovers docs-repo projects after a restart through a small pointer file (`docs-repo-pointers.json`, stored next to the projects registry — never inside a project repo) that maps each main checkout to its docs checkout. Moving a project directory or deleting a project updates the pointer automatically.

## Backups and moving hosts

The docs repo lives **outside** the main repo, so it is outside whatever backs the main repo up. Back up the docs checkout (or just keep its remote pushed — runners push `kb/*` branches there at every stage handoff). When moving hosts, move the docs checkout alongside the main checkout and keep the same absolute paths, or update the local path in settings afterwards; the pointer file moves with the backend's home directory.

## Existing docs when you switch on

Old docs are **left where they are** — only new work goes to the separate repo (safe and reversible). To move existing `docs/tasks/*` and `.kainbain/*` manually: create the docs repo, copy those paths in, commit and push, then remove them from the main repo and enable the docs repo in settings.

## Verifying the main repo is clean (stealth checklist)

```bash
git status --porcelain          # nothing KainBain-related untracked/modified
git log --all --oneline -- .kainbain docs/tasks   # no history touching them
git ls-files | grep -E '(^|/)\.kainbain/|^docs/tasks/'   # nothing tracked
cat .gitignore                  # no KainBain ignore entries added by the engine
```

The backend test suite includes a snapshot gate that fails if provisioning or a task run writes anything KainBain-related into the main repo.

## Limitations (v1)

- One docs repo per project (no sharing across projects yet).
- Code still works on `kb/<taskId>` branches in the main repo — only docs and state move. Keeping working branches out of the shared repo too is a planned follow-up.
- Synced `kb/*` docs branches are a Runner flow: stages executed by Runners commit and push them, but stages run embedded in the backend process (no Runner) write docs into the docs checkout on its current branch without committing — commit there by hand if you mix the two.
- A docs repo with only a local path (no URL) can only run where that checkout exists: remote Runners fail the task loudly instead of guessing. Give the project a docs repo URL if remote Runners must pick it up.
- Switching the docs repo off (clearing the URL in settings) never deletes anything: the docs checkout stays on disk exactly as it was, and the project simply goes back to keeping docs/state in the main repo. Task docs already pushed live on `kb/*` branches of the docs remote — merge or push them there first if you want them on the docs repo's main branch; the engine does not merge docs branches automatically in v1.
