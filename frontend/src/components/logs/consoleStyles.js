/***
 * MARK: consoleStyles
 * @description Terminal console chrome shared by the main page
 *   `ActivityConsole` and the monitor page `LiveConsoleWidget`. Both
 *   surfaces render the same unified `LogViewer`; these constants keep the
 *   surrounding frame (dark terminal background, header bar, auto-scroll
 *   toggle) visually identical so the two consoles cannot drift apart.
 *   Refactoring a surface to these constants changes no pixels — the
 *   values are the monitor console's existing Tailwind classes, extracted
 *   verbatim.
 * @example import { CONSOLE_CHROME } from '../logs/consoleStyles';
 * @example `<div className={CONSOLE_CHROME.outerBg}>` => "bg-[#05070d]"
 ***/
export const CONSOLE_CHROME = Object.freeze({
  // Outer container background (dark terminal).
  outerBg: 'bg-[#05070d]',
  // Header bar background, border, text, and clickable hover state.
  headerBg: 'bg-[#0b0f1a]',
  headerBorder: 'border-slate-800',
  headerText: 'text-slate-400',
  headerHover: 'hover:bg-slate-800/60',
  // Log count badge and streaming indicator pills (slate companions
  // to the header bar so badges stay legible on the dark chrome).
  countBadge: 'bg-slate-800 text-slate-300',
  streamingPill: 'bg-slate-800 text-slate-300 border border-slate-700',
  // Auto-scroll toggle button, on/off states.
  autoScrollOn: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50',
  autoScrollOff: 'bg-slate-800 text-slate-300 border-slate-700',
});
