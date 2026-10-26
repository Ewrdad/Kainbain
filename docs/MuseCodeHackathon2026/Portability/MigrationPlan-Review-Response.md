# Response to Migration Plan Review (2026-10-26)

> **Scope:** Response to [MigrationPlan-Review.md](MigrationPlan-Review.md) against [MigrationPlan.md](MigrationPlan.md). Accepted points are fixed in `MigrationPlan.md`; disagreements are stated with evidence. Code claims re-verified this session.

## Disposition at a glance

| Point | Disposition |
|---|---|
| P1 local-only repos | **Accepted — fixed** |
| P2 risk→phase matrix missing | **Accepted — fixed** |
| P3 D6 dropped | **Accepted — fixed** |
| P4 Phase 3 pre-commits D3 | **Accepted in substance — fixed** (see note) |
| P5 two-port escape hatch | **Accepted in substance — fixed**; one factual correction (WebSocket, not SSE) |
| P6 Phase 1 value overstated | **Partially accepted — fixed**; "none of the three deliverables" is incorrect |
| S1 rollback rehearsal | **Accepted — fixed** |
| S2 onboarding UI unassigned | **Accepted — fixed** |
| S3 frontend↔backend skew | **Accepted — fixed** |
| S4 monitors/cutover | **Accepted — fixed** |

## Significant points

### P1 — Local-only repositories — Accepted

Verified: `api/git/remote.js:50-57` (`pushBranchIfRemote` → `{ pushed: false, skipped: 'no-remote' }`) and `PORTABLE_DEPLOYMENT.md` Scenario D (bring your existing repositories). The reviewer is right that clone→push→verify-SHA has no answer for a repo with no remote, and the plan pre-committed "git clone to Runner projects folder" without naming the clone source.

Fixed in the plan: Phase 0 D2/D10 now decides a 3-way transport matrix — (a) remote-backed (clone-from-origin, push, verify reachable SHA), (b) local-only on a loopback Runner (adopt/share path, completion verified by branch+SHA presence in the backend-visible repo), (c) local-only offered to a remote Runner (not dispatchable without a fetchable transport). Phase 2 parity now requires a local-only fixture repo, and the pageable metric is rescoped to "unverifiable SHA" covering both variants. Declaring remotes mandatory (the reviewer's option b) was rejected: it would change behaviour for existing local-only installs and violate the plan Goal.

### P2 — Phase 0 gate artefact did not exist — Accepted

Correct: neither the plan nor RiskAssessment §6 carried a risk→phase mapping, so the gate was unpassable as written. Fixed: the R01–R16 retirement matrix is now an explicit Phase 0 deliverable inside the plan.

### P3 — D6 dropped — Accepted

Correct: RiskAssessment §4 marks D6 (reconciliation timing/cache invalidation) as blocking Phase 2, but it appeared in neither the Phase 0 priority order nor Open Questions. Fixed in both places.

### P4 — Phase 3 pre-commits D3 — Accepted in substance

The internal inconsistency is real and is fixed: Phase 3 now implements "whichever D3 decides", and D3 explicitly includes counter semantics (backend-central vs per-process, as in `api/aliasSelector.js` today).

One qualification: the weighted wording was not an arbitrary pre-commitment — it restated RiskAssessment R07's own recommendation (backend-routed, deterministic, central). The plan now labels it as a recommendation pending D3 rather than deleting it, so Phase 0 still has a proposal to accept or reject instead of a blank page.

### P5 — Two-port escape hatch — Accepted in substance; factual correction

Accepted: "document the two-port change" contradicts the Goal. Phase 1 now mandates a same-origin proxy topology and reclassifies two-port as a Goal amendment.

Correction to the review: the live stream is not SSE. It is WebSocket — `api/routes/ws.js` (`app.get("/ws", { websocket: true })`) forwarded by `api/eventBridge.js`, with the frontend building its URL in `frontend/src/services/api.js`/`apiBase.js` (empty `VITE_API_BASE`/`VITE_WS_URL` = same origin). The proxy requirement therefore covers `/ws` specifically. This does not change the fix, only the protocol named in it.

### P6 — Phase 1 value overstated — Partially accepted

Accepted: the original wording ("most of the portability deliverable") overclaimed, and the plan now states Phase 1 delivers neither native-Runner packaging (Phase 2) nor multithreading (Phase 3).

Not accepted: "Phase 1 delivers none of the three" deliverables. `Deliverables.md` Priority 1 acceptance criteria are three bullets — runner paradigm, **Docker Compose for the engine + UI**, native Runner. Phase 1 delivers the Compose bullet exactly. The corrected wording credits that bullet while denying the headline (multithreading), which is the accurate middle position.

## Smaller points

- **S1 rollback rehearsal — Accepted.** Phase 1 and Phase 2 gates now require an actually performed rollback (topology revert + board/in-flight proof), per R16's "rehearsed, not improvised".
- **S2 onboarding UI — Accepted.** A minimal Settings approval surface (pending join requests, approve/deny) is now an explicit Phase 2 deliverable; the full Runners config screen stays Phase 3.
- **S3 frontend↔backend skew — Accepted.** Phase 1 now specifies lockstep Compose releases, backend version on `/status`, and an explicit mismatch banner.
- **S4 monitors/cutover — Accepted.** The monitor table now has an "Activates" phase column and a named alert owner (backend operator on call); Phase 1 and Phase 2 gates now start with a drain-the-queue step (cutover only at stage boundaries, no in-flight stage on the old path).

## What was deliberately not changed

- Strangler sequencing, fencing-over-leasing, reconciler + pageable-zero, honest R03/R05 acceptance, and the reuse list — the review retains these without reservation, and they stand.
- Mandatory remotes (P1 option b) — rejected for the Goal reason above; the local-transport variant is specified instead.

---
#project/kainbain #review #portability #migration
