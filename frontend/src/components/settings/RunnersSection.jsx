import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';

/***
 * MARK: RunnersSection
 * @description System Settings › Harness › Runner onboarding (D4, ADR 0009
 *   steps 1–2): lists Runner registrations from `GET /runners` — pending
 *   join requests with Approve/Deny, active Runners with Revoke — with
 *   honest loading, error-with-retry, and empty states. Credential values
 *   are never rendered (the approve response carries the single copy the
 *   Runner already holds). Stateless: refetches after every mutation.
 * @example <RunnersSection />
 ***/
export function RunnersSection() {
  const [runners, setRunners] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadRunners = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api.getRunners();
      setRunners(Array.isArray(list) ? list : []);
    } catch (err) {
      setRunners(null);
      setLoadError(err?.message || 'Could not load Runner registrations.');
    }
  }, []);

  useEffect(() => {
    loadRunners();
  }, [loadRunners]);

  const mutate = useCallback(
    async (runnerId, action) => {
      setBusyId(runnerId);
      setActionError(null);
      try {
        if (action === 'approve') await api.approveRunner(runnerId);
        else if (action === 'deny') await api.denyRunner(runnerId);
        else await api.revokeRunner(runnerId);
        await loadRunners();
      } catch (err) {
        setActionError(err?.message || `Could not ${action} Runner ${runnerId}.`);
      } finally {
        setBusyId(null);
      }
    },
    [loadRunners],
  );

  if (runners === null && !loadError) {
    return (
      <div className="py-6 text-xs text-text-muted" data-testid="runners-section-loading">
        Loading Runner registrations…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-6 flex flex-col gap-3" data-testid="runners-section-error">
        <p className="text-xs text-text-muted">{loadError}</p>
        <button
          type="button"
          onClick={loadRunners}
          className="self-start px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const pending = runners.filter((r) => r.status === 'pending');

  return (
    <section aria-label="Runner onboarding" data-testid="runners-section" className="mt-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
        Runners
      </h3>
      <p className="mt-2 text-xs text-text-muted">
        Out-of-process task executors (Phase 2, loopback only). A Runner joins
        with the operator join token set as KAINBAIN_RUNNER_JOIN_TOKEN on the
        backend, waits here for approval, then heartbeats and claims tasks
        with its own credential. Revoking stops the credential immediately;
        leases expire on their own.
      </p>
      {actionError && (
        <p className="mt-2 text-xs text-error" role="alert">
          {actionError}
        </p>
      )}
      {runners.length === 0 ? (
        <p className="py-4 text-xs text-text-muted" data-testid="runners-section-empty">
          No Runner registrations yet. Boot a Runner pointed at this backend and
          its join request will appear here.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {runners.map((runner) => (
            <li
              key={runner.runnerId}
              className="flex flex-wrap items-center gap-2 px-3 py-2 bg-surface-container border border-border-standard rounded-sm"
            >
              <span className="text-xs font-mono text-on-surface">{runner.runnerId}</span>
              <span
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted"
                data-testid={`runner-status-${runner.runnerId}`}
              >
                {runner.status}
              </span>
              {runner.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    disabled={busyId === runner.runnerId}
                    onClick={() => mutate(runner.runnerId, 'approve')}
                    aria-label={`Approve runner ${runner.runnerId}`}
                    className="ml-auto px-3 py-1.5 min-h-[44px] bg-primary hover:brightness-110 text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm transition-all cursor-pointer disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === runner.runnerId}
                    onClick={() => mutate(runner.runnerId, 'deny')}
                    aria-label={`Deny runner ${runner.runnerId}`}
                    className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                  >
                    Deny
                  </button>
                </>
              ) : (
                runner.status === 'active' && (
                  <button
                    type="button"
                    disabled={busyId === runner.runnerId}
                    onClick={() => mutate(runner.runnerId, 'revoke')}
                    aria-label={`Revoke runner ${runner.runnerId}`}
                    className="ml-auto px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                  >
                    Revoke
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <p className="mt-2 text-xs text-text-muted" role="status">
          {pending.length} pending join request{pending.length === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  );
}
