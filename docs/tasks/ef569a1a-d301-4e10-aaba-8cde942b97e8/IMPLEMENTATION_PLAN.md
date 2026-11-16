# Implementation Plan — Prevent binary proof PNG corruption (prevention follow-on to b1c069e0)

## Goal

Stop proof-PNG corruption at the source instead of catching it in CI 15+ minutes later. An agent following the documented path must be able to attach proof PNGs without bytes ever passing through a text tool, a text-path rewrite must fail fast locally naming the file and the safe alternative, and valid PNG proofs must keep passing the existing proof-hygiene gate unchanged (detection ticket b1c069e0 stays as is).

## Success Criteria

- [ ] An agent following the documented path can attach proof PNGs without ever passing bytes through a text tool.
- [ ] A text-path rewrite of a PNG is either impossible or fails fast locally with a message naming the file.
- [ ] Valid PNG proofs still pass the existing proof-hygiene check unchanged (`npm run check:proof-hygiene` green, no changes to its pass/fail semantics for valid files).

## Context and Starting Facts (researched 2026-11-16, no code changed)

- **Detection already exists and stays untouched:** `scripts/check-proof-and-hygiene.mjs` (magic-byte validation for proof images + root-scratch rules, dependency-free, baseline-aware) is wired as the `Proof Hygiene` branch in `scripts/run-tests.mjs` (~line 472) and reachable via `npm run check:proof-hygiene`. Unit/pinning coverage lives in `tests/check-proof-and-hygiene.test.mjs`. Any prevention work must not weaken this gate.
- **Direct-write capture already exists and is the prevention primitive:** `scripts/capture-screenshot.mjs` writes bytes directly via Playwright (`page.screenshot({ path })`), accepts `--url` / `--path` / `--out` / `--click` / `--width` / `--height` / `--wait`, creates the output directory itself, and already carries the binary-safe proof checklist in its header comment. The plan builds on it rather than inventing a second capture path.
- **The documented rule already exists in one place:** `docs/agent-docs/GitGuidance.md` ("Binary-safe proof artifacts") + pointer from `agents.md` line 13. It states the never-through-text-tools rule, the two safe paths (capture script, `git checkout <ref> -- <path>`), and the `xxd`/`file` verification quoting requirement. Per survey answer Q2 this must now live in **both** places, not just here.
- **No local fail-fast exists:** no `.husky/` hook, no `.pre-commit-config.yaml`, no staged-binary guard was found. Step 3 of the ticket is therefore greenfield and is the highest-risk decision (see Key Decisions).
- **Corruption signature is known:** magic `ef bf bd` (UTF-8 replacement character from a text round-trip) instead of PNG `89 50 4e 47`, `file` reporting `data`. Both the detector message and the future guard message should name this signature so agents recognise it.

## Key Decisions (driven by SURVEY.md grill answers)

| Survey Q | Answer given | Plan consequence |
|---|---|---|
| Q1 safe attach path | Both: automatic tool plus short guide | Keep `capture-screenshot.mjs` as the tool; add a 5-line agent-facing recipe. Neither alone. |
| Q2 rule location | Both: main helper guide + note near proof folder | Update `GitGuidance.md` **and** add a short note at/near the proof-pictures location (exact filename decided in Phase 0; candidate: `docs/tasks/_PROOF_RULE.md` or a per-task-folder stub). |
| Q3 wrong-way behaviour | Stop it and explain the safe way | The guard must exit non-zero, name the file, show expected-vs-actual magic, and print the exact safe command. A warning-only mode is rejected. |
| Q4 file coverage | PNG + all pictures + all non-text, extendable | Drive the guard from the existing `MAGIC_TABLE` extension set plus a small configurable binary-extension list (`png jpg jpeg gif webp`, open to `zip/tgz`), so future taggable types (survey note) slot in without redesign. |
| Q5 old damage | Also repair old broken pictures if found | Include a bounded repair sweep: enumerate current magic failures, restore each from a known-good ref (`git checkout <ref> -- <path>`), re-verify with `xxd`/`file`; record unrestorable ones in the existing baseline file rather than silently deleting. |
| Notes (tagged photos) | Photos live in the task directory and are referenced | Capture `--out` defaults/examples must point into the task docs folder (`docs/tasks/<task-id>/`), and the guide shows reference-not-copy attachment. UI tagging mechanics are out of scope. |

## Approach — Make the Change Easy, Then Make the Change

Order deliberately puts research and the highest-uncertainty piece (the fail-fast guard mechanism) first, shrinks the change surface by reusing the two assets that already work (capture script, detector), and leaves docs + repair + verification to the end when the mechanism is settled. No new abstraction is introduced: one guard, one recipe, one second doc location.

## Steps

### Phase 0 — Grounding inventory (make the change easy, part 1)

1. Confirm the reuse surface with targeted reads only (no edits): `scripts/capture-screenshot.mjs` flags, `scripts/check-proof-and-hygiene.mjs` `MAGIC_TABLE` / `isProofPath` / `formatFailure`, `scripts/run-tests.mjs` Proof Hygiene branch, `docs/agent-docs/GitGuidance.md` binary-safe section, `tests/check-proof-and-hygiene.test.mjs` fixture pattern.
2. Decide the exact second doc location from Q2: check whether proof folders share one parent that can hold a single note vs. needing a per-task stub; record the chosen path in the plan before writing it.
3. Decide the guard mechanism (the plan's one research spike — this step). Candidates: (a) lightweight pre-commit hook or `lint-staged`-style staged-file check reusing `checkFileMagic`; (b) a small wrapper/preflight script agents run before commit (`npm run check:proof-local` or similar); (c) harness-level interception of text-tool writes by extension. Evaluate against: works offline, runs in <5s, names the file + safe remedy, zero new runtime dependencies, extendable extension list. Recommend (a)+(b) sharing one checker module; treat (c) as stretch only if the harness exposes a clean interception point.
4. Enumerate current damage: run `npm run check:proof-hygiene` and `node scripts/check-proof-and-hygiene.mjs --strict` on a clean checkout; list every failing path (expect the three `docs-sidebar-*proof.png` files from the ticket history if still corrupt) and identify a known-good ref per file for the step 9 repair.

### Phase 1 — Smallest safe-path recipe (make the change easy, part 2)

5. Write the 5-line agent recipe (canonical form, exact flags verified against the script in Phase 0): capture with `node scripts/capture-screenshot.mjs --path … --out docs/tasks/<task-id>/<name>-proof.png`, then verify with `xxd -l 8 <path>` (expect `8950 4e47…`) and `file <path>` (expect `PNG image data`), then run the local gate. Keep it copy-pasteable; no prose alternative that invites improvisation.
6. Confirm the recipe end-to-end once against a disposable output path (headless, existing mock fixture or `npm run capture:screenshot` pattern per Testing Guidance — no long-lived server): prove the script writes valid magic without any agent text-tool step, then delete the disposable file or move it out of `docs/`.

### Phase 2 — The prevention change

7. Implement the fail-fast guard from the Phase 0 decision: any write path that would route binary-extension bytes through text handling fails locally before commit/push, exit non-zero, message names the exact file, shows expected vs. actual magic where bytes exist, and prints the safe-path command from the recipe. Extension list is data (extends `MAGIC_TABLE` keys), not code branches, per Q4-extendability.
8. Place the binary-safe rule in both locations from Q2: (a) tighten the existing `GitGuidance.md` section to point at the recipe + guard (no duplication of the recipe body — link it); (b) add the short near-folder note chosen in step 2 containing the never-with-text-tools rule, the recipe, and the verify commands. Both must state: never create, edit, or restore `*.png` (and listed binaries) with text edit/write tools; verify with magic bytes before claiming validity.
9. Repair sweep (Q5): for each file listed in step 4, restore via `git checkout <good-ref> -- <path>`, re-verify `xxd` + `file`, and confirm the detector passes. Anything with no valid source goes into `scripts/baselines/proof-hygiene-known-violations.json` following the file's existing same-path-same-bytes convention — never silent deletion.

### Phase 3 — Assurance (testing + documentation plans)

10. Testing plan (execute in this order):
    - a. Regression: `npm run check:proof-hygiene` and the `tests/check-proof-and-hygiene.test.mjs` suite pass unchanged on valid proofs (acceptance criterion 3).
    - b. Guard unit tests: new fixture tests mirroring the existing fixture style — corrupt-magic PNG is rejected with the filename in the message; valid PNG passes; unknown extensions are skipped not failed; vanished-file and unreadable-file semantics match the detector (skip vs. fail).
    - c. Fail-fast proof: stage a deliberately text-corrupted PNG copy in `/tmp` or `scratch/` (never committed), run the guard, observe non-zero exit + filename + remedy; then run the recipe capture and observe valid magic.
    - d. Agent walkthrough: a fresh agent follows only the documented recipe to attach a proof PNG to a scratch task folder — no text-tool step, detector green. Record the exact commands run.
    - e. Gate placement check: confirm which automated gate invokes the guard (pre-commit and/or `npm test` branch) and show one run where the corruption fails there instead of after a full CI cycle.
11. Documentation plan: `GitGuidance.md` delta + new near-folder note (both locations cross-link the recipe, neither duplicates the detector's job); stage report quotes the `xxd`/`file` outputs for each touched proof; this plan file stays as the audit trail. No changes to `README.md` (owner-maintained) or to b1c069e0's detector semantics.
12. Rollout: land guard + docs + repairs as one reviewable unit; if the guard mechanism choice from Phase 1 proves harness-dependent, land docs + recipe + repair first and the guard second rather than blocking prevention docs on tooling.

## Risks and Open Questions

- **Guard mechanism uncertainty (highest risk):** if neither a pre-commit hook nor a preflight script can intercept the actual agent text-tool write path, the guard degrades to "detect earlier" rather than "impossible". Mitigation: the Phase 0 spike must demonstrate a real interception (or rejection) on a fixture before Phase 2 is built; otherwise scope the ticket to fail-fast-at-commit plus docs and record tool-level blocking as a follow-on.
- **Scope creep into tagging infra:** the survey notes ask for expandable taggable-file support. This plan makes the extension list data-driven but does not build tagging UI — that is a separate ticket.
- **Repair without a good source:** if any corrupt PNG has no valid git ref, it is baselined per the existing convention, not reconstructed or AI-regenerated (a regenerated image would be a fabrication, not a restoration).
- **None (checked):** no open Stage-1 ticket covers this (per ticket notes); `agents.md`/`AGENTS-MAP.md` need only pointer-level updates if the new note changes navigation.

## Non-Goals

- No changes to `scripts/check-proof-and-hygiene.mjs` pass/fail semantics (b1c069e0 stays as is).
- No new capture engine; no `README.md` edits; no source, config, or test changes beyond the guard + its tests + the two doc locations.
- No long-lived servers for verification; no bulk reformatting or unrelated hygiene.
