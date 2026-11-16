# IMPLEMENTATION_PLAN.md — Docs viewer sidebar: definition between headers and articles

## 1. Goal

Give the docs viewer sidebar (`frontend/src/components/docs/DocsView.jsx`)
clear visual separation between category headers and article names, make each
category collapsible, and reorganise the two current avenues
(`how-it-works` / `working-with`) into groupings that match how the docs are
actually used — implementing the survey-chosen style:

- **Chosen design (SURVEY.md r1/q5):** dark sidebar, category headers as small
  rounded badge labels with soft purple background and dark text, article names
  in lighter grey indented underneath, arrow on each header to collapse the
  group — "modern app look" (`assets/survey-r1-q5-chosen.png`).
- **Survey mandates locked in:** totally-new sidebar style is approved (q1);
  every category collapsible (q2); collapsed state persists across visits (q3,
  i.e. `localStorage`); articles may be freely regrouped/renamed (q4).

Current pain (from `assets/19087.png`): headers are 10px mono uppercase grey
(`text-text-muted`) sitting directly above same-size article buttons, so the
two levels scan as one flat list; with ~9 articles under "How KainBain works"
and ~25+ under "How to work with KainBain", the long second group dominates
scrolling.

## 2. Guiding principle — make the change easy, then make the change

Phases A–C below change no pixels: they isolate the sidebar, centralise the
taxonomy, and lock behaviour with tests so the visual/collapse/regroup work
(Phase D) lands as small, reversible edits on a seam built for it. Do not
start Phase D until A–C are green.

## 3. Current-state facts (researched this run)

- Sidebar source: `frontend/src/components/docs/DocsView.jsx` lines ~199–259 —
  `DOC_SECTION_LABELS`, `DOC_SECTION_ORDER`, `grouped` memo, and the inline
  `<section>/<h2>/<ul>` render loop. Headers are plain `h2`, not buttons.
- Taxonomy source of truth: `api/siteDocs.js` — `DOC_SECTIONS`,
  `SECTION_LABELS`, frontmatter `section:` per file in `site-docs/*.md`.
  Frontend duplicates the labels in `DOC_SECTION_LABELS`; the two copies must be
  changed together (or unified — see Step 2).
- Behavioural contracts in tests that constrain the work:
  - `frontend/src/components/docs/DocsView.test.jsx` — both avenues listed,
    filter, empty/error/XSS states, bare-`/docs` normalisation, deep links,
    and the **heading-order test** (`sidebar avenue headings are h2`).
    Collapsible headers become interactive, so this test must evolve, not
    break silently (see Step 7).
  - `frontend/src/components/docs/DocsNavigation.test.jsx` — docs routing
    regression lock (leaving docs, refresh, back/forward). Collapse state must
    never touch the route.
- Imbalance to fix: `grep ^section: site-docs/*.md` shows the `working-with`
  avenue holding onboarding, runners, auth, skills, runbooks, and reference
  alike — the regroup in Step 4 is data-driven, not a guess.
- Verification gates: `npm run test:frontend` (vitest incl. both suites above),
  `npm run lint:frontend`, headless check via `npm run capture:screenshot`
  (no long-lived dev servers per stage guidance).

## 4. Step-by-step work plan

### PHASE A — Seams first (no visual change)

**Step 1 — Extract a `DocsSidebarGroup` component (frontend-only refactor).**
Move the per-group `<section>/<h2>/<ul>` block out of `DocsView.jsx` into a
new `frontend/src/components/docs/DocsSidebarGroup.jsx` taking
`{ label, docs, activeSlug, onSelect }` and rendering the *identical* markup.
`DocsView.jsx` keeps `DOC_SECTION_ORDER`/`grouped` and maps groups to the new
component. Pure move; no class changes.
*Why first:* every later step (badges, chevron button, collapsed rendering)
edits one small component instead of the 343-line view.

**Step 2 — Single-source the taxonomy.**
Export the section list/labels from one place both layers already respect
(e.g. have the frontend import the API's `DOC_SECTIONS`/`SECTION_LABELS`
shape via the docs-index response, or a shared `docsSections` module) and
delete the `DocsView.jsx` duplicate. Add/extend a unit test asserting frontend
labels equal API labels for every section.
*Why first:* regrouping (Step 4) then touches frontmatter + one constant, not
two files that can drift.

**Step 3 — Add the collapse-state hook with persistence.**
New hook (e.g. `useCollapsedSections`, co-located with the sidebar component):
`{ collapsed, toggle(section) }`, initialised from `localStorage`
(key e.g. `kainbain.docsSidebar.collapsed.v1`, JSON array of section ids,
`try/catch` around parse for corrupt values), writing back on change.
Unit-test the hook standalone: default-expanded, toggle flips one section,
corrupt storage falls back to expanded, choice survives remount.
*Why first:* persistence (survey q3) is the fiddliest behaviour; proving it in
isolation keeps the UI step dumb.

### PHASE B — Safety net before pixels

**Step 4 — Decide the new grouping from the data.**
Audit all `site-docs/*.md` frontmatter (`title/section/order`) and cluster
into 3–4 groups sized for scanning, e.g. *Getting started* (getting-started,
install-run, first-time-setup, link-runner-*, first-project), *Concepts*
(architecture, pipeline-stages, agent-execution, prompts-tokens, …),
*Everyday workflows* (editing-tasks, review-gates, custom-skills, …),
*Reference & runbooks* (api-reference, ports-env, git-index-lock-runbook,
surveys, …). Rule: no group holds more than ~10 articles; onboarding order
(concepts before operations) preserved. Write the proposed mapping as a table
in the implementing PR/task note and confirm it once — renames move `title:`
only, slugs stay stable so `/docs/:slug` deep links and the router tests never
break.
*Research-before-build:* this is the "big piece" the task calls out — do it
before any styling so Step 5 styles the real groups.

**Step 5 — Characterisation tests for the new contract (red first).**
Extend `DocsView.test.jsx` / `DocsNavigation.test.jsx` (or a new
`DocsSidebarGroup.test.jsx`) with failing tests for: (a) each header renders
the badge style hook (assert via class/test-id, not pixels); (b) clicking a
header chevron collapses/expands only that group; (c) collapsed state persists
across remount (localStorage); (d) text filter auto-expands groups holding
matches and shows the empty-search state when none match; (e) active article
auto-expands its own group on deep link even if stored collapsed;
(f) collapse never changes the route (navigation-lock suite stays green);
(g) keyboard: header toggle reachable and operable via Tab+Enter/Space with
`aria-expanded`.
*Why before:* defines "done" for the visual step and protects the heading-order
and routing contracts while markup changes.

### PHASE C — The change (small edits on the seams)

**Step 6 — Apply the chosen badge style to `DocsSidebarGroup`.**
Header becomes the survey winner: pill/badge (`rounded-full`, soft purple
bg/dark text — reuse the existing `bg-primary`/`text-on-primary` tokens or the
accent-token companion in `frontend/src/theme/`, not a hardcoded hex),
articles `text-on-surface`/muted, indented (`pl-4`) under the badge, wider
spacing above each group (`mt-4 first:mt-0`), chevron (`Icon` chevron,
rotates 90° on collapse) beside the badge per `assets/survey-r1-q5-chosen.png`.
Keep the header text inside an `h2` with the toggle as the button *inside* it
(`<h2><button aria-expanded …>`), so the existing axe heading-order contract
holds by construction. Respect `prefers-reduced-motion` for the chevron/list
transition and keep the 44px touch targets.

**Step 7 — Wire collapse + filter/deep-link interplay.**
Header button toggles via the Step-3 hook; collapsed groups render badge +
count only (`aria-expanded="false"`, list hidden). Rules: filter text forces
matching groups open (restore stored state on clear); deep link / active
article forces its group open on navigation; "Expand all / Collapse all" (if
added) is sidebar-scoped and separate from the existing article-section
controls. Update the old `sidebar avenue headings are h2` test to assert
`h2 > button[aria-expanded]` instead of a plain `h2` — an intentional,
reviewed contract evolution, documented in the commit message.

**Step 8 — Migrate the taxonomy data.**
Change `section:` frontmatter per the Step-4 mapping, update `DOC_SECTIONS`/
`SECTION_LABELS` (API + the single-sourced frontend constant), keep
`order:` sequencing within each new group. Slugs unchanged. Run the
`siteDocs` API suites (`api/siteDocs*.test.js`, `routes/docs.test.js`,
`docs.apiCoverage`) — an unknown-section guard (`readDocFile` returns null)
means any missed file surfaces as a test failure, not a silent drop.

### PHASE D — Assurance (prove it, then document it)

**Step 9 — Automated verification.**
`npm run test:frontend` (both docs suites + new collapse/persistence tests),
`npm run test:api` (siteDocs suites after regroup), `npm run lint:frontend`,
plus the repo's contrast tests if badge tokens changed
(`frontend/src/theme/*contrast*`). Headless visual proof only:
`npm run capture:screenshot` of `/docs` (expanded, one-group-collapsed,
filtered states) attached to the task — no persistent dev servers.

**Step 10 — Manual / accessibility pass.**
Keyboard-only run (Tab to header, Enter toggles, focus visible), screen-reader
spot check (group label + `aria-expanded` announced, article count exposed),
viewport sweep (narrow ~360px: badges wrap, no horizontal scroll; wide: sidebar
stays `w-64`), reduced-motion on/off, corrupt/empty `localStorage` entry,
filter-while-collapsed, deep link into a stored-collapsed group.

**Step 11 — Documentation updates.**
Update whichever of these describe the sidebar/taxonomy: the docs-viewer
section of the relevant `site-docs/*.md` (e.g. getting-started or
stage/UX-adjacent article), `site-docs/README.md` template frontmatter comment
if sections are enumerated there, and the `DOC_SECTIONS`/`SECTION_LABELS`
docblocks in `api/siteDocs.js` if the avenue description changes. Note the new
`localStorage` key and the regroup mapping in the change notes so support can
answer "where did article X go".

## 5. Risks and mitigations

- **Two taxonomies drift (frontend labels vs API sections):** killed by Step 2's
  single source + equality test.
- **Heading-order a11y regression (plain `h2` → interactive header):**
  `h2 > button` pattern + evolved (not deleted) heading test + axe/manual
  reader check in Step 10.
- **Collapsed group hides the deep-linked/active article:** active slug always
  forces its group open (Step 7e); covered by test.
- **Filter + collapse confusion:** filter overrides collapse while typed,
  restores on clear (Step 7); empty-search state retained.
- **localStorage unavailable/corrupt (private mode, SSR):** `try/catch`,
  default expanded, never throws (Step 3 test).
- **Regroup orphaning an article:** `readDocFile` unknown-section null +
  API suites fail loudly; slugs frozen so routes/bookmarks survive (Step 8).
- **Badge contrast failure:** reuse theme tokens, run contrast suites
  (Step 9); fall back to the q5 option-0 high-spacing style if tokens fail.

## 6. Non-goals

- No change to article rendering, `MarkdownViewer`, or article-level
  expand/collapse; no search-backend work (title filter only); no route
  changes; no new dependencies or icon set — reuse `Icon` + theme tokens.

## 7. Definition of done

Sidebar shows badge-style collapsible headers per the chosen mock; every group
collapses independently and persists; groups are rebalanced (none ~25 deep);
all docs frontend + siteDocs API suites green; lint green; headless screenshots
attached; a11y pass recorded; taxonomy docs updated.
