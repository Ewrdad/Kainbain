// Run in the lighter node environment: pure logic, no DOM needs.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveRunnerBoxes } from './resolveRunnerBoxes';

/***
 * MARK: resolveRunnerBoxes tests
 * @description Pins the fleet-roster contract behind the Now Playing bar's
 *   runner boxes, imported from its own module (not the NowPlayingBar
 *   barrel) so the extraction stays directly covered: every configured
 *   active Runner gets a box (idle ones included), assignments overlay
 *   task/stage, and the result is always an array.
 ***/
describe('resolveRunnerBoxes', () => {
  const runners = [
    { runnerId: 'r1', status: 'active', paused: false },
    { runnerId: 'r2', status: 'active', paused: true },
  ];

  it('returns an empty array with no Runners configured', () => {
    expect(resolveRunnerBoxes({ assignments: [], tasks: [], stages: [], runners: [] })).toEqual(
      [],
    );
    expect(resolveRunnerBoxes({ assignments: [], tasks: [], stages: [], runners: null })).toEqual(
      [],
    );
  });

  it('renders an honest idle box for a configured Runner with no assignment', () => {
    const boxes = resolveRunnerBoxes({ assignments: [], tasks: [], stages: [], runners });
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({
      runnerId: 'r1',
      taskId: null,
      taskName: 'Idle',
      stageName: 'Waiting for work',
      idle: true,
    });
    expect(boxes[1]).toMatchObject({ runnerId: 'r2', paused: true, idle: true });
  });

  it('overlays the live assignment with resolved task and stage names', () => {
    const tasks = [{ id: 't1', goal: 'Ship the runner screen' }];
    const stages = [{ id: 's1', name: 'Automated tests' }];
    const boxes = resolveRunnerBoxes({
      assignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }],
      tasks,
      stages,
      runners,
    });
    const live = boxes.find((box) => box.runnerId === 'r1');
    expect(live).toMatchObject({ taskName: 'Ship the runner screen', stageName: 'Automated tests', idle: false });
  });

  it('ignores non-active registry rows but keeps unknown assignment-only ids', () => {
    const boxes = resolveRunnerBoxes({
      assignments: [{ runnerId: 'ghost', taskId: 't9', stageId: 's9' }],
      tasks: [],
      stages: [],
      runners: [...runners, { runnerId: 'r3', status: 'pending' }],
    });
    expect(boxes.map((box) => box.runnerId).sort()).toEqual(['ghost', 'r1', 'r2']);
  });
});
