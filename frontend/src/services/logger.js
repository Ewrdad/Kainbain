/**
 * MARK: logger
 * @description Minimal structured logger for the frontend. Centralizes console
 * output so production code never calls console directly. Errors are logged
 * with console.error (useful for production triage); info/warn are available
 * for lower-severity diagnostics.
 */
export const logger = {
  info: (...args) => console.info('[kainbain]', ...args),
  warn: (...args) => console.warn('[kainbain]', ...args),
  error: (...args) => console.error('[kainbain]', ...args),
};
