import React, { useState } from 'react';

import { useKainBain } from '../../context/KainBainContext';
import { soundEffects } from '../../services/soundEffects';
import { isWakeLockSupported } from '../../services/wakeLock';
import { SelectDropdown } from '../common/SelectDropdown';

const THEMES = [
  {
    id: 'dark',
    label: 'Dark (Charcoal)',
    desc: 'Standard deep dark theme',
    bg: '#0a0a0a',
    border: '#333',
  },
  {
    id: 'midnight',
    label: 'Midnight (Navy)',
    desc: 'Deep ocean navy slate',
    bg: '#070c14',
    border: '#223659',
  },
  {
    id: 'light',
    label: 'Light (Daylight)',
    desc: 'Clean high-legibility light',
    bg: '#f8fafc',
    border: '#cbd5e1',
  },
  {
    id: 'high-contrast',
    label: 'High Contrast',
    desc: 'Maximum WCAG AAA contrast',
    bg: '#000000',
    border: '#ffffff',
  },
];

const DENSITIES = [
  { id: 'compact', label: 'Compact', desc: 'Dense data display' },
  { id: 'comfortable', label: 'Comfortable', desc: 'Standard balanced spacing' },
  { id: 'spacious', label: 'Spacious', desc: 'Roomy touch-friendly targets' },
];

const FONT_SIZES = [
  { id: 'small', label: 'Small (14px)' },
  { id: 'medium', label: 'Medium (16px)' },
  { id: 'large', label: 'Large (18px)' },
  { id: 'extra-large', label: 'Extra Large (20px)' },
];

const MONO_FONTS = [
  { id: 'jetbrains', label: 'JetBrains Mono' },
  { id: 'fira', label: 'Fira Code' },
  { id: 'source', label: 'Source Code Pro' },
  { id: 'system', label: 'System Monospace' },
];

const COLUMN_WIDTHS = [
  { id: '240px', label: '240px (Compact)' },
  { id: '280px', label: '280px (Standard)' },
  { id: '320px', label: '320px (Wide)' },
  { id: '360px', label: '360px (Spacious)' },
  { id: 'fill', label: 'Full Width (Fill)' },
];

const TASK_CARD_DENSITIES = [
  {
    id: 'compact',
    label: 'Compact Card',
    desc: 'One-line goal, minimal rows — fits ~3× more cards per column',
  },
  {
    id: 'default',
    label: 'Full Card',
    desc: 'Complete metadata: badges, timestamp, quick actions, stage moves',
  },
];

/***
 * MARK: UI_PREFERENCE_TABS
 * @description Allowlisted sub-tabs of the UI preferences panel. Rendered in
 * System Settings screen (SystemSettingsPage) and the quick Customize UI
 * modal (UiPreferencesModal) — one shared panel, one shared tab list.
 * @example UI_PREFERENCE_TABS.map((t) => t.id) => ['appearance', ...]
 ***/
export const UI_PREFERENCE_TABS = [
  { id: 'appearance', label: '🎨 Appearance', desc: 'Theme & Fonts' },
  { id: 'workspace', label: '🗂️ Workspace', desc: 'Panels & Layout' },
  { id: 'cards', label: '📋 Task Cards', desc: 'Card Metadata' },
  { id: 'alerts', label: '🔔 Sound & Alerts', desc: 'Audio & Desktop' },
  { id: 'shortcuts', label: '⌨️ Shortcuts', desc: 'Keyboard Navigation' },
  { id: 'backup', label: '💾 Backup & Reset', desc: 'Import / Export' },
];

/**
 * MARK: UiPreferencesPanel
 * @description Comprehensive settings panel for customizing appearance,
 * density, layout, board options, audio, and shortcuts. System
 * notifications are NOT configured here: Web Push (the only path that works
 * on mobile) lives in System Settings → Notifications, and the Sound &
 * Alerts tab links there through `onOpenPushNotifications` when the host
 * provides the navigation.
 * @param {Object} [props]
 * @param {Function} [props.onOpenPushNotifications] - Host-provided
 *   navigation to the push notifications settings (e.g. switching the System
 *   Settings screen to its Notifications tab). When absent, the alerts tab
 *   shows plain guidance instead of a dead button.
 */
export function UiPreferencesPanel({ onOpenPushNotifications } = {}) {
  const {
    uiPreferences,
    updateUiPreference,
    resetUiPreferences,
    exportUiPreferences,
    importUiPreferences,
    setIsShortcutsModalOpen,
  } = useKainBain();

  const [activeTab, setActiveTab] = useState('appearance');
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState(null);
  const [wakeLockSupported] = useState(() => isWakeLockSupported());
  const [copiedExport, setCopiedExport] = useState(false);

  const handleTestChime = () => {
    soundEffects.playChime('taskCompleted');
  };

  const handleExportCopy = async () => {
    const json = exportUiPreferences();
    try {
      await navigator.clipboard.writeText(json);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleImportSubmit = (e) => {
    e.preventDefault();
    if (!importText.trim()) return;
    const res = importUiPreferences(importText.trim());
    if (res.success) {
      setImportStatus({ type: 'success', msg: 'Preferences imported successfully!' });
      setImportText('');
      setTimeout(() => setImportStatus(null), 3000);
    } else {
      setImportStatus({ type: 'error', msg: res.error || 'Failed to import JSON' });
    }
  };

  // Fail-safe: an unknown tab id renders the Appearance tab instead of a
  // blank panel (all tab switches go through UI_PREFERENCE_TABS, so this
  // only triggers on stale state after a future refactor).
  const effectiveTab = UI_PREFERENCE_TABS.some((tab) => tab.id === activeTab)
    ? activeTab
    : UI_PREFERENCE_TABS[0].id;

  return (
    <div className="space-y-6 text-on-surface">
      {/* Sub-tabs for customization categories */}
      <div className="flex flex-wrap gap-2 border-b border-border-standard pb-3">
        {UI_PREFERENCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors ${
              effectiveTab === tab.id
                ? 'bg-primary text-on-primary font-bold shadow-sm'
                : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. APPEARANCE TAB */}
      {effectiveTab === 'appearance' && (
        <div className="space-y-6 animate-in fade-in duration-150 max-w-3xl">
          {/* Theme selection */}
          <div className="space-y-3">
            <span id="prefs-theme-caption" className="text-xs font-bold uppercase text-text-muted tracking-wider block">
              Color Theme Mode
            </span>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="group"
              aria-labelledby="prefs-theme-caption"
            >
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => updateUiPreference('theme', th.id)}
                  className={`p-3 rounded-sm border text-left transition-all flex items-start gap-3 ${
                    uiPreferences?.theme === th.id
                      ? 'border-primary ring-1 ring-primary bg-surface-container-high'
                      : 'border-border-standard bg-surface-container hover:border-outline-variant'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded border flex-shrink-0 flex items-center justify-center font-bold text-xs"
                    style={{ backgroundColor: th.bg, borderColor: th.border }}
                  >
                    {uiPreferences?.theme === th.id ? '✓' : ''}
                  </div>
                  <div>
                    <div className="text-xs font-bold">{th.label}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{th.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Density & Spacing */}
          <div className="space-y-3 border-t border-border-standard pt-6">
            <span id="prefs-density-caption" className="text-xs font-bold uppercase text-text-muted tracking-wider block">
              UI Density & Information Spacing
            </span>
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
              role="group"
              aria-labelledby="prefs-density-caption"
            >
              {DENSITIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => updateUiPreference('density', d.id)}
                  className={`p-3 rounded-sm border text-left transition-all ${
                    uiPreferences?.density === d.id
                      ? 'border-primary ring-1 ring-primary bg-surface-container-high'
                      : 'border-border-standard bg-surface-container hover:border-outline-variant'
                  }`}
                >
                  <div className="text-xs font-bold">{d.label}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Font Scaling & Monospace family */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-border-standard pt-6">
            <div className="space-y-2">
              <label
                htmlFor="font-size-select"
                className="text-xs font-bold uppercase text-text-muted tracking-wider block"
              >
                Font Scale
              </label>
              <SelectDropdown
                id="font-size-select"
                ariaLabel="Font Scale"
                value={uiPreferences?.fontSize || 'medium'}
                onChange={(val) => updateUiPreference('fontSize', val)}
                options={FONT_SIZES.map((f) => ({ value: f.id, label: f.label }))}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="mono-font-select"
                className="text-xs font-bold uppercase text-text-muted tracking-wider block"
              >
                Code & Terminal Font
              </label>
              <SelectDropdown
                id="mono-font-select"
                ariaLabel="Code and Terminal Font"
                value={uiPreferences?.fontMono || 'jetbrains'}
                onChange={(val) => updateUiPreference('fontMono', val)}
                options={MONO_FONTS.map((m) => ({ value: m.id, label: m.label }))}
              />
            </div>
          </div>

          {/* Reduce Motion */}
          <div className="border-t border-border-standard pt-6">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Reduce Motion & Animations"
                checked={Boolean(uiPreferences?.reduceMotion)}
                onChange={(e) => updateUiPreference('reduceMotion', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold uppercase">Reduce Motion & Animations</span>
                <p className="text-[10px] text-text-muted">
                  Disables UI animations, pulsing effects, and smooth transitions
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* 2. WORKSPACE & LAYOUT TAB */}
      {effectiveTab === 'workspace' && (
        <div className="space-y-6 animate-in fade-in duration-150 max-w-3xl">
          <div className="space-y-3">
            <span id="prefs-column-caption" className="text-xs font-bold uppercase text-text-muted tracking-wider block">
              Pipeline Column Width
            </span>
            <div
              className="grid grid-cols-2 sm:grid-cols-3 gap-3"
              role="group"
              aria-labelledby="prefs-column-caption"
            >
              {COLUMN_WIDTHS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => updateUiPreference('columnWidth', col.id)}
                  className={`p-2.5 rounded-sm border text-xs font-bold transition-all ${
                    uiPreferences?.columnWidth === col.id
                      ? 'border-primary ring-1 ring-primary bg-surface-container-high text-primary'
                      : 'border-border-standard bg-surface-container text-text-muted hover:text-on-surface'
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-border-standard pt-6">
            <span className="text-xs font-bold uppercase text-text-muted tracking-wider block">
              Panels & Visibility
            </span>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Show Bottom Now Playing Control Bar"
                checked={uiPreferences?.showNowPlayingBar !== false}
                onChange={(e) => updateUiPreference('showNowPlayingBar', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Show Bottom "Now Playing" Control Bar</span>
                <p className="text-[10px] text-text-muted">
                  Display the bottom engine transport controls, timer, and active stage progress
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Live Agent Activity Drawer Default Expanded"
                checked={uiPreferences?.activityDrawerDefaultOpen === true}
                onChange={(e) => updateUiPreference('activityDrawerDefaultOpen', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">
                  Live Agent Activity Drawer Default Expanded
                </span>
                <p className="text-[10px] text-text-muted">
                  Keep the bottom agent thoughts and tool call stream expanded by default
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Keep screen awake while monitoring"
                checked={uiPreferences?.keepScreenAwakeOnMonitor !== false}
                onChange={(e) => updateUiPreference('keepScreenAwakeOnMonitor', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Keep screen awake while monitoring</span>
                <p className="text-[10px] text-text-muted">
                  Prevents the screen from dimming or sleeping while the monitor is open and
                  a task is running, like a video player does
                  {!wakeLockSupported && (
                    <span className="mt-0.5 block">
                      Not supported on this browser/connection — the screen may still sleep.
                    </span>
                  )}
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* 3. TASK CARDS & DISPLAY TAB */}
      {effectiveTab === 'cards' && (
        <div className="space-y-6 animate-in fade-in duration-150 max-w-3xl">
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase text-text-muted tracking-wider block">
              Task Card Density
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TASK_CARD_DENSITIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => updateUiPreference('taskCardDensity', d.id)}
                  className={`p-3 rounded-sm border text-left transition-all ${
                    (uiPreferences?.taskCardDensity || 'compact') === d.id
                      ? 'border-primary ring-1 ring-primary bg-surface-container-high'
                      : 'border-border-standard bg-surface-container hover:border-outline-variant'
                  }`}
                >
                  <div className="text-xs font-bold">{d.label}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <span className="text-xs font-bold uppercase text-text-muted tracking-wider block">
              Kanban Card Metadata Display
            </span>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Show Task Short ID (#KB-XXXX)"
                checked={uiPreferences?.showTaskId !== false}
                onChange={(e) => updateUiPreference('showTaskId', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Show Task Short ID (#KB-XXXX)</span>
                <p className="text-[10px] text-text-muted">
                  Display unique short hash tag on top left of each card
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Show Stage & Role Badges"
                checked={uiPreferences?.showStageBadge !== false}
                onChange={(e) => updateUiPreference('showStageBadge', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Show Stage & Role Badges</span>
                <p className="text-[10px] text-text-muted">
                  Display role indicator pills (Agent, Human Review, CI, Custom)
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Show Time In Stage Timestamp"
                checked={uiPreferences?.showTimeInStage !== false}
                onChange={(e) => updateUiPreference('showTimeInStage', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Show Time In Stage Timestamp</span>
                <p className="text-[10px] text-text-muted">
                  Display elapsed duration since task moved into the current stage
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Default Show Completed Tasks"
                checked={Boolean(uiPreferences?.defaultShowCompletedTasks)}
                onChange={(e) => updateUiPreference('defaultShowCompletedTasks', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Default Show Completed Tasks</span>
                <p className="text-[10px] text-text-muted">
                  Starting default for showing completed / done tasks; the canvas remembers your
                  last manual Show Completed choice instead
                </p>
              </div>
            </label>
          </div>

          <div className="border-t border-border-standard pt-6 space-y-3">
            <label
              htmlFor="task-sort-select"
              className="text-xs font-bold uppercase text-text-muted tracking-wider block"
            >
              Card Order Within Stages
            </label>
            <SelectDropdown
              id="task-sort-select"
              ariaLabel="Card Order Within Stages"
              value={uiPreferences?.taskSort === 'oldest' ? 'oldest' : 'manual'}
              onChange={(val) => updateUiPreference('taskSort', val)}
              options={[
                { value: 'manual', label: 'Manual (drag-and-drop order)' },
                { value: 'oldest', label: 'Oldest first (longest waiting on top)' },
              ]}
            />
            <p className="text-[10px] text-text-muted">
              Oldest first only changes the display order — your manual order is kept.
            </p>
          </div>

          <div className="border-t border-border-standard pt-6 space-y-3">
            <label
              htmlFor="preview-lines-select"
              className="text-xs font-bold uppercase text-text-muted tracking-wider block"
            >
              Goal Description Preview Clamping
            </label>
            <SelectDropdown
              id="preview-lines-select"
              ariaLabel="Goal Description Preview Clamping"
              value={String(uiPreferences?.cardPreviewLines ?? 2)}
              onChange={(val) =>
                updateUiPreference(
                  'cardPreviewLines',
                  val === 'unlimited' ? 'unlimited' : parseInt(val, 10),
                )
              }
              options={[
                { value: '1', label: '1 Line (Ultra Compact)' },
                { value: '2', label: '2 Lines (Balanced Default)' },
                { value: '3', label: '3 Lines (More context)' },
                { value: 'unlimited', label: 'Unlimited (Show full goal text)' },
              ]}
            />
          </div>
        </div>
      )}

      {/* 4. SOUND & NOTIFICATIONS TAB */}
      {effectiveTab === 'alerts' && (
        <div className="space-y-6 animate-in fade-in duration-150 max-w-3xl">
          {/* Audio Chimes */}
          <div className="bg-surface-container p-4 rounded-sm border border-border-standard space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label="Audio Cues & Synthesized Chimes"
                  checked={Boolean(uiPreferences?.enableAudioChimes)}
                  onChange={(e) => updateUiPreference('enableAudioChimes', e.target.checked)}
                  className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold">Audio Cues & Synthesized Chimes</span>
                  <p className="text-[10px] text-text-muted">
                    Plays subtle notification chords on stage progression, reviews, and task
                    completion
                  </p>
                </div>
              </label>

              <button
                type="button"
                onClick={handleTestChime}
                className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold uppercase rounded-sm border border-border-standard transition-colors"
              >
                ▶ Test Audio
              </button>
            </div>
          </div>

          {/* System notifications (Web Push) */}
          <div className="bg-surface-container p-4 rounded-sm border border-border-standard space-y-3">
            <div>
              <span className="text-xs font-bold">System Notifications (Web Push)</span>
              <p className="text-[10px] text-text-muted">
                Push notifications are configured in one place — General App Settings →
                Notifications — so they work the same on desktop and mobile (Android/iOS
                browsers do not support the old in-page notification path).
              </p>
            </div>
            {typeof onOpenPushNotifications === 'function' ? (
              <button
                type="button"
                onClick={onOpenPushNotifications}
                className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold uppercase rounded-sm border border-border-standard transition-colors"
              >
                Manage push notifications
              </button>
            ) : (
              <p className="text-[10px] text-text-muted">
                Open General App Settings and choose the Notifications tab to allow and
                subscribe this browser.
              </p>
            )}
          </div>

          {/* Auto Scroll Logs */}
          <div className="bg-surface-container p-4 rounded-sm border border-border-standard">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Auto-scroll Live Activity Stream"
                checked={uiPreferences?.autoScrollLogs !== false}
                onChange={(e) => updateUiPreference('autoScrollLogs', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Auto-scroll Live Activity Stream</span>
                <p className="text-[10px] text-text-muted">
                  Automatically scroll live agent messages and tool executions as they stream in
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* 5. SHORTCUTS TAB */}
      {effectiveTab === 'shortcuts' && (
        <div className="space-y-6 animate-in fade-in duration-150 max-w-3xl">
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Enable Global Keyboard Shortcuts"
                checked={uiPreferences?.enableKeyboardShortcuts !== false}
                onChange={(e) => updateUiPreference('enableKeyboardShortcuts', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Enable Global Keyboard Shortcuts</span>
                <p className="text-[10px] text-text-muted">
                  Quick navigation with keyboard keys like 1, 2, 3, Ctrl+K, P, and ?
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-container p-3 rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                aria-label="Display Shortcut Hints on UI Controls"
                checked={uiPreferences?.showKeyboardHints !== false}
                onChange={(e) => updateUiPreference('showKeyboardHints', e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 w-4 h-4"
              />
              <div>
                <span className="text-xs font-bold">Display Shortcut Hints on UI Controls</span>
                <p className="text-[10px] text-text-muted">
                  Show badges like [1], [2], [Ctrl+K] on tabs and navigation buttons
                </p>
              </div>
            </label>
          </div>

          <div className="border-t border-border-standard pt-6 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-text-muted">
              Keyboard Reference Cheat Sheet
            </span>
            <button
              type="button"
              onClick={() => setIsShortcutsModalOpen(true)}
              className="px-4 py-2 bg-primary text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider hover:brightness-110 transition-all"
            >
              ⌨️ View All Shortcuts
            </button>
          </div>
        </div>
      )}

      {/* 6. BACKUP & RESET TAB */}
      {effectiveTab === 'backup' && (
        <div className="space-y-6 animate-in fade-in duration-150 max-w-3xl">
          {/* Export */}
          <div className="bg-surface-container p-4 rounded-sm border border-border-standard space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-high">
              Export UI Preferences
            </h3>
            <p className="text-[10px] text-text-muted">
              Copy your customization settings as JSON to share or back up across devices.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleExportCopy}
                className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold uppercase rounded-sm border border-border-standard transition-all"
              >
                {copiedExport ? 'Copied to Clipboard ✓' : 'Copy Settings JSON'}
              </button>
            </div>
          </div>

          {/* Import */}
          <form
            onSubmit={handleImportSubmit}
            className="bg-surface-container p-4 rounded-sm border border-border-standard space-y-3"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-high">
              Import UI Preferences
            </h3>
            <p className="text-[10px] text-text-muted">
              Paste JSON configuration below to restore or apply customization.
            </p>
            <textarea
              aria-label="Preferences JSON input"
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"theme": "midnight", "density": "compact", ...}'
              className="w-full p-2.5 bg-surface-deep border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary"
            />
            {importStatus && (
              <div
                className={`text-xs font-bold ${
                  importStatus.type === 'success' ? 'text-primary' : 'text-error'
                }`}
              >
                {importStatus.msg}
              </div>
            )}
            <button
              type="submit"
              disabled={!importText.trim()}
              className="px-4 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-wider rounded-sm hover:brightness-110 disabled:opacity-40 transition-all"
            >
              Apply Imported Settings
            </button>
          </form>

          {/* Factory Reset */}
          <div className="bg-surface-container p-4 rounded-sm border border-border-standard space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-error">
              Reset to Factory Defaults
            </h3>
            <p className="text-[10px] text-text-muted">
              Reset all UI settings, themes, and workspace preferences back to original defaults.
            </p>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reset all UI customization preferences to default?')) {
                  resetUiPreferences();
                }
              }}
              className="px-4 py-2 bg-error-container text-on-error-container text-xs font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all"
            >
              Reset All Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
