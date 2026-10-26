// Role: board duration evidence — toTaskSummary + per-stage seconds for board responses.
// See also activeTaskDisplay.js (live monitor display, not durations).
import { toTaskSummary } from "./work/taskIdentity.js";
import { normalizeStageType } from "./projectStore.js";
import { collectStageDurations } from "../shared/stageDurations.js";

/***
 * MARK: toTaskDurationSummary
 * @description Computes duration evidence before compacting a board response.
 *   Canonical cached tasks are never changed; callers resolve each task's workflow
 *   stages. The store's one-argument toTaskSummary remains a compact projection.
 * @example toTaskDurationSummary(task, stages) => { id: 'task-1', stageDurationSamples: […] }
 ***/
export function toTaskDurationSummary(task, stages = []) {
 return {
  ...toTaskSummary(task),
  stageDurationSamples: taskStageDurationSamples(task, stages),
 };
}

/***
 * MARK: taskStageDurationSamples
 * @description Collects compact duration samples using the task's workflow stages.
 *   Per visit, prefer report seconds, report markdown, timeline, then bounded
 *   history deltas. Full detail evidence overrides stale precomputed samples.
 *   Each entry carries the stage's normalized `stageType` ('agent', 'human',
 *   'ci', 'merge') so the retrospective page can hide/show whole stage types
 *   without re-resolving the workflow. A deploy is now a `ci` stage, so its
 *   samples report as `ci`.
 * @example taskStageDurationSamples(task, stages) => [{ stageId: '1', stageType: 'ci', seconds: [125] }]
 ***/
export function taskStageDurationSamples(task, stages = []) {
 return stages
  .map((stage) => ({
   stageId: stage.id,
   stageName: stage.name,
   stageType: normalizeStageType(stage.type),
   seconds: collectStageDurations(task, stage),
  }))
  .filter((entry) => entry.seconds.length > 0);
}
