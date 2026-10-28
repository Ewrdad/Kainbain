/***
 * MARK: stageTokens
 * @description Shared pipeline-board tokens: the canonical keyword catalogue
 *   lives in `shared/stageKeywordTokens.js` (single source for the agent
 *   prompt editor, the CI command editor, and backend consistency tests);
 *   this module re-exports it alongside the board-only pill class.
 *   Pure data — no React, no context.
 ***/
export { STAGE_KEYWORD_TOKENS } from '../../../../shared/stageKeywordTokens.js';

/***
 * MARK: STAGE_TAB_PILL_CLASS
 * @description Shared Tailwind classes for a mobile stage-selector pill:
 *   padding, radius, label typography and the 44px touch target. Both the
 *   per-stage tabs and the trailing "Add stage" pill build on it so the
 *   two can never drift apart visually. Mobile density (task 34793321):
 *   tighter `px/py` below `sm` reclaims stage-strip height on phones while
 *   `min-h-[44px]` preserves the WCAG 2.5.8 pointer target; desktop keeps
 *   the original roomier metrics.
 ***/
export const STAGE_TAB_PILL_CLASS =
  'px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded text-xs font-label-caps uppercase tracking-wider flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer min-h-[44px] shrink-0';

/***
 * MARK: STAGE_TAG_CHIP_CLASS
 * @description Standard visual token for stage tag chips in settings and editor.
 ***/
export const STAGE_TAG_CHIP_CLASS =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-container border border-border-standard text-on-surface';

/***
 * MARK: STAGE_HEADER_TAG_CHIP_CLASS
 * @description Visual token for stage tag chips in the ochre column header.
 ***/
export const STAGE_HEADER_TAG_CHIP_CLASS =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/40 text-[#ffe0b2] border border-[#ffb77f]/40';
