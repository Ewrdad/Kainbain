# Design note — collapsed alias-row layout (Step 0)

Decision for the alias-screen redo (issue: model names cut off mid-name in the
collapsed summary, `assets/image.png`). Survey round-1 answers are still empty,
so the proposed defaults in `IMPLEMENTATION_PLAN.md` §1 bind: q1 whole alias
screen, q2 wrap-before-ellipsis, q3 provider as a badge, q4 mobile gets its own
full-width line, q5 compact rows by default, q6 error badge on its own line.

## Before (current markup, `ModelAliasesSection.jsx` ~:1238)

```
┌───────────────────────────────────────────────────────────────┐
│ ▸ name │ summary-badge (one hard-truncated line) │ ⚠err │ rel │ ✕ │  ← one flex line, everything competes
└───────────────────────────────────────────────────────────────┘
section root capped at max-w-2xl (672px) even on a 1440px+ desktop page
```

`TruncatedText` applies `truncate` (one-line ellipsis), so a long
`provider::model` ref — exactly what the summary badge holds — is cut mid-name.

## After (chosen layout)

```
┌───────────────────────────────────────────────────────────────┐
│ ▸ name  reliability-line                              ✕        │  ← header line
│ ┌────────────────────────────┐ ┌────────────────────────────┐ │  ← line 2: full-width wrapping chips
│ │ 50% Muse [google] gemini-… │ │ 50% pi [anthropic] claude-…│ │    (data-testid=model-alias-summary-{i})
│ └────────────────────────────┘ └────────────────────────────┘ │
│ [⚠ error badge — own full-width line when present]            │
└───────────────────────────────────────────────────────────────┘
section root widened to max-w-4xl (896px) — this section only
```

## Decisions

- **(a) Two-line collapsed row.** Line 1 = toggle + alias name (still
  `truncate` — names are short by design) + reliability + delete. Line 2 =
  `w-full flex flex-wrap gap-1.5` chips container carrying
  `data-testid="model-alias-summary-{i}"` (existing test id survives on the
  container). On `<sm` the flex-wrap structure makes line 2 naturally
  full-width under the header (q4 option 1) — verified at 390px.
- **(b) Chip structure.** `percent` (bold, nowrap) + harness label (nowrap) +
  provider badge (small uppercase) + model id (`font-mono`, `min-w-0 flex-1`,
  `break-all` so it wraps before any ellipsis). Chip itself is
  `inline-flex flex-wrap` with `min-w-0`, so a 140+ char id wraps inside the
  chip instead of overflowing. Full stored ref (`harness::provider::id[::lvl]`)
  rides in the chip's `title` **and** an sr-only span inside the chip, so the
  complete ref is always in the DOM/accessibility tree (WCAG — hover alone is
  not enough).
- **(c) Truncation order.** chip wraps to next line → model id wraps
  (`break-all`) → single-line ellipsis only as last resort on the alias *name*
  (unchanged). Model refs are never ellipsized.
- **(d) Container width.** `max-w-2xl` → `max-w-4xl` on the alias section root
  only (other settings tabs keep `max-w-2xl` — intentional, noted in PR).
- **(e) Mobile.** No separate breakpoint needed: chips line is a full-width
  block under the header at every width; at 390px each chip takes the full row.
- **Provider split semantics** (`splitModelRefProvider`): strip optional
  `::reasoning` via `splitReasoning`, then split the base on the first `::`:
  - `google::gemini-3-pro` → `{ provider: 'google', modelId: 'gemini-3-pro' }`
  - `pi::google::m` (canonical 3-segment) → `{ provider: 'google', modelId: 'm' }`
    (the harness half is already shown by the harness label chip — not repeated)
  - bare `m` → `{ provider: '', modelId: 'm' }` (no badge rendered)
  - garbage/blank → `{ provider: '', modelId: ref }` (never throws)

## Mock verification (scratchpad `design-spike/mock.html`, headless chromium)

- 1440px: section uses 896px (max-w-4xl); all three chips (incl. a 204-char
  model id) render with `scrollWidth == clientWidth` — zero clipping; no
  horizontal page scroll.
- 390px: chips drop to full-width rows under the header; 204-char model id
  wraps inside its chip, fully contained, no page scroll.

Gate: this note written; no source changes in Step 0.
