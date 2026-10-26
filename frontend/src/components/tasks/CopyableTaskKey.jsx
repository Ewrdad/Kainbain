import { useEffect, useRef, useState } from 'react';

import { copyToClipboard } from '../../services/clipboard';

/***
 * MARK: CopyableTaskKey
 * @description Click-to-copy badge for a task's display key (e.g. `#KB-XXXX`).
 * Looks identical to the static badge until clicked: clicking copies the full
 * task id to the clipboard and briefly swaps the label to "Copied ✓".
 * The copy only happens when the click would otherwise do nothing — an
 * active text selection is left alone so manual select-and-copy still works.
 * Renders as a native button so keyboard and screen-reader users get the
 * same labelled action.
 * @param {Object} props
 * @param {string} props.taskId - Full task id copied to the clipboard.
 * @param {string} props.label - Display text (the short formatted key).
 * @param {string} [props.className] - Pass-through styling from the call site.
 * @param {string} [props.copiedLabel] - Transient label shown after a copy.
 * @param {number} [props.copyDelayMs] - How long the copied label shows.
 * @example <CopyableTaskKey taskId={task.id} label={formattedKey} className="font-mono text-xs ..." />
 ***/
export function CopyableTaskKey({
  taskId,
  label,
  className = '',
  copiedLabel = 'Copied ✓',
  copyDelayMs = 2000,
}) {
  const [copied, setCopied] = useState(false);
  const revertTimer = useRef(null);

  useEffect(
    () => () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    },
    [],
  );

  const handleClick = async () => {
    if (!taskId) return;
    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const selection = window.getSelection();
      if (selection && selection.isCollapsed === false) return;
    }
    const copySucceeded = await copyToClipboard(taskId);
    if (!copySucceeded) return;
    setCopied(true);
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setCopied(false), copyDelayMs);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={taskId ? `Copy task ID ${taskId}` : 'Copy task ID'}
      title="Click to copy task ID"
      className={className ? `${className} cursor-pointer` : 'cursor-pointer'}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
