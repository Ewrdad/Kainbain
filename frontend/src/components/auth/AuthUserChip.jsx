import React from 'react';
import { fetchAuthStatus, signOut } from '../../services/auth/index.js';

/***
 * MARK: AuthUserChip
 * @description Signed-in user indicator for the app header. Renders nothing
 *   while access control is off, while loading, or when nobody is signed
 *   in; otherwise shows the display name plus a Sign out button that ends
 *   the session and returns to the login page.
 * @example <AuthUserChip />
 ***/
export function AuthUserChip() {
  const [user, setUser] = React.useState(null);
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    fetchAuthStatus()
      .then((status) => {
        if (!live) return;
        setEnabled(Boolean(status?.authEnabled));
        setUser(status?.authEnabled ? status?.user || null : null);
      })
      .catch(() => {
        if (live) {
          setEnabled(false);
          setUser(null);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  if (!enabled || !user) return null;

  const onSignOut = async () => {
    try {
      await signOut();
    } catch {
      // The session is gone server-side or the API is unreachable either
      // way — still leave for the login page.
    }
    if (typeof window !== 'undefined') window.location.hash = '#/login';
  };

  return (
    <span
      data-testid="auth-user-chip"
      className="flex items-center gap-2 text-[11px] text-text-muted"
    >
      <span className="max-w-[12rem] truncate" title={user.name || user.id}>
        {user.name || user.id}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        className="px-2 py-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
      >
        Sign out
      </button>
    </span>
  );
}

/***
 * MARK: AuthUserChip default export
 * @description Default entry point for the header user chip (same component).
 * @example import AuthUserChip from './AuthUserChip';
 ***/
export default AuthUserChip;
