/***
 * MARK: COMPLETE_EXECUTION_BODY_LIMIT_BYTES
 * @description THE single source of truth for "how big may one run-finished
 *   report be?", shared verbatim by the backend (`api/flow/runnerRoutes.js`,
 *   which sets it as the per-route `bodyLimit` on
 *   `POST /tasks/:id/complete-execution`) and the Runner
 *   (`runner/daemon.js`, which names it in the `report-too-large`
 *   failure reason) so the two can never drift (task d164fb3f,
 *   RESPONSE.md S2: the 413 completion-payload loop).
 *
 *   10 MiB: 10x headroom over today's ~1 MiB reports (task docs +
 *   output legitimately ride this route), small enough to keep the
 *   default protection meaningful. ONLY this route is raised — every
 *   other route keeps Fastify's 1 MiB default, pinned by
 *   `api/bodyLimit.default.test.js`.
 * @example COMPLETE_EXECUTION_BODY_LIMIT_BYTES => 10485760
 ***/
export const COMPLETE_EXECUTION_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
