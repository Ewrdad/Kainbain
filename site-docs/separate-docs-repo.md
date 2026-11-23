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

**On create or import** (recommended, especially on import): open the *Advanced options* disclosure in the New Project / Add Existing Project dialog and fill in **Docs Repository URL**. On import you can also set **Docs Repo Local Path** — the absolute path where the docs repo is (or will be) checked out on this machine. When left blank, KainBain provisions a sibling `<project-dir>-kainbain-docs` directory.

**On an existing project**: Project Settings → Files & Repositories carries the same fields; saving provisions the docs repo and moves all *new* KainBain docs/state into it.

The docs repo URL is stored credential-redacted; authentication uses the same login as the main repo (ambient git credentials — same host, same credential helper). One docs repo per project; a second project claiming the same URL or path is refused with a 409.

## How it works

- The backend treats the docs-repo checkout as the project's *KainBain home*: `project.json`, sessions, and `docs/tasks/*` all live there. Every docs path resolver maps through one seam (`resolveKainbainHome`), so nothing is written into the main repo.
- Runners check out the docs repo **adjacent** to the main repo (`<workRoot>/kb-<taskId>-docs` next to `kb-<taskId>`, each from its own mirror) and keep the **same `kb/<taskId>` task branches synced** in both repos. At stage handoff the docs worktree is committed and pushed *first*, so a code branch never appears on the shared remote without its docs twin.
- Task prompts keep working unchanged: absolute `.../docs/tasks/<id>` paths in curated prompts are retargeted to the runner's docs worktree automatically.

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
- Switching the docs repo off (clearing the URL in settings) never deletes anything: the docs checkout stays on disk exactly as it was, and the project simply goes back to keeping docs/state in the main repo. Task docs already pushed live on `kb/*` branches of the docs remote — merge or push them there first if you want them on the docs repo's main branch; the engine does not merge docs branches automatically in v1.
