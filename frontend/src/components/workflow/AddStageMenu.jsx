import { useEffect, useRef, useState } from 'react';
import { AddStageButton } from './AddStageButton';
import { STAGE_TAB_PILL_CLASS } from './stageTokens';
import {
  buildImportPayload,
  exportFilename,
  isFileOversize,
  oversizeImportError,
  parsePipelineFile,
  serializePipelineJson,
  summarizeImport,
  validatePipelineDoc,
} from './pipelineTransfer';

/***
 * MARK: AddStageMenu
 * @description Transfer affordance for the end-of-pipeline add-stage slot: the
 *   primary action still adds a stage in one click (via the untouched
 *   `AddStageButton`, whose contract and tests stay intact), while a compact
 *   chevron opens an `Export / Import` menu.
 *   `variant="column"` wraps the desktop dashed end-of-pipeline card with a
 *   corner chevron chip; `variant="tab"` renders the chevron as an in-flow
 *   pill immediately before the trailing add-stage pill, so the add pill
 *   stays the last in-flow child of the mobile strip and keeps the shared
 *   `STAGE_TAB_PILL_CLASS` metrics.
 *
 *   Pure presentational: parsing/validation lives in `pipelineTransfer.js`;
 *   persistence arrives via `onImportWorkflow` (wired to `createWorkflow`,
 *   which always creates a NEW workflow — imports can never clobber the
 *   pipeline being exported from). The menu uses `position: fixed` because
 *   both hosts (the desktop board and the mobile strip) scroll, which would
 *   clip an absolutely-positioned dropdown.
 * @example <AddStageMenu variant="column" onAdd={addStageAndSave} stages={stages} ... />
 ***/

const MENU_WIDTH = 240;

function formatBreakdown(byType) {
  return Object.entries(byType)
    .map(([type, count]) => `${count} ${type}`)
    .join(' · ');
}

export function AddStageMenu({
  variant = 'column',
  onAdd,
  projectId,
  workflowName = 'Pipeline',
  stages = [],
  onImportWorkflow,
  notifySuccess,
  notifyError,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, above: false });
  const [pendingDoc, setPendingDoc] = useState(null);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const chevronRef = useRef(null);
  const menuRef = useRef(null);
  const importingRef = useRef(false);
  const fileRef = useRef(null);
  const firstItemRef = useRef(null);
  // Opening the menu focuses the chevron (or its first item), and focusing an
  // element inside the horizontal stage strip scrolls that strip — which used
  // to fire a captured `scroll` event and close the menu in the same tick, so
  // a user's FIRST tap could flicker the menu shut. Scroll-closing therefore
  // sleeps through the programmatic focus-scroll right after open.
  const openedAtRef = useRef(0);

  const closeMenu = () => setMenuOpen(false);

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    openedAtRef.current = Date.now();
    const rect = chevronRef.current?.getBoundingClientRect();
    const left = rect
      ? Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
      : 8;
    if (variant === 'tab' && rect) {
      setMenuPos({ top: rect.bottom + 8, left, above: false });
    } else if (rect) {
      setMenuPos({ top: rect.top - 8, left, above: true });
    } else {
      setMenuPos({ top: 0, left, above: false });
    }
    setMenuOpen(true);
  };

  // Menu dismissal: outside click, Escape, scroll, resize. Focus returns to
  // the chevron so keyboard users do not lose their place.
  useEffect(() => {
    if (!menuOpen) return undefined;
    firstItemRef.current?.focus();
    function handlePointerDown(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !chevronRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMenuOpen(false);
        chevronRef.current?.focus();
      }
    }
    function handleScroll() {
      // Ignore the programmatic focus-scroll right after opening (see
      // openedAtRef above); only user-initiated scrolling closes the menu.
      if (Date.now() - openedAtRef.current < 150) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [menuOpen]);

  // Dialog dismissal on Escape (no writes on cancel). While a create call is
  // in flight the dialog stays put so Escape cannot hide a pending write.
  useEffect(() => {
    if (!pendingDoc) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !importingRef.current) setPendingDoc(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pendingDoc]);

  const handleExport = () => {
    closeMenu();
    if (!Array.isArray(stages) || stages.length === 0) {
      notifyError?.('Nothing to export — the active pipeline has no stages.', 'Export failed');
      return;
    }
    // Serialization can throw on unserializable stage state (e.g. a circular
    // value): fail with a notification, never an unhandled throw and never a
    // truncated download.
    let text;
    try {
      text = serializePipelineJson({ name: workflowName }, stages);
    } catch {
      notifyError?.(
        'Could not serialize this pipeline — a stage holds data that cannot be saved to JSON.',
        'Export failed',
      );
      return;
    }
    const filename = exportFilename(workflowName);
    const blob = new Blob([text], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notifySuccess?.(`Exported ${stages.length} stage(s) to ${filename}.`, 'Pipeline exported');
  };

  const handleFileChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    closeMenu();
    if (!file) return;
    // Pre-read guard: never buffer a multi-MB drop into memory — the same
    // cap is re-checked on the decoded text in `parsePipelineFile`, so an
    // unknown `size` here simply falls through to that check.
    if (isFileOversize(file)) {
      notifyError?.(oversizeImportError(), 'Import failed');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      notifyError?.(`Could not read "${file.name || 'that file'}". Try again.`, 'Import failed');
      return;
    }
    const parsed = parsePipelineFile(text);
    if (!parsed.ok) {
      notifyError?.(parsed.error, 'Import failed');
      return;
    }
    const validation = validatePipelineDoc(parsed.doc);
    if (!validation.ok) {
      const shown = validation.errors.slice(0, 3).join(' ');
      const more = validation.errors.length > 3 ? ` (+${validation.errors.length - 3} more)` : '';
      console.error('Pipeline import rejected:', validation.errors);
      // Zero API calls on invalid files: bail before any persistence.
      notifyError?.(`${shown}${more}`, 'Import failed');
      return;
    }
    setPendingDoc(parsed.doc);
    setImportName(`${parsed.doc.name} (imported)`);
  };

  const handleConfirmImport = async () => {
    let payload;
    try {
      payload = buildImportPayload(pendingDoc, { name: importName });
    } catch (e) {
      notifyError?.(e.message || 'Import failed.', 'Import failed');
      return;
    }
    if (!projectId) {
      notifyError?.('No active project — open a project before importing.', 'Import failed');
      return;
    }
    if (!onImportWorkflow) {
      notifyError?.('Import is not wired up in this view — nothing was written.', 'Import failed');
      return;
    }
    setImporting(true);
    importingRef.current = true;
    try {
      await onImportWorkflow(payload);
      setPendingDoc(null);
    } catch (e) {
      notifyError?.(e.message || 'Import failed.', 'Import failed');
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  const summary = pendingDoc ? summarizeImport(pendingDoc) : null;

  const menu = menuOpen && (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Pipeline transfer"
      style={{
        position: 'fixed',
        top: menuPos.top,
        left: menuPos.left,
        width: MENU_WIDTH,
        transform: menuPos.above ? 'translateY(-100%)' : 'none',
        zIndex: 100,
      }}
      className="bg-surface-container border border-border-standard shadow-2xl rounded-sm p-1"
    >
      <button
        ref={firstItemRef}
        type="button"
        role="menuitem"
        onClick={handleExport}
        className="w-full text-left px-3 py-2 min-h-[44px] text-xs rounded-sm transition-colors text-on-surface hover:bg-surface-container-high cursor-pointer"
      >
        <span className="block font-bold">Export pipeline…</span>
        <span className="block text-[10px] font-mono text-text-muted">
          Download {exportFilename(workflowName)}
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => fileRef.current?.click()}
        className="w-full text-left px-3 py-2 min-h-[44px] text-xs rounded-sm transition-colors text-on-surface hover:bg-surface-container-high cursor-pointer"
      >
        <span className="block font-bold">Import pipeline…</span>
        <span className="block text-[10px] font-mono text-text-muted">
          New pipeline from a .pipeline.json file
        </span>
      </button>
    </div>
  );

  const dialog = pendingDoc && (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import pipeline"
        className="w-full max-w-md bg-surface border border-border-standard rounded-sm p-4 space-y-3 shadow-2xl"
      >
        <h2 className="text-sm font-bold text-on-surface">Import pipeline</h2>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            New pipeline name
          </span>
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- dialog-owned focus on open
            autoFocus
            type="text"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            aria-label="New pipeline name"
            className="w-full p-2 bg-surface-container border border-border-standard rounded-sm text-xs text-on-surface outline-none focus:border-primary"
          />
        </label>
        {summary && (
          <p className="text-xs font-mono text-text-muted">
            {summary.stageCount} stage(s): {formatBreakdown(summary.byType)}
          </p>
        )}
        <p className="text-xs text-text-muted">
          Creates a new pipeline; nothing existing is changed. The new pipeline stays inactive until
          you switch to it.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={() => setPendingDoc(null)}
            className="px-3 py-2 min-h-[44px] text-xs rounded-sm border border-border-standard text-on-surface hover:bg-surface-container-high cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={importing || importName.trim() === ''}
            onClick={handleConfirmImport}
            className="px-3 py-2 min-h-[44px] text-xs font-bold rounded-sm bg-primary text-on-primary hover:brightness-110 cursor-pointer disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import pipeline'}
          </button>
        </div>
      </div>
    </div>
  );

  const transferInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      aria-hidden="true"
      tabIndex={-1}
      className="hidden"
      onChange={handleFileChosen}
    />
  );

  const chevronButton =
    variant === 'tab' ? (
      <button
        ref={chevronRef}
        type="button"
        aria-label="Pipeline transfer options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu();
        }}
        className={`${STAGE_TAB_PILL_CLASS} bg-surface-deep text-text-muted hover:text-on-surface hover:bg-surface-container-high border border-dashed border-border-standard hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`}
      >
        <span aria-hidden="true" className="text-xs leading-none">
          ▾
        </span>
        <span className="sr-only">Pipeline transfer</span>
      </button>
    ) : (
      <button
        ref={chevronRef}
        type="button"
        aria-label="Pipeline transfer options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu();
        }}
        title="Export or import this pipeline"
        className="absolute top-1 right-1 w-11 h-11 rounded-full bg-surface-deep/90 border border-border-standard shadow-sm flex items-center justify-center text-text-muted hover:text-primary hover:border-primary/60 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>
    );

  // The hidden file input is rendered first so the trailing add-stage pill
  // remains the strip's last in-flow child (WorkflowCanvas.mobile.test.jsx
  // asserts this); menu/dialog render as null/false while closed, so they
  // never take DOM slots between them.
  if (variant === 'tab') {
    return (
      <>
        {transferInput}
        {chevronButton}
        <AddStageButton variant="tab" onAdd={onAdd} />
        {menu}
        {dialog}
      </>
    );
  }

  return (
    <>
      <div style={{ width: '180px', flexShrink: 0 }} className="hidden md:block relative">
        <AddStageButton variant="column" onAdd={onAdd} />
        {chevronButton}
      </div>
      {transferInput}
      {menu}
      {dialog}
    </>
  );
}
