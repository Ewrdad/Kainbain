import { useCallback, useEffect, useRef, useState } from 'react';
import { isWakeLockSupported, releaseWakeLock, requestScreenWakeLock } from '../services/wakeLock';

/***
 * MARK: isDocumentVisible
 * @description Whether the document is currently visible (not hidden). The
 * platform auto-releases wake locks on hide, so visibility gates every
 * acquire and re-acquire.
 * @example isDocumentVisible() => true
 * @returns {boolean}
 ***/
function isDocumentVisible() {
  if (typeof document === 'undefined') return false;
  return document.visibilityState !== 'hidden';
}

/***
 * MARK: useScreenWakeLock
 * @description Holds a screen wake lock while `wanted` is true and the
 * document is visible, releasing it otherwise — the same "screen stays on
 * like a video player" behaviour on desktop and mobile. Mounting the hook
 * is what "open" means, so unmount always releases. The platform can also
 * drop the lock on its own (tab hidden, low battery): hidden tabs release
 * our handle and re-acquire on return (the MDN visibilitychange pattern),
 * while other system releases simply mark us inactive until the next gate
 * transition — no re-request loop against a denying platform. A generation
 * counter keeps rapid wanted flips and StrictMode double-effects settling
 * on exactly one held lock (in-flight requests are released on settle
 * instead of kept). Where the API is missing the hook is a silent no-op
 * reporting `supported: false`.
 * @example const { supported, active } = useScreenWakeLock({ wanted });
 * @param {Object} [options]
 * @param {boolean} [options.wanted=false] - Whether the lock should be held.
 * @param {Function} [options.onChange] - Called with the new active state on transitions.
 * @returns {{ supported: boolean, active: boolean }}
 ***/
export function useScreenWakeLock({ wanted = false, onChange } = {}) {
  const [supported] = useState(() => isWakeLockSupported());
  const [active, setActive] = useState(false);
  const sentinelRef = useRef(null);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const wantedRef = useRef(wanted);
  const onChangeRef = useRef(onChange);
  // Sync latest values for the async acquire/release closures. Declared
  // before the main effect so it runs first on every render.
  useEffect(() => {
    wantedRef.current = wanted;
    onChangeRef.current = onChange;
  });

  const setHeld = useCallback((next) => {
    if (activeRef.current === next) return;
    activeRef.current = next;
    setActive(next);
    onChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !supported) return undefined;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let cancelled = false;

    const acquire = async () => {
      if (!wantedRef.current || !isDocumentVisible()) return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      const sentinel = await requestScreenWakeLock();
      if (
        cancelled ||
        generation !== generationRef.current ||
        !sentinel ||
        !wantedRef.current ||
        !isDocumentVisible()
      ) {
        // The gate flipped, we unmounted, the tab hid, or the request
        // failed while it was in flight: release the just-acquired lock
        // (a no-op for null) instead of keeping it.
        await releaseWakeLock(sentinel);
        return;
      }
      if (sentinelRef.current && !sentinelRef.current.released) {
        // A concurrent acquire in this generation already holds the lock
        // (e.g. hide->show while a request was pending): keep the first,
        // release the duplicate.
        await releaseWakeLock(sentinel);
        return;
      }
      sentinelRef.current = sentinel;
      const handleSystemRelease = () => {
        // Intentional releases clear the ref before releasing, so an
        // event arriving with our ref still set is the platform dropping
        // the lock on its own (hidden tab, low battery).
        if (sentinelRef.current === sentinel) {
          sentinelRef.current = null;
          setHeld(false);
        }
      };
      if (typeof sentinel.addEventListener === 'function') {
        sentinel.addEventListener('release', handleSystemRelease);
      }
      setHeld(true);
    };

    const release = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setHeld(false);
      await releaseWakeLock(sentinel);
    };

    if (wanted) {
      void acquire();
    } else {
      void release();
    }

    const handleVisibility = () => {
      if (generation !== generationRef.current) return;
      if (document.visibilityState === 'hidden') {
        void release();
      } else if (wantedRef.current) {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setHeld(false);
      void releaseWakeLock(sentinel);
    };
  }, [supported, wanted, setHeld]);

  return { supported, active };
}
