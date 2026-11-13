# Update Compatibility Verification

Stage evaluation for task `94ee5786-309a-4063-85a2-a4062e836c47`: verifying that the canonical-id catalogue contract and verified counts implementation will not break existing installs on update.

## Evaluation Summary

1. **State File Migration & Backward Compatibility (`fleet-catalog.json`)**:
   - `normalizeSnapshotState` gracefully parses existing persisted snapshot shapes.
   - Non-canonical entries (`bare` and `provider` forms) are moved safely into `quarantined` with an audit trail preserving all claimant history (`runnerIds`, `declaredBy`, `claimedBy`).
   - Valid entries retain timestamps (`firstSeenAtMs`, `lastSeenAtMs`) and per-runner provenance.
   - The migration logic is fully idempotent: repeatedly loading or migrating yields an identical normalized structure.
   - Verified directly against the host's actual `~/.kainbain/engine/fleet-catalog.json` (96 models -> 94 canonical models, 2 properly quarantined bare/provider models without loss of state).

2. **API & Consumer Compatibility**:
   - `GET /runners/models/catalogue` maintains backward compatibility by keeping the derived `available` boolean (`runnerCount > 0`) and `unavailableReason` string in addition to the new fields (`declaredBy`, `verified`, `harnesses`).
   - Consumers like `/compute/models` continue operating normally (`compute.fleet.test.js` and `compute.test.js` all pass).
   - Non-canonical entries are cleanly omitted from serving sections while remaining accessible and inspectable in the quarantine list.

3. **Runtime & Fleet Operations**:
   - Handles poisoned runner records or missing runner capability properties defensively without throwing or crashing the snapshot store.
   - The snapshot store's lifecycle methods (`remove`, `removeQuarantined`) provide clean operator control without affecting existing project alias mappings.
   - All 118 relevant unit tests across `catalogIngest.test.js`, `runnerModelConfirmation.test.js`, `fleetModelSnapshot.test.js`, and `runnerRoutes.test.js` pass cleanly.
