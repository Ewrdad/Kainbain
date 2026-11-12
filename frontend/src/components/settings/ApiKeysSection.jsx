import React from 'react';
import {
  getAuthSettings,
  saveAuthSettings,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getApiKeyUsage,
} from '../../services/auth/index.js';
import { copyToClipboard } from '../../services/clipboard.js';

const labelClass = 'text-xs font-bold text-on-surface';
const hintClass = 'text-[11px] text-text-muted';
const inputClass =
  'w-full max-w-sm p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors';
const buttonClass =
  'px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 cursor-pointer disabled:opacity-50';
const secondaryButtonClass =
  'px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-50';

const defaultExpiryInput = () => {
  // Survey answer (Q6): default key lifetime is one year.
  const date = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

/***
 * MARK: ApiKeysSection
 * @description System Settings › Access tab: the API-keys enable toggle,
 *   the key table (name, prefix, roles/scopes, expiry, last used), the
 *   create form (name, role, narrowing scopes, expiry pre-filled to +1
 *   year and clearable), the one-time secret reveal with a copy button,
 *   per-key usage, and revoke with a confirm. Non-admins see the same
 *   access-denied pattern as `AccessControlSection`.
 * @example <ApiKeysSection />
 ***/
export function ApiKeysSection() {
  const [enabled, setEnabled] = React.useState(null);
  const [keys, setKeys] = React.useState([]);
  const [knownScopes, setKnownScopes] = React.useState([]);
  const [knownRoles, setKnownRoles] = React.useState(['admin', 'member', 'viewer']);
  const [notice, setNotice] = React.useState(null);
  const [denied, setDenied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('member');
  const [scopes, setScopes] = React.useState([]);
  const [expiry, setExpiry] = React.useState(defaultExpiryInput);
  const [createdSecret, setCreatedSecret] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [usageById, setUsageById] = React.useState({});
  const [usageOpenId, setUsageOpenId] = React.useState(null);
  // Frozen at mount: expiry badges compare against the load time rather than
  // calling the clock during render.
  const [now] = React.useState(() => Date.now());

  // Mount fetch as a promise chain (never a sync effect call — the
  // react-hooks/set-state-in-effect rule): state only settles in async
  // continuations, and the cancelled flag drops late responses.
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getAuthSettings(), listApiKeys()])
      .then(([settings, list]) => {
        if (cancelled) return;
        setEnabled(settings.apiKeysEnabled === true);
        setKeys(list.keys || []);
        setKnownScopes(list.knownScopes || settings.knownApiKeyScopes || []);
        if (Array.isArray(settings.knownRoles) && settings.knownRoles.length > 0) {
          setKnownRoles(settings.knownRoles);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 401 || error?.status === 403) setDenied(true);
        else setNotice({ kind: 'error', text: `Could not load API keys: ${error.message}` });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (denied) {
    return (
      <p data-testid="apikeys-denied" className="py-3 text-xs text-text-muted">
        You need the admin role to manage API keys.
      </p>
    );
  }

  if (enabled === null) {
    return <p className="py-3 text-xs text-text-muted">Loading API keys…</p>;
  }

  const onToggle = async (next) => {
    setSaving(true);
    setNotice(null);
    try {
      const view = await saveAuthSettings({ apiKeysEnabled: next });
      setEnabled(view.apiKeysEnabled === true);
      setNotice({ kind: 'ok', text: `API keys ${next ? 'enabled' : 'disabled'}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: `Save failed: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const toggleScope = (scope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((entry) => entry !== scope) : [...prev, scope],
    );
    setNotice(null);
  };

  const onCreate = async () => {
    setSaving(true);
    setNotice(null);
    setCopied(false);
    try {
      const body = { name: name.trim(), roles: [role], scopes };
      if (expiry.trim() !== '') body.expiresAt = new Date(`${expiry.trim()}T23:59:59.999Z`).toISOString();
      const created = await createApiKey(body);
      setCreatedSecret({ name: created.key.name, secret: created.secret });
      setName('');
      setScopes([]);
      setExpiry(defaultExpiryInput());
      const list = await listApiKeys();
      setKeys(list.keys || []);
      setNotice({ kind: 'ok', text: `Key “${created.key.name}” created — copy the secret now.` });
    } catch (error) {
      setNotice({ kind: 'error', text: `Create failed: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const onCopySecret = async () => {
    if (!createdSecret) return;
    const ok = await copyToClipboard(createdSecret.secret);
    setCopied(ok);
    if (!ok) setNotice({ kind: 'error', text: 'Copy failed — select the secret manually.' });
  };

  const onRevoke = async (key) => {
    if (!window.confirm(`Revoke API key “${key.name}”? It stops working immediately.`)) return;
    setSaving(true);
    setNotice(null);
    try {
      await revokeApiKey(key.id);
      const list = await listApiKeys();
      setKeys(list.keys || []);
      setNotice({ kind: 'ok', text: `Key “${key.name}” revoked.` });
    } catch (error) {
      setNotice({ kind: 'error', text: `Revoke failed: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const onToggleUsage = async (key) => {
    if (usageOpenId === key.id) {
      setUsageOpenId(null);
      return;
    }
    setNotice(null);
    try {
      const view = await getApiKeyUsage(key.id);
      setUsageById((prev) => ({ ...prev, [key.id]: view.usage || [] }));
      setUsageOpenId(key.id);
    } catch (error) {
      setNotice({ kind: 'error', text: `Usage load failed: ${error.message}` });
    }
  };

  return (
    <div className="flex flex-col gap-2 py-3" data-testid="api-keys-section">
      <h3 className="text-sm font-bold text-on-surface">API keys</h3>
      {!enabled && (
        <p className="px-3 py-2 text-[11px] text-text-muted bg-surface-container-high border border-border-standard rounded-sm">
          API keys are off: key credentials are ignored and the API behaves
          exactly as today. Switch them on to let agents and services call in
          with least-privilege keys.
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
          aria-label="Enable API keys"
          checked={enabled === true}
          disabled={saving}
          onChange={(event) => onToggle(event.target.checked)}
          className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
        />
        <span>Enable API keys (agents and services)</span>
      </label>

      {createdSecret && (
        <div
          data-testid="apikey-secret-once"
          className="px-3 py-2 bg-surface-container-high border border-primary rounded-sm flex flex-col gap-2"
        >
          <span className={labelClass}>
            Secret for “{createdSecret.name}” — shown once, copy it now
          </span>
          <code className="text-xs text-on-surface break-all select-all">{createdSecret.secret}</code>
          <div className="flex gap-2 items-center">
            <button type="button" onClick={onCopySecret} className={secondaryButtonClass}>
              Copy secret
            </button>
            {copied && <span className={hintClass}>Copied.</span>}
            <button
              type="button"
              onClick={() => {
                setCreatedSecret(null);
                setCopied(false);
              }}
              className={secondaryButtonClass}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 py-2 border-b border-border-standard">
        <span className={labelClass}>New key</span>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className={hintClass}>Name</span>
            <input
              aria-label="Key name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="security-scanner"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={hintClass}>Role</span>
            <select
              aria-label="Key role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className={inputClass}
            >
              {knownRoles.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={hintClass}>Expiry (clear for none)</span>
            <input
              aria-label="Key expiry"
              type="date"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={onCreate}
            disabled={saving || name.trim() === ''}
            className={buttonClass}
          >
            Create key
          </button>
        </div>
        {knownScopes.length > 0 && (
          <fieldset className="flex flex-col gap-1 pt-1">
            <legend className={hintClass}>Scopes (empty means the full role; scopes only narrow)</legend>
            <div className="flex flex-wrap gap-2">
              {knownScopes.map((scope) => (
                <label key={scope} className="flex items-center gap-1 text-[11px] text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                  />
                  <span>{scope}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {keys.length === 0 ? (
        <p className="text-[11px] text-text-muted">No API keys yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((key) => (
            <li
              key={key.id}
              data-testid={`apikey-row-${key.id}`}
              className="px-3 py-2 bg-surface-container-high border border-border-standard rounded-sm flex flex-col gap-1"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={labelClass}>{key.name}</span>
                <span className={hintClass}>…{key.prefix}</span>
                {key.revoked === true && (
                  <span className="text-[11px] font-bold text-error">revoked</span>
                )}
                {key.expiresAt && new Date(key.expiresAt).getTime() <= now && key.revoked !== true && (
                  <span className="text-[11px] font-bold text-error">expired</span>
                )}
              </div>
              <span className={hintClass}>
                Roles: {(key.roles || []).join(', ') || '—'} · Scopes:{' '}
                {(key.scopes || []).length > 0 ? key.scopes.join(', ') : 'full role'} · Expires:{' '}
                {key.expiresAt ? formatDateTime(key.expiresAt) : 'never'} · Last used:{' '}
                {formatDateTime(key.lastUsedAt)}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => onToggleUsage(key)} className={secondaryButtonClass}>
                  {usageOpenId === key.id ? 'Hide usage' : 'Usage'}
                </button>
                {key.revoked !== true && (
                  <button
                    type="button"
                    onClick={() => onRevoke(key)}
                    disabled={saving}
                    className={secondaryButtonClass}
                  >
                    Revoke
                  </button>
                )}
              </div>
              {usageOpenId === key.id && (
                <ul data-testid={`apikey-usage-${key.id}`} className="flex flex-col gap-1 pt-1">
                  {(usageById[key.id] || []).length === 0 ? (
                    <li className={hintClass}>No recorded usage.</li>
                  ) : (
                    (usageById[key.id] || []).map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className={hintClass}>
                        {formatDateTime(entry.at)} · {entry.action}
                        {entry.detail?.route ? ` · ${entry.detail.method || ''} ${entry.detail.route}` : ''}
                        {entry.detail?.reason ? ` · ${entry.detail.reason}` : ''}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
