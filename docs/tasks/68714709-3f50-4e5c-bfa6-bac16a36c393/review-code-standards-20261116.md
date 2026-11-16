# Review — KB Code Standards (docs sidebar branch vs main)

Branch: `kb/68714709-3f50-4e5c-bfa6-bac16a36c393` vs `main` (merge-base `45b0db37`).
Standards: `./docs/KB Code Standards.md`.
Scope reviewed: `api/siteDocs.js`, `frontend/src/components/docs/DocsView.jsx`,
`DocsSidebarGroup.jsx`, `docsSections.js`, `useCollapsedSections.js`,
`frontend/src/components/Icon.jsx`, `frontend/tailwind.config.js`,
`site-docs/*.md` frontmatter migrations + all touched tests.

## Verdict: PASS

Branch complies with the standards. No blocking violation. Three non-blocking nits noted below.

## Principle-by-principle findings

### 1. User understandable over technical language — PASS
- New identifiers are long and descriptive: `groupLabel`, `visibleDocs`,
  `pickArticle`, `toggleGroup`, `toggleLabel`, `DOC_SECTION_LABELS`,
  `DOCS_SIDEBAR_STORAGE_KEY`, `LEGACY_SECTION_ALIASES`, `pinnedClosedSlug`.
- User-facing language (`Getting started`, `Concepts`, `Everyday workflows`,
  `Reference & runbooks`) replaces the internal `how-it-works`/`working-with` ids.
  `section` remains the data key, `group` the UI concept; both are reconciled
  in JSDoc (`api/siteDocs.js` `DOC_SECTIONS`/`SECTION_LABELS`, `docsSections.js`).
- No `factory`/`barrel` or other design-pattern mention in any changed source.
  `grep` hits: pre-existing `facade` in `DocsNavigation.test.jsx:131`,
  `window.Storage.prototype` in the new hook test (language builtin, not a pattern claim).
- Every new/changed function carries a `MARK` JSDoc with plain-English
  `@description` plus `@example`: `DocsSidebarGroup`, `docsSections`,
  `DOC_SECTION_ORDER`, `DOCS_SIDEBAR_STORAGE_KEY`, `readStoredCollapsed`,
  `useCollapsedSections`, `DOC_SECTIONS`, `SECTION_LABELS`,
  `LEGACY_SECTION_ALIASES`, `listDocs`, `DocsView`, `slugFromHash`,
  `waitFor` in `runner/daemon.test.js`.
- JSDoc records *why*, not just *what*: WCAG heading-order reason for
  `h2 > button`, `motion-safe:` for reduced-motion, `try/catch` storage
  rationale, parity-test rationale in `docsSections.js` header, pin rationale
  in `DocsView.jsx:64-70`, `sectionOrder` fallback rationale.
- Destructured data-in pattern everywhere the change touches:
  `DocsSidebarGroup({ section, label, docs, activeSlug, collapsed, onSelect, onToggle })`,
  `listDocs({ dir } = {})`, `Icon({ name, className })`, `useCollapsedSections` returns `{ collapsed, toggle }`.

### 2. Functional over object oriented — PASS
- No new classes in sidebar code; no currying / pseudo-class pattern.
  The only `class` in the diff is the pre-existing `MockWebSocket` test double.
- New functions are singular: `readStoredCollapsed` reads storage,
  `useCollapsedSections` owns the stored set, `DocsSidebarGroup` renders one group,
  `toggleGroup`/`isGroupCollapsed` decide visibility.
- Verb-first names on the new surface: `pickArticle`, `toggleGroup`,
  `readStoredCollapsed`, `toggle`, `listDocs`, `readDocFile`, `getDoc`.
  `isGroupCollapsed`/`isFiltering` are boolean predicates, not actions — acceptable.
- Minimum data passed: `DocsSidebarGroup` takes only the group it renders
  (`section/label/docs` + `activeSlug/collapsed` + two handlers), no whole-index injection.
- State stays immutable-style: `toggle` clones the `Set` before mutation.

### 3. Co-location over abstraction — PASS
- New modules sit with their caller, mirroring the call stack:
  `frontend/src/components/docs/DocsSidebarGroup.jsx`,
  `docsSections.js`, `useCollapsedSections.js` all alongside `DocsView.jsx`.
- Tests sit next to the file they cover:
  `DocsSidebarGroup.test.jsx`, `useCollapsedSections.test.jsx`, `docsSections.test.js`.
- Frontend taxonomy duplicates the API labels rather than abstracting across
  the node/browser boundary; the duplication is deliberate (offline/fallback
  rendering) and locked by `api/siteDocs.frontendParity.test.js` asserting
  `DOC_SECTION_ORDER === DOC_SECTIONS` and `DOC_SECTION_LABELS === SECTION_LABELS`.
- No new generic helper was introduced; `waitFor` in `runner/daemon.test.js`
  is test-local and reused across three cadence cases.

### 4. Tested over trusted — PASS
- New behaviour is covered at unit level first:
  hook storage/persistence/corruption/storage-failure, component badge/count/
  `aria-expanded`/fail-safe rendering, parity lock, legacy-alias resolution.
  `DocsView.test.jsx` adds filter override, deep-link force-open, route
  immutability, unknown-group and malformed-entry safety.
- Typing is treated as hostile throughout the new sidebar code:
  non-array `index.docs`, missing `title`/`slug`/`section`, corrupt JSON,
  non-string ids, storage-quota throws — all fall back instead of throwing.
- Integration coverage is user-shaped (click chevron → list folds,
  type filter → matches appear, remount → collapse persists), not implementation-shaped.
- Verification this run: frontend docs suites 252 tests pass
  (`DocsSidebarGroup`, `DocsView`, `useCollapsedSections`, `docsSections` among them),
  API suites 485 tests pass (`siteDocs`, `frontendParity`, `routes/docs`),
  `frontend lint` 0 errors (220 pre-existing warnings, none in new files).
- Badge contrast is locked as AAA in `frontend/src/theme/containerContrast.test.js`
  (`#221d35` on `#dccdf7`).

### 5. Fast iteration — PASS
- Change is sequenced behind seams (taxonomy extracted, hook proved standalone,
  component extracted one-group-at-a-time) exactly as the IMPLEMENTATION_PLAN
  phases A–C prescribe; `DOC_SECTION_LABELS`/`DOC_SECTION_ORDER` are re-exported
  from `DocsView.jsx` so existing importers keep working.
- `DEPRECATIONS.md` documents the regroup + `LEGACY_SECTION_ALIASES` migration
  with coverage pointers; `site-docs/README.md` authoring rules updated;
  `agents.md`/`agentGuide.js` copy updated; proofs attached
  (`docs-sidebar-collapsed/expanded/filtered-proof.png`).
- Heading-order contract evolved intentionally and is documented in the test
  (`h2 > button[aria-expanded]` instead of plain `h2`), not silently broken.

## Non-blocking nits (do not fail the stage)

1. **Terse locals in tiny predicates.** `DocsView.jsx` uses `(d)`, `(s)`, `q`;
   `useCollapsedSections.js` uses `(s)`. The standard asks for descriptive names.
   These are single-use predicate scopes and match pre-existing style, but
   `DocsSidebarGroup` shows the preferred spelling (`doc`). Advisory: rename
   to `docEntry`/`sectionId`/`filterQuery` on next touch.
2. **`Icon.jsx` JSDoc has no `@example`** (pre-existing). The diff adds
   `chevron-down` to the available-names line but leaves
   `@param {string} name - The icon name ('close' | 'gear')` stale.
   Advisory: sync the union and add `@example` when next editing the file.
3. **Storage write inside the `setCollapsed` updater** (`useCollapsedSections.js`)
   is a side effect inside a state function. It is guarded and tested
   (private-mode never throws), but StrictMode may double-invoke updaters;
   moving the write to an effect is the purer shape. Advisory only.

## Files checked

- `frontend/src/components/docs/DocsSidebarGroup.jsx` (new)
- `frontend/src/components/docs/docsSections.js` (new)
- `frontend/src/components/docs/useCollapsedSections.js` (new)
- `frontend/src/components/docs/DocsView.jsx`
- `frontend/src/components/Icon.jsx`, `frontend/tailwind.config.js`
- `api/siteDocs.js`, `api/siteDocs.frontendParity.test.js`
- `frontend/src/theme/containerContrast.test.js`, `runner/daemon.test.js`
- `DEPRECATIONS.md`, `agents.md`, `api/agentGuide.js`,
  `site-docs/README.md`, `site-docs/*.md` frontmatter
