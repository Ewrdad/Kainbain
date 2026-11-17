# Code-standards review — WP2 production signals (branch vs main)

Checked against `docs/KB Code Standards.md`, diff base `f12d070d..HEAD`.

- Understandable language: descriptive names throughout (`dispatchScanStartedAt`, `claimSuccessRate`, `recordDispatchLatency`); why-comments on every hook site; no technical pattern terms (grep for factory/barrel/singleton clean).
- JSDoc: every new export carries `MARK:` + `@example`; `npm run check:jsdoc-example` PASS (679 missing, baseline 680 grandfathered).
- Functional shape: plain functions, no classes; state in one named place (`store.productionSignals`); pure `percentile`/`claimSuccessRate` pinned by unit tests.
- Co-location: implementation + both test files in `api/watch/` next to the exposition they extend; hooks sit at the dispatch sites they observe; cross-process bridge uses the pre-existing runner→api import direction and is cycle-free.
- Additive only: every `record*` is fail-safe (never throws into dispatch); behaviour unchanged with recording on/off.
- Tests & isolation: 30 unit tests + synthetic burst test on `mkdtemp`/`isolatedTestRoots` fixtures with a live-tree contamination guard; no live writes. `productionSignals*.test.js` 31/31 pass; `runnerRoutes.test.js` 66/66 and `runner/daemon.test.js` 146/146 pass (via their native runners; direct-root invocation fails on the accessibility-feedback isolation guard by design, unrelated to this change).
- Docs: one-page metric dictionary present at `docs/production-signals-dictionary.md` (name, labels, what proves what, healthy/investigate).

No violations found. No files changed in this review.
