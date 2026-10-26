import { logger } from '../../services/logger';

// The viewport helpers live canonically in `../util/viewport` (shared by the
// compact monitor and the System Settings popout); re-exported here so
// existing observability imports keep working.
export {
  narrowViewportOverride,
  setNarrowViewportOverride,
  isNarrowViewport,
  useIsNarrowViewport,
} from '../util/viewport';

/***
 * MARK: compact monitor preference
 * @description Remembers when the user explicitly asked for the compact
 *   logs-only monitor (desktop right-click on the Monitor button). Stored in
 *   sessionStorage so the request lasts for the tab session without leaking
 *   into fresh tabs or restarts, and without touching routing or context.
 * @example requestCompactMonitorView(); readCompactMonitorRequest() => true
 ***/
const STORAGE_KEY = 'kainbain:observability:compact';

/***
 * MARK: readCompactMonitorRequest
 * @description True when this tab session explicitly requested the compact
 *   monitor view. Never throws: missing storage or bad values read as false.
 * @returns {boolean} Whether the compact view was requested.
 ***/
export function readCompactMonitorRequest() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch (err) {
    logger.warn('Failed to read compact monitor preference', err);
    return false;
  }
}

/***
 * MARK: requestCompactMonitorView
 * @description Remembers an explicit compact-view request for this tab
 *   session (desktop right-click entry). Never throws.
 * @example requestCompactMonitorView()
 ***/
export function requestCompactMonitorView() {
  try {
    window?.sessionStorage?.setItem(STORAGE_KEY, '1');
  } catch (err) {
    logger.warn('Failed to store compact monitor preference', err);
  }
}

/***
 * MARK: clearCompactMonitorView
 * @description Forgets the explicit compact-view request (leaving the
 *   monitor returns to viewport-driven presentation). Never throws.
 * @example clearCompactMonitorView()
 ***/
export function clearCompactMonitorView() {
  try {
    window?.sessionStorage?.removeItem(STORAGE_KEY);
  } catch (err) {
    logger.warn('Failed to clear compact monitor preference', err);
  }
}

