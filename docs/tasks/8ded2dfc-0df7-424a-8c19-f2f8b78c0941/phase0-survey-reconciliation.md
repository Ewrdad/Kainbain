# Phase 0.1 — Survey reconciliation

`SURVEY.md` (round 1, generated 2026-11-02T09:56:00Z) exists in this task dir,
but its `answers` object is empty — no round was ever answered. Per the plan's
Step 0.1 fallback, the gap is recorded as accepted and execution proceeds on
the task text plus the plan's decisions D1–D5.

Assumption mapping (task text → survey question → chosen behavior):

- Q1 (clickable area) → "Whole row clickable plus keyboard support": roster
  `<li>` becomes the interactive element (`role="option"`, click + Enter/Space,
  visible focus ring). The name button's test id is kept as the accessible name
  so existing tests and screen-reader labels survive.
- Q2 (folder fields) → "Auto-fill with the Runner's own folders": directory
  inputs show the runner-reported effective folders (see
  `phase0-directory-defaults.md`) with a "Runner default" hint; operator edits
  override via the existing PATCH. Unknown (old runner) reads
  "Runner default (unknown)", never a guessed path.
- Q3 (model picking) → tick-boxes for each detected model + still allow typing
  a custom id by hand ("add id" field). Newly detected models are NOT
  auto-selected (the allowlist stays operator-owned; Reset returns to
  advertised). Last-seen timestamps are out of scope: discovery reports ids
  only, and stamping per-model times would widen the heartbeat contract.
- Q4 (re-check while offline/busy) → queue the request and run it when the
  runner is free: the command sits `queued` on the record (visible in the UI
  with "waiting for runner" when the runner has not heartbeated since the
  request) and the runner acts on its next heartbeat pull. A TTL (24h) expires
  commands no runner ever collected; expiry is shown, not silent.
- Q5 (update button) → idle-only ("update at next idle", never interrupts) AND
  shown only when an update is actually available (both readings combined:
  the button renders exactly when `updateAvailable`, and its copy/tooltip
  states the idle-only semantics). Disabled with an explanation while the
  runner holds a live assignment or below-minimum handling applies.
- Q6 (extra refinements) → clearer status labels where cheap (stale "last seen"
  badges, per-control busy states, better save-failure messages), a confirm
  step kept only where a destructive consequence remains (revoke keeps none
  today — see Phase 6 notes; directories drop the double-confirm once the
  "not sent yet" limitation is resolved). No runner search/filter: the roster
  is a handful of rows; filter UI would be unused chrome.

If a later survey round answers differently, the D1–D5 callouts in the
implementation plan are the reconciliation points.
