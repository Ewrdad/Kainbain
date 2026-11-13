/***
 * MARK: clampToRange
 * @description Rounds a width to a whole pixel and clamps it into
 *   [min, max]; non-finite input falls back to `min` so a corrupt stored
 *   preference can never blow up the layout.
 * @example clampToRange(1000.4, 320, 1840) // 1000
 * @param {number} value - Candidate width.
 * @param {number} min - Smallest allowed width.
 * @param {number} max - Largest allowed width.
 * @returns {number} Clamped integer width.
 ***/
export function clampToRange(value, min, max) {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
