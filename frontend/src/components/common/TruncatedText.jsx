/***
 * MARK: TruncatedText
 * @description One-line label for user-controlled text (workflow names, stage
 *   names, skill names) that must never push its card wider: the text is cut
 *   with an ellipsis when it runs out of room, and the label is allowed to
 *   shrink below the text width instead of overflowing the card. The full
 *   text stays discoverable through the `title` tooltip (hover) and the
 *   element's own text content (screen readers, accessible-name queries).
 *   Single shared pattern for every Settings card — do not hand-roll
 *   per-card truncation classes.
 *   Fail-safe behaviour: missing or empty text renders an empty label with
 *   no tooltip (never the words "undefined"/"null", never a crash); any
 *   other value is shown as-is and its tooltip uses its string form.
 * @param {Object} props
 * @param {string} [props.text] - Full text to show; also the default tooltip.
 *   Nullish or empty text renders an empty label with no `title` attribute.
 * @param {string} [props.className] - Extra styling merged after the guard
 *   classes (e.g. font and colour). Non-string values are ignored.
 * @param {string} [props.title] - Tooltip override; defaults to the full text.
 * @param {string} [props.id] - Optional element id (e.g. an `aria-labelledby`
 *   target that must survive the truncation wrapper).
 * @example <TruncatedText text={workflow.name} className="font-bold text-sm text-text-high" />
 ***/
export function TruncatedText({ text, className = '', title, id }) {
  // Guard classes, in plain words: `min-w-0` lets a flex row squeeze this
  // label below the text width; `max-w-full` plus `inline-block` clip it to
  // the parent when it is reused outside a flex row (a width cap has no
  // effect on a plain inline span); `truncate` cuts one line with an
  // ellipsis. Caller styling merges last; anything that is not a string is
  // dropped so a null className can never render as a literal "null" class.
  const extraStyling = typeof className === 'string' ? className : '';
  // The tooltip defaults to the full text, but an empty label gets no
  // tooltip at all (an empty hover box helps nobody); an explicit `title`
  // always wins, even an empty string.
  const tooltipText =
    title ?? (text === null || text === undefined || text === '' ? undefined : String(text));
  return (
    <span id={id} title={tooltipText} className={`min-w-0 max-w-full truncate inline-block ${extraStyling}`.trim()}>
      {text ?? ''}
    </span>
  );
}

/***
 * MARK: TruncatedText default export
 * @description Default entry point for the shared truncation label (same component).
 * @example import TruncatedText from '../common/TruncatedText';
 ***/
export default TruncatedText;
