import { reportCreatedAt } from "./reportTimestamp.js";

/***
 * MARK: parseDuration
 * @description Converts seconds, unit-bearing strings, or a report Duration line to seconds.
 * Invalid values return null; legacy zero placeholders are filtered by the sample collector.
 * @example parseDuration('2m 5s') => 125
 ***/
export function parseDuration(value) {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const line = value.match(/^\s*\*\*Duration:\*\*\s*([^\r\n]+)$/m);
  const text = (line ? line[1] : value).trim();
  // Duration labels are tiny; bound input before numeric regexes (reports may be large).
  if (text.length > 64) return null;
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded to 64 characters above
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded to 64 characters above
  const match = text.match(/^(?:(\d+(?:\.\d+)?)m\s*)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!match || (!match[1] && !match[2])) return null;
  const seconds = Number(match[1] || 0) * 60 + Number(match[2] || 0);
  return Number.isFinite(seconds) ? seconds : null;
}

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-");

/***
 * MARK: matchesDurationStage
 * @description Names survive positional id changes; exact normalized matching avoids Plan/Review Plan collisions.
 * @example matchesDurationStage({ name: 'Review Plan' }, 'review-plan') => true
 ***/
export function matchesDurationStage(stage, name, id) {
  if (name && normalize(name) === normalize(stage.name)) return true;
  if (name != null && String(name) === String(stage.id)) return true;
  // A named record with a conflicting name must not be reassigned by its stale id.
  if (name && !/^\d+$/.test(String(name))) return false;
  return id == null
    ? String(name) === String(stage.id)
    : String(id) === String(stage.id);
}

/***
 * MARK: stageHistoryVisits
 * @description Reconstructs closed visits from entry/exit audit events, ignoring unrelated logs and open visits.
 * Clock skew and gaps over a year are not credible duration samples.
 * @example stageHistoryVisits(task, stage) => [{ start: 1000, end: 61000, seconds: 60 }]
 ***/
function stageHistoryVisits(task, stage) {
  const visits = [];
  let start = null;
  for (const entry of task.history || []) {
    const action = entry.action || "";
    const timestamp = Date.parse(entry.timestamp);
    const entered = action.match(
      /^(?:Created(?: and placed)? in|Advanced(?: \(First Stage\))? to|Moved to|Failed back to) stage (?:'([^']+)'|(.+))$/i,
    );
    const ended =
      /^(?:Completed|Aborted by failback policy)$/i.test(action) ||
      /^Stage failed in /i.test(action);
    if (!entered && !ended) continue;
    if (entered && visits.length && visits.at(-1).nextEntry == null)
      visits.at(-1).nextEntry = timestamp;
    if (start !== null) {
      const seconds = (timestamp - start) / 1000;
      if (Number.isFinite(seconds) && seconds > 0 && seconds <= 366 * 86400)
        visits.push({
          start,
          end: timestamp,
          seconds,
          failed: /^Stage failed in /i.test(action),
          nextEntry: entered ? timestamp : null,
        });
      start = null;
    }
    if (
      entered &&
      matchesDurationStage(stage, entered[1] || entered[2]) &&
      Number.isFinite(timestamp)
    )
      start = timestamp;
  }
  return visits;
}

/***
 * MARK: collectStageDurations
 * @description Chooses report seconds, then report markdown, then timeline, then bounded history deltas per visit.
 * Each known visit contributes at most one sample (first report wins equal priority).
 * New reports identify visits by durationStartedAt, including writes after failure.
 * Legacy failure reports in the gap before the next entry belong to the closed failed visit.
 * Unknown-time sources are used only without attributable samples or closed visits.
 * @example collectStageDurations({ reports: [{ stageName: 'Plan', duration: 12 }] }, { name: 'Plan' }) => [12]
 ***/
export function collectStageDurations(task, stage) {
  // Board summaries omit detail evidence; full tasks always recompute from source.
  if (
    !Array.isArray(task.history) &&
    !Array.isArray(task.timeline) &&
    !(task.reports || []).some(
      (report) => typeof report.content === "string",
    ) &&
    Array.isArray(task.stageDurationSamples)
  ) {
    return task.stageDurationSamples
      .filter((entry) =>
        matchesDurationStage(stage, entry.stageName, entry.stageId),
      )
      .flatMap((entry) => entry.seconds || [])
      .filter((seconds) => Number.isFinite(seconds) && seconds > 0);
  }
  const visits = stageHistoryVisits(task, stage).map((visit) => ({
    ...visit,
    samples: [],
  }));
  const executions = new Map();
  const unknown = [];
  const add = (seconds, timestamp, priority, startedAt, failed = false) => {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    const time = Date.parse(timestamp);
    const start = Date.parse(startedAt);
    // Entry and audit timestamps can be separate clock reads a few milliseconds apart.
    const visit =
      (Number.isFinite(start) && visits.find((item) => item.start === start)) ||
      visits.find((item) => time >= item.start && time <= item.end) ||
      (failed &&
        visits.find(
          (item) =>
            item.failed &&
            time > item.end &&
            (item.nextEntry == null || time < item.nextEntry),
        ));
    let samples;
    if (visit) samples = visit.samples;
    else if (Number.isFinite(start) || Number.isFinite(time)) {
      const key = Number.isFinite(start) ? `start:${start}` : `time:${time}`;
      if (!executions.has(key)) executions.set(key, []);
      samples = executions.get(key);
    } else samples = unknown;
    if (!samples.length || priority < samples[0].priority) {
      samples.length = 0;
      samples.push({ seconds, priority });
    } else if (samples === unknown && priority === samples[0].priority)
      samples.push({ seconds, priority });
  };
  for (const report of task.reports || []) {
    if (
      !matchesDurationStage(
        stage,
        report.stageName || report.stageSlug,
        report.stageId,
      )
    )
      continue;
    const structured = parseDuration(report.duration);
    const seconds = structured > 0 ? structured : parseDuration(report.content);
    // All reports outrank timeline/history, even when their duration came from markdown.
    add(
      seconds,
      reportCreatedAt(report),
      0,
      report.durationStartedAt,
      report.status === "FAILED" ||
        /^\*\*Status:\*\*\s*FAILED\s*$/m.test(report.content || ""),
    );
  }
  for (const entry of task.timeline || []) {
    if (
      !matchesDurationStage(
        stage,
        entry.durationStage ?? entry.stage,
        entry.durationStageId,
      )
    )
      continue;
    const seconds =
      parseDuration(entry.durationSeconds) ?? parseDuration(entry.duration);
    add(
      seconds,
      entry.timestamp,
      1,
      entry.durationStartedAt,
      entry.status === "Failed",
    );
  }
  const samples = visits.map(
    (visit) => visit.samples[0]?.seconds ?? visit.seconds,
  );
  // Without history, retain the best source type, avoiding report + timeline duplication.
  const unpaired = [...executions.values()].flat();
  const bestPriority = Math.min(...unpaired.map((sample) => sample.priority));
  samples.push(
    ...unpaired
      .filter((sample) => sample.priority === bestPriority)
      .map((sample) => sample.seconds),
  );
  return samples.length ? samples : unknown.map((sample) => sample.seconds);
}
