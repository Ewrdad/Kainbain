import React from 'react';
import { useLiveBuild } from './useLiveBuild';
import { InfoTooltip } from '../common/InfoTooltip';
import { ChangelogModal } from './ChangelogModal';

/***
 * MARK: BuildHashTrigger
 * @description Slightly greyed-out monospace `#B<build><·short SHA>` trigger
 *   living in the Now Playing bar's right rail, left of the queue-depth chip.
 *   Clicking (or keyboard-activating) it opens the Kainbain changelog baked
 *   into the live build. Hidden when no build identity is baked (dev and
 *   pre-deploy builds), so it never shows a fabricated hash.
 * @example <BuildHashTrigger />
 ***/
export function BuildHashTrigger() {
  const { buildNumber, commitSha, changelogOpen, setChangelogOpen } = useLiveBuild();

  if (buildNumber == null) return null;

  const sha = typeof commitSha === 'string' && commitSha.trim() !== '' ? commitSha : null;
  const label = sha ? `#B${buildNumber}·${sha}` : `#B${buildNumber}`;
  const accessibleName =
    sha != null
      ? `Build ${buildNumber} (${sha}) of the live deployment — show Kainbain changelog`
      : `Build ${buildNumber} of the live deployment — show Kainbain changelog`;

  return (
    <>
      <InfoTooltip
        title={`Live Production Build #B${buildNumber}`}
        description="Self-deploying production build identifier stamped from atomic counter. Click to view the Kainbain changelog baked into this build."
        behindTheScenes="Reads /status which checks ~/apps/kainbain/build.json; the changelog comes from /deploy/changelog (baked at deploy time)."
        position="top-left"
      >
        <button
          type="button"
          onClick={() => setChangelogOpen(true)}
          className="px-2 py-1 min-h-[44px] rounded-sm text-text-muted hover:text-primary text-xs font-mono select-none border border-transparent hover:border-border-standard flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={accessibleName}
          data-testid="build-badge"
        >
          {label}
        </button>
      </InfoTooltip>
      {changelogOpen && (
        <ChangelogModal buildNumber={buildNumber} onClose={() => setChangelogOpen(false)} />
      )}
    </>
  );
}

// Named export only (no `export default`): the jsdoc-example gate requires an
// @example on every default export, and every importer uses the named one.
