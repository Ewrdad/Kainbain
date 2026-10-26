import React from 'react';

/**
 * MARK: modelStatus
 * @description Pure mapping from backend-enriched model objects (see the
 *   /compute/models `runnable` / `authConfigured` / `statusLabel` enrichment)
 *   to the badge metadata and SelectDropdown options shared by the
 *   default-model (ProjectSettings) and stage-model (WorkflowCanvas)
 *   dropdowns.
 *
 *   Badge semantics (mirrors the backend statusLabel vocabulary and the
 *   SubsystemHealthWidget dot classes):
 *     - runnable === true          → emerald dot "Ready"
 *     - authConfigured === false   → slate dot "No credentials"
 *     - authConfigured === true    → amber dot "Unavailable"
 *     - no status info (runtime absent / legacy payload) → NO badge (never
 *       mislead the user about a state we do not know).
 */

/***
 * MARK: modelStatusBadge
 * @description Maps a model's credential status to badge metadata, or null
 *   when the model carries no status info.
 * @example modelStatusBadge({ runnable: true }) => { label: 'Ready', dotClass: 'bg-emerald-400', title: '…' }
 * @param {Object|null} model - Enriched model object from /compute/models.
 * @returns {{ label: string, dotClass: string, title: string }|null}
 ***/
export function modelStatusBadge(model) {
  if (!model || typeof model !== 'object') return null;
  if (model.runnable === true) {
    return {
      label: model.statusLabel || 'Ready',
      dotClass: 'bg-emerald-400',
      title: 'Provider credentials verified — ready to run',
    };
  }
  if (model.authConfigured === false) {
    return {
      label: model.statusLabel || 'No credentials',
      dotClass: 'bg-slate-400',
      title:
        'Provider has no configured credentials — this model cannot run until credentials are added',
    };
  }
  if (model.authConfigured === true) {
    return {
      label: model.statusLabel || 'Unavailable',
      dotClass: 'bg-amber-400',
      title: 'Credentials configured, but the model is not currently available',
    };
  }
  // No status info — deliberately no badge rather than a misleading one.
  return null;
}

/***
 * MARK: modelBadgeNode
 * @description Renders the badge as a React node (dot + label) suitable for
 *   SelectDropdown's existing `option.badge` slot.
 * @example <SelectDropdown options={[{ value, label, badge: modelBadgeNode(model) }]} />
 * @param {Object|null} model - Enriched model object.
 * @returns {React.ReactNode|null}
 ***/
export function modelBadgeNode(model) {
  const badge = modelStatusBadge(model);
  if (!badge) return null;
  return React.createElement(
    'span',
    {
      // text-slate-50 overrides the SelectDropdown badge wrapper's accent
      // `text-primary` color: badge labels must meet the WCAG 2 AAA enhanced
      // contrast threshold (7:1) on the accent-tinted badge background for
      // EVERY accent color, which the accent hue itself cannot guarantee.
      className: 'inline-flex items-center gap-1 text-slate-50',
      title: badge.title,
    },
    React.createElement('span', {
      className: `inline-block w-1.5 h-1.5 rounded-full ${badge.dotClass}`,
      'aria-hidden': 'true',
    }),
    badge.label,
  );
}

/***
 * MARK: modelOptionWithBadge
 * @description Builds a SelectDropdown option for a model, attaching the
 *   credential-status badge when the model carries status info. Mirrors the
 *   composite-key option-value rules of api.js modelOptionValue.
 * @example <SelectDropdown options={models.map(modelOptionWithBadge)} />
 * @param {Object} model - Enriched model object.
 * @returns {{ value: string, label: string, badge?: React.ReactNode }}
 ***/
export function modelOptionWithBadge(model) {
  const value =
    model?.key || (model?.provider ? `${model.provider}::${model.id}` : (model?.id ?? ''));
  const label = `${model?.name || model?.id}${model?.provider ? ` (${model.provider})` : ''}`;
  const badge = modelBadgeNode(model);
  return badge ? { value, label, badge } : { value, label };
}

/***
 * MARK: groupModelsByStatus
 * @description Groups enriched models by their credential status. Useful for
 *   summaries/tests; keys are stable: 'runnable' | 'unavailable' |
 *   'uncredentialed' | 'unknown'.
 * @example groupModelsByStatus(models) => { runnable: [...], unavailable: [...], uncredentialed: [...], unknown: [...] }
 * @param {Array<Object>} models - Enriched model objects.
 * @returns {Object} Model lists keyed by status.
 ***/
export function groupModelsByStatus(models = []) {
  const groups = { runnable: [], unavailable: [], uncredentialed: [], unknown: [] };
  for (const model of Array.isArray(models) ? models : []) {
    if (model?.runnable === true) groups.runnable.push(model);
    else if (model?.authConfigured === false) groups.uncredentialed.push(model);
    else if (model?.authConfigured === true) groups.unavailable.push(model);
    else groups.unknown.push(model);
  }
  return groups;
}
