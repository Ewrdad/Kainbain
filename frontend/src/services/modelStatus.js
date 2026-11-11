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
 * MARK: fleetCountBadgeNode
 * @description Renders fleet availability as a React node (dot + label)
 *   suitable for SelectDropdown's existing `option.badge` slot: the number
 *   of claim-eligible Runners serving the model id ("2 runners", "1
 *   runner", "No runners"). This replaces credential-health badges in the
 *   stage, default, and alias pickers — availability is judged by the
 *   fleet, not by backend-host credentials. Unknown ids (not in the fleet
 *   catalogue) render "No runners": honest, never blocking. The label text
 *   itself announces the count (screen-reader friendly, no title needed).
 * @example fleetCountBadgeNode({ runnerCount: 2, runnerIds: ['r1', 'r2'] })
 * @param {Object|null} info - Fleet entry (`{ runnerCount, runnerIds }`).
 * @returns {React.ReactNode} The badge node.
 ***/
export function fleetCountBadgeNode(info) {
  const count =
    info && typeof info.runnerCount === 'number' && info.runnerCount > 0
      ? info.runnerCount
      : 0;
  const label = count === 0 ? 'No runners' : `${count} runner${count === 1 ? '' : 's'}`;
  const dotClass = count === 0 ? 'bg-slate-400' : 'bg-emerald-400';
  return React.createElement(
    'span',
    {
      className: 'inline-flex items-center gap-1 text-slate-50',
    },
    React.createElement('span', {
      className: `inline-block w-1.5 h-1.5 rounded-full ${dotClass}`,
      'aria-hidden': 'true',
    }),
    label,
  );
}

/***
 * MARK: fleetInfoForModel
 * @description Resolves one catalogue model to its fleet availability entry.
 *   Tries the dropdown option value first (composite `harness::provider::id`
 *   key), then the model's own key forms — runner-advertised ids use the
 *   same key grammar, so exact matches dedupe across machines. Returns null
 *   when the id is served by no Runner (pickers render "No runners").
 * @example fleetInfoForModel({ 'pi::g::m': { runnerCount: 1 } }, { key: 'pi::g::m', provider: 'g', id: 'm' }, 'pi::g::m')
 *   => { runnerCount: 1 }
 * @param {Object} [counts={}] - Fleet map from `fleetCountsById`.
 * @param {Object|null} [model] - Catalogue model (`key`/`provider`/`id`).
 * @param {string} [optionValue] - Dropdown option value (composite key).
 * @returns {Object|null} Fleet entry or null.
 ***/
export function fleetInfoForModel(counts, model, optionValue) {
  if (!counts || typeof counts !== 'object') return null;
  const candidates = [];
  if (typeof optionValue === 'string' && optionValue) candidates.push(optionValue);
  if (model && typeof model === 'object') {
    if (typeof model.key === 'string' && model.key) candidates.push(model.key);
    if (typeof model.provider === 'string' && typeof model.id === 'string' && model.provider && model.id) {
      candidates.push(`${model.provider}::${model.id}`);
    }
    if (typeof model.id === 'string' && model.id) candidates.push(model.id);
  }
  for (const candidate of candidates) {
    // eslint-disable-next-line security/detect-object-injection -- candidate is a catalogue model id
    if (Object.hasOwn(counts, candidate)) return counts[candidate];
  }
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

/***
 * MARK: fleetSnapshotBadge
 * @description Maps a central-catalogue model's fleet availability to badge
 *   metadata, or null when the entry is available (or carries no verdict).
 *   An explicit `available: false` (the persisted snapshot marking a model
 *   no claim-eligible Runner serves right now) renders "Unavailable" with
 *   the snapshot's reason as the tooltip — marked, never hidden, never
 *   normal-looking. Entries without the field (backend-served models,
 *   older backends) stay badge-free here; other badge layers judge them.
 * @example fleetSnapshotBadge({ available: false, unavailableReason: 'No runner' }) => { label: 'Unavailable', … }
 * @param {Object|null} model - Catalogue model from /compute/models.
 * @returns {{ label: string, dotClass: string, title: string }|null}
 ***/
export function fleetSnapshotBadge(model) {
  if (!model || typeof model !== 'object') return null;
  if (model.available !== false) return null;
  return {
    label: 'Unavailable',
    dotClass: 'bg-amber-400',
    title:
      typeof model.unavailableReason === 'string' && model.unavailableReason
        ? model.unavailableReason
        : 'No claim-eligible Runner serves this model right now',
  };
}

/***
 * MARK: fleetSnapshotBadgeNode
 * @description Renders the fleet-snapshot verdict as a React node (dot +
 *   label) suitable for SelectDropdown's existing `option.badge` slot, or
 *   null when the entry carries no unavailable verdict. Pickers check this
 *   FIRST, before fleet-count and credential-health badges: the snapshot's
 *   explicit unavailable marker is authoritative for its entry and carries
 *   the reason, so it must never be covered by a vaguer badge.
 * @example <SelectDropdown options={[{ value, label, badge: fleetSnapshotBadgeNode(model) }]} />
 * @param {Object|null} model - Catalogue model from /compute/models.
 * @returns {React.ReactNode|null}
 ***/
export function fleetSnapshotBadgeNode(model) {
  const badge = fleetSnapshotBadge(model);
  if (!badge) return null;
  return React.createElement(
    'span',
    {
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
