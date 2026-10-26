/***
 * MARK: RESUMED_PRIORITY_REASON
 * @description Priority reason attached to scheduler candidates and queue
 *   items that were interrupted by a stop/crash and are being picked up
 *   again. The frontend queue widget renders the reason as plain text, so
 *   no frontend change is needed for it to display.
 * @example RESUMED_PRIORITY_REASON => "resumed_interrupted"
 ***/
export const RESUMED_PRIORITY_REASON = "resumed_interrupted";
