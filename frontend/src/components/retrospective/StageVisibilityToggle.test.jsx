import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { StageVisibilityToggle } from './StageVisibilityToggle';
import '@testing-library/jest-dom';

/***
 * MARK: StageVisibilityToggle tests
 * @description Locks the stage-type filter panel: collapsed count label,
 *   expanding/collapsing, one checkbox per type with checked state, toggle
 *   and show-all callbacks, and rendering nothing without types.
 ***/
function renderToggle(props = {}) {
  const merged = {
    types: ['agent', 'human', 'ci'],
    hiddenTypes: new Set(),
    onToggle: vi.fn(),
    onShowAll: vi.fn(),
    ...props,
  };
  const rendered = renderWithKainBain(<StageVisibilityToggle {...merged} />);
  return { ...rendered, props: merged };
}

describe('StageVisibilityToggle', () => {
  it('starts collapsed with a shown-count label', () => {
    renderToggle({ hiddenTypes: new Set(['human']) });
    const button = screen.getByRole('button', { name: /Stage types \(2 of 3 shown\)/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('expands to one checked checkbox per type', () => {
    renderToggle({ hiddenTypes: new Set(['ci']) });
    fireEvent.click(screen.getByRole('button', { name: /Stage types/ }));
    expect(screen.getByRole('button', { name: /Stage types/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const group = screen.getByRole('group', { name: 'Stage types to show' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show Agent stages' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Show Human stages' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Show CI stages' })).not.toBeChecked();
  });

  it('collapses again on a second click', () => {
    renderToggle();
    const button = screen.getByRole('button', { name: /Stage types/ });
    fireEvent.click(button);
    expect(screen.getByRole('checkbox', { name: 'Show Agent stages' })).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('calls onToggle with the flipped type', () => {
    const onToggle = vi.fn();
    renderToggle({ onToggle });
    fireEvent.click(screen.getByRole('button', { name: /Stage types/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Human stages' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('human');
  });

  it('offers Show all only while a type is hidden', () => {
    const onShowAll = vi.fn();
    const { unmount } = renderToggle({ onShowAll });
    fireEvent.click(screen.getByRole('button', { name: /Stage types/ }));
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
    unmount();

    renderToggle({ hiddenTypes: new Set(['agent', 'ci']), onShowAll });
    fireEvent.click(screen.getByRole('button', { name: /Stage types \(1 of 3 shown\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without types', () => {
    const { container } = renderToggle({ types: [] });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('stage-visibility-toggle')).not.toBeInTheDocument();
  });

  it('tolerates a missing hidden set', () => {
    renderToggle({ hiddenTypes: undefined });
    fireEvent.click(screen.getByRole('button', { name: /Stage types \(3 of 3 shown\)/ }));
    expect(screen.getByRole('checkbox', { name: 'Show CI stages' })).toBeChecked();
  });
});
