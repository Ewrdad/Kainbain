import packageJson from '../package.json';
import frontendContract from '../version.json';

/***
 * MARK: UI_VERSION
 * @description The running UI (frontend) version: read straight from the
 *   frontend `package.json` so the bundle can never drift from the
 *   published version. The Settings About page sends this to
 *   `GET /status/versions?uiVersion=` for the newer-version comparison.
 * @example UI_VERSION => '1.0.0'
 ***/
export const UI_VERSION = packageJson.version;

/***
 * MARK: FRONTEND_API_VERSION
 * @description The screen-to-server API contract version this UI bundle was
 *   built to speak: read straight from `frontend/version.json` so the
 *   bundle can never drift from the declared contract. The Settings About
 *   page sends this (plus the required backend range below) to
 *   `GET /status/versions` so the backend can tie the UI side to its own
 *   contract and judge compatibility.
 * @example FRONTEND_API_VERSION => '1.0.0'
 ***/
export const FRONTEND_API_VERSION = frontendContract.apiVersion;

/***
 * MARK: FRONTEND_REQUIRES_BACKEND_API
 * @description The backend API range this UI bundle requires, read straight
 *   from `frontend/version.json` (`requires.backendApi`). Empty when the
 *   bundle declares no requirement — the backend then judges compatibility
 *   on the API major alone.
 * @example FRONTEND_REQUIRES_BACKEND_API => '>=1.0.0 <2.0.0'
 ***/
export const FRONTEND_REQUIRES_BACKEND_API =
  frontendContract.requires?.backendApi ?? '';
