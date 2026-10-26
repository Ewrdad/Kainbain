import { STAGE_TAB_PILL_CLASS } from './stageTokens';

/***
 * MARK: AddStageButton
 * @description Shared "add stage" affordance for the pipeline board.
 * `variant="column"` renders the desktop dashed end-of-pipeline card;
 * `variant="tab"` renders the compact trailing button at the end of the
 * mobile stage-selector strip. Both share the accessible name
 * ("Add new pipeline stage") and call the same `onAdd` creation path.
 * The tab variant is a plain `button` (not `role="tab"`) because it
 * performs an action rather than selecting a panel. It renders as the
 * last in-flow pill of the scrollable strip — styled like an unselected
 * stage tab, with a dashed border as the only cue that it creates a stage
 * instead of selecting one — so it never overlays the stage tabs while
 * they scroll.
 * @example <AddStageButton variant="column" onAdd={addStageAndSave} />
 * @param {{ variant: 'column' | 'tab', onAdd: () => void }} props
 ***/
export function AddStageButton({ variant = 'column', onAdd }) {
  if (variant === 'tab') {
    return (
      <button
        type="button"
        aria-label="Add new pipeline stage"
        onClick={() => onAdd?.()}
        className={`${STAGE_TAB_PILL_CLASS} bg-surface-deep text-text-muted hover:text-on-surface hover:bg-surface-container-high border border-dashed border-border-standard hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`}
      >
        <span aria-hidden="true" className="text-base font-bold leading-none">
          +
        </span>
        <span>Add stage</span>
      </button>
    );
  }
  return (
    <div
      style={{ width: '180px', flexShrink: 0 }}
      className="h-full hidden md:flex flex-col items-center justify-center border-2 border-dashed border-border-standard hover:border-primary/60 rounded-sm p-4 text-center transition-colors group cursor-pointer bg-surface-container/20 hover:bg-surface-container/40 select-none"
      onClick={() => {
        onAdd?.();
      }}
      role="button"
      tabIndex={0}
      aria-label="Add new pipeline stage"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd?.();
        }
      }}
    >
      <div className="w-9 h-9 rounded-full bg-surface-container group-hover:bg-primary group-hover:text-on-primary text-text-muted flex items-center justify-center text-lg font-bold transition-all mb-2 shadow-sm">
        +
      </div>
      <span className="font-label-caps text-xs uppercase font-bold text-text-muted group-hover:text-primary transition-colors">
        Add Stage
      </span>
      <span className="text-[10px] font-mono text-text-muted mt-1">Extend pipeline</span>
    </div>
  );
}
