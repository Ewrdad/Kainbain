import { InfoTooltip } from '../common/InfoTooltip';

/***
 * MARK: CollapsedStageRunBar
 * @description Slim vertical bar that replaces a contiguous run of stages
 *   hidden by the board tag filter. Shows the hidden stage count, the active
 *   task count across the hidden stages, and expands/collapses on click so
 *   the hidden stages render inline (ephemeral, per-session state — only the
 *   selected tags/mode are shared via the URL). The bar is deliberately NOT a
 *   drop target: drag-and-drop onto it is rejected, expand first.
 * @example <CollapsedStageRunBar entry={entry} isExpanded={false} onToggle={fn} colStyle={style} />
 ***/
export function CollapsedStageRunBar({
  entry,
  isExpanded = false,
  onToggle,
  colStyle,
  stageAnalytics,
}) {
  const hiddenStages = Array.isArray(entry?.stages) ? entry.stages : [];
  const hiddenCount = hiddenStages.length;
  const hiddenLabel = `${hiddenCount} stage${hiddenCount === 1 ? '' : 's'} hidden`;
  const hiddenNames = hiddenStages.map((s) => s?.name || s?.id || 'stage').join(', ');
  const hiddenTags = [
    ...new Set(hiddenStages.flatMap((s) => (Array.isArray(s?.tags) ? s.tags : []))),
  ];
  const activeTasksCount = hiddenStages.reduce((sum, s) => {
    const stat = stageAnalytics?.byStage?.[s.id];
    return sum + (stat?.activeTasksCount || 0);
  }, 0);
  const tooltipDescription =
    hiddenTags.length > 0 ? `${hiddenNames} — tags: ${hiddenTags.join(', ')}` : hiddenNames;

  return (
    <section
      data-testid="collapsed-stage-run"
      data-collapsed-group={entry?.id}
      style={colStyle}
      className="relative h-full flex flex-col bg-surface-container-low border border-border-standard rounded-sm overflow-hidden shrink-0"
      aria-label={`${hiddenLabel} by tag filter`}
    >
      <InfoTooltip
        title={isExpanded ? `Collapse ${hiddenLabel}` : `Expand ${hiddenLabel}`}
        description={tooltipDescription}
        position="right"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? `Collapse ${hiddenCount} hidden stages`
              : `Expand ${hiddenCount} collapsed stages`
          }
          className="flex-1 w-full flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-surface-container/50 transition-colors py-2"
        >
          <span
            className="text-[9px] font-mono font-bold uppercase tracking-wider text-text-muted select-none"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {hiddenLabel}
          </span>
          <span
            data-testid="collapsed-stage-run-tasks"
            title={`${activeTasksCount} active tasks in hidden stages`}
            className="text-[9px] font-mono text-on-surface bg-surface-container border border-border-standard font-bold px-1 py-0.5 rounded"
          >
            {activeTasksCount}
          </span>
          <span aria-hidden="true" className="text-text-muted text-[10px]">
            {isExpanded ? '⟨' : '⟩'}
          </span>
        </button>
      </InfoTooltip>
    </section>
  );
}
