import React from 'react';
import { useKainBain } from '../context/KainBainContext';
import { Modal } from './Modal';
import { Icon } from './Icon';

const SHORTCUTS = [
  { key: '1', desc: 'Switch to Orchestrator view' },
  { key: '2', desc: 'Switch to Files & Repo view' },
  { key: '3', desc: 'Switch to Project Settings view' },
  { key: '4  or  O', desc: 'Switch to Observability Monitor display' },
  {
    key: 'Right-click 📡',
    desc: 'Open the compact logs-only monitor — also in the System menu, or tap 📡 on phones',
  },
  { key: '5  or  D', desc: 'Open platform docs' },
  { key: 'R', desc: 'Open cross-task retrospective review' },
  { key: 'Ctrl + K  or  C', desc: 'Open UI Customization & Preferences modal' },
  { key: 'G', desc: 'Open System Transparency & Architecture Guide' },
  { key: 'S', desc: 'Open System Settings' },
  { key: 'P', desc: 'Start / Pause compute execution engine' },
  { key: 'N', desc: 'Focus new task input field in submission panel' },
  { key: 'Esc', desc: 'Close any active overlay or modal dialog' },
  { key: '?', desc: 'Open this Keyboard Shortcuts cheat sheet' },
];

/**
 * MARK: KeyboardShortcutsModal
 * @description Accessible cheat sheet showing all keyboard shortcuts.
 */
export function KeyboardShortcutsModal() {
  const { isShortcutsModalOpen, setIsShortcutsModalOpen } = useKainBain();

  if (!isShortcutsModalOpen) return null;

  return (
    <Modal
      onClose={() => setIsShortcutsModalOpen(false)}
      labelledBy="keyboard-shortcuts-title"
      dialogClassName="w-full max-w-lg bg-surface-container-low border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <header className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border-standard bg-surface flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-primary text-base select-none" aria-hidden="true">
            ⌨️
          </span>
          <h2
            id="keyboard-shortcuts-title"
            className="text-xs sm:text-sm font-bold uppercase tracking-wider text-on-surface font-label-caps"
          >
            Keyboard Shortcuts
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsShortcutsModalOpen(false)}
          className="p-1 min-h-[44px] min-w-[44px] hover:bg-surface-container-high rounded text-text-muted hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Close shortcuts modal"
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="p-4 sm:p-6 space-y-3 bg-surface-deep overflow-y-auto custom-scrollbar max-h-[60vh]">
        <div className="divide-y divide-border-standard/50 border border-border-standard rounded-sm overflow-hidden bg-surface-container">
          {SHORTCUTS.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-2.5 sm:p-3 text-xs gap-2">
              <span className="text-on-surface text-[11px] sm:text-xs">{item.desc}</span>
              <kbd className="px-2 py-1 bg-surface-deep border border-border-standard rounded font-mono text-[10px] text-primary font-bold shadow-xs shrink-0">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      <footer className="px-4 sm:px-6 py-3 border-t border-border-standard bg-surface flex justify-end">
        <button
          type="button"
          onClick={() => setIsShortcutsModalOpen(false)}
          className="px-4 py-2 min-h-[44px] bg-primary text-on-primary font-bold uppercase tracking-wider rounded-sm hover:brightness-110 active:scale-95 transition-all text-xs cursor-pointer flex items-center justify-center"
        >
          Close
        </button>
      </footer>
    </Modal>
  );
}
