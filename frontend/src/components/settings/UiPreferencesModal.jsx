import React from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { Modal } from '../Modal';
import { Icon } from '../Icon';
import { UiPreferencesPanel } from './UiPreferencesPanel';

/**
 * MARK: UiPreferencesModal
 * @description Accessible dialog modal for tweaking UI customization, themes,
 * density, layout, shortcuts, and persistent preferences on the fly.
 */
export function UiPreferencesModal() {
  const { isCustomizationModalOpen, setIsCustomizationModalOpen } = useKainBain();

  if (!isCustomizationModalOpen) return null;

  return (
    <Modal
      onClose={() => setIsCustomizationModalOpen(false)}
      labelledBy="ui-preferences-title"
      dialogClassName="w-full max-w-3xl max-h-[90vh] bg-surface-container-low border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <header className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border-standard bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-primary text-base select-none" aria-hidden="true">
            🎨
          </span>
          <h2
            id="ui-preferences-title"
            className="text-xs sm:text-sm font-bold uppercase tracking-wider text-on-surface font-label-caps truncate"
          >
            UI Customization & Workspace Preferences
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsCustomizationModalOpen(false)}
          className="p-1 min-h-[44px] min-w-[44px] hover:bg-surface-container-high rounded text-text-muted hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Close preferences"
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-surface-deep">
        <UiPreferencesPanel />
      </div>

      <footer className="px-4 sm:px-6 py-3 border-t border-border-standard bg-surface flex justify-between items-center text-[10px] text-text-muted font-mono gap-2 shrink-0">
        <span className="hidden sm:inline">Settings are automatically saved to local storage</span>
        <button
          type="button"
          onClick={() => setIsCustomizationModalOpen(false)}
          className="px-4 py-2 min-h-[44px] bg-primary text-on-primary font-bold uppercase tracking-wider rounded-sm hover:brightness-110 active:scale-95 transition-all text-xs cursor-pointer flex items-center justify-center ml-auto"
        >
          Done
        </button>
      </footer>
    </Modal>
  );
}
