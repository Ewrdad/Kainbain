# Runner update runbook

Operator procedures for the runner self-update channel (Option A,
`docs/adr/0012-runner-artifact-update-channel.md`): cutting releases,
rolling back, migrating hosts to the wrapper, and triaging a runner
that says out of date. The backend directs version selection but never
serves runner bytes (R05) — every procedure below preserves that.

## Cutting a runner release (normal path)

The tag is the version source of truth; the pipeline cuts it.

1. Bump `runnerVersion` in `runner/version.json` (plain semver for
   fleet releases, e.g. `0.2.0`; suffixed tags like `0.3.0-rc.1` for
   canaries — v1 runners skip pre-releases automatically).
2. If the release needs a newer backend API, update the
   `requires.backendApi` range in the same file (e.g.
   `>=1.0.0 <2.0.0`). The release builder refuses manifests without a
   compat claim, and runners filter on this range.
3. Merge to the main line through the normal review flow.
4. Publish the runner (`publish.sh` with the runner component). The
   publish cuts and pushes the annotated `runner-vX.Y.Z` tag, which
   triggers `runner-release.yml`: full update-channel test gate, four
   platform archives, signed `manifest.json` + `.minisig`, GitHub
   release. Re-publishing an unchanged runner is a no-op success (the
   tag already exists, so nothing is re-cut).
5. Raise `KAINBAIN_RUNNER_RECOMMENDED_VERSION` to the new version on
   the backend. That is the one managed place: trailers light the
   "update available" badge and the backend auto-nudges command-capable
   ones (`requestUpdate`, at most daily per runner). Runners converge
   on idle with no SSH. Leave `KAINBAIN_RUNNER_MIN_VERSION` alone
   unless this is a breaking release (the 409 floor stops dispatch).

## Cutting a runner release (emergency path)

When the pipeline cannot cut the tag (CI down, urgent patch), tag by
hand from the release commit — the same builder runs:

```
git tag -a runner-vX.Y.Z -m "Runner runner-vX.Y.Z" <full-sha>
git push origin runner-vX.Y.Z
```

Then follow step 5 above. Never move an existing tag: cut a patch
version forward instead.

## Rollback drill (bad release, no host access needed)

1. Delete (or un-publish) the bad GitHub release so `releases/latest`
   resolves to the prior tag.
2. Lower `KAINBAIN_RUNNER_RECOMMENDED_VERSION` (and
   `KAINBAIN_RUNNER_MIN_VERSION` if it was raised past the bad
   version) to stop badge nagging and 409 loops.
3. Cut a patch release forward (normal path above). The updater never
   downgrades: runners still on older versions pick the prior release
   up on their next idle check, while runners already on the bad
   release stay there until the patch supersedes it.
4. Two automatic outs: a release that crashes on boot rolls itself
   back to `previous` after 3 failed boots, and raising the min knob
   above the bad version stops it dispatching (409) while the patch
   is cut.

Drill timing to record: un-publish → badges clear, patch cut →
fleet converged.

## Migrating a host to the wrapper

Direct `node main.js` units re-exec the same old directory on every
restart, so staged updates can never boot there. The migration lays a
versioned install root from the running tree and repoints the unit at
the stable wrapper shim — onto the SAME version (no update is staged,
so the fleet version does not change).

Per host, idle runners first; drain busy runners, then migrate:

```
# 1. Pre-check (read-only, safe any time):
KAINBAIN_RUNNER_INSTALL_ROOT=$HOME/.kainbain/runner-install \
  /path/to/runner/bin/kainbain-runner doctor --unit kainbain-runner-<id>.service

# 2. Rehearse:
scripts/migrate-runner-to-wrapper.sh --id <id> --dry-run

# 3. Migrate (snapshots unit + env, reloads, restarts, re-verifies):
scripts/migrate-runner-to-wrapper.sh --id <id>
```

The script refuses to overwrite an existing `current` link and prints
revert commands (copy the `.bak-<timestamp>` files back, reload,
restart). New installs need no migration: both installers
(`scripts/install-local-runner.sh`, `startRunner.sh`) already write
wrapper-based units. Verify after: `doctor` reports `status: ok` with
`entrypoint: wrapper`, and the next heartbeat shows the same version
as before.

## Triage: a runner says out of date

Start on the runner host (or ask the host owner to run it) — the
doctor is read-only and never writes:

```
$KAINBAIN_RUNNER_INSTALL_ROOT/bin/kainbain-runner doctor --unit kainbain-runner-<id>.service
```

Match the Settings › Runners badge to a cause:

- **"update available" that never clears.** The runner trails
  `KAINBAIN_RUNNER_RECOMMENDED_VERSION`. If the doctor says
  `entrypoint: direct`, migrate to the wrapper (above) — staged
  updates can never boot there. If the env shows
  `KAINBAIN_RUNNER_AUTO_UPDATE=0` (or `(unset)` with a host-level
  opt-out), the runner acked the nudge with "skipped: auto-update is
  disabled" — flip that switch. If the recommended knob sits above
  every published release, lower it to the newest release. Otherwise
  the runner is likely just busy: it converges at the next idle
  check, or press Update now (idle-only, never interrupts work).
- **"below minimum" / 409 loop.** The runner is under
  `KAINBAIN_RUNNER_MIN_VERSION` and dispatch refuses it. It
  self-updates immediately when idle (interval bypassed). If it
  spins, check the journal for `Runner update` lines and treat the
  reason like an "update failed" below.
- **"update failed".** The next heartbeat carries `updateStatus`
  (`state: failed`, `reason`, `at`) — the badge tooltip shows it.
  Map the reason prefix: signature/key failure (release not signed
  by the pinned key — never hand-edit
  `PINNED_RELEASE_PUBLIC_KEY` in `runner/updates/verify.js` for a
  cut release); sha mismatch (re-download on next check); no asset
  for this platform (release is missing this host's tarball);
  incompatible with this backend (no newer release admits this
  backend's API — expected while the backend lags the release
  line); update lock held (a previous updater is still running or
  crashed mid-apply — stale locks self-heal); opted out (see
  above). Any failure keeps the old version running; fix the cause
  and the next idle check retries.
- **"rolled back" in the doctor.** Three crashed boots flipped
  `current` back to `previous`. Do not retry blindly: read the
  journal for the crash, fix forward with a patch release, and run
  the rollback drill above if the release is bad fleet-wide.

Backend-side checks: `KAINBAIN_RUNNER_MIN_VERSION` and
`KAINBAIN_RUNNER_RECOMMENDED_VERSION` values, the fleet matrix row
for the runner (`runnerVersion`, `updateAvailable`, `belowMinimum`,
`updateStatus`), and whether a `requestUpdate` command is pending or
was acked within the last 24h (the auto-nudge cooldown).
