import React from 'react';

import { RunnerBox } from './RunnerBox';
import { RUNNER_BOX_MAX_COUNT } from './runnerBoxUi';

/***
 * MARK: RunnerBoxesRow
 * @description Row container for the Now Playing runner boxes (plan B2):
 *   `role="list"` labelled "Live runners", one `role="listitem"` per box.
 *   Renders null unless there are 1-4 entries — 0 or 5+ falls back to the
 *   legacy single-task view in the parent, so this component never decides
 *   the fallback itself. The row scrolls horizontally inside the bar's
 *   bounded left container (`flex-1 min-w-0`) and each box is `shrink-0`,
 *   so boxes can never paint under the centre transport controls.
 * @example <RunnerBoxesRow entries={[{ runnerId: 'bravo', runnerLabel: 'Bravo', task: { id: 't1' }, taskTitleFirstLine: 'Ship it', stageName: 'Plan', statusWord: 'running' }]} onOpenTask={(task) => setSelectedTask(task)} />
 * @param {Object} props - Component props.
 * @param {Array<Object>} props.entries - Runner entries (1-4 render, anything else returns null).
 * @param {Function} [props.onOpenTask] - Forwarded to each RunnerBox.
 * @returns {React.ReactElement|null} The row, or null when out of the 1-4 window.
 ***/
export function RunnerBoxesRow({ entries, onOpenTask }) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > RUNNER_BOX_MAX_COUNT) {
    return null;
  }
  return (
    <div
      role="list"
      aria-label="Live runners"
      data-testid="runner-boxes-row"
      className="flex min-w-0 items-center gap-2 overflow-x-auto"
    >
      {entries.map((entry) => (
        <div
          key={String(entry?.runnerId ?? 'unknown')}
          role="listitem"
          className="min-w-0 shrink-0"
        >
          <RunnerBox entry={entry} onOpenTask={onOpenTask} />
        </div>
      ))}
    </div>
  );
}
