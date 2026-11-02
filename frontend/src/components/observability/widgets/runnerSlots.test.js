import { describe, expect, test } from 'vitest';

import {
  describeMemoryPressure,
  formatMemoryMb,
  groupLiveAssignments,
  MEMORY_LOW_MB,
} from './runnerSlots';

describe('groupLiveAssignments', () => {
  test('returns one slot per Runner with the first row current', () => {
    const slots = groupLiveAssignments([
      { runnerId: 'r1', taskId: 't1' },
      { runnerId: 'r2', taskId: 't2' },
    ]);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({
      runnerId: 'r1',
      current: { runnerId: 'r1', taskId: 't1' },
      extras: [],
      liveHoldCount: 1,
    });
  });

  test('never renders two live rows under one Runner: extras stay flagged, not current', () => {
    const slots = groupLiveAssignments([
      { runnerId: 'r1', taskId: 't1' },
      { runnerId: 'r1', taskId: 't2' },
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0].current).toMatchObject({ taskId: 't1' });
    expect(slots[0].extras).toHaveLength(1);
    expect(slots[0].extras[0]).toMatchObject({ taskId: 't2' });
    expect(slots[0].liveHoldCount).toBe(2);
  });

  test('server runnerLoad wins for the current task and the count', () => {
    const slots = groupLiveAssignments(
      [
        { runnerId: 'r1', taskId: 't1' },
        { runnerId: 'r1', taskId: 't2' },
      ],
      [{ runnerId: 'r1', liveHoldCount: 2, currentTaskId: 't2' }],
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].current).toMatchObject({ taskId: 't2' });
    expect(slots[0].extras).toHaveLength(1);
    expect(slots[0].liveHoldCount).toBe(2);
  });

  test('drops rows without a Runner and tolerates missing input', () => {
    expect(groupLiveAssignments(null)).toEqual([]);
    expect(groupLiveAssignments(undefined)).toEqual([]);
    expect(
      groupLiveAssignments([null, { taskId: 't9' }, { runnerId: '', taskId: 't8' }]),
    ).toEqual([]);
  });
});

describe('describeMemoryPressure', () => {
  test('flags low memory and passes healthy readings through', () => {
    expect(describeMemoryPressure({ memoryFreeMb: MEMORY_LOW_MB - 1 })).toMatchObject({
      low: true,
    });
    expect(describeMemoryPressure({ memoryFreeMb: MEMORY_LOW_MB })).toMatchObject({
      low: false,
    });
  });

  test('reads unknown for old Runners and unmeasurable values', () => {
    expect(describeMemoryPressure(null)).toBeNull();
    expect(describeMemoryPressure({})).toBeNull();
    expect(describeMemoryPressure({ memoryFreeMb: 'lots' })).toBeNull();
    expect(describeMemoryPressure({ memoryFreeMb: -1 })).toBeNull();
  });
});

describe('formatMemoryMb', () => {
  test('formats megabytes and gigabytes, never invents a reading', () => {
    expect(formatMemoryMb(320)).toBe('320 MB free');
    expect(formatMemoryMb(2048)).toBe('2.0 GB free');
    expect(formatMemoryMb(null)).toBe('—');
  });
});
