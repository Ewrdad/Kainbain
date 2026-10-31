# CI/CD scripts — review and workflow

Reviewed 2026-10-30. Three scripts, publish/deploy split: publish never
deploys, update never builds. Detection is asymmetric throughout, so a
UI-only change publishes and restarts only the frontend, a runner-only
change only repackages and restarts the Runner.

## The three scripts

| Script | Home | Job |
| --- | --- | --- |
| `publish.sh` (+ `deploy.sh --prod --publish-only`) | repo root | Gates, build, push images, write `dist/` (runner tarball + release manifest). Never touches prod, never restarts anything. |
| `deploy/update.sh` | `~/apps/kainbain/update.sh`; template `deploy/update.sh`; copy on the ad-site at `/update.sh` | Pull the latest published release and restart only the components whose tag/sha changed. Never builds, never tests. |
| `deploy/install.sh` | ad-site at `/install.sh`; canonical `deploy/install.sh` | From-scratch install for new users: compose stack (prebuilt images) + native Runner. Not run on the dev host. |

Supporting: `deploy/redeploy.sh` (per-component pull/restart/health/rollback,
called by `update.sh`), `scripts/detect-changed-components.mjs` (path →
component mapping), `scripts/check-component-compat.mjs` (API-range gate),
`scripts/sync-adsite.sh` (release → ad-site/S3), `scripts/package-runner.sh`.
`deploy/homelab-pull.sh` is superseded by `update.sh` (it always redeployed
`--all` from an scp source); kept working, do not use for new flows.

## Script 1 — publish (gates, `--fast` to skip them)

```sh
./publish.sh [--detect [--base <ref>] | --backend|--frontend|--runner|--all] [--fast] [--dry-run]
./deploy.sh --prod --publish-only [--fast] [--sync-site]   # CI stage form
```

- Detection: `scripts/detect-changed-components.mjs` diffs the last
  published manifest commit → HEAD. `frontend/**` → frontend only,
  `runner/**` → runner only, `shared/**` or release machinery → all three,
  docs/tests → nothing. Override: `KAINBAIN_PUBLISH_COMPONENTS=all|none|csv`.
- Gates run per changed component only (backend: api tests+lint; frontend:
  frontend tests+lint+build; runner: runner tests). `--all` without
  `--fast` also runs canary once. All gates pass before any push (atomic).
- `--fast` skips the unit gates. It never skips the compatibility check or
  the frontend build.
- Needs `KAINBAIN_DOCKERHUB_NAMESPACE` for image components (exit 2 without
  it; `deploy.sh --prod` defaults it to `ewrdad`). Refuses a dirty component
  tree and a non-default branch. Runner tarballs in `dist/` are pruned to
  the newest 5.
- `dist/release-manifest.json` is carried forward per component and records
  image tags plus the runner tarball's sha256; `dist/release-history.jsonl`
  is the append-only audit trail.
- `deploy.sh --prod --publish-only` is the CI wrapper: it skips the
  deploy-level full test/canary/security/frontend-build/api-install gates
  (publish.sh's per-component gates replace them), runs the registry
  publish, optionally syncs the ad-site, and stops. Plain
  `./deploy.sh --prod` (manual/emergency full deploy + rollback machinery)
  is unchanged.

## Script 2 — update (remote is the source of truth)

```sh
cd ~/apps/kainbain && ./update.sh [--backend|--frontend|--runner|--all] [--check] [--force] [--dry-run]
  [--manifest-url URL] [--manifest FILE] [--dist-dir DIR] [--runner-url URL] [--dir DIR]
```

- Backend/frontend truth = the published release manifest + registry
  images. `--manifest-url`/`$KAINBAIN_MANIFEST_URL` (the ad-site/S3 copy)
  wins; with no URL it falls back to the local checkout's `dist/`
  (`$KAINBAIN_DIST_DIR`, default `~/projects/kainbain/dist`).
- Runner truth = the tarball in that local `dist/` for now, sha256-verified
  by `redeploy.sh`. When the ad-site hosts releases, `--runner-url` (or the
  manifest URL's directory) downloads it instead — same verification path.
- Only changed components are handed to `redeploy.sh --<component>`
  (single-service `pull` + `up -d --no-deps`, health poll, auto-rollback).
- `--check`: exit 0 current, 3 update available, changes nothing.

## Script 3 — install (new users)

```sh
curl -fsSL https://kainbain.ewrdad.uk/install.sh | bash -s -- [options]
```

Many flags (see `--help`): `--install-dir`, `--port`/`--frontend-port`/
`--backend-port`, `--runners N`, `--runner-id`, `--harness`,
`--namespace`, `--tag`/`--backend-tag`/`--frontend-tag`, `--release-url`/
`--manifest-url`/`--manifest`, `--projects-dir`/`--state-dir`/`--notes-dir`,
`--join-token`/`--credential`, `--no-runner`, `--no-start`, `--skip-pull`,
`--dry-run`, `--force`. The flag names match the ad-site InstallerCard
(`--backend-port`, `--frontend-port`, `--runners`, `--install-dir`).
Writes compose + `.env` (600, never overwritten without `--force`),
downloads and sha256-verifies the Runner tarball, health-polls `/status`,
and leaves `update.sh`/`redeploy.sh` beside the install for upgrades.

## Ad-site / S3

`scripts/sync-adsite.sh` copies the manifest, the runner tarball and
`install.sh`/`update.sh`/`redeploy.sh` into the ad-site's `public/`, and
writes `public/releases.json` with a sha256 per file (cheap freshness
check). Set `KAINBAIN_ADSITE_S3_BUCKET=s3://…` (aws CLI required) and it
also builds the site and `aws s3 sync`s it; unset, it stages locally only.
`deploy.sh --prod --sync-site` runs it after a publish. The generated
tarball/manifest/`releases.json` are gitignored in the ad-site; the three
`.sh` files are tracked source there.

## CI workflow (`.kainbain/project.json`, Feature Pipeline)

1. Merge stage (unchanged).
2. **Publish**: `./deploy.sh --prod --fast --publish-only` (`runOnBranch: primary`).
3. **Update**: `cd /home/server/apps/kainbain && ./update.sh` (`runOnBranch: primary`).
4. Final review (unchanged).

`api/project/deployCommands.js` and `api/continuity/deployMarkers.js`
recognise `deploy|publish|redeploy|update|install.sh` as deploy-family
commands (pattern sources pinned identical by test).

## Verified 2026-10-30

- `bash deploy/update.test.sh`, `deploy/install.test.sh`,
  `deploy/redeploy.test.sh`, `deploy/homelab-pull.test.sh`: all pass.
- API: `project/deployCommands`, `continuity/deployMarkers`, `deploy.gates`,
  `deploy.packaging` — 54 tests pass.
- `./publish.sh --dry-run --frontend` prints the full plan, writes nothing.
- Live: `~/apps/kainbain/update.sh` detected only the backend as stale,
  redeployed only it, `/status` stayed ok; a second `--check` exits 0.
- Ad-site `public/` staged; every `releases.json` sha256 matches the file
  on disk, and the runner hash matches the release manifest.

## Known gaps

- No S3 bucket is configured and the aws CLI is not installed on this
  host, so the S3 leg is staged-but-not-run. Set the bucket env and the
  same commands go live. (The ad-site builds: `npm run build` in
  `kainbain-addsite/Kainbain-adsite`; `dist/` serves `/install.sh`,
  `/update.sh`, `/release-manifest.json`, `/releases.json`.)
- `install.sh` has only been shim-tested (never run for real, by design —
  it is for new users' machines).
