// Domain: General App Settings — Default Prompt Layout Editor.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { MarkdownViewer } from '../common/MarkdownViewer';
import {
  DEFAULT_PROMPT_LAYOUT,
  INLINE_LAYOUT_TOKENS,
  MAX_LAYOUT_CHARS,
  SECTION_LAYOUT_TOKENS,
  validatePromptLayout,
} from './promptLayoutTokens';

/***
 * MARK: PromptLayoutSection
 * @description Markdown editor with keyword chips for the default task prompt layout.
 *   Enforces mandatory contract tokens (task, stage, failureGuidance), surfaces
 *   conditional auto-reinject warnings, provides sample dry-run preview, and bounds
 *   blast radius with safe-mode guidance and fallback recovery.
 * @example <PromptLayoutSection />
 ***/
export function PromptLayoutSection() {
  const [layout, setLayout] = useState(DEFAULT_PROMPT_LAYOUT);
  const [savedLayout, setSavedLayout] = useState(DEFAULT_PROMPT_LAYOUT);
  const [isDefault, setIsDefault] = useState(true);
  const [consecutiveFallbacks, setConsecutiveFallbacks] = useState(0);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(() => typeof api.getPromptLayout === 'function');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewMode, setPreviewMode] = useState('edit'); // 'edit' | 'preview'
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState(() =>
    typeof api.getPromptLayout === 'function'
      ? null
      : {
          type: 'error',
          text: 'Prompt layout settings are unavailable in this build.',
        },
  );

  const textareaRef = useRef(null);

  const applyState = useCallback((state) => {
    const raw = typeof state?.layout === 'string' ? state.layout : DEFAULT_PROMPT_LAYOUT;
    setLayout(raw);
    setSavedLayout(raw);
    setIsDefault(Boolean(state?.isDefault));
    setConsecutiveFallbacks(
      typeof state?.consecutiveFallbacks === 'number' ? state.consecutiveFallbacks : 0,
    );
    setDegraded(Boolean(state?.degraded));
  }, []);

  useEffect(() => {
    if (typeof api.getPromptLayout !== 'function') return undefined;
    let cancelled = false;
    api
      .getPromptLayout()
      .then((state) => {
        if (!cancelled) {
          applyState(state);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatusMessage({
            type: 'error',
            text: `Could not load prompt layout: ${err.message || 'Check connection'}`,
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyState]);

  const validation = validatePromptLayout(layout);
  const isDirty = layout !== savedLayout;

  const handleInsertToken = (token) => {
    const el = textareaRef.current;
    const tokenText = `{{${token}}}`;
    if (!el) {
      setLayout((prev) => `${prev}\n\n${tokenText}`);
      return;
    }
    const start = el.selectionStart ?? layout.length;
    const end = el.selectionEnd ?? layout.length;
    const nextLayout = layout.slice(0, start) + tokenText + layout.slice(end);
    setLayout(nextLayout);
    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(start + tokenText.length, start + tokenText.length);
      }
    }, 0);
  };

  const handleDryRun = async () => {
    setDryRunning(true);
    setStatusMessage(null);
    try {
      const result = await api.dryRunPromptLayout({ layout });
      setDryRunResult(result);
      setPreviewMode('preview');
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Preview failed: ${err.message || 'Invalid layout'}`,
      });
    } finally {
      setDryRunning(false);
    }
  };

  const handleSave = async () => {
    if (!validation.ok) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const state = await api.updatePromptLayout(layout);
      applyState(state);
      setStatusMessage({ type: 'success', text: 'Prompt layout saved successfully.' });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Save failed: ${err.message || 'Validation error'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm('Reset prompt layout to factory default? Any custom format will be lost.')
    ) {
      return;
    }
    setResetting(true);
    setStatusMessage(null);
    try {
      const state = await api.resetPromptLayout();
      applyState(state);
      setDryRunResult(null);
      setStatusMessage({ type: 'info', text: 'Reset to factory default prompt layout.' });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Reset failed: ${err.message || 'Check storage'}`,
      });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-xs text-text-muted">
        Loading prompt layout settings…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Degraded / Repeated Fallback Banner */}
      {(consecutiveFallbacks > 0 || degraded) && (
        <div
          data-testid="prompt-layout-fallback-banner"
          className="p-3 rounded-sm bg-amber-950/40 border border-amber-600/60 text-amber-200 flex flex-col gap-1"
        >
          <div className="font-bold flex items-center justify-between">
            <span>
              Custom layout failing ({consecutiveFallbacks} fallback
              {consecutiveFallbacks > 1 ? 's' : ''}) — serving default
            </span>
          </div>
          <p className="text-[11px] text-amber-300/90">
            A syntax or rendering error occurred during task prompt dispatch. The engine
            automatically fell back to the default prompt layout to keep tasks running. Please
            review the layout or reset it to default.
          </p>
        </div>
      )}

      {/* Custom layout active status notice */}
      {!isDefault && (
        <div
          data-testid="prompt-layout-active-banner"
          className="p-2.5 rounded-sm bg-surface-container-high border border-border-standard text-on-surface-variant flex items-center justify-between"
        >
          <span>
            <strong className="text-on-surface">Custom layout active:</strong> Applied globally to
            all task prompts.
          </span>
          <span className="text-[11px] text-text-muted">
            Tasks can run in canonical safe mode with <code>useDefaultLayout</code>.
          </span>
        </div>
      )}

      {/* Status Messages */}
      {statusMessage && (
        <div
          role="status"
          className={`p-2.5 rounded-sm border ${
            statusMessage.type === 'error'
              ? 'bg-red-950/40 border-red-700/60 text-red-200'
              : statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                : 'bg-surface-container-highest border-border-standard text-on-surface'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Token Chip Bar */}
      <div className="flex flex-col gap-2.5 p-3 rounded-sm bg-surface-container-low border border-border-standard">
        <div>
          <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider">
            Section Blocks (Click to insert at cursor)
          </span>
          <p className="text-[11px] text-text-muted mt-0.5">
            Injects curated section headers and dynamic content. Contract sections cannot be
            dropped.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SECTION_LAYOUT_TOKENS.map((token) => (
              <button
                key={token.token}
                type="button"
                onClick={() => handleInsertToken(token.token)}
                title={token.description}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-surface-container-high hover:bg-surface-container-highest border border-border-standard text-[11px] font-mono text-on-surface transition-colors cursor-pointer"
              >
                <span>{`{{${token.token}}}`}</span>
                {token.requirement === 'required' && (
                  <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1 py-0.2 bg-red-900/60 text-red-300 rounded">
                    Required
                  </span>
                )}
                {token.requirement === 'conditional' && (
                  <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1 py-0.2 bg-blue-900/60 text-blue-300 rounded">
                    Auto-added
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-border-standard">
          <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider">
            Inline Keywords
          </span>
          <p className="text-[11px] text-text-muted mt-0.5">
            Interpolates live task &amp; project context into your custom prose.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {INLINE_LAYOUT_TOKENS.map((token) => (
              <button
                key={token.token}
                type="button"
                onClick={() => handleInsertToken(token.token)}
                title={token.description}
                className="inline-flex items-center px-2 py-1 rounded-sm bg-surface-container hover:bg-surface-container-high border border-border-standard/80 text-[11px] font-mono text-text-muted hover:text-on-surface transition-colors cursor-pointer"
              >
                {`{{${token.token}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editor & Preview Toggle Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewMode('edit')}
            className={`px-3 py-1.5 rounded-sm text-xs font-bold transition-colors cursor-pointer ${
              previewMode === 'edit'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            Edit Template
          </button>
          <button
            type="button"
            onClick={handleDryRun}
            disabled={dryRunning || !validation.ok}
            className={`px-3 py-1.5 rounded-sm text-xs font-bold transition-colors cursor-pointer ${
              previewMode === 'preview'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {dryRunning ? 'Previewing…' : 'Preview with Sample Data'}
          </button>
          {isDirty && (
            <span className="text-[11px] text-amber-400 font-semibold">(Unsaved changes)</span>
          )}
        </div>
        <div className="text-[11px] text-text-muted">
          {layout.length} / {MAX_LAYOUT_CHARS} characters
        </div>
      </div>

      {/* Validation Warnings & Errors */}
      {!validation.ok && (
        <div
          data-testid="layout-errors"
          className="p-2.5 rounded-sm bg-red-950/40 border border-red-700/60 text-red-200 text-xs flex flex-col gap-1"
        >
          <strong className="font-bold">Cannot save layout:</strong>
          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
            {validation.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.ok && validation.warnings.length > 0 && (
        <div
          data-testid="layout-warnings"
          className="p-2.5 rounded-sm bg-amber-950/30 border border-amber-700/50 text-amber-200 text-xs flex flex-col gap-1"
        >
          <strong className="font-bold">Omitted section notices:</strong>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-300/90">
            {validation.warnings.map((warn, idx) => (
              <li key={idx}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Pane: Edit vs Preview */}
      {previewMode === 'edit' ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            ref={textareaRef}
            aria-label="Default prompt layout template"
            data-testid="prompt-layout-textarea"
            rows={14}
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            className="w-full font-mono text-xs p-3 rounded-sm bg-surface-deep border border-border-standard text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed"
            placeholder="Author markdown prompt layout using {{task}}, {{stage}}, and other tokens..."
          />
        </div>
      ) : (
        <div
          data-testid="prompt-layout-preview-pane"
          className="p-4 rounded-sm bg-surface-deep border border-border-standard max-h-[400px] overflow-y-auto"
        >
          {dryRunResult?.autoReinjected?.length > 0 && (
            <div className="mb-3 p-2 rounded-sm bg-blue-950/40 border border-blue-700/60 text-blue-200 text-xs">
              <strong>Auto-reinjected sections:</strong>{' '}
              {dryRunResult.autoReinjected.map((t) => `{{${t}}}`).join(', ')}
            </div>
          )}
          {dryRunResult?.fallbackUsed && (
            <div className="mb-3 p-2 rounded-sm bg-red-950/40 border border-red-700/60 text-red-200 text-xs">
              Notice: Rendering fell back to the default canonical layout.
            </div>
          )}
          <MarkdownViewer content={dryRunResult?.renderedMarkdown || ''} />
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border-standard">
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting || saving || isDefault}
          className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface-variant text-xs font-bold uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {resetting ? 'Resetting…' : 'Reset to Default'}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty || !validation.ok}
            className="px-5 py-1.5 min-h-[44px] bg-primary text-on-primary disabled:opacity-50 text-xs font-bold uppercase tracking-wider rounded-sm hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Layout'}
          </button>
        </div>
      </div>
    </div>
  );
}
