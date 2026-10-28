import React from 'react';

import { RunnerBox } from './RunnerBox';
import { RUNNER_BOX_MAX_COUNT, coerceBoxText, selectRenderableRunnerEntries } from './runnerBoxUi';

/***
 * MARK: RunnerBoxesRow
 * @description Row container for the Now Playing runner boxes (plan B2):
 *   `role="list"` labelled "Live runners", one `role="listitem"` per box.
 *   Renders null unless there are 1-4 renderable entries — 0 or 5+ falls
 *   back to the legacy single-task view in the parent, so this component
 *   never decides the fallback itself. Junk array items and entries whose
 *   field reads throw are dropped by the shared filter (same one the parent
 *   gate counts), so the row and the gate can never disagree. Keys use the same fail-closed id coercion as
 *   the box test ids (so a numeric or symbol id can never throw in the
 *   key or disagree with the box), plus the list index so two entries
 *   sharing a runner id (hand-injected props) cannot collide and swap
 *   each other's boxes. The row scrolls horizontally inside the bar's
 *   bounded left container (`flex-1 min-w-0`) and each box is `shrink-0`,
 *   so boxes can never paint under the centre transport controls.
 * @example <RunnerBoxesRow entries={[{ runnerId: 'bravo', runnerLabel: 'Bravo', task: { id: 't1' }, taskTitleFirstLine: 'Ship it', stageName: 'Plan', statusWord: 'running' }]} onOpenTask={(task) => setSelectedTask(task)} />
 * @param {Object} props - Component props.
 * @param {Array<Object>} props.entries - Runner entries (1-4 renderable render, anything else returns null).
 * @param {Function} [props.onOpenTask] - Forwarded to each RunnerBox.
 * @returns {React.ReactElement|null} The row, or null when out of the 1-4 window.
 ***/
export function RunnerBoxesRow({ entries, onOpenTask }) {
  const renderable = selectRenderableRunnerEntries(entries);
  if (renderable.length === 0 || renderable.length > RUNNER_BOX_MAX_COUNT) {
    return null;
  }
  return (
    <div
      role="list"
      aria-label="Live runners"
      data-testid="runner-boxes-row"
      className="flex min-w-0 items-center gap-2 overflow-x-auto"
    >
      {renderable.map((entry, index) => (
        <div
          key={`${coerceBoxText(entry?.runnerId, 'unknown')}-${index}`}
          role="listitem"
          className="min-w-0 shrink-0"
        >
          <RunnerBox entry={entry} onOpenTask={onOpenTask} />
        </div>
      ))}
    </div>
  );
}
