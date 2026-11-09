import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { UNAUTHORIZED_EVENT, fetchAuthStatus } from '../../services/auth/index.js';

/***
 * MARK: RequireAuth
 * @description Route guard for organisation sign-in. While access control is
 *   off (the default) it renders its children untouched, so the app behaves
 *   exactly as today. While on, a missing user bounces to `#/login`; an
 *   expired session (401 from any auth request) bounces the same way. A
 *   failed status check reads as "off", keeping direct navigation working
 *   when the API is unreachable.
 * @example <MemoryRouter><RequireAuth><p>board</p></RequireAuth></MemoryRouter>
 * @param {Object} props
 * @param {React.ReactNode} props.children - Routes to protect.
 ***/
export function RequireAuth({ children }) {
  const location = useLocation();
  const [status, setStatus] = React.useState(null);

  React.useEffect(() => {
    let live = true;
    fetchAuthStatus()
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch(() => {
        if (live) setStatus({ authEnabled: false, user: null, roles: [] });
      });
    const onUnauthorized = () => {
      if (live) setStatus({ authEnabled: true, user: null, roles: [] });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      live = false;
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, []);

  if (status === null) return children;
  if (!status.authEnabled) return children;
  if (!status.user) {
    if (location.pathname === '/login') return children;
    return <Navigate to="/login" replace />;
  }
  if (location.pathname === '/login') return <Navigate to="/" replace />;
  return children;
}

export default RequireAuth;
