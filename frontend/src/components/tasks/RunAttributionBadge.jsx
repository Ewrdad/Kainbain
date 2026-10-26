/***
 * MARK: formatRunAttribution
 * @description Renders a timeline row's resolved run choice as one small
 *   muted footnote: `harness · model`, plus `· alias <name>` when a model
 *   alias resolved the pick. Returns null when the row carries no harness
 *   and no model — CI / merge / deploy / human rows render absolutely
 *   nothing (never "no model" or "automated" placeholders).
 * @example formatRunAttribution({ harnessId: 'pi', modelRef: 'mistral::large' }) => 'pi · mistral::large'
 * @example formatRunAttribution({ harnessId: 'pi', modelRef: 'glm', aliasName: 'worker' }) => 'pi · glm · alias worker'
 * @example formatRunAttribution({ stage: 'CI' }) => null
 * @param {Object} [entry] - Timeline entry.
 * @returns {string|null} Badge text, or null when unattributed.
 ***/
export function formatRunAttribution(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const harnessId = clean(entry.harnessId);
  const modelRef = clean(entry.modelRef);
  if (!harnessId && !modelRef) return null;
  const aliasName = clean(entry.aliasName);
  const parts = [harnessId, modelRef, aliasName ? `alias ${aliasName}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function RunAttributionBadge({ entry }) {
  const label = formatRunAttribution(entry);
  if (!label) return null;
  const expansion = [
    `harness: ${entry?.harnessId || 'unknown'}`,
    `model: ${entry?.modelRef || 'unknown'}`,
    entry?.aliasName ? `alias: ${entry.aliasName}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const tooltip = `Stage run attribution — ${expansion}`;
  return (
    <>
      {' • '}
      {/*
        `<abbr>` + title is the app's GlossaryTerm mechanism for jargon
        (WCAG 3.1.4 Abbreviations): the expansion of `harness · model`
        reaches assistive technology when the value is read, and the visible
        text/design stays byte-identical (no added underline or glyph). A
        plain span's `title` was hover-only and left screen readers with the
        raw ids alone.
      */}
      <abbr className="font-mono no-underline" title={tooltip}>
        {label}
      </abbr>
    </>
  );
}
