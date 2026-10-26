import React, { useEffect, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { InfoTooltip } from '../common/InfoTooltip';
import { ChangelogModal } from './ChangelogModal';

/***
 * MARK: BuildBadge
 * @description Shows the live production build number in the header. Fetches it
 *   from /status (which reads the deploy's build.json) on mount and periodically.
 *   Clicking (or keyboard-activating) the badge opens the Kainbain changelog
 *   baked into the live build.
 * @example <BuildBadge />
 ***/
export function BuildBadge() {
  const [buildNumber, setBuildNumber] = useState(null);
  const [changelogOpen, setChangelogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const isVisible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const poll = async () => {
      if (!active || !isVisible()) return;
      try {
        const data = await api.systemStatus();
        if (active && data?.build?.buildNumber != null) {
          setBuildNumber(data.build.buildNumber);
        }
      } catch (e) {
        logger.error('Failed to fetch build number', e);
      }
    };
    poll();
    const timer = setInterval(poll, 15000);

    const onVisibility = () => {
      if (active && isVisible()) {
        poll();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onVisibility);
    }

    return () => {
      active = false;
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onVisibility);
      }
    };
  }, []);

  if (buildNumber == null) return null;

  return (
    <>
      <InfoTooltip
        title={`Live Production Build #B${buildNumber}`}
        description="Self-deploying production build identifier stamped from atomic counter. Click to view the Kainbain changelog baked into this build."
        behindTheScenes="Reads /status which checks ~/apps/kainbain/build.json; the changelog comes from /deploy/changelog (baked at deploy time)."
        position="bottom-left"
      >
        <button
          type="button"
          onClick={() => setChangelogOpen(true)}
          className="px-2 py-1 min-h-[44px] rounded-sm bg-surface-container-high text-on-surface-variant hover:text-primary text-xs font-mono font-bold select-none border border-border-standard hover:border-primary flex items-center justify-center cursor-pointer transition-colors"
          aria-label={`Build ${buildNumber} of the live deployment — show Kainbain changelog`}
          data-testid="build-badge"
        >
          #B{buildNumber}
        </button>
      </InfoTooltip>
      {changelogOpen && (
        <ChangelogModal buildNumber={buildNumber} onClose={() => setChangelogOpen(false)} />
      )}
    </>
  );
}

export default BuildBadge;
