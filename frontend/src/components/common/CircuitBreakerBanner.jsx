import { useCallback, useEffect, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';

/***
 * MARK: CircuitBreakerBanner
 * @description Tier-5 containment surface: a persistent, page-level warning
 *   banner shown whenever the engine is tripped (systemic outage, disk-full,
 *   sustained auth failure, or an operator `POST /engine/trip`). Reads the
 *   live circuit state from the WebSocket ENGINE_STATE frame (merged into
 *   `engineState` by the context) and falls back to one `GET /engine/state`
 *   on mount so a fresh page load still shows the containment. Hidden while
 *   the engine is healthy. Resetting requires a recorded reason — the Reset
 *   button stays disabled until the operator types one.
 * @example <CircuitBreakerBanner />
 ***/
export function CircuitBreakerBanner() {
  const { engineState } = useKainBain();
  const [fetched, setFetched] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Defensive: a partial `api` mock (or an older client) without the
    // engine endpoints must never crash the whole app — the WebSocket
    // ENGINE_STATE frame remains the primary source.
    const pending = api.engineState?.();
    if (!pending || typeof pending.then !== 'function') return undefined;
    pending
      .then((data) => {
        if (!cancelled) setFetched(data?.circuit || null);
      })
      .catch(() => {
        // A failed read never blocks the app; the WS frame remains the source.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = engineState?.circuit || null;
  const circuit = live || fetched;
  const tripped = engineState?.tripped === true || circuit?.tripped === true;

  const submitReset = useCallback(async () => {
    const trimmed = reason.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.engineReset(trimmed);
      setReason('');
      setFetched((prev) => (prev ? { ...prev, tripped: false } : prev));
    } catch (err) {
      setError(err?.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  }, [reason, busy]);

  if (!tripped) return null;

  const source = circuit?.source || 'manual';
  const trippedAt = circuit?.trippedAt ? new Date(circuit.trippedAt).toLocaleString() : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="circuit-breaker-banner"
      className="flex flex-col gap-2 border-b-2 border-red-500 bg-red-950/90 px-4 py-2 text-red-50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-sm font-bold uppercase tracking-wide">
          Engine tripped — all work stopped
        </p>
        <p className="truncate text-xs text-red-100" title={circuit?.reason || ''}>
          {circuit?.reason || 'Systemic failure detected'}
          {` · source: ${source}`}
          {trippedAt ? ` · since ${trippedAt}` : ''}
        </p>
        <p className="text-[11px] text-red-200">
          Queued tasks are deferred, not failed — retry budgets are preserved.
        </p>
      </div>
      <form
        className="flex shrink-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitReset();
        }}
      >
        <label className="sr-only" htmlFor="circuit-reset-reason">
          Reset reason
        </label>
        <input
          id="circuit-reset-reason"
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reset reason (required)"
          className="w-56 rounded-sm border border-red-300/60 bg-red-900/60 px-2 py-1 text-xs text-red-50 placeholder:text-red-200/70 focus:border-red-100 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!reason.trim() || busy}
          className="rounded-sm bg-red-100 px-3 py-1 text-xs font-bold uppercase text-red-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Resetting…' : 'Reset engine'}
        </button>
      </form>
      {error && (
        <p role="status" className="w-full text-xs font-semibold text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}

export default CircuitBreakerBanner;
