import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { logger } from '../../services/logger';

/***
 * MARK: useLiveBuild
 * @description Data hook behind the build-hash trigger: polls `/status` (which
 *   reads the deploy's `build.json`) for the live build number plus the short
 *   commit SHA stamped at deploy time, and owns the changelog dialog's open
 *   state. Stays hidden (null build) when no build is baked — dev and
 *   pre-deploy builds render nothing instead of a fabricated identity.
 * @example const { buildNumber, commitSha, changelogOpen, setChangelogOpen } = useLiveBuild();
 ***/
export function useLiveBuild() {
  const [buildNumber, setBuildNumber] = useState(null);
  const [commitSha, setCommitSha] = useState(null);
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
          setCommitSha(typeof data.build.commit === 'string' ? data.build.commit : null);
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

  return { buildNumber, commitSha, changelogOpen, setChangelogOpen };
}
