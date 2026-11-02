import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';

/***
 * MARK: providerStatusLabel
 * @description Human status for one provider row: keyless providers need no
 *   key, env-backed keys are read-only, stored keys can be cleared.
 * @example providerStatusLabel({ requiresKey: true, configured: false }) => 'Not configured'
 * @param {Object} provider - Catalogue entry with configured/source flags.
 * @returns {string}
 ***/
export const providerStatusLabel = (provider) => {
  if (!provider) return 'Not configured';
  if (provider.requiresKey !== true) return 'No key needed';
  if (provider.configured !== true) return 'Not configured';
  return provider.source === 'env' ? 'Configured via environment' : 'Configured';
};

/***
 * MARK: ImageGenSection
 * @description System Settings › Images: per-provider API key management for
 *   survey image generation. Keys persist immediately through their own
 *   controls (save/clear) and are never displayed back; a Test control runs
 *   one dry-run generation through the real adapter. Keyless providers (the
 *   offline mock) show a Test control only.
 * @example <ImageGenSection />
 * @param {Object} [props]
 * @param {Object} [props.client] - API client override (tests); defaults to the app client.
 ***/
export function ImageGenSection({ client }) {
  const http = client || api;
  const [providers, setProviders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState({});
  const [message, setMessage] = useState(null);

  const unavailable = typeof http?.getImageGenProviders !== 'function';

  const refresh = useCallback(async () => {
    if (unavailable) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await http.getImageGenProviders();
      setProviders(Array.isArray(data?.providers) ? data.providers : []);
    } catch (err) {
      setLoadError(err?.message || 'Could not load image providers');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, [http, unavailable]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (unavailable) {
        setLoading(false);
        return;
      }
      try {
        const data = await http.getImageGenProviders();
        if (!cancelled) setProviders(Array.isArray(data?.providers) ? data.providers : []);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || 'Could not load image providers');
          setProviders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [http, unavailable]);

  const setBusyFor = (id, value) =>
    setBusy((prev) => (value ? { ...prev, [id]: value } : { ...prev, [id]: undefined }));

  const mergeProvider = (id, patch) =>
    setProviders((prev) => (Array.isArray(prev) ? prev.map((p) => (p.id === id ? { ...p, ...patch } : p)) : prev));

  const handleSave = async (provider) => {
    const key = (drafts[provider.id] || '').trim();
    if (!key) {
      setMessage({ type: 'error', text: `Enter an API key for ${provider.label} first.` });
      return;
    }
    setBusyFor(provider.id, 'saving');
    setMessage(null);
    try {
      const result = await http.saveImageGenKey(provider.id, key);
      mergeProvider(provider.id, { configured: result.configured !== false, source: result.source ?? 'stored' });
      setDrafts((prev) => ({ ...prev, [provider.id]: '' }));
      setMessage({ type: 'success', text: `API key saved for ${provider.label}.` });
    } catch (err) {
      setMessage({ type: 'error', text: `Could not save the key: ${err?.message || 'check the key and retry'}` });
    } finally {
      setBusyFor(provider.id, null);
    }
  };

  const handleClear = async (provider) => {
    setBusyFor(provider.id, 'clearing');
    setMessage(null);
    try {
      const result = await http.clearImageGenKey(provider.id);
      mergeProvider(provider.id, { configured: result.configured === true, source: result.source ?? null });
      setMessage({
        type: 'info',
        text:
          result.configured === true
            ? `Stored key cleared for ${provider.label}; an environment key is still active.`
            : `Stored key cleared for ${provider.label}.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Could not clear the key: ${err?.message || 'retry'}` });
    } finally {
      setBusyFor(provider.id, null);
    }
  };

  const handleTest = async (provider) => {
    setBusyFor(provider.id, 'testing');
    setMessage(null);
    try {
      const result = await http.testImageGenProvider(provider.id);
      if (result?.ok) {
        setMessage({
          type: 'success',
          text: `${provider.label} generated a test image (${result.bytes} bytes in ${result.ms}ms).`,
        });
      } else {
        setMessage({ type: 'error', text: `${provider.label} test failed: ${result?.error || 'unknown error'}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `${provider.label} test failed: ${err?.message || 'unknown error'}` });
    } finally {
      setBusyFor(provider.id, null);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-xs text-text-muted">Loading image providers…</div>;
  }

  if (unavailable) {
    return (
      <div role="status" className="p-2.5 rounded-sm border bg-red-950/40 border-red-700/60 text-red-200 text-xs">
        Image generation settings are unavailable in this build.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-xs" data-testid="image-gen-section">
      <p className="text-[11px] text-text-muted leading-relaxed">
        API keys for survey image generation. Keys stay on the server — the survey page and runners never see
        them. Pick a provider per survey stage in the workflow editor (question-me skill, imageGen setting).
      </p>

      {loadError && (
        <div
          role="alert"
          className="p-2.5 rounded-sm bg-red-950/40 border border-red-700/60 text-red-200 flex items-center justify-between gap-2"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-3 py-1.5 min-h-[44px] bg-surface-container-high text-on-surface text-[11px] font-bold uppercase tracking-wider rounded-sm cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {message && (
        <div
          role="status"
          className={`p-2.5 rounded-sm border ${
            message.type === 'error'
              ? 'bg-red-950/40 border-red-700/60 text-red-200'
              : message.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                : 'bg-surface-container-highest border-border-standard text-on-surface'
          }`}
        >
          {message.text}
        </div>
      )}

      {(providers || []).map((provider) => {
        const status = providerStatusLabel(provider);
        const configured = provider.configured === true;
        const isBusy = busy[provider.id];
        return (
          <div
            key={provider.id}
            data-testid={`image-gen-provider-${provider.id}`}
            className="p-3 rounded-sm bg-surface-container border border-border-standard flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-on-surface">{provider.label || provider.id}</span>
              <span
                data-testid={`image-gen-status-${provider.id}`}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border ${
                  configured || provider.requiresKey !== true
                    ? 'text-emerald-200 border-emerald-700/60 bg-emerald-950/40'
                    : 'text-text-muted border-border-standard bg-surface-deep'
                }`}
              >
                {status}
              </span>
            </div>
            {provider.description && <p className="text-[11px] text-text-muted">{provider.description}</p>}
            {provider.requiresKey === true ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  aria-label={`API key for ${provider.label || provider.id}`}
                  placeholder={configured ? '•••••••• (saved)' : 'Paste API key…'}
                  autoComplete="off"
                  spellCheck={false}
                  value={drafts[provider.id] || ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                  className="flex-1 p-2 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface outline-none focus:border-primary font-mono"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Save API key for ${provider.label || provider.id}`}
                    disabled={!!isBusy}
                    onClick={() => void handleSave(provider)}
                    className="px-4 py-2 min-h-[44px] bg-primary text-on-primary text-[11px] font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBusy === 'saving' ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Clear API key for ${provider.label || provider.id}`}
                    disabled={!!isBusy}
                    onClick={() => void handleClear(provider)}
                    className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isBusy === 'clearing' ? 'Clearing…' : 'Clear'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Test ${provider.label || provider.id}`}
                    disabled={!!isBusy}
                    onClick={() => void handleTest(provider)}
                    className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isBusy === 'testing' ? 'Testing…' : 'Test'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  aria-label={`Test ${provider.label || provider.id}`}
                  disabled={!!isBusy}
                  onClick={() => void handleTest(provider)}
                  className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isBusy === 'testing' ? 'Testing…' : 'Test'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {(providers || []).length === 0 && !loadError && (
        <p className="text-[11px] text-text-muted">No image providers are registered on this server.</p>
      )}
    </div>
  );
}
