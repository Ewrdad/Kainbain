# PROD VERIFICATION — confirming which cause fires on a real affected MR

> **PERMISSION REQUIRED.** Everything in this file touches the **live
> deployment**. Do not run any of it without explicit user permission.
> All commands below are **read-only** by design:
> - API `GET`s and `git ls-remote` / `git rev-parse` / `git cat-file -e` /
>   reading `task.md` mutate nothing.
> - Do **not** run `git fetch` inside the prod project checkout unless
>   explicitly permitted — even a fetch mutates local remote-tracking refs.
> - Do **not** create tasks, dispatch agent stages, approve/merge, or write
>   anything. The one end-to-end scenario that would require a real agent
>   invocation is described in §5 and must **not** be tried without explicit
>   permission (and preferably never in prod at all).

Context: `skills/kainbain-task-analysis/SKILL.md` (deployment shapes, log
locations, API surface). Let `KB_API` be the API base (prod URL or service
`PORT` — never assume localhost in prod), `PID` a project id, `TID` a task id
of a blank-review MR.

## 1. Confirm the symptom server-side (API, read-only)

```bash
# find blank-review tasks
curl -s "$KB_API/tasks?projectId=$PID" | jq '.[] | {id, title, status, branch}'
curl -s "$KB_API/tasks/$TID?projectId=$PID" | jq '{id, status, branch, reviewBaseline, baseBranch, workflowId}'

# the payload the UI renders — this distinguishes causes:
curl -s "$KB_API/projects/$PID/tasks/$TID/review?projectId=$PID" \
  | jq '{files, commits: (.commits|length), aheadBy, behindBy, reason,
         filteredTaskFilesCount, uncommittedChanges, branch, baseBranch,
         preserved, preserveNote, newSinceMerge}'
```

Interpretation:

| payload shape | points at |
|---|---|
| `files: []`, `reason: null`, `filteredTaskFilesCount: 0`, `aheadBy: 0`, `behindBy: 0` | cause 1 (stale local ref) or 2a (base absorbed head) — check §2/§3 |
| `files: []`, `filteredTaskFilesCount > 0` | cause 3 — docs-only task, by design |
| `preserved: true` with empty `files`, or `preserveNote` set | cause 4 |
| `files: [...]` populated but UI blank | cause 5 — only then look at the frontend |

## 2. Cause 1 check — do backend local refs lag origin? (read-only git)

On the **backend host**, in the project's `cwd` (from
`<project cwd>/.kainbain/project.json` → `"cwd"`):

```bash
cd "$PROJECT_CWD"
TBRANCH=$(curl -s "$KB_API/tasks/$TID?projectId=$PID" | jq -r '.branch')
echo "local : $(git rev-parse refs/heads/$TBRANCH 2>&1)"
echo "remote: $(git ls-remote origin refs/heads/$TBRANCH | cut -f1)"
# diverged  =>  cause 1 confirmed for this MR (review path never fetches;
# the local ref was create-only at the base tip via ensureTaskBranchRef)
# equal     =>  cause 1 not firing here; go to §3
# also: which commits does the REMOTE diff have?
git fetch --dry-run origin >/dev/null 2>&1; git ls-remote origin | grep -E "$TBRANCH|refs/heads/main"
```

Safe alternative that never touches local refs at all: compare
`git rev-parse refs/heads/$TBRANCH` against `git ls-remote` only (as above) —
skip anything that writes. To see what the diff *would* be after a fetch,
do it in a **separate throwaway clone** of the repo, never in `project.cwd`.

Also confirm the stage actually ran on a Runner (not embedded):
`KAINBAIN_RUNNER_EXECUTION_ONLY` defaults to true
(`api/flow/execution/executeStage.js:229-251`). Runner-executed stages keep
their session in the per-task worktree on the **Runner host**; embedded runs
write `<project cwd>/.kainbain/sessions/*.jsonl`. Check
`GET $KB_API/status/observability?projectId=$PID` and the task's `# History`
in `docs/tasks/$TID/task.md` for dispatch/deferral lines
(`deferred: "runner-dispatch"`).

## 3. Cause 2 check — pipeline destination/base (read-only)

```bash
# effective base resolution order: task.baseBranch -> workflow.baseBranch -> repo default
curl -s "$KB_API/tasks/$TID?projectId=$PID" | jq '{baseBranch, workflowId, reviewBaseline}'
# pipeline record (workflow) baseBranch:
curl -s "$KB_API/projects/$PID" | jq '.workflows // .pipelines // empty'   # locate the workflow record
cd "$PROJECT_CWD"
git rev-parse --verify refs/heads/<pipelineBase> 2>&1        # local base exists?
git ls-remote origin refs/heads/<pipelineBase> | cut -f1      # remote base tip
# base exists remotely but NOT locally => resolveReviewBase silently fell back
#   to the repo default (cause 2b)
# base (local or remote) already contains the task branch => three-dot diff empty (cause 2a)
# check containment without fetching, from a throwaway clone:
#   git merge-base --is-contains origin/<base> origin/$TBRANCH && echo "base absorbed head"
```

`task.md` frontmatter (`docs/tasks/$TID/task.md` under `project.cwd`) also
carries `branch`, `baseBranch` (if pinned), and `reviewBaseline` — read it
directly.

## 4. Cause 4 check — preservation flag + baseline SHAs (read-only)

```bash
cd "$PROJECT_CWD"
jq -r '.preserveReviewDiffAfterMerge // "unset"' .kainbain/project.json 2>/dev/null \
  || curl -s "$KB_API/projects/$PID" | jq '.preserveReviewDiffAfterMerge'
grep -A6 'reviewBaseline' docs/tasks/$TID/task.md
# do the frozen SHAs resolve locally? (read-only)
git cat-file -e <baseSha> && echo base-ok || echo base-MISSING
git cat-file -e <headSha> && echo head-ok || echo head-MISSING
# MISSING + runner-pushed commits  =>  cause 4 x cause 1 interaction
```

## 5. End-to-end scenario (real agent invocation) — DO NOT RUN WITHOUT EXPLICIT PERMISSION

The only way to observe the full bug end-to-end is to let a **real agent
stage** run on a **real Runner**, push commits, reach a human checkpoint, and
then open the review. How it would go, on a **scratch/staging project only**:

1. Create a throwaway project (its own repo with an `origin`) and a pipeline
   with an agent stage + human review stage; attach a Runner.
2. Create a task; watch `GET $KB_API/status/observability` until the stage is
   `deferred: "runner-dispatch"` and then running on the Runner.
3. The Runner commits in its worktree and pushes `kb/<task>` to origin
   (`runner/gitOps.js` `commitAndPush`); the task parks at `waiting_human`.
4. Open `GET /projects/$PID/tasks/$TID/review` on the backend **without**
   fetching in `project.cwd`: expect `files: []`, `aheadBy: 0`, `reason: null`
   while `git ls-remote origin refs/heads/kb/<task>` shows the agent commits —
   the bug reproduced live.
5. Then (only with permission, since even `fetch` mutates remote-tracking
   refs in that checkout) `git fetch origin` in the project cwd and re-call
   the review after forcing a remote-aware diff → files appear. That delta is
   the proof a fetch/remote-aware head fixes it.

**Flag:** steps 1–4 involve real agent invocation and writes to a shared
origin. They must not be attempted against prod or any shared project without
explicit user permission; prefer a disposable staging project. Nothing in
this stage has run any of it.

## 6. Service logs (read-only) — corroboration

```bash
docker compose logs --tail 200 backend | grep -i "review\|fetch"   # compose deploys
journalctl --user -u <service-unit> -n 200                            # native self-host
```

Look for the `GET /projects/:p/tasks/:t/review` requests (they'll show 200,
not errors — consistent with an empty payload rather than a crash) and for
absence of any fetch around review time. Per-task evidence:
`docs/tasks/$TID/task.md` `# History` (snapshot commits, branch provisioning
warnings) and `# Log Entries`.

## 7. Decision tree (map observations → cause)

```text
review payload files:[] , aheadBy:0 , filteredTaskFilesCount:0
 ├─ local refs/heads/kb/<t> != ls-remote origin kb/<t>   → CAUSE 1 (stale local ref, no fetch)
 ├─ local == remote, but base absorbed head (merge-base --is-contains) → CAUSE 2a
 ├─ pipeline base missing locally (silent fallback to default)         → CAUSE 2b
 └─ preserved:true / preserveNote with unresolvable SHAs              → CAUSE 4
review payload files:[] , filteredTaskFilesCount>0                      → CAUSE 3 (by design, docs-only)
review payload files:[...] but UI blank                                 → CAUSE 5 (frontend) — rare
```
