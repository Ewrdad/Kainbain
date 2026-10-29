import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { SettingsSearchInput } from './SettingsSearchInput';
import '@testing-library/jest-dom';

/***
 * MARK: SettingsSearchInput tests
 * @description Verifies the settings search box: typing shows matches with
 *   tab names, keyboard navigation and Enter select a result, Escape closes
 *   the dropdown, and clicking a result calls onSelect.
 ***/
describe('SettingsSearchInput', () => {
  it('shows matching results with tab names while typing', () => {
    renderWithKainBain(<SettingsSearchInput onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search settings'), {
      target: { value: 'git' },
    });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Git Repository URL')).toBeInTheDocument();
    // Results name their home tab.
    expect(screen.getAllByText('Files & Repos').length).toBeGreaterThan(0);
  });

  it('shows no dropdown for a blank query or no matches', () => {
    renderWithKainBain(<SettingsSearchInput onSelect={vi.fn()} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search settings'), {
      target: { value: 'zzz-no-such-setting' },
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects the highlighted result on Enter', () => {
    const onSelect = vi.fn();
    renderWithKainBain(<SettingsSearchInput onSelect={onSelect} />);
    const input = screen.getByLabelText('Search settings');
    fireEvent.change(input, { target: { value: 'git' } });
    // Move past the first result, then jump.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].tab).toBe('files');
    // Choosing clears the query and closes the dropdown.
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ArrowUp wraps to the last result', () => {
    const onSelect = vi.fn();
    renderWithKainBain(<SettingsSearchInput onSelect={onSelect} />);
    const input = screen.getByLabelText('Search settings');
    fireEvent.change(input, { target: { value: 'git' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Enter jumps to the top result even after the dropdown is dismissed', () => {
    const onSelect = vi.fn();
    renderWithKainBain(<SettingsSearchInput onSelect={onSelect} />);
    const input = screen.getByLabelText('Search settings');
    fireEvent.change(input, { target: { value: 'git' } });
    // Dismiss with Escape (text stays), then Enter still follows the top hit.
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: 'git-repo', tab: 'files' });
  });

  it('clears aria-activedescendant when the dropdown closes', () => {
    renderWithKainBain(<SettingsSearchInput onSelect={vi.fn()} />);
    const input = screen.getByLabelText('Search settings');
    fireEvent.change(input, { target: { value: 'git' } });
    // While open, the active descendant names the highlighted option.
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      'project-settings-search-option-git-repo',
    );
    fireEvent.keyDown(input, { key: 'Escape' });
    // Closed dropdowns must not reference a removed option id.
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('Escape closes the dropdown without selecting', () => {
    const onSelect = vi.fn();
    renderWithKainBain(<SettingsSearchInput onSelect={onSelect} />);
    const input = screen.getByLabelText('Search settings');
    fireEvent.change(input, { target: { value: 'git' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking a result calls onSelect with the entry', () => {
    const onSelect = vi.fn();
    renderWithKainBain(<SettingsSearchInput onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText('Search settings'), {
      target: { value: 'accent' },
    });
    fireEvent.mouseDown(screen.getByText('Accent Theme Color'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: 'accent-color', tab: 'project' });
  });
});
