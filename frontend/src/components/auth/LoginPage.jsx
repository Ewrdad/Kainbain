import React from 'react';
import { useSearchParams } from 'react-router';
import { fetchAuthStatus, startLogin } from '../../services/auth/index.js';

/***
 * MARK: LoginPage
 * @description Organisation sign-in page. Shown only while access control is
 *   on and nobody is signed in: one button leaves for the identity provider
 *   (a full-page visit to `GET /auth/login`), and provider refusals
 *   (`?error=…`) render as a plain-language notice. When access control is
 *   off this page never appears (the guard renders the app directly).
 * @example <MemoryRouter initialEntries={['/login']}><LoginPage /></MemoryRouter>
 ***/
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [checking, setChecking] = React.useState(true);
  const [alreadyIn, setAlreadyIn] = React.useState(false);

  // If a session already exists (a signed-in user opening /#/login
  // directly), send them back to the board instead of signing in again.
  React.useEffect(() => {
    let live = true;
    fetchAuthStatus()
      .then((status) => {
        if (!live) return;
        setAlreadyIn(Boolean(status?.authEnabled && status?.user));
        setChecking(false);
      })
      .catch(() => {
        if (!live) return;
        setChecking(false);
      });
    return () => {
      live = false;
    };
  }, []);

  React.useEffect(() => {
    if (!checking && alreadyIn && typeof window !== 'undefined') {
      window.location.hash = '#/';
    }
  }, [checking, alreadyIn]);

  const error = searchParams.get('error');
  const message = searchParams.get('message');

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-deep px-4">
      <div className="w-full max-w-sm bg-surface border border-border-standard rounded-sm p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-sm font-bold uppercase tracking-wider text-on-surface font-label-caps">
            Sign in
          </h1>
          <p className="text-xs text-text-muted">
            Use your organisation account to continue. You will sign in at your
            identity provider — KainBain never sees your password.
          </p>
        </div>
        {error && (
          <p
            role="alert"
            data-testid="login-error"
            className="px-3 py-2 text-[11px] text-on-surface bg-surface-container-high border border-border-standard rounded-sm"
          >
            Sign-in did not complete ({error}
            {message ? `: ${message}` : ''}). Press the button to try again or
            ask your administrator for help.
          </p>
        )}
        <button
          type="button"
          onClick={startLogin}
          disabled={checking && alreadyIn}
          className="px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
        >
          Sign in with your organisation account
        </button>
      </div>
    </div>
  );
}

export default LoginPage;
