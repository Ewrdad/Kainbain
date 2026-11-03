# Runners Onboarding

Runners should be configured through the general app settings


## Workflow

1. Runner boots up with env variables pointed at the backend.
2. (Optional) Runner is configured with the API’s public key and asks the Backend to verify it is the correct backend
3. Runner requests to the backend to join with details such as its IP/MAc address ,system configuration, operating system etc. Especially available harnesses and models
4. User in system settings sees the new request and can either accept or deny in ui
5. Automatic handshake occurs setting up a secure channel between the two services.
6. User can load projects onto runner
7. runner requests tasks
8. Update verification (Option A, ADR 0012): on first idle the runner checks
   the GitHub release pointer, verifies the manifest signature against its
   pinned key and the asset sha256, self-updates, and re-registers — Settings
   › Runners shows the new version in the fleet matrix. A failed verification
   keeps the old version and raises the "update failed" badge; a runner below
   `KAINBAIN_RUNNER_MIN_VERSION` gets 409 on dispatch/claim until it updates.
   Roll back a bad release by deleting it (latest pointer reverts) and
   lowering `KAINBAIN_RUNNER_RECOMMENDED_VERSION`.