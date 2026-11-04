// jsdom pin: native select/option semantics (matches the StageSkillsPanel suite).
// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import {
  ProviderKeywordSelect,
  providerSelectOptions,
  fallbackSelectOptions,
  IMAGE_GEN_NONE_VALUE,
} from './ProviderKeywordSelect';
import '@testing-library/jest-dom';

/***
 * MARK: ProviderKeywordSelect tests
 * @description Verifies the image-gen provider dropdown: registry options with
 *   a none-first row and honest no-key flags, the static-enum offline
 *   fallback, legacy unknown-value preservation, and change propagation.
 ***/

const catalogueClient = (providers) => ({
  getImageGenProviders: vi.fn(async () => ({ providers })),
});

test('providerSelectOptions puts none first and flags keyless providers', () => {
  const options = providerSelectOptions([
    { id: 'muse', label: 'Muse Image (Meta)', requiresKey: true, configured: false },
    { id: 'mock', label: 'Mock (offline tests)', requiresKey: false, configured: true },
  ]);
  expect(options.map((o) => o.value)).toEqual(['none', 'muse', 'mock']);
  expect(options[0].label).toBe('None (no image questions)');
  expect(options[1].label).toBe('Muse Image (Meta) — no key saved');
  expect(options[2].label).toBe('Mock (offline tests)');
});

test('fallbackSelectOptions renders the static enum with a none label', () => {
  expect(fallbackSelectOptions(['none', 'muse']).map((o) => o.value)).toEqual(['none', 'muse']);
  expect(fallbackSelectOptions([])).toEqual([
    { value: 'none', label: 'None (no image questions)' },
  ]);
});

test('renders registry options and propagates changes', async () => {
  const onChange = vi.fn();
  renderWithKainBain(
    <ProviderKeywordSelect
      value=""
      defaultValue={IMAGE_GEN_NONE_VALUE}
      onChange={onChange}
      ariaLabel="Keyword imageGen for question-me"
      fallbackEnum={['none', 'muse', 'mock']}
      client={catalogueClient([
        { id: 'muse', label: 'Muse Image (Meta)', requiresKey: true, configured: true },
        { id: 'mock', label: 'Mock (offline tests)', requiresKey: false, configured: true },
      ])}
    />,
  );
  const select = screen.getByLabelText('Keyword imageGen for question-me');
  await waitFor(() => expect(select.options.length).toBe(3));
  expect(select.value).toBe('none');
  fireEvent.change(select, { target: { value: 'muse' } });
  expect(onChange).toHaveBeenCalledWith('muse');
});

test('falls back to the static enum when the catalogue is unreachable', async () => {
  const client = { getImageGenProviders: vi.fn(async () => { throw new Error('down'); }) };
  renderWithKainBain(
    <ProviderKeywordSelect
      value="muse"
      onChange={() => {}}
      ariaLabel="Keyword imageGen for question-me"
      fallbackEnum={['none', 'muse']}
      client={client}
    />,
  );
  const select = screen.getByLabelText('Keyword imageGen for question-me');
  await waitFor(() => expect(select.options.length).toBe(2));
  expect(select.value).toBe('muse');
});

test('preserves a stored value that matches no known provider', () => {
  renderWithKainBain(
    <ProviderKeywordSelect
      value="future-provider"
      onChange={() => {}}
      ariaLabel="Keyword imageGen for question-me"
      fallbackEnum={['none', 'muse']}
      client={{}}
    />,
  );
  const select = screen.getByLabelText('Keyword imageGen for question-me');
  expect(select.value).toBe('future-provider');
  expect(screen.getByText('future-provider (unknown provider)')).toBeInTheDocument();
});
