# Decisions (Steps 1–2 gates)

## D1 — D11 creation policy: option (a), remote field in the dialog

Decision: add an optional "Git remote URL" field to the Header "Create
New Project" modal, posting the existing `gitUrl` body field, plus a
"no remote yet — adopt a local repo instead" link that swaps to the
adopt modal, and inline display of the backend D11 error.

Rejected:
- (b) local-first creation: duplicates the adoption path (D11b already
  covers local-only repos via `POST /projects/register`) and weakens
  the fetchability guarantee remote runners rely on (transport matrix
  row 3). Would also churn the pinned contract in
  `api/projectStore.remoteRequired.test.js`.
- (c) adoption-only for new users: keeps the dead-end for users who DO
  have a remote but cannot enter it.

Impact: `api/projectStore.remoteRequired.test.js` stays untouched (no
contract change). Frontend: `Header.jsx`, `useProjects.js`
(`createProject` gains `{ gitUrl }` opts and rethrows so the modal can
render the error inline), `Header.test.jsx`, `useProjects.test.js`.

## D2 — Runner credential handover: join-nonce, one-time, runner-persisted

The plan's Step 5 ("approving writes the credential to the runner env
automatically, or the runner picks up approval by polling") cannot be
the first half: the backend runs in Docker while the runner env file
lives on the host, so the backend cannot write it. Implemented as the
second half, with a security design:

- The runner mints a random 256-bit `joinNonce` per boot and sends it
  on every `POST /runners/register` poll while pending.
- The registry stores the nonce on first register. After human
  approval, a register poll presenting the SAME nonce receives the
  credential exactly once (`credentialExposed` flag, persisted); any
  other caller (browser approve response aside) still gets
  `credential: null`.
- The runner persists the collected credential to
  `~/.kainbain/runner-<id>.credential` (0600) and continues booting —
  no restart, no paste. `runner/config.js` reads that file as a
  fallback when `KAINBAIN_RUNNER_CREDENTIAL` is unset.

Why the nonce: handing the credential to any poller presenting only
the shared join token would escalate the join token into full fleet
impersonation. The nonce proves continuity of the same join session;
an attacker with the token but not the nonce (256-bit, memory-only,
never logged) cannot steal the credential, and a stolen credential is
single-runner scoped anyway. Restart-before-collect loses the nonce
and falls back to the existing manual paste — safe default.

Manual paste stays as the fallback path in all cases.

## D3 — No phantom runner seeding; close the token loop instead

Plan Step 5 bullet 1 says the backend should auto-register a `local-pi`
entry on first boot. Evidence from the journey log shows the real
"never appears" cause is the open join-token loop (fresh installs
generate no token, so registration is disabled). A phantom pending
record would additionally lie (never-seen runner shown as pending).

Implemented instead:
- `install.sh` generates a join token when none is provided, writes it
  to `.env` AND to `~/.kainbain/runner-join.token` (mode 600) so
  `startRunner.sh` picks it up — the runner then self-registers as
  pending within seconds of install (real state, not a phantom).
- `GET /runners/bootstrap` (Step 3 resolver) reports counts plus an
  `expectedRunnerId` hint so the UI can say "waiting for the local
  runner to check in" honestly when zero runners exist.

Deviation accepted because it achieves the plan's user-visible outcome
("pending approval, not no runner") with real registry state.

## D4 — Seeded demo project via boot flag, not installer curl loop

`--adopt-from DIR` (installer curl loop over `.git` children, host→
container path translation, capped) is implemented as planned.
The demo seed, however, is implemented as a backend boot seed behind
`KAINBAIN_SEED_DEMO=1` (which `install.sh` writes unless `--no-seed`):
`seedDemoProject` creates a local-only "Welcome Tour" project (one
agent stage + human review) when the store holds zero projects. This
avoids a second installer↔container protocol and keeps D11 intact
(the route still always enforces; the seed uses the internal
`allowLocalOnly` creation path, same as adoption).

## D5 — Uninstall is self-contained; parity-tested, not lib-sourced

Plan Step 4 wants `install.sh` refactored to source `deploy/lib/`
helpers that uninstall reuses. Both scripts are served standalone
(`curl …/install.sh | bash`), so a sourced lib would break the
documented install path unless inlined at publish time — machinery the
repo does not have. Implemented instead:
- `deploy/uninstall.sh` is self-contained, duplicating ~15 lines of
  path/unit-name logic with comments naming `install.sh` /
  `startRunner.sh` as the source of truth.
- `deploy/uninstall.test.sh` asserts parity by grepping the unit/env
  filename patterns out of `startRunner.sh` and proving uninstall
  removes them (plus a dry-run install → real install → uninstall
  round-trip in a fixture).
- The shared-shell-fixture half of Step 4 IS implemented:
  `deploy/test-fixture.sh` holds the temp-dir + stub-PATH harness, and
  both `install.test.sh` and `uninstall.test.sh` source it (install
  assertions unchanged in behavior).

## D6 — Onboarding checklist data: one `GET /onboarding` summary

Rather than three frontend fetches, the checklist/empty-state UI reads
one new additive endpoint `GET /onboarding` returning the runner
bootstrap summary, project/task counts, adoptable-directory count, and
a precomputed checklist. Pure resolver `resolveOnboardingChecklist`
lives in `api/onboardingChecklist.js` with unit tests; the route only
aggregates stores. Discovered-but-unadopted directories come from
`projectStore.discoverAdoptable()` (immediate `.git` children of scan
roots, capped), also exposed as `GET /projects/discover` for the
empty-state one-click adopt list. Auto-adopt on scan was rejected: it
would write `.kainbain` state into user repos without consent.
