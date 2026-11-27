# GUIDE — Cause 3: `filterTaskFiles` strips `docs/tasks/**`, so docs-only tasks render a blank Files Changed **by design**

**Status: REPLICABLE LOCALLY (SAFE), and intended behaviour for no-code
stages.** Important nuance for triage: this cause produces the
`"N task file(s) hidden"` hint (`filteredTaskFilesCount > 0`), **not** the
default "Nothing to review yet" text seen in the screenshot — so cause 3
alone does not explain the pictured MR, but it fully explains blank MRs whose
stages only wrote stage docs (survey q5/q8).

**Mechanism:** `buildTaskReview` pipes the raw diff through `filterTaskFiles`
(`api/reviewAssembly.js`), which drops rows whose path is inside
`<docsDirName>/tasks/` via `docsTasksIgnorePath(project)`
(`api/docsPath.js:255`, e.g. `docs/tasks/`) and `isTaskFilePath`
(`api/work/isTaskFilePath.js`). The UI renders the empty state when
`hasReviewFiles` is false (`frontend/src/components/tasks/TaskReviewPage.jsx:118`),
with two different texts (`:434-446`):

- `filteredTaskFilesCount === 0` → `data.reason || "Nothing to review yet — the agent has not modified any files."`
- `filteredTaskFilesCount > 0` → same line plus `"N task file(s) hidden from this view."` (and "see the Reports tab" when reports exist, `:480-482`)

## Repro (executed, captured)

The pure filter, run against this repo's own module:

```bash
node --input-type=module -e "
import { isTaskFilePath } from './api/work/isTaskFilePath.js';
const prefix = 'docs/tasks/';
console.log(isTaskFilePath('docs/tasks/t1/SURVEY.md', prefix));            // true  -> dropped
console.log(isTaskFilePath('docs/tasks/t1/assets/image.png', prefix));     // true  -> dropped
console.log(isTaskFilePath('src/app.js', prefix));                         // false -> kept
console.log(isTaskFilePath('./docs/tasks/t1/task.md', prefix));            // true  -> dropped
"
```

```text
docs/tasks/t1/SURVEY.md -> true
docs/tasks/t1/assets/image.png -> true
src/app.js -> false
./docs/tasks/t1/task.md -> true
```

And the raw diff for a docs-only commit (temp repo):

```text
git diff --name-status main...kb/docs-only
A	docs/tasks/abc123/REPORT.md        <- present in the RAW diff ...
... but isTaskFilePath(...) === true  <- ... so filterTaskFiles drops it
=> payload: files: [], filteredTaskFilesCount: 1  => UI shows the hidden-hint variant
```

Also verifiable on this very branch:
`git diff --name-status main...HEAD` on `kb/278cd8c8-…` lists only
`docs/tasks/278cd8c8-…/SURVEY.md` and `…/assets/image.png` — this task's own
MR would render with `files: []` + `filteredTaskFilesCount: 2`.

## TDD test example (paste into a code stage, e.g. `api/reviewAssembly.docsFilter.integration.test.js`)

```js
import { describe, it, expect } from "vitest";
// reuse initRepo/commitFile/makeDeps/makeTask pattern from reviewAssembly.integration.test.js

describe("cause 3: docs/tasks/** rows are filtered from the Files Changed view", () => {
  it("docs-only commit -> files: [] but filteredTaskFilesCount: 1 (hidden-hint, not default text)", async () => {
    const dir = initRepo();
    git(dir, "checkout", "-b", "kb/task-1");
    const project = { id: "proj-1", useBranches: true }; // docsDirName defaults to "docs"
    const task = makeTask("kb/task-1");
    // agent stage writes ONLY a stage report:
    fs.mkdirSync(path.join(dir, "docs/tasks/task-1"), { recursive: true });
    commitFile(dir, "kb/task-1", "docs/tasks/task-1/REPORT.md", "# report\n", "docs: report");

    const review = await buildTaskReview(makeDeps(project, task), dir, "proj-1", "task-1");
    expect(review.files).toHaveLength(0);
    expect(review.filteredTaskFilesCount).toBe(1);
    expect(review.reason).toBeNull();
    // commits are NOT filtered (view-only concern):
    expect(review.commits).toHaveLength(1);
  });

  it("mixed commit -> code file kept, docs row hidden", async () => {
    const dir = initRepo();
    git(dir, "checkout", "-b", "kb/task-1");
    const project = { id: "proj-1", useBranches: true };
    const task = makeTask("kb/task-1");
    fs.mkdirSync(path.join(dir, "docs/tasks/task-1"), { recursive: true });
    git(dir, "checkout", "kb/task-1");
    fs.writeFileSync(path.join(dir, "src.js"), "x\n");
    fs.writeFileSync(path.join(dir, "docs/tasks/task-1/REPORT.md"), "# r\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "code + report");

    const review = await buildTaskReview(makeDeps(project, task), dir, "proj-1", "task-1");
    expect(review.files.map(f => f.path)).toEqual(["src.js"]);
    expect(review.filteredTaskFilesCount).toBe(1);
  });
});
```

## Triage takeaway

If the blank MRs in the survey are exactly the **docs-only / no-code stages**,
this is working as designed — the fix would be UX (surface the hidden count
more prominently), not diff logic. If code-editing MRs are also blank, cause 3
is not the explanation; go to cause 1/2 (and `PROD_VERIFICATION.md`).
