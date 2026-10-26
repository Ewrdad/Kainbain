// Shared with the board-list projection so legacy evidence can be compacted
// without changing duration precedence or counting a visit twice.
export {
  parseDuration,
  matchesDurationStage,
  collectStageDurations,
} from '../../../../shared/stageDurations.js';
