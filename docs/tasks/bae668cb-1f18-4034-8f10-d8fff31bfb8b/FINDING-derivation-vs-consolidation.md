# Finding — derivation vs. consolidation (Step 4 decision gate)

Date: 2026-11-16. Decided: end state C (consolidation). Touch-point deleted:
the frontend hand mirror (`DOC_SECTION_ORDER` + `DOC_SECTION_LABELS` in
`frontend/src/components/docs/docsSections.js`).

## Spike A — frontend channel

`DocsView.jsx` already prefers the `sections` array of `GET /docs` at runtime
and only falls back to `DOC_SECTION_ORDER` when `index.sections` is missing or
empty; unknown sections append under their id with `DOC_SECTION_LABELS[id] ||
id`. Direct `import` of `api/siteDocs.js` into the web bundle is unsafe: it
pulls `node:fs`, `node:path`, and `./config.js` at module top. Chosen channel:
extend `GET /docs` with `sectionLabels` (additive; route schema already sets
`additionalProperties: true`) and derive order/labels from the index at
runtime. New failure mode: a stale bundle against an older API without
`sectionLabels` renders raw section ids as group headers (same degradation the
code already applies to unknown sections); order falls back to
first-appearance in `docs`. No generated-file staleness, no build step.

## Spike B — labels and order are not derivable from shipped content

All 40 `site-docs/*.md` articles carry exactly `title`, `section`, `order`,
and optional `slug` frontmatter (`grep -h "^label:" site-docs/*.md` returns
nothing; `grep -h "^section:"` shows only the four current ids, 10 each).
`order` is per article, so section order derived from content would be
first-appearance, alphabetical, or min-article-order — all unstable across
edits. Deriving ids+order+labels would need a new frontmatter contract, which
is itself a central list by another name, not "no list".

## Spike C — empty-section and custom-dir behavior under derivation

A rename moving the last article out of a section would make a derived
taxonomy silently drop that id — byte-identical to the silent-drop failure the
guardrail exists to prevent (`readDocFile` null with no alias/warning), and
the integrity suite by design never asserts on article counts, so no test
could catch it. `KAINBAIN_SITE_DOCS` overrides would additionally make the
derived taxonomy differ per deployment, breaking the single-list property.
A brand-new empty section could not exist before its first article.
Verdict: derivation-unsafe without a reserved list, which concedes the
owner's "no central list" premise. `DOC_SECTIONS` stays hand-maintained;
`LEGACY_SECTION_ALIASES` + warn + `KNOWN_SECTION_HISTORY` + guardrail +
`DEPRECATIONS.md` requirement are unchanged by this task.

## Baseline rename cost (Step 5, from code reading)

Before: a rename edits `DOC_SECTIONS`, `SECTION_LABELS`,
`LEGACY_SECTION_ALIASES`, `KNOWN_SECTION_HISTORY`, `DEPRECATIONS.md`,
`frontend/.../docsSections.js` (order + labels), and the exact-equality
literals in `siteDocs.test.js`, `docsSections.test.js`,
`siteDocs.frontendParity.test.js` — ~7 places across 8 files.
After: the frontend file and its literals drop out; the parity test asserts
the index contract instead of literal equality. Proof recorded via the Step 8
rename probe diff file list.

## Step 8 — mutation probes (all reverted after recording)

1. Removed `working-with` from `LEGACY_SECTION_ALIASES` → guardrail failed:
   `[siteDocs taxonomy guardrail] Retired section "working-with" is neither
   a current DOC_SECTIONS member nor a key of LEGACY_SECTION_ALIASES ...
   Fix: add LEGACY_SECTION_ALIASES['working-with'] = '<new-section>' plus a
   DEPRECATIONS.md entry`.
2. Renamed `workflows` → `flows` in `DOC_SECTIONS`/`SECTION_LABELS` with no
   alias → guardrail failed naming `workflows` with the same fix text.
3. Valid rename `reference` → `runbooks` (alias + `KNOWN_SECTION_HISTORY`
   entry + `DEPRECATIONS.md` note + migrated `site-docs/*.md` frontmatter):
   all 43 siteDocs tests passed with updates only to the three intentional
   tripwire literals (`DOC_SECTIONS` order, alias map, deploy content list);
   no frontend file appeared in the probe diff. A legacy custom dir carrying
   `section: reference` indexed under `runbooks` with one owner-facing
   warning naming the file, retired id, and replacement.
