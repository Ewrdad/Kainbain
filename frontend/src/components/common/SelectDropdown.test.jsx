import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { SelectDropdown, normalizeOptions } from './SelectDropdown';

describe('SelectDropdown Component', () => {
  const mockOptions = [
    { value: 'stage-1', label: 'Discovery Stage', badge: 'AI' },
    { value: 'stage-2', label: 'Implementation Stage', badge: 'AI' },
    { value: 'stage-3', label: 'Review Stage', disabled: true },
    { value: 'stage-4', label: 'Deployment Stage', badge: 'CI' },
  ];

  it('renders trigger button with placeholder when no value is selected', () => {
    render(
      <SelectDropdown
        options={mockOptions}
        placeholder="Choose stage..."
        ariaLabel="Stage Selector"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Stage Selector' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Choose stage...');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the label of the currently selected value', () => {
    render(
      <SelectDropdown
        options={mockOptions}
        value="stage-2"
        ariaLabel="Stage Selector"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Stage Selector' })).toHaveTextContent(
      'Implementation Stage',
    );
  });

  it('opens listbox on click and selects option on option click', () => {
    const onChange = vi.fn();
    render(
      <SelectDropdown
        options={mockOptions}
        value="stage-1"
        onChange={onChange}
        ariaLabel="Stage Selector"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Stage Selector' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Click on option 4
    const option4 = screen.getByRole('option', { name: /Deployment Stage/i });
    expect(option4).toBeInTheDocument();
    fireEvent.click(option4);

    expect(onChange).toHaveBeenCalledWith('stage-4', expect.objectContaining({ value: 'stage-4' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not select disabled options on click', () => {
    const onChange = vi.fn();
    render(
      <SelectDropdown
        options={mockOptions}
        value="stage-1"
        onChange={onChange}
        ariaLabel="Stage Selector"
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    const disabledOption = screen.getByRole('option', { name: /Review Stage/i });
    fireEvent.click(disabledOption);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('supports full keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)', () => {
    const onChange = vi.fn();
    render(
      <SelectDropdown
        options={mockOptions}
        value="stage-1"
        onChange={onChange}
        ariaLabel="Stage Selector"
      />,
    );

    const trigger = screen.getByRole('combobox');

    // Press ArrowDown to open
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // ArrowDown moves from stage-1 to stage-2
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    // Press Enter to select
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('stage-2', expect.objectContaining({ value: 'stage-2' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Reopen and test Escape to close
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('normalizes options from children <option> and <optgroup>', () => {
    const onChange = vi.fn();
    render(
      <SelectDropdown value="b" onChange={onChange} ariaLabel="Children Select">
        <optgroup label="Group 1">
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
        </optgroup>
        <optgroup label="Group 2">
          <option value="c">Gamma</option>
        </optgroup>
      </SelectDropdown>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Beta');

    fireEvent.click(trigger);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Group 2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Gamma'));
    expect(onChange).toHaveBeenCalledWith('c', expect.objectContaining({ value: 'c' }));
  });

  it('closes dropdown when clicking outside', () => {
    render(
      <div>
        <span data-testid="outside-el">Outside</span>
        <SelectDropdown options={mockOptions} value="stage-1" />
      </div>,
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-el'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('respects disabled prop and prevents opening', () => {
    render(<SelectDropdown options={mockOptions} value="stage-1" disabled />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();

    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders listbox in portal attached to document.body and escapes overflow-hidden container', () => {
    // Mount SelectDropdown inside a constrained overflow-hidden parent (simulating stage column or inspector drawer)
    const { container } = render(
      <div
        data-testid="overflow-container"
        style={{ overflow: 'hidden', height: '40px', width: '120px', position: 'relative' }}
      >
        <SelectDropdown
          options={mockOptions}
          value="stage-1"
          ariaLabel="Constrained Dropdown"
        />
      </div>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Constrained Dropdown' });
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Verify listbox is a child of document.body (React portal) and NOT trapped inside overflow container
    const overflowContainer = screen.getByTestId('overflow-container');
    expect(overflowContainer.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);

    // Ensure style has fixed position and high z-index
    expect(listbox.style.position).toBe('fixed');
    expect(listbox.style.zIndex).toBe('9999');
  });

  it('supports Home, End, and type-ahead keyboard navigation', () => {
    const onChange = vi.fn();
    render(
      <SelectDropdown
        options={mockOptions}
        value="stage-2"
        onChange={onChange}
        ariaLabel="Nav Selector"
      />,
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // Home jumps to first enabled option (stage-1)
    fireEvent.keyDown(trigger, { key: 'Home' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('stage-1', expect.objectContaining({ value: 'stage-1' }));

    // Reopen and test End jumps to last enabled option (stage-4)
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'End' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('stage-4', expect.objectContaining({ value: 'stage-4' }));

    // Reopen and test type-ahead: pressing 'r' (Review is disabled, but if typing 'd' -> Deployment)
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'd' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('stage-4', expect.objectContaining({ value: 'stage-4' }));
  });

  it('recalculates portal positioning on window resize and scroll events', () => {
    render(<SelectDropdown options={mockOptions} value="stage-1" />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Trigger scroll and resize events
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders with custom variant and size styles', () => {
    render(
      <SelectDropdown
        options={mockOptions}
        value="stage-1"
        variant="ochre"
        size="lg"
        mono={true}
        ariaLabel="Themed Dropdown"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Themed Dropdown' });
    expect(trigger.className).toContain('text-ochre');
    expect(trigger.className).toContain('min-h-[44px]');
    expect(trigger.className).toContain('font-mono');
  });
  it('renders grouped options with accessible group headers (not options)', () => {
    const groupedOptions = [
      { value: 'deepseek', label: 'DeepSeek Flash', group: 'ollama-cloud' },
      { value: 'gpt-oss', label: 'GPT-OSS 20B', group: 'ollama-cloud' },
      { value: 'gemini-pro', label: 'Gemini 2.5 Pro', group: 'google' },
    ];
    render(<SelectDropdown options={groupedOptions} ariaLabel="Model Picker" />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Model Picker' }));
    const listbox = screen.getByRole('listbox');

    // Group headers are labelled groups, not selectable options.
    const ollamaHeader = screen.getByText('ollama-cloud');
    expect(ollamaHeader).toHaveAttribute('role', 'group');
    expect(ollamaHeader).toHaveAttribute('aria-label', 'ollama-cloud');
    const googleHeader = screen.getByText('google');
    expect(googleHeader).toHaveAttribute('role', 'group');
    // Only the three real options carry role="option".
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
  });

  it('keyboard navigation always targets a real option, never a group header', () => {
    const groupedOptions = [
      { value: 'deepseek', label: 'DeepSeek Flash', group: 'ollama-cloud' },
      { value: 'gpt-oss', label: 'GPT-OSS 20B', group: 'ollama-cloud' },
      { value: 'gemini-pro', label: 'Gemini 2.5 Pro', group: 'google' },
    ];
    render(<SelectDropdown options={groupedOptions} ariaLabel="Model Picker" />);

    const trigger = screen.getByRole('combobox', { name: 'Model Picker' });
    fireEvent.click(trigger);

    const optionIds = () =>
      screen
        .getAllByRole('option')
        .map((o) => o.id);
    const validIds = optionIds();

    // Walk down through every position and back up; at each step the
    // activedescendant must reference an element with role="option".
    for (let i = 0; i < 6; i += 1) {
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      const active = trigger.getAttribute('aria-activedescendant');
      if (active) expect(validIds).toContain(active);
    }
    for (let i = 0; i < 6; i += 1) {
      fireEvent.keyDown(trigger, { key: 'ArrowUp' });
      const active = trigger.getAttribute('aria-activedescendant');
      if (active) expect(validIds).toContain(active);
    }
  });

  it('type-ahead lands on the first option whose label matches, skipping headers', () => {
    const groupedOptions = [
      { value: 'deepseek', label: 'DeepSeek Flash', group: 'ollama-cloud' },
      { value: 'gemini-pro', label: 'Gemini 2.5 Pro', group: 'google' },
      { value: 'gemma', label: 'Gemma 4', group: 'google' },
    ];
    render(<SelectDropdown options={groupedOptions} ariaLabel="Model Picker" />);

    const trigger = screen.getByRole('combobox', { name: 'Model Picker' });
    fireEvent.click(trigger);

    // Type "g": the first option whose label starts with "g" is Gemini 2.5
    // Pro (the first option of the google group); the ollama-cloud header is
    // never a match target.
    fireEvent.keyDown(trigger, { key: 'g' });
    const active = trigger.getAttribute('aria-activedescendant');
    const activeOption = document.getElementById(active);
    expect(activeOption).toHaveTextContent('Gemini 2.5 Pro');
    expect(activeOption).toHaveAttribute('role', 'option');
  });
});
