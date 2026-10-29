import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { logger } from '../../services/logger';

/***
 * MARK: frontendBuildRef
 * @description The commit this frontend bundle was built from (Vite inlines
 *   VITE_* at build; compose passes KAINBAIN_BUILD_REF through as
 *   VITE_BUILD_REF). Empty in dev and in builds that predate the stamp —
 *   kept for diagnostics only; the banner decision no longer uses it.
 * @example frontendBuildRef() => 'a1b2c3d' (or '' when unstamped)
 ***/
const frontendBuildRef = () => (import.meta.env?.VITE_BUILD_REF ?? '').trim();

/***
 * MARK: frontendBackendApiRange
 * @description The backend API range this frontend was built against
 *   (VITE_BACKEND_API_RANGE, baked from frontend/version.json by publish).
 *   Empty in dev ⇒ no banner, exactly like the unstamped behaviour before.
 * @example frontendBackendApiRange() => '>=1.0.0 <2.0.0' (or '' in dev)
 ***/
const frontendBackendApiRange = () =>
  (import.meta.env?.VITE_BACKEND_API_RANGE ?? '').trim();

const parseVersion = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(typeof v === 'string' ? v.trim() : '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const cmpVersion = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

/***
 * MARK: satisfiesRange
 * @description Minimal semver-range check supporting the `>=a.b.c <d.e.f`
 *   ranges this project declares in its version.json files (plus a bare
 *   exact version). Anything unparseable does not satisfy.
 * @example satisfiesRange('1.2.0', '>=1.0.0 <2.0.0') => true
 * @example satisfiesRange('2.0.0', '>=1.0.0 <2.0.0') => false
 ***/
export const satisfiesRange = (version, range) => {
  const v = parseVersion(version);
  if (!v || typeof range !== 'string') return false;
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => {
    const m = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(part);
    if (!m) return false;
    const target = parseVersion(m[2]);
    const cmp = cmpVersion(v, target);
    switch (m[1] || '=') {
      case '>=': return cmp >= 0;
      case '<=': return cmp <= 0;
      case '>': return cmp > 0;
      case '<': return cmp < 0;
      default: return cmp === 0;
    }
  });
};

/***
 * MARK: isApiMismatch
 * @description Pure API-range check: true only when BOTH the frontend's
 *   required range and the backend's apiVersion are present and the version
 *   falls outside the range. Empty/null on either side ⇒ no mismatch (never
 *   break the board over an unverifiable version).
 * @example isApiMismatch('>=1.0.0 <2.0.0', '2.0.0') => true
 * @example isApiMismatch('>=1.0.0 <2.0.0', '1.0.0') => false
 * @example isApiMismatch('', '2.0.0') => false
 ***/
export const isApiMismatch = (frontendRequires, backendApiVersion) => {
  const range = typeof frontendRequires === 'string' ? frontendRequires.trim() : '';
  const version = typeof backendApiVersion === 'string' ? backendApiVersion.trim() : '';
  if (!range || !version || !parseVersion(version)) return false;
  return !satisfiesRange(version, range);
};

/***
 * MARK: isBuildMismatch
 * @description Legacy commit-equality check, retained for diagnostics
 *   callers. The banner itself no longer decides on commits.
 * @example isBuildMismatch('a1b2c3d', 'e4f5g6h') => true
 ***/
export const isBuildMismatch = (frontendRef, backendRef) => {
  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  const f = clean(frontendRef);
  const b = clean(backendRef);
  const unknown = (v) => v === '' || v === 'unknown' || v === 'dev';
  if (unknown(f) || unknown(b)) return false;
  return f !== b;
};

/***
 * MARK: VersionMismatchBanner
 * @description Frontend<->backend API compatibility banner
 *   (AsymmetricUpdatesPlan WP-A4). Compares the baked-in
 *   VITE_BACKEND_API_RANGE against /status build.apiVersion once on mount
 *   and renders a full-width alert, naming both numbers, only on a proven
 *   range mismatch. Renders nothing in dev (no range baked), against
 *   unstamped backends, while loading, or on fetch failure.
 * @example <VersionMismatchBanner />
 ***/
export function VersionMismatchBanner() {
  const [backendApiVersion, setBackendApiVersion] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.systemStatus();
        const version = data?.build?.apiVersion;
        if (active && typeof version === 'string' && version.trim() !== '') {
          setBackendApiVersion(version.trim());
        }
      } catch (e) {
        logger.error('Failed to fetch backend API version', e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const range = frontendBackendApiRange();
  if (!isApiMismatch(range, backendApiVersion)) return null;

  return (
    <div
      role="alert"
      data-testid="version-mismatch-banner"
      className="w-full px-4 py-2 border-b-2 border-red-500 bg-red-950/90 text-red-50 text-sm text-center"
    >
      Frontend needs backend API {range}, backend is {backendApiVersion} — redeploy a
      compatible backend or frontend.
      {frontendBuildRef() ? ` (frontend build ${frontendBuildRef()})` : ''}
    </div>
  );
}

/***
 * MARK: VersionMismatchBanner default export
 * @description Default-export alias of the API compatibility banner above.
 * @example <VersionMismatchBanner />
 ***/
export default VersionMismatchBanner;
