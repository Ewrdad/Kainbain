import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom';
import { MultiSelectDropdown, defaultMultiSelectFilter } from './MultiSelectDropdown';

/***
 * MARK: MultiSelectDropdown tests
 * @description Covers the generic tags-style multi-select: collapsed
 *   trigger, search filtering, toggle select/deselect, chip removal,
 *   Escape/outside-close, and the disabled state.
 ***/

const mockOptions = [
  { value: 'task-a', label: 'Build API', secondary: 'in_stage · #KB-TASK' },
  { value: 'task-b', label: 'Build UI', secondary: 'in_stage · #KB-TAS2' },
  { value: 'task-c', label: 'Write docs', secondary: 'queued · #KB-TAS3' },
  { value: 'task-d', label: 'Retired', secondary: 'completed · #KB-TAS4', disabled: true },
];

function renderControlled(props = {}) {
  function Harness({ onChangeSpy }) {
    const [selected, setSelected] = useState(props.initialSelected || []);
    return (
      <MultiSelectDropdown
        options={mockOptions}
        selected={selected}
        ariaLabel="Prerequisite tasks"
        onChange={(next) => {
          setSelected(next);
          onChangeSpy?.(next);
          props.onChange?.(next);
        }}
        {...props}
      />
    );
  }
  return render(<Harness onChangeSpy={props.onChangeSpy} />);
}

function openDropdown() {
  fireEvent.click(screen.getByRole('button', { name: 'Prerequisite tasks' }));
  return screen.getByRole('listbox');
}

describe('defaultMultiSelectFilter', () => {
  test('returns all options on blank query and narrows on text', () => {
    expect(defaultMultiSelectFilter(mockOptions, '')).toHaveLength(4);
    expect(defaultMultiSelectFilter(mockOptions, 'build')).toHaveLength(2);
    expect(defaultMultiSelectFilter(mockOptions, '#kb-tas2')).toHaveLength(1);
    expect(defaultMultiSelectFilter(mockOptions, 'nope')).toHaveLength(0);
  });
});

test('trigger shows placeholder when empty and count when selected', () => {
  renderControlled({ placeholder: 'Select tasks...', initialSelected: [] });
  expect(screen.getByRole('button', { name: 'Prerequisite tasks' })).toHaveTextContent(
    'Select tasks...',
  );
});

test('opens listbox on trigger click and closes on second click', () => {
  renderControlled();
  const trigger = screen.getByRole('button', { name: 'Prerequisite tasks' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(trigger);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('typing in search narrows options', () => {
  renderControlled({ searchPlaceholder: 'Search tasks...' });
  openDropdown();
  fireEvent.change(screen.getByPlaceholderText('Search tasks...'), {
    target: { value: 'docs' },
  });
  const listbox = screen.getByRole('listbox');
  expect(within(listbox).getByRole('option', { name: 'Write docs' })).toBeInTheDocument();
  expect(within(listbox).queryByRole('option', { name: 'Build API' })).not.toBeInTheDocument();
});

test('clicking an option selects it and keeps the dropdown open', () => {
  const onChange = vi.fn();
  renderControlled({ onChangeSpy: onChange });
  openDropdown();
  fireEvent.click(screen.getByRole('option', { name: 'Build API' }));
  expect(onChange).toHaveBeenCalledWith(['task-a']);
  // Multi-select stays open so the user can pick more
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Prerequisite tasks' })).toHaveTextContent(
    '1 selected',
  );
  // Selected option stays visible as checked
  expect(screen.getByRole('option', { name: 'Build API' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('clicking a selected option deselects it', () => {
  const onChange = vi.fn();
  renderControlled({ onChangeSpy: onChange, initialSelected: ['task-a'] });
  openDropdown();
  fireEvent.click(screen.getByRole('option', { name: 'Build API' }));
  expect(onChange).toHaveBeenCalledWith([]);
});

test('chip remove button deselects without opening the dropdown', () => {
  const onChange = vi.fn();
  renderControlled({ onChangeSpy: onChange, initialSelected: ['task-a'] });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Build API' }));
  expect(onChange).toHaveBeenCalledWith([]);
});

test('disabled options cannot be selected', () => {
  const onChange = vi.fn();
  renderControlled({ onChangeSpy: onChange });
  openDropdown();
  fireEvent.click(screen.getByRole('option', { name: 'Retired' }));
  expect(onChange).not.toHaveBeenCalled();
});

test('Escape closes the dropdown and returns focus to the trigger', () => {
  renderControlled();
  openDropdown();
  const search = screen.getByLabelText('Prerequisite tasks search');
  expect(search).toBeInTheDocument();
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Prerequisite tasks' })).toHaveFocus();
});

test('clicking outside closes the dropdown', () => {
  render(
    <div>
      <button type="button">outside</button>
      <MultiSelectDropdown options={mockOptions} selected={[]} onChange={() => {}} ariaLabel="Prerequisite tasks" />
    </div>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Prerequisite tasks' }));
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('shows no-results text when the query matches nothing', () => {
  renderControlled({ noResultsText: 'No tasks match your search.' });
  openDropdown();
  fireEvent.change(screen.getByLabelText('Prerequisite tasks search'), {
    target: { value: 'zzz-no-such-task' },
  });
  expect(screen.getByText('No tasks match your search.')).toBeInTheDocument();
});

test('shows empty text when there are no options at all', () => {
  render(
    <MultiSelectDropdown
      options={[]}
      selected={[]}
      onChange={() => {}}
      ariaLabel="Prerequisite tasks"
      emptyText="No other active tasks to wait on."
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Prerequisite tasks' }));
  expect(screen.getByText('No other active tasks to wait on.')).toBeInTheDocument();
});

test('disabled dropdown does not open', () => {
  render(
    <MultiSelectDropdown
      options={mockOptions}
      selected={[]}
      onChange={() => {}}
      ariaLabel="Prerequisite tasks"
      disabled
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Prerequisite tasks' });
  expect(trigger).toBeDisabled();
  fireEvent.click(trigger);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('custom filterOptions overrides the default matching', () => {
  const filterOptions = vi.fn((opts) => opts.slice(0, 1));
  const onSearch = vi.fn();
  render(
    <MultiSelectDropdown
      options={mockOptions}
      selected={[]}
      onChange={() => {}}
      ariaLabel="Prerequisite tasks"
      filterOptions={filterOptions}
    />,
  );
  openDropdown();
  expect(filterOptions).toHaveBeenCalledWith(mockOptions, '');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Prerequisite tasks search'), {
    target: { value: 'x' },
  });
  expect(onSearch).not.toHaveBeenCalled(); // onSearch not passed; must not crash
  expect(filterOptions).toHaveBeenLastCalledWith(mockOptions, 'x');
});

test('notifies onSearch on each keystroke', () => {
  const onSearch = vi.fn();
  render(
    <MultiSelectDropdown
      options={mockOptions}
      selected={[]}
      onChange={() => {}}
      ariaLabel="Prerequisite tasks"
      onSearch={onSearch}
    />,
  );
  openDropdown();
  fireEvent.change(screen.getByLabelText('Prerequisite tasks search'), {
    target: { value: 'bu' },
  });
  expect(onSearch).toHaveBeenCalledWith('bu');
});
