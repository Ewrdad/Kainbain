# PR Review Round 4 — Code-standards compliance, pretty tasks (task 5a38ad45)

Date: 2026-11-14. Reviewer: stage review (docs-only; no source touched).
Scope: branch `kb/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` vs `origin/main`,
judged solely against `./docs/KB Code Standards.md`.
Method: read every changed source file and test, ran the repo's own
standards gates and the two affected unit suites, verified byte evidence.
Assumed nothing works until the evidence shows it does.

## Standards gates (run in this session, current tree)

- `node scripts/check-one-function-per-file.mjs` → PASS (822 files scanned,
  281 grandfathered). The `api/flow/resolveStatePath.js` split into five
  one-function files is what keeps this green.
- `node scripts/check-jsdoc-example.mjs` → PASS (681 missing vs 684
  grandfathered baseline).
- `npm run test --prefix api -- taskPersistence` → 72 passed.
- `npm run test --prefix frontend -- MarkdownViewer.mermaid` → 18 passed
  (2 files).

## Compliant work (keep as-is)

- `api/work/taskPersistence.js` — new `extractGoalSection`: verb-first name,
  plain-English JSDoc stating why (fence-aware so `# History`-like text inside
  a code block never truncates the goal) with `@example`, pure function with
  minimal single input, one responsibility, defined in the file that uses it
  (lowest-level co-location), tests co-located in `taskPersistence.test.js`
  covering happy path plus edges (CRLF, unclosed fence, same-marker closing,
  indented terminator, non-string input).
- `frontend/src/components/common/MarkdownViewer.jsx` — `fenceMarkerOf`
  helper with a plain-language comment, tilde-fence parity plus same-marker
  closing that mirrors the API-side `extractGoalSection` scan; tests
  co-located in `MarkdownViewer.mermaid.test.jsx` (mermaid/code parity,
  cross-marker non-close, unclosed fence).
- `skills/creating-new-tickets/SKILL.md` — title-verbatim wording is accurate:
  verified against `api/work/taskIdentity.js` (`_sanitizeTaskTitle` strips
  leading `#+` via `/^#+\s*/`; `resolveTaskTitleAndGoal` runs the explicit
  title through it), so "copy the first line with the `# ` marker, the API
  strips it" is true. Guardrails (dedupe, 10-cap, explicit `blockedBy`,
  idempotency, `execute: false`) untouched.
- Round-3 hygiene fixed: stray `rt.mjs` is gone from the tree.

## Non-compliance 1 — banned technical term in a new comment (code standards)

`api/flow/resolveStatePath.js` (branch version) contains:

```
// Barrel re-exports: the live-path guards live in one file each
// (one-function-per-file gate); callers keep importing from here.
```

The Code Standards say, under user-understandable language: "Avoid using
technical language such as "factory" or "barrel"" and "NEVER MENTION DESIGN
PATTERNS". "Barrel" is named explicitly as the example of what not to write,
and a barrel file is a named module pattern. A grep over the full branch
diff confirms this is the only banned-term hit, which makes it a sharp,
one-line breach rather than a pattern — but the standard is unambiguous and
this stage was asked to enforce it. The fix is one plain-language comment
(e.g. `// Re-exports: each guard lives in its own file so the one-function
check passes; callers keep importing from here.`). This stage is docs-only
and cannot edit source; a code-writing stage must apply it.

## Non-compliance 2 — corrupted binary evidence still shipped (tested over trusted)

The branch diff still replaces `origin/main`'s valid `pretty-proof.png`
with a text-corrupted copy. Byte evidence on this clean tree, just now:

- branch worktree magic: `efbf bd50 4e47 0d0a` (UTF-8 replacement character
  where `0x89` belongs — written through a text path before commit);
- `file` reports `data`, not `PNG image data`.

Meanwhile `implementation-report-20261114.md` (lines 3–16) claims the file
"has now been restored binary-safely" with magic `8950 4e47` verified. That
claim is factually false against the committed bytes. Round 3 already blocked
on this exact item; it is unresolved. Under the standards ("Tested over
trusted": assume nothing works until evidenced; failures must be transparent,
and a report asserting the opposite of the bytes is the reverse), the branch
must re-commit the PNG through a binary-safe path, verify with `xxd -l 8`
(`8950 4e47 0d0a 1a0a`) and `file` (`PNG image data`), and correct the
report's validity claim.

## Verdict

FAIL. Two concrete, fixable items above: (1) the banned "Barrel" term in
`api/flow/resolveStatePath.js`, one plain-language comment away from
compliant; (2) the corrupted `pretty-proof.png` plus the report's false
restored-valid claim. Everything else reviewed complies with the standards
and both configured standards gates pass.
