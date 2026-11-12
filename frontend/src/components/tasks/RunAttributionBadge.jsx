/***
 * MARK: formatRunAttribution
 * @description Renders a timeline row's resolved run choice as one small
 *   muted footnote: `harness · model`, plus `· alias <name>` when a model
 *   alias resolved the pick, plus `· runner <id>` when a remote Runner ran
 *   the stage (a Runner-run CI/merge row carries no harness/model, so the
 *   Runner itself is the whole label). Returns null when the row carries
 *   no harness, no model, and no Runner — embedded CI / merge / deploy /
 *   human rows render absolutely nothing (never "no model" or "automated"
 *   placeholders).
 * @example formatRunAttribution({ harnessId: 'pi', modelRef: 'mistral::large' }) => 'pi · mistral::large'
 * @example formatRunAttribution({ harnessId: 'pi', modelRef: 'glm', aliasName: 'worker' }) => 'pi · glm · alias worker'
 * @example formatRunAttribution({ harnessId: 'pi', modelRef: 'glm', runnerId: 'local-alpha' }) => 'pi · glm · runner local-alpha'
 * @example formatRunAttribution({ runnerId: 'local-alpha' }) => 'runner local-alpha'
 * @example formatRunAttribution({ stage: 'CI' }) => null
 * @param {Object} [entry] - Timeline entry.
 * @returns {string|null} Badge text, or null when unattributed.
 ***/
export function formatRunAttribution(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const harnessId = clean(entry.harnessId);
  const modelRef = clean(entry.modelRef);
  const aliasName = clean(entry.aliasName);
  const runnerId = clean(entry.runnerId);
  // An alias name alone never names a run (same rule as the backend
  // attribution shape): it only rides along once a harness or model does.
  const hasRunChoice = Boolean(harnessId || modelRef);
  const parts = [
    harnessId,
    modelRef,
    hasRunChoice && aliasName ? `alias ${aliasName}` : null,
    runnerId ? `runner ${runnerId}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function RunAttributionBadge({ entry }) {
  const label = formatRunAttribution(entry);
  if (!label) return null;
  const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const expansion = [
    `harness: ${clean(entry?.harnessId) || 'unknown'}`,
    `model: ${clean(entry?.modelRef) || 'unknown'}`,
    clean(entry?.aliasName) ? `alias: ${clean(entry.aliasName)}` : null,
    clean(entry?.runnerId) ? `runner: ${clean(entry.runnerId)}` : null,
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
