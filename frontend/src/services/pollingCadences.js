/***
 * MARK: pollingCadences
 * @description Single home for the Now Playing bar / fleet / queue polling
 *   cadences, so freshness tuning changes one place with the rationale
 *   beside each value. All foreground cadences: background tabs pause
 *   polling and catch up on return (see `tabVisibility.js`).
 * @example FLEET_POLL_MS => 5000
 ***/

/***
 * MARK: FLEET_POLL_MS
 * @description Foreground cadence for the shared Runner fleet poller
 *   (`useFleetDirectory`, behind the Now Playing bar's runner boxes and the
 *   per-runner observability widget). 5s matches the pre-existing fleet
 *   cadence, so sharing the poller strictly reduces load (two pollers
 *   become one) while stage/roster changes land within 5s — well inside
 *   the near-live (15–30s) freshness target the survey chose.
 * @example FLEET_POLL_MS => 5000
 ***/
export const FLEET_POLL_MS = 5000;

/***
 * MARK: QUEUE_POPUP_POLL_MS
 * @description Safety-net cadence for the dispatch-order queue popup
 *   (`useScheduledQueue`). The popup refreshes immediately on
 *   observability invalidations (TASK_UPDATED and friends); the 15s poll
 *   only repairs missed frames, so it stays slow and cheap.
 * @example QUEUE_POPUP_POLL_MS => 15000
 ***/
export const QUEUE_POPUP_POLL_MS = 15000;

/***
 * MARK: ENGINE_QUEUE_SYNC_POLL_MS
 * @description Safety-net cadence for the engine-snapshot refresh behind
 *   the bar's queue-depth chip (`useWebSocket`). Task activity refreshes
 *   the snapshot within the invalidation debounce below; the 15s poll
 *   only covers paths that broadcast no task frame (Runner claim/release)
 *   and missed frames, inside the survey's 15–30s bound. Reads ride the
 *   5s TTL `/status` cache shared with the build-hash trigger.
 * @example ENGINE_QUEUE_SYNC_POLL_MS => 15000
 ***/
export const ENGINE_QUEUE_SYNC_POLL_MS = 15000;

/***
 * MARK: INVALIDATION_DEBOUNCE_MS
 * @description Trailing debounce collapsing a burst of WebSocket
 *   invalidations (stage-advance bursts, sweeps touching many tasks) into
 *   a single refresh read. Shared by the queue popup and the engine-snapshot
 *   sync so one burst costs one read per surface, never one per frame.
 * @example INVALIDATION_DEBOUNCE_MS => 500
 ***/
export const INVALIDATION_DEBOUNCE_MS = 500;
