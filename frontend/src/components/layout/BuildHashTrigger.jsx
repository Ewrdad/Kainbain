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

  // The stamped `commit` is sometimes a full 40-char SHA (older bakes) or a
  // version-prefixed tag (`1.0.0-<sha>`): display at most the short 7-char
  // form so a long hash can never crowd the 72px bar at narrow widths. The
  // full value is never needed in the DOM — identity is build number + short.
  // `unknown` / blank stamps (a deploy that could not resolve HEAD) are
  // treated as "no hash" so we never fabricate an identity from garbage.
  const rawSha = typeof commitSha === 'string' && commitSha.trim() !== '' ? commitSha.trim() : null;
  const strippedSha = rawSha
    ? rawSha.includes('-')
      ? rawSha.slice(rawSha.lastIndexOf('-') + 1)
      : rawSha
    : null;
  const sha =
    strippedSha != null && strippedSha !== '' && strippedSha.toLowerCase() !== 'unknown'
      ? strippedSha.slice(0, 7)
      : null;
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
        className="min-w-0"
      >
        <button
          type="button"
          onClick={() => setChangelogOpen(true)}
          className="px-2 py-1 min-h-[44px] min-w-0 max-w-[36vw] sm:max-w-none rounded-sm text-text-muted hover:text-primary text-xs font-mono select-none border border-transparent hover:border-border-standard flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={accessibleName}
          data-testid="build-badge"
        >
          {/* Capped width with ellipsis on phones so a long build number can
              never crowd the idle hint / runner boxes out of the 72px bar;
              the untruncated label stays in the accessible name. */}
          <span className="truncate min-w-0">{label}</span>
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
