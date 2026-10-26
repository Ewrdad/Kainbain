import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { logger } from '../../services/logger';

/***
 * MARK: frontendBuildRef
 * @description The commit this frontend bundle was built from (Vite inlines
 *   VITE_* at build; compose passes KAINBAIN_BUILD_REF through as
 *   VITE_BUILD_REF). Empty in dev and in builds that predate the stamp —
 *   callers treat empty as "unknown, do not compare".
 * @example frontendBuildRef() => 'a1b2c3d' (or '' when unstamped)
 ***/
const frontendBuildRef = () => (import.meta.env?.VITE_BUILD_REF ?? '').trim();

/***
 * MARK: isBuildMismatch
 * @description Pure lockstep check (D7): true only when BOTH sides carry a
 *   real ref and they disagree. 'unknown'/'dev' placeholders and empty
 *   values never count as a mismatch — an unstamped side is unverified,
 *   not mismatched — so dev builds and pre-stamp backends stay silent.
 * @example isBuildMismatch('a1b2c3d', 'a1b2c3d') => false
 * @example isBuildMismatch('a1b2c3d', 'e4f5g6h') => true
 * @example isBuildMismatch('', 'e4f5g6h') => false
 * @example isBuildMismatch('dev', 'e4f5g6h') => false
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
 * @description Explicit frontend<->backend lockstep banner (D7,
 *   MigrationPlan Phase 1 WP-1.1). Compares the baked-in VITE_BUILD_REF
 *   against /status build.commit once on mount and renders a full-width
 *   alert only on a proven mismatch. Renders nothing in dev (unstamped
 *   frontend), against unstamped backends, while loading, or on fetch
 *   failure — a version check must never break the board it guards.
 * @example <VersionMismatchBanner />
 ***/
export function VersionMismatchBanner() {
  const [backendRef, setBackendRef] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.systemStatus();
        const commit = data?.build?.commit;
        if (active && typeof commit === 'string' && commit.trim() !== '') {
          setBackendRef(commit.trim());
        }
      } catch (e) {
        logger.error('Failed to fetch backend build ref', e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!isBuildMismatch(frontendBuildRef(), backendRef)) return null;

  return (
    <div
      role="alert"
      data-testid="version-mismatch-banner"
      className="w-full px-4 py-2 border-b-2 border-red-500 bg-red-950/90 text-red-50 text-sm text-center"
    >
      Frontend build {frontendBuildRef()} does not match backend build {backendRef}. This
      combination is unsupported — rebuild both images from the same commit
      (`docker compose up --build`).
    </div>
  );
}

/***
 * MARK: VersionMismatchBanner default export
 * @description Default-export alias of the lockstep banner above.
 * @example <VersionMismatchBanner />
 ***/
export default VersionMismatchBanner;
