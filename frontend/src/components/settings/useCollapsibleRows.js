import { useCallback, useId, useState } from 'react';

/***
 * MARK: sanitizeRowCount
 * @description Coerces an arbitrary row count into a safe non-negative
 *   integer. Non-finite, negative, and non-numeric inputs fold to 0
 *   (fail-safe: the section renders the empty state instead of crashing).
 * @example sanitizeRowCount(2.7) => 2
 * @param {*} count - Claimed row count.
 * @returns {number} Safe row count (>= 0 integer).
 ***/
export function sanitizeRowCount(count) {
  const n = typeof count === 'number' ? Math.floor(count) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function mintKeys(prefix, seq, count) {
  const keys = [];
  let next = seq;
  for (let i = 0; i < count; i += 1) {
    next += 1;
    keys.push(`row-${prefix}-${next}`);
  }
  return { keys, seq: next };
}

function pruneCollapsed(collapsed, liveKeys) {
  if (collapsed.size === 0) return collapsed;
  const live = new Set(liveKeys);
  let dropped = false;
  for (const key of collapsed) {
    if (!live.has(key)) {
      dropped = true;
      break;
    }
  }
  if (!dropped) return collapsed;
  const next = new Set();
  for (const key of collapsed) {
    if (live.has(key)) next.add(key);
  }
  return next;
}

/***
 * MARK: useCollapsibleRows
 * @description Positional stable keys + collapsed-set state for a
 *   collapsible row list (Settings › Model Aliases cards, reusable anywhere
 *   a list needs per-row disclose state that survives add/delete).
 *
 *   Keys are per-component-instance (a `useId` prefix plus an instance
 *   sequence kept in state), so two mounted sections can never share or
 *   confuse keys. Collapse state follows keys, not array indices, so
 *   deleting row 0 keeps row 1's collapsed/expanded state on row 1. New keys
 *   added via `addRowKey()` start expanded by default, even when the hook is
 *   configured with `startCollapsed`, so newly created rows are open on
 *   creation (and remain open-able). Keys reconciled externally (count grows)
 *   honour `startCollapsed` so discard/reset/project-switch keep the chosen
 *   default instead of popping cards open.
 *
 *   Pass `{ startCollapsed: true }` (or `true`) to initialise every row
 *   collapsed (Settings › Model Aliases default). Defaults to expanded otherwise.
 *
 *   Row data itself is NEVER stored here — collapse only hides bodies while
 *   the draft rows stay in the parent's array, so save / discard / reset
 *   flows see every row regardless of collapse state (transfer-safe: a
 *   collapsed row submits exactly like an expanded one).
 *
 *   External count changes (the parent replacing the array on discard/reset)
 *   are reconciled by adjusting state during render — the documented React
 *   alternative to sync effects (same pattern as ProjectSettings), so no
 *   cascading renders and no render-impure key generation.
 *
 *   How it can fail (all fail-safe):
 *   - `count` is garbage (null/NaN/negative) → treated as 0, empty state.
 *   - The parent replaces the whole array externally with a different length
 *     → keys are appended fresh / truncated, and collapsed entries for
 *     dropped keys are pruned, so neither state grows without bound. With
 *     the same length, keys stay positional and collapse follows position.
 *   - `removeRowKeyAt` out of range → no-op, never throws.
 * @example const { keys, isCollapsed, toggle } = useCollapsibleRows(rows.length);
 * @example const { keys } = useCollapsibleRows(rows.length, { startCollapsed: true });
 * @param {number} count - Current row count (positional list length).
 * @param {{ startCollapsed?: boolean } | boolean} [options] - Hook options.
 *   `startCollapsed` initialises every row (and externally reconciled rows)
 *   collapsed. Defaults to `false` (expanded). `addRowKey()` always mints
 *   open rows. Can also be passed directly as a boolean.
 * @returns {{keys: Array<string>, isCollapsed: Function, toggle: Function, collapseAll: Function, expandAll: Function, allCollapsed: boolean, addRowKey: Function, removeRowKeyAt: Function}} Collapse state + key management.
 ***/
export function useCollapsibleRows(count, options) {
  const safeCount = sanitizeRowCount(count);
  const startCollapsed =
    typeof options === 'boolean' ? options : Boolean(options?.startCollapsed);
  const instancePrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  // The sequence lives in state (never a render-touched ref), so StrictMode
  // double-renders stay consistent and every updater below stays pure.
  const [keyState, setKeyState] = useState(() => {
    const { keys, seq } = mintKeys(instancePrefix, 0, safeCount);
    return { keys, seq };
  });
  // Keys minted by addRowKey() that the parent has not reflected in `count`
  // yet. Internal adds land in the same event as the parent's onChange, but
  // a split render must neither collapse the fresh key (growth branch) nor
  // truncate it (shrink branch). Cleared as soon as lengths match again, so
  // later external growth is fully governed by `startCollapsed`.
  const [pendingAddedRows, setPendingAddedRows] = useState(0);
  const [collapsedKeys, setCollapsedKeys] = useState(() => {
    if (!startCollapsed) return new Set();
    const { keys } = mintKeys(instancePrefix, 0, safeCount);
    return new Set(keys);
  });

  // Reconcile when the parent changes the row count externally
  // (discard/reset replacing the array). Internal add/delete go through
  // addRowKey/removeRowKeyAt in the same event as onChange, so lengths
  // already match and this is a no-op for them.
  if (keyState.keys.length !== safeCount) {
    if (keyState.keys.length < safeCount) {
      const { keys: extra, seq } = mintKeys(
        instancePrefix,
        keyState.seq,
        safeCount - keyState.keys.length,
      );
      setKeyState({ keys: [...keyState.keys, ...extra], seq });
      // Externally added rows (discard/reset replacing the array, rows
      // arriving after mount) honour the default. The leading `extra` keys
      // are attributed to in-flight internal adds first, so a split render
      // between addRowKey() and the parent's count update keeps the fresh
      // key expanded.
      if (startCollapsed || pendingAddedRows > 0) {
        setCollapsedKeys((prev) => {
          const next = new Set(prev);
          let remaining = pendingAddedRows;
          for (const key of extra) {
            if (remaining > 0) {
              remaining -= 1;
            } else {
              next.add(key);
            }
          }
          return next;
        });
      }
      if (pendingAddedRows > 0) {
        setPendingAddedRows((prev) => Math.max(0, prev - extra.length));
      }
    } else {
      // Reserve room for in-flight internal adds: truncating to `safeCount`
      // here would eat a fresh key whose parent update has not rendered yet.
      const keep = Math.min(keyState.keys.length, safeCount + pendingAddedRows);
      if (keep !== keyState.keys.length) {
        const keys = keyState.keys.slice(0, keep);
        setKeyState({ keys, seq: keyState.seq });
        setCollapsedKeys((prev) => pruneCollapsed(prev, keys));
        const dropped = keyState.keys.length - keep;
        if (pendingAddedRows > 0 && dropped > 0) {
          setPendingAddedRows((prev) => Math.max(0, prev - dropped));
        }
      }
    }
  } else if (pendingAddedRows > 0) {
    // Counts caught up with the internal adds — clear the reservation so a
    // later external growth is fully governed by `startCollapsed`.
    setPendingAddedRows(0);
  }

  const isCollapsed = useCallback((key) => collapsedKeys.has(key), [collapsedKeys]);

  // Unknown keys are ignored (never added): toggle sources are always live
  // row keys, so an unknown key means a stale closure — growing the set
  // would leak memory and corrupt a future row that mints the same key.
  const toggle = useCallback(
    (key) => {
      if (!keyState.keys.includes(key)) return;
      setCollapsedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [keyState.keys],
  );

  const collapseAll = useCallback(() => {
    setCollapsedKeys(new Set(keyState.keys));
  }, [keyState.keys]);

  const expandAll = useCallback(() => {
    setCollapsedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const addRowKey = useCallback(() => {
    // Reserve one in-flight slot so the reconcile branches above can tell
    // this fresh key (stays expanded) apart from externally added rows
    // (honour `startCollapsed`). Cleared once the parent count catches up.
    setPendingAddedRows((prev) => prev + 1);
    setKeyState((prev) => {
      const seq = prev.seq + 1;
      return { keys: [...prev.keys, `row-${instancePrefix}-${seq}`], seq };
    });
    // New rows start expanded: a fresh key can never already be collapsed,
    // so no collapsed-set touch is needed (fail-safe without a second write).
  }, [instancePrefix]);

  const removeRowKeyAt = useCallback(
    (index) => {
      if (!Number.isInteger(index) || index < 0) return;
      // eslint-disable-next-line security/detect-object-injection -- positional removal of our own key
      const doomed = keyState.keys[index];
      if (doomed === undefined) return;
      setKeyState((prev) => ({
        keys: prev.keys.filter((_, i) => i !== index),
        seq: prev.seq,
      }));
      setCollapsedKeys((prev) => {
        if (!prev.has(doomed)) return prev;
        const next = new Set(prev);
        next.delete(doomed);
        return next;
      });
    },
    [keyState.keys],
  );

  const allCollapsed = safeCount > 0 && keyState.keys.every((key) => collapsedKeys.has(key));

  return {
    keys: keyState.keys,
    isCollapsed,
    toggle,
    collapseAll,
    expandAll,
    allCollapsed,
    addRowKey,
    removeRowKeyAt,
  };
}
