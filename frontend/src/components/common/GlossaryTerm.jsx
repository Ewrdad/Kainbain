import React from 'react';

/***
 * MARK: GlossaryTerm
 * @description Reusable mechanism for WCAG 2.2 AAA criteria 3.1.3 (Unusual
 * Words) and 3.1.4 (Abbreviations): every potentially unfamiliar term or
 * abbreviation rendered through this component exposes its expanded form
 * and/or definition via the accessible `title`, so users — including screen
 * reader users (the `title` is exposed on the `abbr` element) — can look up
 * any jargon without leaving the page. Authors must still expand a term on
 * first use in long prose; this component is the safety net, not a licence
 * to skip that. Styling inherits the surrounding text colour (contrast-safe
 * by construction) with a dotted underline as the non-colour cue (1.4.1).
 * @param {Object} props
 * @param {string} props.term - Short form as it appears in copy (e.g. "LLM").
 * @param {string} [props.expansion] - Written-out form (e.g. "Large Language Model").
 * @param {string} [props.definition] - One-line glossary definition.
 * @param {React.ReactNode} [props.children] - Visible text (defaults to `term`).
 * @example <GlossaryTerm term="LLM" expansion="Large Language Model" definition="An AI model trained on text that predicts the next word." />
 ***/
export function GlossaryTerm({ term, expansion, definition, children }) {
  const visible = children ?? term;
  const title = [expansion, definition].filter(Boolean).join(' — ') || undefined;
  return (
    <abbr
      title={title}
      className="underline decoration-dotted underline-offset-2 cursor-help"
      data-testid={`glossary-${term}`}
    >
      {visible}
    </abbr>
  );
}

export default GlossaryTerm;
