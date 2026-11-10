import React from 'react';
import {
  getAuthSettings,
  saveAuthSettings,
  getGroupMappings,
  setGroupMappings,
} from '../../services/auth/index.js';

const inputClass =
  'w-full max-w-sm p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors';
const labelClass = 'text-xs font-bold text-on-surface';
const hintClass = 'text-[11px] text-text-muted';
const buttonClass =
  'px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 cursor-pointer disabled:opacity-50';
const secondaryButtonClass =
  'px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-50';

/***
 * MARK: AccessControlSection
 * @description System Settings › Access tab: the enable toggle, the OIDC
 *   provider fields, group claim and admin group, session lifetimes, role
 *   managers, and the IdP-group to role mapping editor. Everything persists
 *   through `PUT /auth/settings` / `/auth/group-mappings` (the server
 *   enforces the admin role). While access control is off the same form
 *   explains the default and offers the on-switch.
 * @example <AccessControlSection />
 ***/
export function AccessControlSection() {
  const [settings, setSettings] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [mappings, setMappings] = React.useState({});
  const [newGroup, setNewGroup] = React.useState('');
  const [notice, setNotice] = React.useState(null);
  const [denied, setDenied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Mount fetch as a promise chain (never a sync effect call — the
  // react-hooks/set-state-in-effect rule): state only settles in async
  // continuations, and the cancelled flag drops late responses.
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getAuthSettings(), getGroupMappings()])
      .then(([view, mapView]) => {
        if (cancelled) return;
        setSettings(view);
        setDraft({
          authEnabled: view.enabled,
          authIssuerUrl: view.issuerUrl || '',
          authClientId: view.clientId || '',
          authClientSecret: '',
          authRedirectUri: view.redirectUri || '',
          authScopes: view.scopes || '',
          authGroupsClaim: view.groupsClaim || '',
          authAdminGroup: view.adminGroup || '',
          authBootstrapAdmins: (view.bootstrapAdmins || []).join(', '),
          authSessionTtlMinutes: Math.round((view.sessionTtlMs || 0) / 60000),
          authSessionIdleMinutes: Math.round((view.sessionIdleMs || 0) / 60000),
          authRoleManagerRoles: (view.roleManagerRoles || []).join(', '),
        });
        setMappings(mapView.mappings || {});
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 401 || error?.status === 403) setDenied(true);
        else setNotice({ kind: 'error', text: `Could not load access settings: ${error.message}` });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (denied) {
    return (
      <p data-testid="access-denied" className="py-3 text-xs text-text-muted">
        You need the admin role to manage access control.
      </p>
    );
  }

  if (!draft) {
    return (
      <p className="py-3 text-xs text-text-muted">Loading access settings…</p>
    );
  }

  const update = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  };

  const splitList = (text) =>
    String(text || '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');

  const onSaveSettings = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const partial = {
        authEnabled: draft.authEnabled === true,
        authIssuerUrl: draft.authIssuerUrl.trim(),
        authClientId: draft.authClientId.trim(),
        authRedirectUri: draft.authRedirectUri.trim(),
        authScopes: draft.authScopes.trim(),
        authGroupsClaim: draft.authGroupsClaim.trim(),
        authAdminGroup: draft.authAdminGroup.trim(),
        authBootstrapAdmins: splitList(draft.authBootstrapAdmins),
        authSessionTtlMs: Math.max(1, Math.round(Number(draft.authSessionTtlMinutes) || 0)) * 60000,
        authSessionIdleMs: Math.max(1, Math.round(Number(draft.authSessionIdleMinutes) || 0)) * 60000,
        authRoleManagerRoles: splitList(draft.authRoleManagerRoles),
      };
      if (draft.authClientSecret.trim() !== '') partial.authClientSecret = draft.authClientSecret;
      const view = await saveAuthSettings(partial);
      setSettings(view);
      update('authClientSecret', '');
      setNotice({ kind: 'ok', text: 'Access settings saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: `Save failed: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const toggleMappingRole = (group, role) => {
    setMappings((prev) => {
      const current = prev[group] || [];
      const next = current.includes(role)
        ? current.filter((entry) => entry !== role)
        : [...current, role];
      return { ...prev, [group]: next };
    });
    setNotice(null);
  };

  const onAddGroup = () => {
    const name = newGroup.trim();
    if (!name || mappings[name]) return;
    setMappings((prev) => ({ ...prev, [name]: [] }));
    setNewGroup('');
  };

  const onSaveMappings = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const stored = await setGroupMappings(mappings);
      setMappings(stored.mappings || {});
      setNotice({ kind: 'ok', text: 'Group mappings saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: `Save failed: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const knownRoles = settings.knownRoles || ['admin', 'member', 'viewer'];

  const field = (label, hint, control) => (
    <label className="flex flex-col gap-1 py-2 border-b border-border-standard">
      <span className={labelClass}>{label}</span>
      {control}
      {hint && <span className={hintClass}>{hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-2 py-3" data-testid="access-control-section">
      {!draft.authEnabled && (
        <p className="px-3 py-2 text-[11px] text-text-muted bg-surface-container-high border border-border-standard rounded-sm">
          Access control is off: every request runs as the shared admin user
          and no login screen appears. Fill in your provider details below and
          switch it on when you are ready.
        </p>
      )}
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className="px-3 py-2 text-[11px] text-on-surface bg-surface-container-high border border-border-standard rounded-sm"
        >
          {notice.text}
        </p>
      )}

      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface py-2">
        <input
          type="checkbox"
          aria-label="Enable access control"
          checked={draft.authEnabled === true}
          onChange={(event) => update('authEnabled', event.target.checked)}
          className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
        />
        <span>Enable access control (organisation sign-in)</span>
      </label>

      {field(
        'OIDC issuer URL',
        'Base URL of your provider — discovery lives at <issuer>/.well-known/openid-configuration.',
        <input
          type="text"
          aria-label="OIDC issuer URL"
          value={draft.authIssuerUrl}
          onChange={(event) => update('authIssuerUrl', event.target.value)}
          placeholder="https://idp.example.com"
          className={inputClass}
        />,
      )}
      {field(
        'Client ID',
        'The client registration KainBain uses at your provider.',
        <input
          type="text"
          aria-label="Client ID"
          value={draft.authClientId}
          onChange={(event) => update('authClientId', event.target.value)}
          className={inputClass}
        />,
      )}
      {field(
        'Client secret',
        settings.hasClientSecret ? 'A secret is stored. Leave blank to keep it.' : 'Required for the code exchange. Stored server-side, never shown.',
        <input
          type="password"
          aria-label="Client secret"
          value={draft.authClientSecret}
          onChange={(event) => update('authClientSecret', event.target.value)}
          placeholder={settings.hasClientSecret ? 'Unchanged' : ''}
          autoComplete="new-password"
          className={inputClass}
        />,
      )}
      {field(
        'Redirect URI',
        `Exact callback URI registered at your provider. Blank uses ${settings.effectiveRedirectUri || 'the app default'}.`,
        <input
          type="text"
          aria-label="Redirect URI"
          value={draft.authRedirectUri}
          onChange={(event) => update('authRedirectUri', event.target.value)}
          placeholder={settings.effectiveRedirectUri || ''}
          className={inputClass}
        />,
      )}
      {field(
        'Scopes',
        'Space-separated scopes requested at sign-in. Keep openid.',
        <input
          type="text"
          aria-label="Scopes"
          value={draft.authScopes}
          onChange={(event) => update('authScopes', event.target.value)}
          className={inputClass}
        />,
      )}
      {field(
        'Groups claim',
        'ID-token claim carrying group membership.',
        <input
          type="text"
          aria-label="Groups claim"
          value={draft.authGroupsClaim}
          onChange={(event) => update('authGroupsClaim', event.target.value)}
          className={inputClass}
        />,
      )}
      {field(
        'Admin group',
        'Members of this IdP group always sign in as admin (lockout recovery).',
        <input
          type="text"
          aria-label="Admin group"
          value={draft.authAdminGroup}
          onChange={(event) => update('authAdminGroup', event.target.value)}
          className={inputClass}
        />,
      )}
      {field(
        'Bootstrap admins',
        'Comma-separated subject ids or emails that always sign in as admin.',
        <input
          type="text"
          aria-label="Bootstrap admins"
          value={draft.authBootstrapAdmins}
          onChange={(event) => update('authBootstrapAdmins', event.target.value)}
          className={inputClass}
        />,
      )}
      {field(
        'Session lifetime (minutes)',
        'Absolute browser-session lifetime. Expiry forces a fresh sign-in.',
        <input
          type="number"
          aria-label="Session lifetime in minutes"
          min={1}
          value={draft.authSessionTtlMinutes}
          onChange={(event) => update('authSessionTtlMinutes', event.target.value)}
          className={inputClass}
        />,
      )}
      {field(
        'Idle timeout (minutes)',
        'Each request slides this window; an untouched session expires.',
        <input
          type="number"
          aria-label="Idle timeout in minutes"
          min={1}
          value={draft.authSessionIdleMinutes}
          onChange={(event) => update('authSessionIdleMinutes', event.target.value)}
          className={inputClass}
        />,
      )}
      {field(
        'Role managers',
        'Comma-separated roles allowed to change assignments and settings (default admin).',
        <input
          type="text"
          aria-label="Role managers"
          value={draft.authRoleManagerRoles}
          onChange={(event) => update('authRoleManagerRoles', event.target.value)}
          className={inputClass}
        />,
      )}

      <div className="py-2">
        <button type="button" onClick={onSaveSettings} disabled={saving} className={buttonClass}>
          {saving ? 'Saving…' : 'Save access settings'}
        </button>
      </div>

      <div className="flex flex-col gap-2 py-2 border-t border-border-standard">
        <span className={labelClass}>Group to role mappings</span>
        <span className={hintClass}>
          Roles assumed from IdP groups at sign-in. Changes apply on each
          user&apos;s next request.
        </span>
        {Object.keys(mappings).length === 0 && (
          <span className={hintClass}>No group mappings yet.</span>
        )}
        {Object.entries(mappings).map(([group, roles]) => (
          <div key={group} className="flex flex-wrap items-center gap-2" data-testid={`mapping-${group}`}>
            <span className="text-xs font-bold text-on-surface min-w-24">{group}</span>
            {knownRoles.map((role) => (
              <label key={role} className="flex items-center gap-1 cursor-pointer text-xs text-on-surface">
                <input
                  type="checkbox"
                  aria-label={`${group} grants ${role}`}
                  checked={(roles || []).includes(role)}
                  onChange={() => toggleMappingRole(group, role)}
                  className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                />
                <span>{role}</span>
              </label>
            ))}
            <button
              type="button"
              aria-label={`Remove mapping for ${group}`}
              onClick={() => {
                setMappings((prev) => {
                  const next = { ...prev };
                  delete next[group];
                  return next;
                });
              }}
              className={secondaryButtonClass}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label="New IdP group name"
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
            placeholder="IdP group name"
            className={inputClass}
          />
          <button type="button" onClick={onAddGroup} className={secondaryButtonClass}>
            Add group
          </button>
        </div>
        <div>
          <button type="button" onClick={onSaveMappings} disabled={saving} className={secondaryButtonClass}>
            {saving ? 'Saving…' : 'Save group mappings'}
          </button>
        </div>
      </div>
    </div>
  );
}

/***
 * MARK: AccessControlSection default export
 * @description Default entry point for the Access settings tab (same component).
 * @example import AccessControlSection from './AccessControlSection';
 ***/
export default AccessControlSection;
