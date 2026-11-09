import React from 'react';
import {
  getAuthSettings,
  listUsers,
  setUserDisabled,
  setUserProjectRoles,
  setUserRoles,
} from '../../services/auth/index.js';

const secondaryButtonClass =
  'px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-50';

/***
 * MARK: AccessUserList
 * @description System Settings › Access tab, users half: every provisioned
 *   account with its direct roles, per-project roles, and disabled switch.
 *   Admins assign roles here; the server enforces the admin role on every
 *   write. Non-admins see the same explanatory note as the settings form.
 * @example <AccessUserList />
 ***/
export function AccessUserList() {
  const [users, setUsers] = React.useState(null);
  const [knownRoles, setKnownRoles] = React.useState(['admin', 'member', 'viewer']);
  const [projectInputs, setProjectInputs] = React.useState({});
  const [notice, setNotice] = React.useState(null);
  const [denied, setDenied] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [userView, settingsView] = await Promise.all([listUsers(), getAuthSettings()]);
      setUsers(userView.users || []);
      setKnownRoles(settingsView.knownRoles || ['admin', 'member', 'viewer']);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) setDenied(true);
      else setNotice(`Could not load users: ${error.message}`);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (denied) {
    return (
      <p data-testid="access-users-denied" className="py-3 text-xs text-text-muted">
        You need the admin role to manage users.
      </p>
    );
  }

  if (!users) {
    return <p className="py-3 text-xs text-text-muted">Loading users…</p>;
  }

  const refreshUser = (updated) =>
    setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)));

  const onToggleDirectRole = async (user, role) => {
    setNotice(null);
    const current = user.directRoles || [];
    const next = current.includes(role)
      ? current.filter((entry) => entry !== role)
      : [...current, role];
    try {
      const { user: updated } = await setUserRoles(user.id, next);
      refreshUser(updated);
    } catch (error) {
      setNotice(`Could not update ${user.id}: ${error.message}`);
    }
  };

  const onSetProjectRoles = async (user) => {
    setNotice(null);
    const entry = projectInputs[user.id] || {};
    if (!entry.projectId || !entry.role) {
      setNotice('Pick a project id and a role first.');
      return;
    }
    try {
      const { user: updated } = await setUserProjectRoles(user.id, entry.projectId, [entry.role]);
      refreshUser(updated);
      setProjectInputs((prev) => ({ ...prev, [user.id]: {} }));
    } catch (error) {
      setNotice(`Could not update ${user.id}: ${error.message}`);
    }
  };

  const onToggleDisabled = async (user) => {
    setNotice(null);
    try {
      const { user: updated } = await setUserDisabled(user.id, user.disabled !== true);
      refreshUser(updated);
    } catch (error) {
      setNotice(`Could not update ${user.id}: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-2 py-3" data-testid="access-user-list">
      <span className="text-xs font-bold text-on-surface">Users</span>
      <span className="text-[11px] text-text-muted">
        Accounts appear here on first sign-in — there are no local passwords.
        Direct roles apply everywhere; project roles add rights for one project.
      </span>
      {notice && (
        <p role="alert" className="px-3 py-2 text-[11px] text-on-surface bg-surface-container-high border border-border-standard rounded-sm">
          {notice}
        </p>
      )}
      {users.length === 0 && (
        <span className="text-[11px] text-text-muted">No users yet.</span>
      )}
      {users.map((user) => (
        <div
          key={user.id}
          data-testid={`access-user-${user.id}`}
          className="flex flex-col gap-2 py-2 border-b border-border-standard"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-on-surface">
              {user.name || user.email || user.id}
            </span>
            <span className="text-[11px] text-text-muted">{user.email}</span>
            {user.disabled === true && (
              <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                Disabled
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-text-muted">Direct roles:</span>
            {knownRoles.map((role) => (
              <label key={role} className="flex items-center gap-1 cursor-pointer text-xs text-on-surface">
                <input
                  type="checkbox"
                  aria-label={`${user.id} direct role ${role}`}
                  checked={(user.directRoles || []).includes(role)}
                  onChange={() => onToggleDirectRole(user, role)}
                  className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                />
                <span>{role}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-text-muted">Project roles:</span>
            <span className="text-[11px] text-on-surface" data-testid={`project-roles-${user.id}`}>
              {Object.entries(user.projectRoles || {})
                .map(([projectId, roles]) => `${projectId}: ${(roles || []).join(', ')}`)
                .join(' · ') || 'none'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label={`Project id for ${user.id}`}
              placeholder="Project id"
              value={projectInputs[user.id]?.projectId || ''}
              onChange={(event) =>
                setProjectInputs((prev) => ({
                  ...prev,
                  [user.id]: { ...(prev[user.id] || {}), projectId: event.target.value },
                }))
              }
              className="w-40 p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary"
            />
            <select
              aria-label={`Role for ${user.id} in project`}
              value={projectInputs[user.id]?.role || ''}
              onChange={(event) =>
                setProjectInputs((prev) => ({
                  ...prev,
                  [user.id]: { ...(prev[user.id] || {}), role: event.target.value },
                }))
              }
              className="p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface"
            >
              <option value="">Role…</option>
              {knownRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onSetProjectRoles(user)}
              className={secondaryButtonClass}
            >
              Set project role
            </button>
            <button
              type="button"
              onClick={() => onToggleDisabled(user)}
              className={secondaryButtonClass}
            >
              {user.disabled === true ? 'Enable' : 'Disable'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AccessUserList;
