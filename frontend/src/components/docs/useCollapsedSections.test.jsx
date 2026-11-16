import React from 'react';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DOCS_SIDEBAR_STORAGE_KEY } from './docsSections';
import { useCollapsedSections, readStoredCollapsed } from './useCollapsedSections';
import '@testing-library/jest-dom';

/***
 * MARK: useCollapsedSections tests
 * @description Verifies the persisted sidebar collapse state: groups start
 *   expanded, toggling flips one group, choices survive remount via
 *   localStorage, corrupt payloads fall back to expanded, and a storage
 *   failure never breaks the toggle.
 ***/

function Probe() {
  const { collapsed, toggle } = useCollapsedSections();
  return (
    <div>
      <span data-testid="collapsed">{[...collapsed].sort().join(',')}</span>
      <button type="button" onClick={() => toggle('concepts')}>
        toggle-concepts
      </button>
      <button type="button" onClick={() => toggle('workflows')}>
        toggle-workflows
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

test('groups start expanded with no stored choice', () => {
  render(<Probe />);
  expect(screen.getByTestId('collapsed')).toHaveTextContent('');
});

test('toggling collapses one group without touching the others', () => {
  render(<Probe />);
  fireEvent.click(screen.getByRole('button', { name: 'toggle-concepts' }));
  expect(screen.getByTestId('collapsed')).toHaveTextContent('concepts');
  expect(JSON.parse(window.localStorage.getItem(DOCS_SIDEBAR_STORAGE_KEY))).toEqual(['concepts']);
  fireEvent.click(screen.getByRole('button', { name: 'toggle-workflows' }));
  expect(screen.getByTestId('collapsed')).toHaveTextContent('concepts,workflows');
  fireEvent.click(screen.getByRole('button', { name: 'toggle-concepts' }));
  expect(screen.getByTestId('collapsed')).toHaveTextContent('workflows');
});

test('collapsed choice survives a remount', () => {
  const first = render(<Probe />);
  fireEvent.click(screen.getByRole('button', { name: 'toggle-concepts' }));
  expect(screen.getByTestId('collapsed')).toHaveTextContent('concepts');
  first.unmount();
  render(<Probe />);
  expect(screen.getByTestId('collapsed')).toHaveTextContent('concepts');
});

test('corrupt or non-array payloads fall back to all-expanded', () => {
  window.localStorage.setItem(DOCS_SIDEBAR_STORAGE_KEY, 'not-json{{{');
  const first = render(<Probe />);
  expect(screen.getByTestId('collapsed')).toHaveTextContent('');
  first.unmount();
  window.localStorage.setItem(DOCS_SIDEBAR_STORAGE_KEY, JSON.stringify({ concepts: true }));
  render(<Probe />);
  expect(screen.getByTestId('collapsed')).toHaveTextContent('');
});

test('readStoredCollapsed ignores unknown and empty ids without throwing', () => {
  window.localStorage.setItem(
    DOCS_SIDEBAR_STORAGE_KEY,
    JSON.stringify(['concepts', '', 42, null, 'retired-group']),
  );
  expect(readStoredCollapsed()).toEqual(new Set(['concepts', 'retired-group']));
});

function JunkProbe() {
  const { collapsed, toggle } = useCollapsedSections();
  return (
    <div>
      <span data-testid="junk-collapsed">{[...collapsed].sort().join(',')}</span>
      <button type="button" onClick={() => toggle('')}>
        toggle-empty
      </button>
      <button type="button" onClick={() => toggle(42)}>
        toggle-nonsense
      </button>
      <button type="button" onClick={() => toggle(null)}>
        toggle-null
      </button>
    </div>
  );
}

test('toggle ignores empty or non-string ids without touching storage', () => {
  render(<JunkProbe />);
  fireEvent.click(screen.getByRole('button', { name: 'toggle-empty' }));
  fireEvent.click(screen.getByRole('button', { name: 'toggle-nonsense' }));
  fireEvent.click(screen.getByRole('button', { name: 'toggle-null' }));
  expect(screen.getByTestId('junk-collapsed')).toHaveTextContent('');
  expect(window.localStorage.getItem(DOCS_SIDEBAR_STORAGE_KEY)).toBeNull();
});

test('a storage write failure never breaks the toggle', () => {
  const setItem = vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded');
  });
  render(<Probe />);
  expect(() => {
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle-concepts' }));
    });
  }).not.toThrow();
  expect(screen.getByTestId('collapsed')).toHaveTextContent('concepts');
  setItem.mockRestore();
});
