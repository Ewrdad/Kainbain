// Domain: context — router-backed view navigation (single writer: only the
// router edits history). Owns view state, the setView facade, and the router
// bridge bindings; inspector-snapshot clearing on location change included.
import { useState, useEffect, useCallback, useRef } from 'react';
import { routeToView, viewToPath } from '../routing';
export function useViewNavigation({ tasksList, selectedSnapshot, setSelectedSnapshot }) {
  // The initial view is always 'orchestrator'; the KainBainRouteBridge (which
  // lives inside the router) syncs it to the real route on mount, so boot,
  // refresh, and back/forward all derive from the router location.
  const [view, setViewState] = useState('orchestrator'); // 'orchestrator' | 'tasks' | 'settings' | 'system-settings' | 'explorer' | 'observability' | 'docs' | 'task-detail' | 'task-review' | 'task-survey' | 'retrospective'
  // Router binding filled in by KainBainRouteBridge. Stays empty when the
  // provider renders without a router (isolated unit tests): setView then
  // behaves as a plain state setter, exactly like before the migration.
  const routerBindingRef = useRef({ navigate: null, pathname: null });
  // Guards same-tick duplicate navigations to one target (two setView calls
  // before the location effect catches up must not push two history entries).
  const pendingTargetRef = useRef(null);
  // State mirrors so the stable setView facade can resolve functional
  // updates and default task ids without re-creating the callback. Synced in
  // effects (never during render); both writers below also update the refs
  // synchronously before setting state, so they are never stale at call time.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // ---- Router-backed navigation (single writer: only the router edits history) ----
  // `setView` is the navigation facade: it updates view state AND navigates
  // to the view's canonical path, so leaving a view (docs included) can never
  // strand its old location behind. Legacy query/hash entries (`?view=`,
  // `#docs`, `#/task/:id`) are normalised to canonical hashes once at boot
  // in main.jsx; singular/plural aliases also redirect inside the router.
  const selectedIdRef = useRef(null);
  const selectedSnapshotId = selectedSnapshot?.id ?? null;
  useEffect(() => {
    selectedIdRef.current = selectedSnapshotId;
  }, [selectedSnapshotId]);
  const tasksListRef = useRef([]);
  // Keep the route-sync task lookup pointed at the latest board. Parent
  // effects run before the bridge's location effect, so a location change
  // landing in the same commit still resolves against the fresh list.
  useEffect(() => {
    tasksListRef.current = tasksList || [];
  }, [tasksList]);
  const setView = useCallback((next, opts = {}) => {
    const resolved = typeof next === 'function' ? next(viewRef.current) : next;
    viewRef.current = resolved;
    setViewState(resolved);
    const binding = routerBindingRef.current;
    if (typeof binding.navigate !== 'function') return;
    const target = viewToPath(resolved, {
      taskId: opts.taskId ?? selectedIdRef.current,
      slug: opts.slug,
      section: opts.section,
    });
    if (!target) return;
    if (target === binding.pathname || target === pendingTargetRef.current) return;
    pendingTargetRef.current = target;
    binding.navigate(target);
  }, []);

  // Bridge internals (consumed only by KainBainRouteBridge below).
  const registerRouter = useCallback((binding) => {
    if (binding) {
      routerBindingRef.current = binding;
    } else {
      routerBindingRef.current = { navigate: null, pathname: routerBindingRef.current.pathname };
    }
  }, []);

  // Location (back/forward/boot) is the source of truth: resolve the view and
  // the inspector task from the pathname. Unknown paths keep the current
  // view (no silent switch). Non-task locations clear the inspector snapshot
  // — same as the old hashchange handler — while overlay opens never touch
  // the location and so never clear it.
  const syncRouteLocation = useCallback(
    (pathname) => {
      pendingTargetRef.current = null;
      routerBindingRef.current.pathname = pathname;
      const resolved = routeToView(pathname);
      if (!resolved) return;
      if (resolved.view !== viewRef.current) {
        viewRef.current = resolved.view;
        setViewState(resolved.view);
      }
      if (
        resolved.view === 'task-detail' ||
        resolved.view === 'task-review' ||
        resolved.view === 'task-survey'
      ) {
        const id = resolved.taskId;
        const match = tasksListRef.current.find((t) => String(t.id) === String(id));
        setSelectedSnapshot((previous) =>
          previous && String(previous.id) === String(id) ? previous : match || { id },
        );
      } else {
        setSelectedSnapshot((previous) => (previous ? null : previous));
      }
    },
    [setSelectedSnapshot],
  );

  return {
    view,
    setView,
    registerRouter,
    syncRouteLocation,
  };
}
