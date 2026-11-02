import { useEffect, useState } from 'react';
import { api } from '../../services/api';

/***
 * MARK: IMAGE_GEN_NONE_VALUE
 * @description Stored value meaning "no image generation" — the skill's
 *   image-question section is removed from the agent prompt entirely.
 * @example IMAGE_GEN_NONE_VALUE => 'none'
 ***/
export const IMAGE_GEN_NONE_VALUE = 'none';

/***
 * MARK: IMAGE_GEN_NONE_LABEL
 * @description Dropdown label for the none option.
 * @example IMAGE_GEN_NONE_LABEL => 'None (no image questions)'
 ***/
export const IMAGE_GEN_NONE_LABEL = 'None (no image questions)';

/***
 * MARK: providerSelectOptions
 * @description Builds select options from the backend provider catalogue:
 *   `none` first, then every registered provider (flagging key-backed
 *   providers with no saved key so the choice is honest before saving).
 * @example providerSelectOptions([{ id: 'muse', label: 'Muse', requiresKey: true, configured: false }])[1].label => 'Muse — no key saved'
 * @param {Array<Object>} [providers] - Catalogue entries ({ id, label, requiresKey, configured }).
 * @returns {Array<{ value: string, label: string }>}
 ***/
export const providerSelectOptions = (providers) => {
  const options = [{ value: IMAGE_GEN_NONE_VALUE, label: IMAGE_GEN_NONE_LABEL }];
  for (const provider of Array.isArray(providers) ? providers : []) {
    if (!provider || typeof provider.id !== 'string' || !provider.id) continue;
    if (provider.id === IMAGE_GEN_NONE_VALUE) continue;
    const label = String(provider.label || provider.id);
    const needsKey = provider.requiresKey === true && provider.configured !== true;
    options.push({ value: provider.id, label: needsKey ? `${label} — no key saved` : label });
  }
  return options;
};

/***
 * MARK: fallbackSelectOptions
 * @description Offline fallback options from the keyword's static `enum`
 *   metadata (used before the catalogue loads and when it fails).
 * @example fallbackSelectOptions(['none', 'muse']).map((o) => o.value) => ['none', 'muse']
 * @param {Array<string>} [enumValues] - Static enum from KB_config.
 * @returns {Array<{ value: string, label: string }>}
 ***/
export const fallbackSelectOptions = (enumValues) => {
  const values = Array.isArray(enumValues) && enumValues.length > 0 ? enumValues : [IMAGE_GEN_NONE_VALUE];
  const options = [];
  for (const raw of values) {
    if (typeof raw !== 'string' || !raw) continue;
    options.push({
      value: raw,
      label: raw === IMAGE_GEN_NONE_VALUE ? IMAGE_GEN_NONE_LABEL : raw,
    });
  }
  if (options.length === 0) {
    options.push({ value: IMAGE_GEN_NONE_VALUE, label: IMAGE_GEN_NONE_LABEL });
  }
  return options;
};

/***
 * MARK: ProviderKeywordSelect
 * @description Native select for a `provider-select` skill keyword (the
 *   question-me `imageGen` setting): options load from the backend image-gen
 *   registry with the keyword's static enum as the offline fallback. A stored
 *   value matching no known option is kept as an "unknown provider" row so a
 *   legacy or hand-edited config is never silently dropped by the control.
 * @example <ProviderKeywordSelect value="none" onChange={() => {}} ariaLabel="Keyword imageGen" />
 * @param {Object} props
 * @param {string} [props.value] - Stored override (wins over the default).
 * @param {string} [props.defaultValue] - KB_config default value.
 * @param {Function} [props.onChange] - Called with the next provider id.
 * @param {string} [props.ariaLabel] - Accessible label.
 * @param {Array<string>} [props.fallbackEnum] - Static enum fallback.
 * @param {Object} [props.client] - API client override (tests); defaults to the app client.
 ***/
export function ProviderKeywordSelect({
  value,
  defaultValue,
  onChange,
  ariaLabel,
  fallbackEnum,
  client,
}) {
  const http = client || api;
  const [catalogue, setCatalogue] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loader = http?.getImageGenProviders;
    if (typeof loader !== 'function') {
      setCatalogue([]);
      return undefined;
    }
    loader
      .call(http)
      .then(
        (data) => {
          if (cancelled) return;
          setCatalogue(Array.isArray(data?.providers) ? data.providers : []);
        },
        () => {
          if (!cancelled) setCatalogue([]);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [http]);

  const base =
    catalogue && catalogue.length > 0
      ? providerSelectOptions(catalogue)
      : fallbackSelectOptions(fallbackEnum);
  const stored = typeof value === 'string' && value ? value : '';
  const fallbackDefault = typeof defaultValue === 'string' && defaultValue ? defaultValue : IMAGE_GEN_NONE_VALUE;
  const effective = stored || fallbackDefault;
  const known = base.some((option) => option.value === effective);
  const options = known
    ? base
    : [...base, { value: effective, label: `${effective} (unknown provider)` }];

  return (
    <select
      aria-label={ariaLabel || 'Image generation provider'}
      value={effective}
      onChange={(e) => onChange?.(e.target.value)}
      className="flex-1 p-1 bg-surface border border-border-standard rounded-sm text-[9px] font-mono text-on-surface outline-none focus:border-primary cursor-pointer"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
