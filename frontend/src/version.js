import packageJson from '../../package.json';

/***
 * MARK: UI_VERSION
 * @description The running UI (frontend) version: read straight from the
 *   frontend `package.json` so the bundle can never drift from the
 *   published version. The Settings About page sends this to
 *   `GET /status/versions?uiVersion=` for the newer-version comparison.
 * @example UI_VERSION => '1.0.0'
 ***/
export const UI_VERSION = packageJson.version;
