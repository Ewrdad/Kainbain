import React, { useState } from 'react';

import { Modal } from '../Modal';
import { Icon } from '../Icon';
import {
  WIDGET_CATALOG,
  WIDGET_CATEGORIES,
  PRESET_LAYOUTS,
  createWidgetInstance,
  normalizeLayout,
} from './widgetRegistry';

const CATEGORY_ORDER = Object.values(WIDGET_CATEGORIES);

/***
 * MARK: groupCatalogByCategory
 * @description Splits the widget catalog into the registry's category order so
 *   the add-widget menu stays scannable as the catalog grows. Groups with no
 *   widgets are dropped.
 * @returns {Array<{category: string, widgets: Array<Object>}>} Ordered groups.
 ***/
function groupCatalogByCategory() {
  return CATEGORY_ORDER.map((category) => ({
    category,
    widgets: WIDGET_CATALOG.filter((widget) => widget.category === category),
  })).filter((group) => group.widgets.length > 0);
}

/***
 * MARK: WidgetManagerModal
 * @description Dialog for composing the monitor view: widgets are grouped by
 *   category, every widget can be added more than once, and each live instance
 *   can be hidden, shown, or removed independently. Also hosts layout presets
 *   and export / import of the dashboard layout JSON.
 * @example <WidgetManagerModal isOpen layout={layout} onUpdateLayout={setLayout} onClose={() => {}} />
 * @param {Object} props - Dialog props.
 * @param {boolean} props.isOpen - Whether the dialog is shown.
 * @param {Function} props.onClose - Close handler.
 * @param {Array<Object>} [props.layout] - Current layout entries (render snapshot only).
 * @param {Function} props.onUpdateLayout - Receives a complete replacement layout
 *   or an updater function `(previousLayout) => nextLayout`. Updates always go
 *   through the updater form so two rapid clicks (or a click racing a
 *   dashboard save) compute from fresh state — a stale `layout` snapshot can
 *   never mint a duplicate instance id or drop a sibling update.
 * @param {Function} props.onApplyPreset - Receives a preset layout.
 * @param {Function} props.onResetLayout - Restores the factory layout.
 * @returns {React.ReactElement|null} The dialog, or null when closed.
 ***/
export function WidgetManagerModal({
  isOpen,
  onClose,
  layout = [],
  onUpdateLayout,
  onApplyPreset,
  onResetLayout,
}) {
  const [activeTab, setActiveTab] = useState('widgets'); // 'widgets' | 'presets' | 'backup'
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [exportCopied, setExportCopied] = useState(false);

  if (!isOpen) return null;

  const instancesOf = (widgetId) => layout.filter((entry) => entry.id === widgetId);
  // Count distinct widget types with at least one visible instance, not raw
  // instances: two copies of one widget are still one catalog entry.
  const enabledTypeCount = WIDGET_CATALOG.filter((widget) =>
    layout.some((entry) => entry.id === widget.id && entry.enabled),
  ).length;

  // Append a fresh copy of a widget type (multiple copies are allowed). The
  // updater form reads the live layout, so rapid double-clicks mint -2 then
  // -3 instead of two colliding copies from one stale snapshot.
  const handleAddInstance = (widgetId) => {
    onUpdateLayout((previousLayout) => {
      const current = Array.isArray(previousLayout) ? previousLayout : [];
      const instance = createWidgetInstance(widgetId, current);
      return instance ? [...current, instance] : current;
    });
  };

  // Show / hide one instance without touching any other copy.
  const handleToggleInstance = (instanceId) => {
    onUpdateLayout((previousLayout) =>
      (Array.isArray(previousLayout) ? previousLayout : []).map((entry) =>
        entry.instanceId === instanceId ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    );
  };

  // Remove one instance entirely.
  const handleRemoveInstance = (instanceId) => {
    onUpdateLayout((previousLayout) =>
      (Array.isArray(previousLayout) ? previousLayout : []).filter(
        (entry) => entry.instanceId !== instanceId,
      ),
    );
  };

  // Export layout
  const handleCopyExport = () => {
    const jsonStr = JSON.stringify(layout, null, 2);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonStr);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    }
  };

  // Import layout: accepts both version 1 arrays (no instanceId) and version 2
  // arrays, migrating them through the same validator the loader uses.
  const handleApplyImport = () => {
    setImportError('');
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setImportError('Invalid layout format. Expected an array of widget layout objects.');
        return;
      }
      const knownIds = new Set(WIDGET_CATALOG.map((widget) => widget.id));
      const hasKnownWidget = parsed.some((entry) => entry && knownIds.has(entry.id));
      if (!hasKnownWidget) {
        setImportError('No recognised widgets found in the pasted layout.');
        return;
      }
      onUpdateLayout(normalizeLayout(parsed));
      onClose();
    } catch (e) {
      setImportError('Failed to parse JSON: ' + e.message);
    }
  };

  const widgetGroups = groupCatalogByCategory();

  return (
    <Modal
      onClose={onClose}
      labelledBy="widget-manager-title"
      dialogClassName="w-full max-w-2xl bg-[#0e1424] border border-border-standard rounded-lg shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans"
    >
      {/* Header */}
      <header className="px-5 py-3.5 border-b border-slate-800 bg-[#090d16] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-lg">⚙️</span>
          <h2
            id="widget-manager-title"
            className="text-sm font-bold uppercase tracking-wider font-mono text-slate-100"
          >
            Customize Observability Widgets & Layout
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close widget manager"
        >
          <Icon name="close" />
        </button>
      </header>

      {/* Tabs. The active tab's bottom border is the visual cue; aria-current
          exposes the same state to assistive tech (WCAG 4.1.2 / 1.4.1) without
          changing the interaction or the visuals. */}
      <div className="flex border-b border-slate-800 bg-[#0c101c] px-4 text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab('widgets')}
          aria-current={activeTab === 'widgets' ? 'true' : undefined}
          className={`py-2 px-3 border-b-2 font-bold cursor-pointer transition-colors ${
            activeTab === 'widgets'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📦 Widgets Catalog ({enabledTypeCount}/{WIDGET_CATALOG.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          aria-current={activeTab === 'presets' ? 'true' : undefined}
          className={`py-2 px-3 border-b-2 font-bold cursor-pointer transition-colors ${
            activeTab === 'presets'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📐 Layout Presets
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('backup')}
          aria-current={activeTab === 'backup' ? 'true' : undefined}
          className={`py-2 px-3 border-b-2 font-bold cursor-pointer transition-colors ${
            activeTab === 'backup'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          💾 Export / Import
        </button>
      </div>

      {/* Body Content */}
      <div className="p-5 overflow-y-auto custom-scrollbar max-h-[60vh] bg-[#070a12] space-y-4">
        {/* TAB 1: WIDGETS CATALOG, GROUPED BY CATEGORY */}
        {activeTab === 'widgets' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 font-mono">
              Widgets are grouped by category and can be added more than once. Each copy can be
              resized, moved, hidden, or removed on its own.
            </p>

            {widgetGroups.map((group) => (
              <section key={group.category} aria-label={group.category}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-2">
                  {group.category}
                </h3>

                <div className="grid grid-cols-1 gap-2.5">
                  {group.widgets.map((widget) => {
                    const instances = instancesOf(widget.id);
                    return (
                      <div
                        key={widget.id}
                        data-testid={`widget-catalog-${widget.id}`}
                        className={`p-3 rounded-lg border transition-all flex flex-col gap-2 ${
                          instances.length > 0
                            ? 'bg-slate-900/90 border-emerald-500/40 shadow-sm'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="text-xl p-1 bg-slate-800 rounded">{widget.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-200 font-mono">
                                  {widget.title}
                                </h4>
                                <span
                                  data-testid={`widget-count-${widget.id}`}
                                  className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono"
                                >
                                  ×{instances.length}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                                {widget.description}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddInstance(widget.id)}
                            disabled={widget.allowMultiple === false && instances.length > 0}
                            aria-label={`Add ${widget.title} widget`}
                            className="px-3 py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-emerald-600 hover:text-slate-950 font-mono text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            + Add
                          </button>
                        </div>

                        {instances.length > 0 && (
                          <ul className="flex flex-wrap gap-1.5 pl-1">
                            {instances.map((instance) => (
                              <li
                                key={instance.instanceId}
                                data-testid={`widget-instance-${instance.instanceId}`}
                                className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-700 bg-slate-950/80 text-[10px] font-mono"
                              >
                                <span className="text-slate-300">{instance.instanceId}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleInstance(instance.instanceId)}
                                  aria-label={`${instance.enabled ? 'Hide' : 'Show'} ${instance.instanceId}`}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                                    instance.enabled
                                      ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                  }`}
                                >
                                  {instance.enabled ? 'Visible' : 'Hidden'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInstance(instance.instanceId)}
                                  aria-label={`Remove ${instance.instanceId}`}
                                  className="px-1.5 py-0.5 rounded text-rose-300 hover:bg-rose-900/60 hover:text-rose-200 cursor-pointer transition-colors"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* TAB 2: PRESET LAYOUTS */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-mono">
              Apply a curated dashboard preset tuned for specific monitoring and triage workflows.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_LAYOUTS.map((preset) => (
                <div
                  key={preset.id}
                  className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/80 hover:border-emerald-500/50 flex flex-col justify-between gap-3 transition-colors"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 font-mono">{preset.name}</h4>
                    <p className="text-[11px] text-slate-400 mt-1">{preset.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyPreset(preset.layout);
                      onClose();
                    }}
                    className="w-full py-1.5 bg-emerald-950 text-emerald-300 hover:bg-emerald-900/80 border border-emerald-700/60 rounded text-xs font-mono font-bold transition-colors cursor-pointer"
                  >
                    Apply Preset
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: BACKUP / EXPORT / IMPORT */}
        {activeTab === 'backup' && (
          <div className="space-y-4 text-xs font-mono">
            {/* Export */}
            <div className="p-3.5 bg-slate-900/80 rounded border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Export Current Dashboard Layout
              </h4>
              <p className="text-[11px] text-slate-400">
                Copy your layout configuration JSON to share across browsers or save backups.
              </p>
              <button
                type="button"
                onClick={handleCopyExport}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>
                  {exportCopied ? '✓ Layout JSON Copied!' : '📋 Copy Layout to Clipboard'}
                </span>
              </button>
            </div>

            {/* Import */}
            <div className="p-3.5 bg-slate-900/80 rounded border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Import Layout JSON
              </h4>
              <p className="text-[11px] text-slate-400">
                Accepts current exports and older version-1 layouts (widgets without an instance id
                are upgraded automatically).
              </p>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder="Paste dashboard layout JSON array here..."
                rows={4}
                className="w-full bg-[#05070d] text-slate-200 border border-slate-700 rounded p-2 text-xs font-mono outline-none focus:border-emerald-500 resize-none"
              />
              {importError && (
                <div className="text-[11px] text-rose-300 font-bold">{importError}</div>
              )}
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={!importJson.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded transition-colors cursor-pointer disabled:opacity-40"
              >
                Apply Imported Layout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-5 py-3 border-t border-slate-800 bg-[#090d16] flex items-center justify-between text-xs font-mono">
        <button
          type="button"
          onClick={() => {
            onResetLayout();
            onClose();
          }}
          className="text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
        >
          Reset to Factory Layout
        </button>

        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded transition-colors cursor-pointer"
        >
          Done
        </button>
      </footer>
    </Modal>
  );
}

export default WidgetManagerModal;
