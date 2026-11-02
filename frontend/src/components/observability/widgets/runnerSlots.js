/***
 * MARK: runnerSlots
 * @description Single source of truth for "what is this Runner doing" across
 * every fleet surface. One Runner executes at most one task at a time; the
 * backend fence (`RUNNER_BUSY`) enforces it, and these helpers render it:
 * live assignments group into exactly one slot per Runner (the current
 * task), so two tasks can never render as live under one Runner. A group
 * carrying extras is a converging backend violation — surfaces flag it,
 * never render it as parallel live work.
 * @example groupLiveAssignments([{ runnerId: 'r1', taskId: 't1' }])
 ***/

/***
 * MARK: groupLiveAssignments
 * @description Groups live assignments into one slot per Runner. The current
 * task is the group's first row (claim order); when the monitor's
 * `runnerLoad` names a different current task it wins (server truth). Rows
 * without a Runner id are dropped; a missing/empty input yields no slots.
 * @example groupLiveAssignments([{ runnerId: 'r1', taskId: 't1' }], null)
 * @param {Array<Object>} [assignments] - `liveAssignments` rows.
 * @param {Array<Object>|null} [runnerLoad] - `runnerLoad` rows (or null).
 * @returns {Array<{runnerId: string, current: Object|null, extras: Array<Object>, liveHoldCount: number}>}
 ***/
export const groupLiveAssignments = (assignments, runnerLoad = null) => {
  const groups = new Map();
  for (const row of Array.isArray(assignments) ? assignments : []) {
    if (!row || typeof row.runnerId !== 'string' || !row.runnerId) continue;
    const group = groups.get(row.runnerId) || { runnerId: row.runnerId, rows: [] };
    group.rows.push(row);
    groups.set(row.runnerId, group);
  }
  const loadByRunner = new Map();
  for (const row of Array.isArray(runnerLoad) ? runnerLoad : []) {
    if (!row || typeof row.runnerId !== 'string' || !row.runnerId) continue;
    if (!loadByRunner.has(row.runnerId)) loadByRunner.set(row.runnerId, row);
  }
  return [...groups.values()].map((group) => {
    const server = loadByRunner.get(group.runnerId) || null;
    let rows = group.rows;
    if (server != null && server.currentTaskId != null && server.currentTaskId !== '') {
      const at = rows.findIndex((r) => String(r.taskId) === String(server.currentTaskId));
      if (at > 0) rows = [rows[at], ...rows.slice(0, at), ...rows.slice(at + 1)];
    }
    const serverCount = Number(server?.liveHoldCount);
    return {
      runnerId: group.runnerId,
      current: rows[0] || null,
      extras: rows.slice(1),
      liveHoldCount:
        Number.isFinite(serverCount) && serverCount > 0 ? serverCount : rows.length,
    };
  });
};

/***
 * MARK: MEMORY_LOW_MB
 * @description Free-memory floor behind the fleet UI's pressure note: a
 * Runner reporting less free RAM than this renders an amber warning.
 * Display-only — it never gates dispatch.
 * @example MEMORY_LOW_MB => 512
 ***/
export const MEMORY_LOW_MB = 512;

/***
 * MARK: describeMemoryPressure
 * @description Best-effort memory posture from heartbeat facts. Old Runners
 * (no `memoryFreeMb` fact) and unmeasurable values read as null — the UI
 * shows nothing rather than a fabricated number.
 * @example describeMemoryPressure({ memoryFreeMb: 128 }) => { freeMb: 128, low: true }
 * @param {Object|null} [facts] - Runner heartbeat facts.
 * @returns {{freeMb: number, low: boolean}|null}
 ***/
export const describeMemoryPressure = (facts) => {
  const mb = facts?.memoryFreeMb;
  if (typeof mb !== 'number' || !Number.isFinite(mb) || mb < 0) return null;
  return { freeMb: mb, low: mb < MEMORY_LOW_MB };
};

/***
 * MARK: formatMemoryMb
 * @description Human short form for a free-memory reading: megabytes below
 * 1 GiB, one-decimal gigabytes above.
 * @example formatMemoryMb(2048) => '2.0 GB free'
 * @param {number} mb - Free megabytes.
 * @returns {string}
 ***/
export const formatMemoryMb = (mb) => {
  if (typeof mb !== 'number' || !Number.isFinite(mb) || mb < 0) return '—';
  if (mb < 1024) return `${Math.floor(mb)} MB free`;
  return `${(mb / 1024).toFixed(1)} GB free`;
};
