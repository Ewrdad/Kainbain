# GUIDE — Cause 5: frontend payload consumption / project scoping in `useReview` + `TaskReviewPage`

**Status: NOT REPLICABLE AS A BUG — ruled out by the evidence unless causes
1–4 are cleared.** Treat as low priority. Do not spend prod time here first.

**Why it's ruled out:** the screenshot shows a fully rendered, *correct*
payload for the right task — right branch name (`kb/64fb8fbb-… → main`),
REPORTS (5) populated, `UNCOMMITTED CHANGES ELSEWHERE` badge, `↑0 ↓0` — and
the FILES CHANGED tab showing the default empty-state text. That means
`GET /projects/:p/tasks/:t/review` returned 200 with `files: []`,
`reason: null`, `filteredTaskFilesCount: 0`, and the frontend rendered it
faithfully. Survey q10's "API returns files but UI still empty" was **not**
selected, and "Reload still blank" was — consistent with a server-side empty
payload, not a render bug.

**The mechanism that *would* cause an all-MRs-blank UI** (kept for
completeness): `TaskReviewPage.jsx` derives `project` from `activeProjectId`,
not `task.projectId`, and fetches
`GET /projects/{activeProjectId}/tasks/{taskId}/review?projectId=…`
(`frontend/src/services/watch/index.js:16-17`, `frontend/src/context/useReview.js`
auto-load effect `:99-115`). If the review is opened while a different project
is active, the request is guarded against the wrong project
(`resolveAndGuardProject` in `api/routes/review.js`). But the screenshot
contradicts this firing.

## How to test it anyway (safe, local) — only if 1–4 are cleared

Frontend unit test (vitest, `npm run test --prefix frontend -- <pattern>`):
render `TaskReviewPage` with a mocked `api.getTaskReview` returning
`{ files: [{ path: "src/a.js", … }], commits: [...], aheadBy: 1, behindBy: 0, reason: null, filteredTaskFilesCount: 0, reports: [] }`
and assert the diff view renders and the empty-state text does **not** —
i.e. prove the UI shows files whenever the payload has them:

```jsx
// frontend/src/components/tasks/TaskReviewPage.payload.integration.test.jsx (example)
it("renders files when the review payload has them (rules out UI-side blank)", async () => {
  mockApi.getTaskReview.mockResolvedValue({
    branch: "kb/t1", baseBranch: "main", branchSupported: true,
    files: [{ path: "src/a.js", status: "modified", additions: 1, deletions: 0, binary: false, diff: "…" }],
    commits: [{ sha: "abc", message: "agent: edit", author: "R", date: "…" }],
    aheadBy: 1, behindBy: 0, reason: null, filteredTaskFilesCount: 0,
    uncommittedChanges: false, comments: [], reports: [],
  });
  render(<TaskReviewPage taskId="t1" projectId="p1" />);
  await screen.findByText("src/a.js");
  expect(screen.queryByText(/Nothing to review yet/)).toBeNull();
});
```

And the API-level check that distinguishes server-empty from UI-blank
(run against dev/staging, or prod read-only with permission):

```bash
curl -s "$KB_API/projects/$PID/tasks/$TID/review?projectId=$PID" | jq '{files, aheadBy, behindBy, reason, filteredTaskFilesCount}'
# files: [] + reason: null + filteredTaskFilesCount: 0  => server-side empty (causes 1/2/4)
# files: [...]                                          => UI/render issue (cause 5)
```
