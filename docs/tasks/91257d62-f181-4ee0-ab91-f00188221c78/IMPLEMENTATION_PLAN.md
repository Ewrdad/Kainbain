# IMPLEMENTATION_PLAN.md — commit-history changelog in the Now Playing bar

## Goal

Move the existing commit-history changelog affordance from the top bar into the
Now Playing bar as a slightly greyed-out `#buildhash` on the left of the queue,
clickable to show the git history of `main` up to the deployed point, filtered
to task-merge commits. The history must be bundled at build/deploy time because
a deployed instance has no `.git` access.

Survey decisions applied (see `SURVEY.md`): Now-Playing-bar placement on the
left of the queue; simple pop-up/modal listing recent changes with dates;
show only task-merge messages (hide admin/automation commits); last 100+
entries with scrolling/pagination; standard build-time bundling; visible to
everyone; old design was fine, bring it back in the new location.

## Success Criteria

- A greyed-out, monospace `#buildhash` (build number and/or short SHA) renders
  in `NowPlayingBar`, immediately left of the queue-depth chip, visible to all
  users, on desktop and mobile layouts.
- Clicking (or keyboard-activating) it opens the existing modal pattern listing
  recent `main` commits with short SHA, subject, author, and date; 100+ entries
  reachable via scroll/pagination; commit text rendered as text only.
- Only task-merge (squash) commits appear; admin/automation sync commits
  (e.g. `Kainbain:` runner-sync messages) are excluded by the bake-time filter.
- The changelog payload is baked at deploy time and served from disk with no
  git dependency in production; dev and un-baked builds degrade to an honest
  empty/unavailable state, never a crash or fabricated data.
- The top-bar badge is removed (single affordance, no duplication).
- `npm run test:frontend` and the changelog generator unit tests pass; docs
  updated.

## Approach — make the change easy, then make the change

Most of the machinery already exists; this plan reuses it rather than
rebuilding. Current facts verified in-repo:

- `frontend/src/components/layout/BuildBadge.jsx` — header badge showing
  `#B{buildNumber}` from `/status`, opens `ChangelogModal` on click.
- `frontend/src/components/layout/ChangelogModal.jsx` — modal fetching
  `api.deployChangelog(200)`, 100-initial progressive reveal, text-only commit
  rendering, empty/error/retry states.
- `scripts/generate-changelog.mjs` — bakes `git log` (limit 200, body capped
  500 chars, argv-array git, ref validation) to JSON at deploy time.
- `deploy.sh` (~line 1594) bakes `$STAGE/changelog.json` and ships it as
  `$PROD_DIR/changelog.json`; build number stamped via `stamp_build_json`.
- `frontend/src/components/layout/NowPlayingBar.jsx` — bottom 72px bar; right
  rail is currently just the queue-depth chip (elapsed timer and health light
  were removed), so there is a clean anchor point left of the queue.

Therefore the plan is: (1) decouple the badge's data logic from its header
placement so it is trivially re-placeable; (2) add the bake-time commit filter
and short-SHA identity; (3) relocate the affordance and remove the header copy.
No new data pipeline, no new modal system, no new deploy mechanism.

### Key decisions

- Reuse `ChangelogModal` unchanged (it already matches the survey: modal,
  dates, 100+ pagination). Only its trigger moves.
- Filter commits at bake time in `generate-changelog.mjs`, not at render time,
  so the artifact stays small and the rule is testable in Node without a
  browser.
- Filter predicate derived from a real taxonomy pass over `main` history (Step
  1), not assumed patterns. Expected shape: keep squash-merge subjects
  (`task … merged`, `Merge …`), drop `Kainbain:` automation sync commits and
  merge-remote-tracking noise; exact regexes locked by Step 1 evidence.
- Identity shown is `#B{buildNumber}` plus short SHA when available (task asks
  for "build number/hash"); short SHA comes from the baked artifact's head
  entry or a stamped `commitSha` in `build.json` (Step 1 decides which source
  is cheapest — prefer extending the existing `stamp_build_json` over a second
  fetch).
- Remove `BuildBadge` from `Header.jsx` when the bar copy lands (survey chose
  the bar location, and two badges would confuse); keep the component file only
  if it becomes the shared implementation (see Step 2).

## Steps

### Step 1 — Research spike: commit taxonomy and identity source (do first — de-risks the filter)

- Run `git log --format='%s' main` (bounded sample, e.g. last 200) and classify
  subjects into task-merge vs admin/automation vs other. Record the exact
  subject patterns in the plan notes or a comment-local fixture.
- Confirm which ref the deploy bakes (`--ref` default in
  `generate-changelog.mjs` vs `deploy.sh` invocation) and whether the running
  branch is `main` or `master`; align the modal subtitle (`branch …`) with
  reality.
- Decide the short-SHA source: baked artifact head entry vs new `commitSha`
  field in `build.json` via `stamp_build_json`. Prefer whichever avoids an
  extra network fetch on every bar render.
- Output: a short note (patterns + SHA-source choice) referenced by Steps 2–3.
  No production code changes.

### Step 2 — Make the change easy: extract a place-independent badge

- Split `BuildBadge.jsx` into a data hook (`useLiveBuild` — build number,
  short SHA, changelog-open state) and a presentational trigger button
  (`BuildHashTrigger`, greyed-out monospace `#buildhash` styling, `aria-label`,
  `data-testid`), keeping the header working untouched.
- Add `--filter` support (or a default-on filter function with unit-testable
  export) to `scripts/generate-changelog.mjs`; add Node unit tests with a
  fixture log covering task-merge, `Kainbain:` sync, and remote-tracking merge
  subjects.
- Validation: `npm run test:frontend` for `BuildBadge`/`ChangelogModal`
  suites; `node --test` (or repo's runner) for the generator tests. Header
  visually unchanged (headless screenshot via `npm run capture:screenshot`).

### Step 3 — Make the change: relocate to the Now Playing bar

- Render `BuildHashTrigger` in `NowPlayingBar`'s right rail, immediately left
  of the queue-depth chip; reuse `ChangelogModal` for the dialog; keep the bar
  at 72px and the single-child right-rail layout intact (sibling layout, no
  overlap with runner boxes; hidden on no space via existing responsive rules).
- Remove `BuildBadge` from `Header.jsx`; delete or re-export the old file so
  no dead import remains.
- Styling: slightly greyed-out (`text-text-muted`, monospace) per the task;
  retains full contrast for the clickable target and a visible focus ring
  (a11y: same `Modal` labelledBy/describedBy contract as today).
- Validation: new/updated `NowPlayingBar` tests (badge renders left of queue,
  click opens modal, null-build renders nothing); full `test:frontend` run;
  headless screenshot of the bar.

### Step 4 — Bundling and graceful degradation

- Ensure `deploy.sh` bake covers the filtered artifact and the SHA stamp
  (extend `stamp_build_json`, not a new mechanism); verify `$PROD_DIR`
  ships both `build.json` and `changelog.json` (existing copy step ~line 1640
  already covers the latter — confirm, don't duplicate).
- Dev-mode (no baked files) and pre-filter builds: badge hidden when no build
  identity; modal shows the existing "No changelog baked" empty state with
  redeploy guidance. No new error strings unless the SHA source adds one.
- Validation: dry-run or staging deploy check that both files land; API
  serves them from disk (existing `api/routes/deploy.js` + `deployManager`
  tests updated only if the schema changed).

### Step 5 — Tests and documentation

- Tests: generator filter unit tests (Step 2); `NowPlayingBar` placement and
  interaction tests; `Header` test updated for badge removal; keep
  `ChangelogModal` tests passing unchanged. New tests live next to the
  components they cover (repo convention: `*.test.jsx` siblings).
- Docs: update any user-facing docs that show the header badge location;
  record the filter rule and bake step where deploy docs live
  (`PORTABLE_DEPLOYMENT.md` / `deploy.sh` header comments as appropriate).
- Full gate: `npm run test:frontend` (and `test:unit` if the generator tests
  run under it), plus lint on touched files.

## Validation Plan

| Work unit | Command / check | Expected evidence |
|---|---|---|
| Taxonomy spike | `git log --format='%s' -200 main` | Pattern list justifying the filter regex |
| Generator filter | generator unit tests | keep/drop cases green |
| Badge extraction | `npm run test:frontend` (badge/modal suites), `npm run capture:screenshot` | green; header pixel-identical |
| Bar relocation | `NowPlayingBar` tests + screenshot | badge left of queue; click opens modal; 72px intact |
| Bundling | staging/dry-run deploy; `GET /deploy/changelog`, `/status` | both files served from disk, no git needed |
| Whole change | `npm run test:unit`, lint touched files | green |

Highest-risk check: the bake-time filter silently dropping real task history
— mitigated by the Step 1 taxonomy and fixture tests asserting known task
subjects survive.

## Risks / Open Questions

- Branch name: task says history of `main`; generator examples use `master`.
  Step 1 confirms the real default branch; the plan follows evidence.
- `frontend` `build` script currently runs checks only (no `vite build`);
  the real production bundle path for the frontend must be confirmed during
  Step 4 so the baked files are reachable from the served app (resolved by
  reading `deploy.sh` staging steps, not assumed).
- Old-build compatibility: builds baked before the filter show unfiltered
  history until redeployed — acceptable (modal already handles "baked at
  deploy time" semantics); noted here so QA expects it.
- Open questions: none — all seven survey questions were answered; anything
  the spike contradicts returns as a spur note before Step 2, not as a user
  question.
