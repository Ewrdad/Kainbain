// Domain: prompt layout token catalogue and helpers for frontend settings.
import {
  LAYOUT_TOKENS,
  MANDATORY_LAYOUT_TOKENS,
  CONDITIONAL_LAYOUT_TOKENS,
  SECTION_TOKENS,
  INLINE_KEYWORDS,
  DEFAULT_PROMPT_LAYOUT,
  MAX_LAYOUT_CHARS,
  validatePromptLayout,
  extractLayoutTokens,
} from '../../../../shared/promptLayout.js';

export {
  LAYOUT_TOKENS,
  MANDATORY_LAYOUT_TOKENS,
  CONDITIONAL_LAYOUT_TOKENS,
  SECTION_TOKENS,
  INLINE_KEYWORDS,
  DEFAULT_PROMPT_LAYOUT,
  MAX_LAYOUT_CHARS,
  validatePromptLayout,
  extractLayoutTokens,
};

export const SECTION_LAYOUT_TOKENS = LAYOUT_TOKENS.filter((t) => t.category === 'section');
export const INLINE_LAYOUT_TOKENS = LAYOUT_TOKENS.filter((t) => t.category === 'inline');
