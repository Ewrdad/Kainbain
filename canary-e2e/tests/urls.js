/***
 * MARK: canary URL configuration
 * @description Single source of truth for the app and API URLs the canary
 *   suite drives. When CANARY_BASE_URL and CANARY_API_URL are BOTH set they
 *   are used verbatim (operator-owned stack, e.g. a scratch backend + dev
 *   server on different ports, so the suite never mutates a backend it does
 *   not own). When NEITHER is set the playwright config auto-provisions an
 *   isolated scratch stack (API :3399 with a scratch PROJECTS_ROOT, vite
 *   :5299) — the defaults below are only the fallback endpoints inside that
 *   provisioned stack and never the machine's dev/live :3100/:5173 pair.
 *   Setting exactly one of the two is a configuration error (see
 *   playwright.config.js).
 * @example CANARY_BASE_URL=http://localhost:5273 CANARY_API_URL=http://localhost:3310 npx playwright test
 ***/
export const APP_URL = process.env.CANARY_BASE_URL || "http://localhost:5299";
export const API_URL = process.env.CANARY_API_URL || "http://localhost:3399";