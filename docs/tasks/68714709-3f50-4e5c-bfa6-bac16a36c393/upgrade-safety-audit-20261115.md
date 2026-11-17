# Upgrade-safety audit — docs sidebar regroup

Audit of `origin/main...HEAD` (branch `kb/68714709-3f50-4e5c-bfa6-bac16a36c393`) against
"existing installs must not break on update".

## Changes audited

- `api/siteDocs.js` — `DOC_SECTIONS` renamed from
  `["how-it-works", "working-with"]` to
  `["getting-started", "concepts", "workflows", "reference"]`; `SECTION_LABELS`
  replaced; all `site-docs/*.md` frontmatter migrated in the same diff.
- `frontend/src/components/docs/*` — new `docsSections.js`, `DocsSidebarGroup.jsx`,
  `useCollapsedSections.js`, `DocsView.jsx` regroup/filter/collapse wiring.
- `frontend/tailwind.config.js` — additive `docs-badge` tokens only.
- No diff in `.env.example`, `api/config/*`, `Dockerfile`, `docker-compose*.yml`,
  `deploy.sh`, DB schema, migrations, or volumes.

## Break found (silent data loss for custom docs)

`readDocFile` in `api/siteDocs.js:133` strictly rejects any `section:` not in the
new `DOC_SECTIONS` (`if (!DOC_SECTIONS.includes(section)) return null`), and
`listDocs`/`getDoc` inherit that. There is no alias mapping, no acceptance of the
old ids, no warning log, and no `DEPRECATIONS.md` entry. Reproduced against the
working tree:

- temp dir with `legacy.md` (`section: how-it-works`) and `custom.md`
  (`section: working-with`) → `readDocFile` returns `null` for both,
  `listDocs({ dir })` returns `[]`, `getDoc('legacy')` returns `null`.

Existing installs that carry custom articles break on update:

- Custom content is a supported surface: `site-docs/README.md` documents
  "Adding an article" as live-without-rebuild, and `KAINBAIN_SITE_DOCS`
  (`api/config/schema.js:568`, `group: storage`) points at a user-overridable
  directory.
- Host/git installs (`git pull`) keep untracked custom `.md` files across an
  update; after the rename they silently vanish from `GET /docs` and `GET /docs/:slug`.
- Bundled content is unaffected (replaced atomically with the code), so the
  break is silent and total for custom dirs, not a crash — but it is data loss
  on update, which this stage forbids.

Secondary contract break: `GET /docs` now returns `sections:
["getting-started","concepts","workflows","reference"]` (`api/routes/docs.js:58`).
Any external consumer filtering on the old section names breaks with no compat
window. `agents.md`, `api/agentGuide.js`, and `site-docs/README.md` were updated
in lockstep, but nothing preserves the old API names.

## Verified non-breaks

- No DB/volumes/env/deploy changes: empty diffs in `.env.example`,
  `api/config/`, `Dockerfile`, `docker-compose*.yml`, `deploy.sh`; no migration
  files touched; persisted state is untouched.
- `localStorage` (`kainbain.docsSidebar.collapsed.v1`) is additive and
  namespaced; `useCollapsedSections.js` falls back to all-expanded on missing,
  corrupt, non-array, or unknown-id payloads and never throws. Old installs
  simply start expanded.
- No persisted section state exists anywhere (grep for `how-it-works` /
  `working-with` in `api/` + `frontend/src/` + `shared/` outside `node_modules`
  returns only unrelated URLs) — old collapsed prefs cannot misfire.
- Slugs are unchanged across the regroup, so `/docs/:slug` deep links and
  bookmarked routes survive; the frontend handles backend skew by preferring
  the index `sections` array and appending unknown groups rather than dropping them.

## Verdict rationale

The regroup is user-approved (SURVEY `q4`), but as implemented it is a hard
rename with no backward-compat path: custom articles using either old section
name silently disappear on update with no signal. That fails the stage criterion
("existing installs must not break on update") and must not be fixed in this
stage — the failback stage should address it.
