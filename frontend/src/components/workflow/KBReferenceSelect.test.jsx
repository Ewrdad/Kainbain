import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithKainBain } from '../../testUtils';
import { KainBainContext } from '../../context/KainBainContext';
import { KBReferenceSelect, buildKnownOptions, isTemplateValue } from './KBReferenceSelect';
import '@testing-library/jest-dom';

/***
 * MARK: KBReferenceSelect tests
 * @description Verifies the cascading KB-entity selector: canonical id writes,
 *   option labels "Name (id)", the {{project}} built-in option, the
 *   "Enter value manually…" fallback (apply/cancel, Enter/Escape), custom
 *   (legacy) value display with badge, disabled/loading/error cascade states
 *   with retry, empty-state guidance, and the KB_config default helper line.
 ***/

const projects = [
  { id: 'proj-1', name: 'Alpha', slug: 'alpha' },
  { id: 'proj-2', name: 'Beta', slug: 'beta' },
];

const workflows = [
  {
    id: 'wf-default',
    name: 'Feature Pipeline',
    isDefault: true,
    stages: [
      { id: 'stage-idea', name: 'Idea' },
      { id: 'stage-plan', name: 'Plan' },
    ],
  },
  {
    id: 'wf-hotfix',
    name: 'Hotfix',
    isDefault: false,
    stages: [{ id: 'stage-ship', name: 'Ship' }],
  },
];

function renderSelect(overrides = {}) {
  const props = {
    kind: 'workflow',
    entities: { workflows },
    value: '',
    onChange: vi.fn(),
    ariaLabel: 'Target workflow',
    ...overrides,
  };
  renderWithKainBain(<KBReferenceSelect {...props} />);
  return props;
}

function openDropdown(label) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
});

describe('buildKnownOptions', () => {
  test('renders Name (id) labels and a default-workflow badge', () => {
    const opts = buildKnownOptions('workflow', { workflows });
    expect(opts).toHaveLength(2);
    expect(opts[0]).toMatchObject({
      value: 'wf-default',
      label: 'Feature Pipeline (wf-default)',
      badge: 'default',
      description: 'default workflow',
    });
    expect(opts[1]).toMatchObject({ value: 'wf-hotfix', label: 'Hotfix (wf-hotfix)', badge: null });
  });

  test('degrades gracefully for odd entities shapes', () => {
    expect(buildKnownOptions('workflow', null)).toEqual([]);
    expect(buildKnownOptions('workflow', { workflows: 'nope' })).toEqual([]);
    expect(buildKnownOptions('workflow', { workflows: [null, { id: 'wf-1' }] })).toEqual([
      { value: 'wf-1', label: 'wf-1', description: null, badge: null, entity: { id: 'wf-1' } },
    ]);
  });
});

describe('isTemplateValue', () => {
  test('detects {{...}} templates', () => {
    expect(isTemplateValue('{{project}}')).toBe(true);
    expect(isTemplateValue('wf-default')).toBe(false);
    expect(isTemplateValue('')).toBe(false);
    expect(isTemplateValue(42)).toBe(false);
  });
});

describe('selection', () => {
  test('lists known entities and writes the canonical id on selection', async () => {
    const props = renderSelect();
    openDropdown('Target workflow');
    fireEvent.click(screen.getByRole('option', { name: /Hotfix \(wf-hotfix\)/ }));
    await waitFor(() => {
      expect(props.onChange).toHaveBeenCalledWith('wf-hotfix');
    });
  });

  test('shows the stored id with its human-readable label and default badge', () => {
    renderSelect({ value: 'wf-default' });
    const combo = screen.getByRole('combobox', { name: 'Target workflow' });
    expect(combo).toHaveTextContent('Feature Pipeline (wf-default)');
    expect(combo).toHaveTextContent('default');
  });

  test('project kind offers the {{project}} built-in and stores it verbatim', async () => {
    const props = renderSelect({
      kind: 'project',
      entities: { projects },
      allowBuiltin: true,
      ariaLabel: 'Target project',
    });
    openDropdown('Target project');
    fireEvent.click(screen.getByRole('option', { name: /Use current project/i }));
    await waitFor(() => {
      expect(props.onChange).toHaveBeenCalledWith('{{project}}');
    });
  });

  test('legacy name values resolve to the known option label', () => {
    renderSelect({ value: 'hotfix' });
    expect(screen.getByRole('combobox', { name: 'Target workflow' })).toHaveTextContent(
      'Hotfix (wf-hotfix)',
    );
  });

  test('project legacy slug values resolve too', () => {
    renderSelect({
      kind: 'project',
      entities: { projects },
      value: 'BETA',
      ariaLabel: 'Target project',
    });
    expect(screen.getByRole('combobox', { name: 'Target project' })).toHaveTextContent(
      'Beta (proj-2)',
    );
  });
});

describe('manual fallback', () => {
  test('switches to a text input, applies the typed value, and supports Escape', async () => {
    const props = renderSelect();
    openDropdown('Target workflow');
    fireEvent.click(screen.getByRole('option', { name: /Enter value manually…/ }));
    const input = screen.getByRole('textbox', { name: /Target workflow \(manual entry\)/i });
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'my-legacy-workflow' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(props.onChange).toHaveBeenCalledWith('my-legacy-workflow');
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('Cancel leaves the stored value untouched', () => {
    const props = renderSelect({ value: 'wf-default' });
    openDropdown('Target workflow');
    fireEvent.click(screen.getByRole('option', { name: /Enter value manually…/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Target workflow' })).toHaveTextContent(
      'Feature Pipeline (wf-default)',
    );
  });

  test('external value change exits manual mode and shows the new stored value', () => {
    const onChange = vi.fn();
    const view = renderWithKainBain(
      <KBReferenceSelect
        kind="workflow"
        entities={{ workflows }}
        value="wf-default"
        onChange={onChange}
        ariaLabel="Target workflow"
      />,
    );
    openDropdown('Target workflow');
    fireEvent.click(screen.getByRole('option', { name: /Enter value manually…/ }));
    expect(
      screen.getByRole('textbox', { name: /Target workflow \(manual entry\)/i }),
    ).toBeInTheDocument();

    // A value change from outside (raw JSON editor, parent cascade reset) must
    // kick the row out of manual mode and reflect the new stored value.
    // Mirror the renderWithKainBain root so the component instance (and its
    // manual-entry state) survives — a different root would remount instead.
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <KainBainContext.Provider value={view.value}>
          <KBReferenceSelect
            kind="workflow"
            entities={{ workflows }}
            value="wf-hotfix"
            onChange={onChange}
            ariaLabel="Target workflow"
          />
        </KainBainContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Target workflow' })).toHaveTextContent(
      'Hotfix (wf-hotfix)',
    );
  });
});

describe('custom (legacy) values', () => {
  test('unmatched stored values render as-is with a custom value badge', () => {
    renderSelect({ value: 'totally-legacy' });
    const combo = screen.getByRole('combobox', { name: 'Target workflow' });
    expect(combo).toHaveTextContent('totally-legacy');
    expect(screen.getByText('custom value')).toBeInTheDocument();
  });

  test('template values are not flagged custom', () => {
    renderSelect({
      kind: 'stage',
      entities: { stages: [] },
      value: '{{currentStage}}',
      ariaLabel: 'Target stage',
    });
    expect(screen.queryByText('custom value')).not.toBeInTheDocument();
  });
});

describe('cascade states', () => {
  test('loading disables the dropdown with a loading placeholder', () => {
    renderSelect({ loading: true });
    expect(screen.getByRole('combobox', { name: 'Target workflow' })).toBeDisabled();
    expect(screen.getByText(/Loading known data/)).toBeInTheDocument();
  });

  test('disabled with reason shows the explanation instead of the default helper', () => {
    renderSelect({ disabled: true, disabledReason: 'Select a known project first' });
    expect(screen.getByRole('combobox', { name: 'Target workflow' })).toBeDisabled();
    expect(screen.getByText('Select a known project first')).toBeInTheDocument();
  });

  test('error shows the message plus a working Retry affordance', async () => {
    const onRetry = vi.fn();
    renderSelect({ error: 'Failed to fetch workflows', onRetry });
    expect(screen.getByText(/Failed to fetch workflows/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('empty known options guide toward manual entry', () => {
    renderSelect({ entities: { workflows: [] } });
    expect(screen.getByText(/No known workflows found/)).toBeInTheDocument();
  });

  test('empty override with a KB_config default shows the default helper', () => {
    renderSelect({ defaultValue: 'wf-default' });
    expect(screen.getByText('Default: wf-default')).toBeInTheDocument();
  });
});
