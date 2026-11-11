# Survey reconciliation + compat spec (phase 0 exit)

Task `82e49a05-b83f-4233-8d65-263aa0b9314c`. The plan assumed
`SURVEY.md` was missing; it is present in this checkout, so this file
reconciles it against plan decisions K1–K6 and writes the compat
contract (plan step 0.4) before coding.

## Live evidence (2026-11-11, read-only)

- Backend knobs live: `KAINBAIN_RUNNER_MIN_VERSION=0.1.0`,
  `KAINBAIN_RUNNER_RECOMMENDED_VERSION=0.1.0` (fleet record defaults).
  Fleet: local-alpha, local-bravo, server2-alpha active at runner
  `0.1.0`, no badges lit, `updateStatus` null everywhere.
- server2-alpha unit (this host): `ExecStart=/usr/bin/node main.js`,
  `WorkingDirectory=/home/server2/apps/kainbain/runner/runner`, no
  `KAINBAIN_RUNNER_INSTALL_ROOT`, no `update-state.json`. Confirms plan
  D3: a staged update could never boot here.
- Only release remotely and locally: `runner-v0.1.0` (published
  2026-11-05 by github-actions[bot], 4 tarballs + manifest + minisig).
  The live manifest verifies OK against the pinned key
  (`901011da8bb09147`) with the repo's own verifier. Confirms D1/D2.
- The "initial placeholder" comment above `PINNED_RELEASE_PUBLIC_KEY`
  is stale: the key is real and verifies the live release. Reword, do
  not rotate (plan 1.6).

## Survey vs plan

| Survey answer | Plan | Verdict |
|---|---|---|
| q1: newest release compatible with backend API (+ "pinning maybe an option") | K2 compat-gated selection | Aligned. "Maybe pinning" stays rejected: desired version is fleet-wide, no per-runner pins (ADR 0012 survey line stands). |
| q2: backend auto-commands updates (+ "mostly all of the above") | 2.4 operator sets desired, idle or Update-now converges | Survey extends the plan: implement auto-command on heartbeat (rate-limited nudge) IN ADDITION to idle self-update and the Update button. |
| q3: GitHub releases, backend only chooses target | K1 | Aligned. R05 boundary kept. |
| q4: self-update wrapper | K4 | Aligned. |
| q5: below-minimum blocks dispatch | keep | Aligned, no change. |
| q6: git tag creates release automatically | K5 pipeline cuts the tag | Reconciled: the tag→release trigger is unchanged (survey's "current behaviour"); publish.sh gains the tag+push step so the normal pipeline produces it instead of human memory. Manual tag stays the emergency path. |
| q7: remote reaches internet/GitHub, or only the backend | mirror index in 2.3 | Heads-up: "only reaches backend" cannot fetch GitHub bytes and the backend must not serve bytes (R05). Such hosts use a mirror base reachable from their network via `KAINBAIN_RUNNER_UPDATE_URL` + `releases.json`; documented in the runbook. |
| q8: failed update keeps old version + clear error | keep | Aligned, no change. |

No plan revision needed; q2 adds the auto-command nudge to 2.4 and q7
confirms the mirror index ships in 2.3.

## Compat contract (spec for 2.1–2.3)

Vocabulary reuses `runner/version.json` `requires.backendApi` and
`api/version.json` `accepts.runner` / `apiVersion`.

1. Manifest gains optional `requires: { backendApi: "<range>" }`.
   `buildManifest` stamps it from the release source tree's
   `runner/version.json`. Schema stays `1`; `validateManifest` accepts
   manifests without it and validates the range string when present.
   Old runners ignore the field.
2. Backend advertises on register/heartbeat responses (inside the
   existing `update` object): `backendApiVersion` (from
   `api/version.json`), `desiredRunnerVersion` (= the recommended
   knob, the managed fleet target), `minimumRunnerVersion` (= the min
   knob). Env knobs stay the managed surface; no settings store is
   invented (no such store exists for these keys).
3. Runner selection rule (newest verified release such that):
   - strictly newer than current (never downgrade),
   - not a pre-release (skip after verify, as today),
   - `backendApiVersion` satisfies `requires.backendApi`; a manifest
     without `requires` counts as compatible (legacy releases);
     an unparseable range counts as incompatible (fail closed);
   - an unknown `backendApiVersion` (no heartbeat yet) counts as
     compatible (today's behaviour; R03 offline updates keep working).
   - REVISION vs plan K2 (survey q1 wins per plan step 0.1): the
     backend's desired version does NOT cap selection. The user chose
     "newest release compatible with the backend API" with asymmetric
     updates explicitly allowed, so a runner may run newer than
     desired while compatible. Desired/min keep their badge, 409
     floor, and auto-command roles (item 6). A cap would also freeze
     the fleet at the `0.1.0` knob default until an operator bumps it
     per release.
   - Range grammar supported without dependencies: space-separated
     comparators (`>`, `>=`, `<`, `<=`, `=`, bare version), `||`
     alternation. Anything else is unparseable.
4. Candidate sources: `releases/latest` stays the fast path when it
   already satisfies the filter; otherwise the GitHub releases list
   API (newest-first, bounded to 30 entries / 2 pages, drafts and
   pre-releases skipped before download, seen versions de-duped).
   Mirror bases serve an optional `releases.json` index
   (`{ schema: 1, component: "runner", releases: [{ version,
   manifestUrl, signatureUrl }] }`, newest-first); a missing index
   (404) falls back to today's single-manifest behaviour; a present
   but invalid index fails the check loudly. A full-`manifest.json`
   override URL stays an explicit single-candidate pin (still
   compat/desired-filtered, uniformly).
5. Verification order is unchanged: signature → schema → sha256, and a
   candidate's `requires` is trusted only after its manifest
   signature verifies.
6. Backend auto-command (survey q2): heartbeat enqueues `requestUpdate`
   when the runner is active, advertises `requestUpdate` support,
   trails the desired version, has none pending, and has no
   `requestUpdate` result newer than 24h. The runner still applies it
   only when idle, and honours `KAINBAIN_RUNNER_AUTO_UPDATE=0` with an
   explicit ack reason.
