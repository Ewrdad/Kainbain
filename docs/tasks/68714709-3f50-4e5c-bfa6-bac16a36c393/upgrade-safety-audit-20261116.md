# Upgrade-safety re-audit — docs sidebar regroup (2026-11-16)

Re-audit of `origin/main...HEAD` (branch `kb/68714709-3f50-4e5c-bfa6-bac16a36c393`) against
"existing installs must not break on update", following
`upgrade-safety-audit-20261115.md`. That audit found a silent-data-loss break (hard rename with
no alias). This re-audit verifies the current diff closes it.

## Changes audited

- `api/siteDocs.js` — `DOC_SECTIONS` renamed from `["how-it-works", "working-with"]` to
  `["getting-started", "concepts", "workflows", "reference"]`; `SECTION_LABELS` replaced;
  new `LEGACY_SECTION_ALIASES`; `readDocFile` alias resolution; all `site-docs/*.md`
  frontmatter migrated in the same diff.
- `frontend/src/components/docs/*` — new `docsSections.js`, `DocsSidebarGroup.jsx`,
  `useCollapsedSections.js`, `DocsView.jsx` regroup/filter/collapse wiring, re-exported
  `DOC_SECTION_LABELS`/`DOC_SECTION_ORDER` from `DocsView.jsx:13`.
- `frontend/tailwind.config.js` — additive `docs-badge` tokens only.
- `DEPRECATIONS.md`, `agents.md`, `api/agentGuide.js`, `site-docs/README.md` — lockstep copy.
- No diff in `.env.example`, `api/config/*`, `Dockerfile`, `docker-compose*.yml`, `deploy.sh`,
  DB schema, migrations, or volumes (verified via `git diff --name-only` and empty diffs).

## Prior break now closed (verified live)

The 2026-11-15 break was: `readDocFile` strictly rejected any `section:` not in the new
`DOC_SECTIONS` (`if (!DOC_SECTIONS.includes(section)) return null`), so custom
`KAINBAIN_SITE_DOCS` dirs still carrying `how-it-works`/`working-with` silently vanished.

Current code resolves both retired ids before the strict check:

- `api/siteDocs.js:53-67` exports `LEGACY_SECTION_ALIASES = { "how-it-works": "concepts",
  "working-with": "workflows" }`.
- `api/siteDocs.js:147-157` — `readDocFile` looks up `LEGACY_SECTION_ALIASES[rawSection]`,
  rewrites `section` to the alias, emits `console.warn('[siteDocs] <file> uses retired
  section "…"')` naming the file, then proceeds to the `DOC_SECTIONS` check.
- `DEPRECATIONS.md:195-214` documents the rename, the automatic migration (indefinite alias,
  no removal date), and the `console.warn` signal.
- `api/siteDocs.test.js:159-210` (`LEGACY_SECTION_ALIASES` suite) proves `readDocFile` /
  `listDocs` / `getDoc` resolve old-section files; the full `api` suite (478 tests) is green,
  including `siteDocs.test.js` (17) with the warn captured on stderr.

Live reproduction on the working tree (temp dir with `legacy.md: how-it-works`,
`custom.md: working-with`, `new.md: concepts`):

- `readDocFile(legacy.md)` → `{ slug: "legacy", section: "concepts", ... }` (was `null`).
- `readDocFile(custom.md)` → `{ slug: "custom", section: "workflows", ... }` (was `null`).
- `listDocs({ dir })` indexes all three; `getDoc('legacy')` resolves (was `null`).
- Each aliased file emits one `console.warn` per read; invalid sections (`section: nope`)
  and missing titles still return `null` — the strict guard is unchanged for truly bad files.

Custom content on host/git installs (untracked files survive `git pull`) therefore keeps
indexing after update, with an explicit warning prompting frontmatter migration at the
owner's convenience. This satisfies the stage criterion for the previously-failing case.

## Other upgrade surfaces checked

- **Slugs / routing:** `site-docs/*.md` diffs change only `section:` lines; no `slug:` line
  is added/removed/renamed, no file is renamed/deleted (`git diff --name-status` shows `M`
  only). `/docs/:slug` deep links and bookmarks survive; `api/siteDocs.test.js` first-time-setup
  guard confirms slug/order stability in the real content dir.
- **API contract:** `GET /docs` now returns `sections: ["getting-started","concepts",
  "workflows","reference"]` (`api/routes/docs.test.js` asserts the four-group order and
  non-interleaving). This is the survey-approved regroup (SURVEY `q4` — "reorganise freely"),
  not a silent break: bundled articles are migrated atomically, custom articles resolve via
  the alias to the new ids and are documented as such in `DEPRECATIONS.md` and
  `site-docs/README.md`. No old-id preservation is promised; external consumers filtering on
  old ids must migrate, as documented.
- **Frontend compat:** `DocsView.jsx:13` re-exports `DOC_SECTION_LABELS`/`DOC_SECTION_ORDER`
  from `docsSections.js`, so existing importers keep working. `DocsView` prefers the backend
  index `sections` array at runtime and appends unknown groups instead of dropping them
  (`DocsView.jsx:191-216`), so a future backend addition cannot silently vanish. Labels are
  locked to the API copy by `api/siteDocs.frontendParity.test.js` and `docsSections.test.js`;
  frontend docs suites (47 tests) are green.
- **`localStorage`:** additive, namespaced `kainbain.docsSidebar.collapsed.v1`. `useCollapsedSections.js`
  (`readStoredCollapsed`) falls back to all-expanded on missing storage, corrupt JSON,
  non-array, or unknown-id payloads and never throws; `toggle` ignores empty/non-string ids and
  swallows quota/private-mode failures. Old installs simply start expanded; no persisted
  section state existed before (grep for `how-it-works`/`working-with` in `api/` +
  `frontend/src/` returns only the alias/tests/docs above), so no stale payload can misfire.
- **DB / env / deploy / volumes:** empty diffs in `.env.example`, `api/config/`,
  `Dockerfile`, `docker-compose*.yml`, `deploy.sh`; no migration files touched; persisted
  state untouched. Tailwind change is two additive tokens with AAA pair verified in
  `containerContrast.test.js`.
- **Proof PNGs:** `docs-sidebar-{collapsed,expanded,filtered}-proof.png` magic `89504e47`
  (correct PNG); the prior `automated-test-2-failure` text-path corruption is not present
  on this tree.

## Verdict rationale

The hard-rename-without-compat break identified on 2026-11-15 is fixed on this tree by an
indefinite alias + warning + deprecation notice + regression tests, reproduced live above.
No other upgrade surface (DB, env, deploy, volumes, slugs, persisted state) breaks an
existing install. The change therefore does not cause existing installs to break on update.

PASS.
