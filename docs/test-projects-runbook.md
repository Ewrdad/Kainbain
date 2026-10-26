# Test-Project Residue Runbook

Throwaway projects created by test runs must never live in `~/projects` or
the live SilverBullet notes space (`space/Projects/Personal/`). Past suites
did exactly that, accumulating ~31 scaffold dirs and ~35k fixture notes
(cleaned up under task 99eef182; see
`docs/tasks/99eef182-2633-4acf-8a22-4bf697ee7206/`).

## Where test projects may live

- API unit/integration suites: per-file `mkdtemp` roots via
  `api/isolatedTestRoots.js` (must be imported first — config snapshots env
  at first evaluation), with `afterEach`/`afterAll` cleanup.
- Canary E2E scratch stack: fixed scratch roots under `/tmp/kb-canary-e2e/`
  (`PROJECTS_ROOT` + `NOTES_SPACE_ROOT` in
  `canary-e2e/playwright.config.js`) — fixed, not per-run, so a reused
  scratch server stays coherent. Never the live roots.

## Guard test

`api/testResidue.guard.test.js` snapshots the `~/projects` listing (and the
Personal notes listing) around the run and fails on new residue. It skips
(never fails) where the live layout is absent, e.g. CI. The product-seeded
`project-a..d` / `Project A..D` names are deliberately NOT matched:
`prepareProjects` (`api/house/projectStartup.js`) recreates them on every
live boot by design. Their live instances were deleted 2026-10-06 on review
instruction (empty sample scaffolds; paired notes removed after a quarantine
+ restore drill), but the seed itself still re-creates them at the next live
boot, so the exclusion stays. Because the detector must ignore those names, a
second hermetic meta-guard in the same file statically fails any api test
file that imports the app without isolated roots installed first — the
mechanism that used to re-seed them from every suite run.

## Cleaning up by hand

1. Classify every `~/projects` sibling as KEEP or DELETE with written
   provenance (creating task/test) — ambiguous defaults to KEEP.
2. Move DELETE candidates to a timestamped quarantine dir outside
   `~/projects` first, validate, restore-drill one item, then delete.
3. Delete paired `space/Projects/Personal/<Name>` notes by exact-name match
   only; batch fixture-prefix deletes (`Review Fixture *`,
   `Advance Fixture *`) with per-batch counts and a non-fixture diff after.
4. Never edit files inside a KEEP dir during cleanup.
