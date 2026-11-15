/***
 * MARK: TruncatedText
 * @description One-line label for user-controlled text (workflow names, stage
 *   names, skill names) that must never push its card wider: single-line
 *   ellipsis (`truncate`) inside a shrinkable (`min-w-0`) span, so the flex
 *   item can shrink below the text width instead of overflowing the card.
 *   The full text stays discoverable through the `title` tooltip (hover) and
 *   the element's own text content (screen readers, accessible-name queries).
 *   Single shared pattern for every Settings card — do not hand-roll
 *   per-card truncation classes.
 * @param {Object} props
 * @param {string} props.text - Full text to show; also the default tooltip.
 * @param {string} [props.className] - Extra styling merged after the guard
 *   classes (e.g. font and colour).
 * @param {string} [props.title] - Tooltip override; defaults to the full text.
 * @param {string} [props.id] - Optional element id (e.g. an `aria-labelledby`
 *   target that must survive the truncation wrapper).
 * @example <TruncatedText text={workflow.name} className="font-bold text-sm text-text-high" />
 ***/
export function TruncatedText({ text, className = '', title, id }) {
  return (
    <span id={id} title={title ?? text} className={`min-w-0 truncate ${className}`.trim()}>
      {text}
    </span>
  );
}

/***
 * MARK: TruncatedText default export
 * @description Default entry point for the shared truncation label (same component).
 * @example import TruncatedText from '../common/TruncatedText';
 ***/
export default TruncatedText;
