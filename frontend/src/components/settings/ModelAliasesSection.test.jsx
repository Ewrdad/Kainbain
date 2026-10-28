import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ModelAliasesSection,
  formatAliasSummary,
  targetValidity,
  validateAliasList,
  rowTargetsForEdit,
  canonicalRowForSave,
} from './ModelAliasesSection';

/**
 * MARK: ModelAliasesSection tests
 * @description Verifies the Settings alias table: empty state, add/edit/
 *   rename/delete rows, per-row validation (unique names, model required for
 *   list harnesses), self-managed harness note, usage hints, and the shared
 *   list validator that gates the Settings save.
 */
const HARNESSES = [
  {
    id: 'pi',
    label: 'pi',
    description: 'pi',
    modelSelection: 'list',
    models: [
      { id: 'm1', name: 'M1', provider: 'google', key: 'google::m1' },
      { id: 'm2', name: 'M2', provider: 'anthropic', key: 'anthropic::m2' },
    ],
  },
  { id: 'custom', label: 'Custom', description: 'custom', modelSelection: 'none', models: [] },
];

/**
 * Expands every alias card under test. Cards mount collapsed by default, so
 * tests that exercise the expanded body call this first: the toolbar toggle
 * when several rows render, else the single row's chevron. Null-safe — a
 * no-op when no rows render (e.g. the empty state) — and it never swallows
 * real render errors the way a try/catch would.
 */
function expandAllCards() {
  const toolbar = screen.queryByTestId('model-aliases-collapse-all-toggle');
  if (toolbar) {
    if (/Expand All/i.test(toolbar.textContent || '')) fireEvent.click(toolbar);
    return;
  }
  const toggle = screen.queryByTestId('model-alias-toggle-0');
  if (toggle && toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
}

describe('validateAliasList', () => {
  it('accepts a valid table', () => {
    expect(
      validateAliasList([{ name: 'small', harness: 'pi', model: 'google::m1' }], HARNESSES),
    ).toEqual([]);
  });

  it('flags bad names, duplicates, and missing models for list harnesses', () => {
    const errors = validateAliasList(
      [
        { name: 'small', harness: 'pi', model: 'google::m1' },
        { name: 'small', harness: 'pi', model: 'google::m1' },
        { name: 'Big', harness: 'pi', model: 'google::m1' },
        { name: 'nomodel', harness: 'pi', model: '' },
      ],
      HARNESSES,
    );
    expect(errors.map((e) => e.index)).toEqual([1, 2, 3]);
    expect(errors[0].message).toMatch(/Duplicate/);
    expect(errors[2].message).toMatch(/needs a model/);
  });

  it('allows blank models on self-managed (none) harnesses', () => {
    expect(validateAliasList([{ name: 'cli', harness: 'custom', model: '' }], HARNESSES)).toEqual(
      [],
    );
  });

  it('refuses a model on a self-managed (none) harness, naming the alias and harness', () => {
    const errors = validateAliasList(
      [{ name: 'worker', harness: 'custom', model: 'google::m1' }],
      HARNESSES,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(0);
    expect(errors[0].message).toContain('worker');
    expect(errors[0].message).toContain('custom');
    expect(errors[0].message).toContain('manages its own model');
  });

  it('refuses a none-harness model inside a weighted split', () => {
    const errors = validateAliasList(
      [
        {
          name: 'mix',
          targets: [
            { harness: 'pi', model: 'google::m1', percent: 50 },
            { harness: 'custom', model: 'google::m1', percent: 50 },
          ],
        },
      ],
      HARNESSES,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('mix');
  });
});

describe('ModelAliasesSection', () => {
  it('excludes the virtual alias entry from alias target harnesses (loop guard)', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'small', harness: 'pi', model: 'google::m1' }]}
        onChange={onChange}
        harnesses={[
          ...HARNESSES,
          {
            id: 'alias',
            label: 'Alias',
            description: 'aliases',
            modelSelection: 'list',
            models: [{ id: 'small', name: 'small', provider: 'alias', key: 'small' }],
          },
        ]}
      />,
    );
    expandAllCards();
    // An alias can never target the virtual entry (aliases cannot point at
    // aliases), so the row's harness dropdown offers real harnesses only.
    fireEvent.click(screen.getByLabelText('Alias 1 harness'));
    expect(screen.getByRole('option', { name: 'pi' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alias' })).not.toBeInTheDocument();
  });

  it('renders the empty state and adds a row', () => {
    const onChange = vi.fn();
    render(<ModelAliasesSection aliases={[]} onChange={onChange} harnesses={HARNESSES} />);
    expandAllCards();
    expect(screen.getByTestId('model-aliases-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Add alias'));
    expect(onChange).toHaveBeenCalledWith([
      {
        name: '',
        harness: 'pi',
        model: '',
        targets: [{ harness: 'pi', model: '', percent: 100 }],
      },
    ]);
  });

  it('edits a row name and shows the usage hint', () => {
    const onChange = vi.fn();
    const usagesForName = vi
      .fn()
      .mockReturnValue({ stages: [{ stageId: '1' }], usesAsDefault: true });
    render(
      <ModelAliasesSection
        aliases={[{ name: 'small', harness: 'pi', model: 'google::m1' }]}
        onChange={onChange}
        harnesses={HARNESSES}
        usagesForName={usagesForName}
      />,
    );
    expandAllCards();
    expect(screen.getByText(/Used by 1 stage/)).toBeInTheDocument();
    expect(screen.getByText(/edits apply everywhere/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Alias 1 name'), { target: { value: 'medium' } });
    expect(onChange).toHaveBeenCalledWith([
      {
        name: 'medium',
        harness: 'pi',
        model: 'google::m1',
        targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }],
      },
    ]);
  });

  it('resets the model when the row harness changes', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'small', harness: 'pi', model: 'google::m1' }]}
        onChange={onChange}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.click(screen.getByRole('combobox', { name: 'Alias 1 harness' }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    expect(onChange).toHaveBeenCalledWith([
      {
        name: 'small',
        harness: 'custom',
        model: '',
        targets: [{ harness: 'custom', model: '', percent: 100 }],
      },
    ]);
  });

  it('shows the managed-model note for none harnesses and deletes rows', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'cli', harness: 'custom', model: '' }]}
        onChange={onChange}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByTestId('model-alias-managed-note-0')).toHaveTextContent(
      'manages its own model',
    );
    expect(screen.queryByRole('button', { name: /Clear stored model/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Delete alias cli'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('flags a legacy stored model on a none harness and clears it on demand', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'cli', harness: 'custom', model: 'google::m1' }]}
        onChange={onChange}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByRole('alert')).toHaveTextContent('manages its own model');
    fireEvent.click(screen.getByRole('button', { name: /Clear stored model/ }));
    expect(onChange).toHaveBeenCalledWith([
      {
        name: 'cli',
        harness: 'custom',
        model: '',
        targets: [{ harness: 'custom', model: '', percent: 100 }],
      },
    ]);
  });

  it('accepts weighted rows summing to 100 and flags other totals', () => {
    const weighted = {
      name: 'review',
      harness: 'pi',
      model: 'google::m1',
      targets: [
        { harness: 'pi', model: 'google::m1', percent: 90 },
        { harness: 'custom', model: '', percent: 10 },
      ],
    };
    expect(validateAliasList([weighted], HARNESSES)).toEqual([]);
    const short = {
      ...weighted,
      targets: [
        { harness: 'pi', model: 'google::m1', percent: 60 },
        { harness: 'custom', model: '', percent: 30 },
      ],
    };
    const errors = validateAliasList([short], HARNESSES);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/100/);
  });

  it('requires a model per list-harness target', () => {
    const errors = validateAliasList(
      [
        {
          name: 'review',
          harness: 'pi',
          model: '',
          targets: [
            { harness: 'pi', model: '', percent: 50 },
            { harness: 'custom', model: '', percent: 50 },
          ],
        },
      ],
      HARNESSES,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/needs a model/);
  });

  it('adds a target row, edits its percent, and shows the live total', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'small', harness: 'pi', model: 'google::m1' }]}
        onChange={onChange}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByTestId('model-alias-total-0')).toHaveTextContent('Total: 100%');
    fireEvent.click(screen.getByLabelText('Add target to alias 1'));
    const added = onChange.mock.calls[0][0][0];
    expect(added.targets).toHaveLength(2);
    // The added row carries a numeric percent that keeps the split valid, so
    // the row survives the draft round-trip below instead of being dropped.
    expect(added.targets.every((t) => Number.isInteger(t.percent))).toBe(true);
    expect(added.targets.reduce((sum, t) => sum + t.percent, 0)).toBe(100);
    expect(screen.queryByText('Normalize to 100%')).not.toBeInTheDocument();
  });

  it('keeps the added target after the draft round-trip (ProjectSettings feeds onChange back)', () => {
    // Regression: "+ Add target" used to emit percent:'' and the editor
    // dropped the non-numeric row on the next render, so the second target
    // vanished and no weighted alias could be built through the UI.
    let draft = [{ name: 'small', harness: 'pi', model: 'google::m1' }];
    const onChange = vi.fn((next) => {
      draft = next;
    });
    const { rerender } = render(
      <ModelAliasesSection aliases={draft} onChange={onChange} harnesses={HARNESSES} />,
    );
    expandAllCards();
    fireEvent.click(screen.getByLabelText('Add target to alias 1'));
    expect(onChange).toHaveBeenCalledTimes(1);
    // ProjectSettings stores the emitted rows as draft state and re-renders.
    rerender(<ModelAliasesSection aliases={draft} onChange={onChange} harnesses={HARNESSES} />);
    expandAllCards();
    expect(screen.getAllByTestId('model-alias-target-row')).toHaveLength(2);
    expect(screen.getByTestId('model-alias-total-0')).toHaveTextContent('Total: 100%');
  });

  it('preserves a target row while its percent is cleared mid-edit', () => {
    // Clearing the percent input (to type a new number) emits percent:'' —
    // the row must survive re-renders as a draft; validation flags it.
    let draft = [
      {
        name: 'mix',
        harness: 'pi',
        model: 'google::m1',
        targets: [
          { harness: 'pi', model: 'google::m1', percent: 90 },
          { harness: 'custom', model: '', percent: 10 },
        ],
      },
    ];
    const onChange = vi.fn((next) => {
      draft = next;
    });
    const { rerender } = render(
      <ModelAliasesSection aliases={draft} onChange={onChange} harnesses={HARNESSES} />,
    );
    expandAllCards();
    fireEvent.change(screen.getByLabelText('Alias 1 target 1 percent'), { target: { value: '' } });
    rerender(<ModelAliasesSection aliases={draft} onChange={onChange} harnesses={HARNESSES} />);
    expandAllCards();
    expect(screen.getAllByTestId('model-alias-target-row')).toHaveLength(2);
    expect(screen.getByTestId('model-alias-total-0')).toHaveTextContent('Total: 10%');
    expect(screen.getByRole('alert')).toHaveTextContent('whole number from 1 to 100');
  });

  it('normalizes uneven shares to sum to 100', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[
          {
            name: 'mix',
            harness: 'pi',
            model: 'google::m1',
            targets: [
              { harness: 'pi', model: 'google::m1', percent: 60 },
              { harness: 'custom', model: '', percent: 60 },
            ],
          },
        ]}
        onChange={onChange}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByTestId('model-alias-total-0')).toHaveTextContent('Total: 120%');
    expect(screen.getByRole('alert')).toHaveTextContent('100%');
    fireEvent.click(screen.getByLabelText('Normalize alias 1 shares to 100 percent'));
    const normalized = onChange.mock.calls[0][0][0];
    expect(normalized.targets.map((t) => t.percent)).toEqual([50, 50]);
  });

  it('edits a target percent and removes a target row', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[
          {
            name: 'mix',
            harness: 'pi',
            model: 'google::m1',
            targets: [
              { harness: 'pi', model: 'google::m1', percent: 90 },
              { harness: 'custom', model: '', percent: 10 },
            ],
          },
        ]}
        onChange={onChange}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.change(screen.getByLabelText('Alias 1 target 2 percent'), {
      target: { value: '20' },
    });
    expect(onChange.mock.calls[0][0][0].targets[1].percent).toBe(20);
    fireEvent.click(screen.getByLabelText('Remove custom target from alias 1'));
    expect(onChange.mock.calls[1][0][0].targets).toHaveLength(1);
  });

  it('shows inline row errors for duplicates', () => {
    render(
      <ModelAliasesSection
        aliases={[
          { name: 'small', harness: 'pi', model: 'google::m1' },
          { name: 'small', harness: 'pi', model: 'google::m1' },
        ]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByRole('alert')).toHaveTextContent('Duplicate alias name');
  });
});

describe('targetValidity', () => {
  it('classifies resolving targets as valid', () => {
    expect(targetValidity({ harness: 'pi', model: 'google::m1' }, HARNESSES)).toEqual({
      status: 'valid',
      message: null,
    });
    expect(targetValidity({ harness: 'custom', model: '' }, HARNESSES).status).toBe('valid');
  });

  it('classifies unknown harnesses as hard failures', () => {
    const validity = targetValidity({ harness: 'nope', model: 'm' }, HARNESSES);
    expect(validity.status).toBe('unknown-harness');
    expect(validity.message).toContain('nope');
  });

  it('classifies catalog misses as soft unknown-model (never hard)', () => {
    const validity = targetValidity({ harness: 'pi', model: 'google::stale' }, HARNESSES);
    expect(validity.status).toBe('unknown-model');
    expect(validity.message).toContain('google::stale');
  });

  it('judges nothing on blank slots or an empty catalogue (loading)', () => {
    expect(targetValidity({ harness: 'pi', model: '' }, HARNESSES).status).toBe('blank');
    expect(targetValidity({ harness: 'pi', model: 'google::m1' }, []).status).toBe('blank');
    expect(targetValidity({ harness: '', model: '' }, HARNESSES).status).toBe('blank');
  });
});

describe('validateAliasList unknown-harness parity', () => {
  it('refuses unknown harness ids (backend hard-error parity)', () => {
    const errors = validateAliasList([{ name: 'w', harness: 'nope', model: 'm' }], HARNESSES);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('unknown harness');
  });

  it('does not judge harnesses while the catalogue is still loading', () => {
    expect(validateAliasList([{ name: 'w', harness: 'pi', model: 'm' }], [])).toEqual([]);
  });

  it('never errors on catalog-miss models (soft backend warning only)', () => {
    expect(
      validateAliasList([{ name: 'w', harness: 'pi', model: 'google::stale' }], HARNESSES),
    ).toEqual([]);
  });
});

describe('ModelAliasesSection validity badges', () => {
  it('badges resolving, stale, and unknown-harness targets distinctly', () => {
    render(
      <ModelAliasesSection
        aliases={[
          { name: 'good', harness: 'pi', model: 'google::m1' },
          { name: 'stale', harness: 'pi', model: 'google::stale' },
          { name: 'lost', harness: 'nope', model: 'm' },
        ]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByTestId('model-alias-target-validity-0-0')).toHaveTextContent('✓ Resolves');
    expect(screen.getByTestId('model-alias-target-validity-1-0')).toHaveTextContent(
      'Unknown model',
    );
    // Hard badges stay visual-only: the row error remains the single alert channel.
    const hard = screen.getByTestId('model-alias-target-validity-2-0');
    expect(hard).toHaveTextContent('Unknown harness');
    expect(hard).not.toHaveAttribute('role');
  });

  it('fails safe when a catalogue entry carries a non-array model list', () => {
    // A malformed catalogue (models not an array) must never crash the whole
    // settings section: the target card still renders its harness + percent
    // controls, and the status badge stays consistent with targetValidity.
    render(
      <ModelAliasesSection
        aliases={[{ name: 'worker', targets: [{ harness: 'pi', model: '', percent: 100 }] }]}
        onChange={() => {}}
        harnesses={[{ id: 'pi', label: 'pi', modelSelection: 'list', models: 'not-an-array' }]}
      />,
    );
    expandAllCards();

    const card = screen.getByTestId('model-alias-target-row');
    expect(card).toBeInTheDocument();
    expect(within(card).getByLabelText('Alias 1 harness')).toBeInTheDocument();
    expect(within(card).getByLabelText('Alias 1 percent')).toBeInTheDocument();
    // Empty model list cannot resolve a stored model: honest blank, no crash.
    expect(screen.queryByTestId('model-alias-target-validity-0-0')).not.toBeInTheDocument();
  });
});

describe('ModelAliasesSection mobile wrapping layout', () => {
  it('applies a responsive wrapping grid contract with min-w-0 guards', () => {
    render(
      <ModelAliasesSection
        aliases={[
          {
            name: 'general',
            harness: 'pi',
            model: 'google::m1',
            targets: [
              { harness: 'pi', model: 'google::m1', percent: 60 },
              { harness: 'custom', model: '', percent: 40 },
            ],
          },
        ]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();

    const rows = screen.getAllByTestId('model-alias-target-row');
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      // Each target is a bounded card (border + rounded corners + group
      // role) so one target's controls and metrics can never be read as
      // belonging to a neighbouring target.
      expect(row.className).toContain('border');
      expect(row.className).toContain('rounded-sm');
      expect(row).toHaveAttribute('role', 'group');

      // The controls grid inside the card must stack on mobile and expand
      // to 3 columns at sm: breakpoint
      const controls = row.querySelector('div.grid');
      expect(controls.className).toContain('grid-cols-1');
      expect(controls.className).toContain('sm:grid-cols-[1fr_1fr_64px]');

      // All controls must render inside the card (remove lives in the card header)
      const harness = row.querySelector('[aria-label*="harness"]');
      const percent = row.querySelector('input[type="number"]');
      const remove = row.querySelector('button[title*="Remove"]');
      expect(harness).toBeInTheDocument();
      expect(percent).toBeInTheDocument();
      expect(remove).toBeInTheDocument();

      // Ensure min-w-0 guard exists on grid children so content does not force overflow
      const minW0Children = controls.querySelectorAll('.min-w-0');
      expect(minW0Children.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('preserves accessible DOM and tab order (remove -> harness -> model -> percent)', () => {
    render(
      <ModelAliasesSection
        aliases={[
          {
            name: 'general',
            harness: 'pi',
            model: 'google::m1',
            targets: [
              { harness: 'pi', model: 'google::m1', percent: 60 },
              { harness: 'pi', model: 'google::m2', percent: 40 },
            ],
          },
        ]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();

    const row = screen.getAllByTestId('model-alias-target-row')[0];
    const harnessCombobox = row.querySelector('button[aria-label="Alias 1 target 1 harness"]');
    const modelCombobox = row.querySelector('button[aria-label="Alias 1 target 1 model"]');
    const percentInput = row.querySelector('input[aria-label="Alias 1 target 1 percent"]');
    const removeButton = row.querySelector('button[aria-label="Remove pi target from alias 1"]');

    expect(harnessCombobox).toBeInTheDocument();
    expect(modelCombobox).toBeInTheDocument();
    expect(percentInput).toBeInTheDocument();
    expect(removeButton).toBeInTheDocument();

    // The remove button sits in the card header, so the card reads as one
    // labelled unit; the inputs keep their harness -> model -> percent order.
    expect(
      removeButton.compareDocumentPosition(harnessCombobox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      harnessCombobox.compareDocumentPosition(modelCombobox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      modelCombobox.compareDocumentPosition(percentInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('formatAliasSummary', () => {
  it('formats a single target with 100% share', () => {
    expect(formatAliasSummary([{ harness: 'custom', percent: 100 }], HARNESSES)).toBe(
      '1 target · 100% Custom',
    );
    expect(
      formatAliasSummary([{ harness: 'pi', model: 'google::m1', percent: 100 }], HARNESSES),
    ).toBe('1 target · 100% pi (google::m1)');
  });

  it('formats multiple weighted targets', () => {
    expect(
      formatAliasSummary(
        [
          { harness: 'pi', model: 'google::m1', percent: 50 },
          { harness: 'custom', model: '', percent: 50 },
        ],
        HARNESSES,
      ),
    ).toBe('2 targets · 50% pi (google::m1), 50% Custom');
  });

  it('handles empty or incomplete draft targets gracefully', () => {
    expect(formatAliasSummary([])).toBe('0 targets');
    expect(formatAliasSummary(null)).toBe('0 targets');
    expect(formatAliasSummary([{}], HARNESSES)).toBe('1 target · unassigned');
    expect(formatAliasSummary([{ harness: 'pi' }], HARNESSES)).toBe('1 target · pi');
  });

  it('distinguishes self-managed from list-based models', () => {
    // Self-managed harness ignores model in summary
    expect(
      formatAliasSummary([{ harness: 'custom', model: 'ignored', percent: 100 }], HARNESSES),
    ).toBe('1 target · 100% Custom');
    // List-based harness includes model when present, omits when blank
    expect(
      formatAliasSummary([{ harness: 'pi', model: 'google::m1', percent: 100 }], HARNESSES),
    ).toBe('1 target · 100% pi (google::m1)');
    expect(formatAliasSummary([{ harness: 'pi', model: '', percent: 100 }], HARNESSES)).toBe(
      '1 target · 100% pi',
    );
  });
});

describe('ModelAliasesSection collapsible behaviour', () => {
  const ALIAS_ROWS = [
    {
      name: 'small',
      harness: 'pi',
      model: 'google::m1',
      targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }],
    },
    {
      name: 'worker',
      harness: 'pi',
      model: 'google::m1',
      targets: [
        { harness: 'pi', model: 'google::m1', percent: 80 },
        { harness: 'custom', model: '', percent: 20 },
      ],
    },
  ];

  it('renders alias cards with expand/collapse toggle buttons and ARIA attributes', () => {
    render(<ModelAliasesSection aliases={ALIAS_ROWS} onChange={() => {}} harnesses={HARNESSES} />);

    const toggleBtn1 = screen.getByTestId('model-alias-toggle-0');
    expect(toggleBtn1).toHaveAttribute('aria-expanded', 'false');
    expect(toggleBtn1).toHaveAttribute('aria-controls', 'model-alias-body-0');
    expect(toggleBtn1).toHaveAttribute('aria-label', 'Expand alias small');
    expect(toggleBtn1).toHaveTextContent('▸');

    const toggleBtn2 = screen.getByTestId('model-alias-toggle-1');
    expect(toggleBtn2).toHaveAttribute('aria-expanded', 'false');
    expect(toggleBtn2).toHaveAttribute('aria-controls', 'model-alias-body-1');
    expect(toggleBtn2).toHaveAttribute('aria-label', 'Expand alias worker');
    expect(toggleBtn2).toHaveTextContent('▸');
  });

  it('collapses an alias card: hides targets and reveals summary text', () => {
    render(<ModelAliasesSection aliases={ALIAS_ROWS} onChange={() => {}} harnesses={HARNESSES} />);

    const toggleBtn = screen.getByTestId('model-alias-toggle-0');
    // Cards start collapsed: summary visible, body hidden.
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Alias 1 name')).not.toBeInTheDocument();
    const summary = screen.getByTestId('model-alias-summary-0');
    expect(summary).toHaveTextContent('1 target · 100% pi (google::m1)');

    // Expanding restores the body.
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Alias 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias 1 harness')).toBeInTheDocument();
  });

  it('expands a collapsed alias card: restores the full targets view and inputs intact', () => {
    render(<ModelAliasesSection aliases={ALIAS_ROWS} onChange={() => {}} harnesses={HARNESSES} />);

    const toggleBtn = screen.getByTestId('model-alias-toggle-0');
    // Starts collapsed; expand it.
    expect(screen.queryByLabelText('Alias 1 name')).not.toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Alias 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias 1 harness')).toBeInTheDocument();

    // Collapse again hides them.
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Alias 1 name')).not.toBeInTheDocument();
  });

  it('preserves form values entered into an alias across collapse and expand cycles', () => {
    let currentAliases = [...ALIAS_ROWS];
    const onChange = vi.fn((next) => {
      currentAliases = next;
    });

    const { rerender } = render(
      <ModelAliasesSection aliases={currentAliases} onChange={onChange} harnesses={HARNESSES} />,
    );

    // Expand the collapsed card first to edit.
    fireEvent.click(screen.getByTestId('model-alias-toggle-0'));
    // Edit alias 1 name
    fireEvent.change(screen.getByLabelText('Alias 1 name'), { target: { value: 'custom-name' } });
    expect(onChange).toHaveBeenCalled();

    rerender(
      <ModelAliasesSection aliases={currentAliases} onChange={onChange} harnesses={HARNESSES} />,
    );
    expect(screen.getByLabelText('Alias 1 name')).toHaveValue('custom-name');

    // Collapse alias 1
    const toggleBtn = screen.getByTestId('model-alias-toggle-0');
    fireEvent.click(toggleBtn);
    expect(screen.queryByLabelText('Alias 1 name')).not.toBeInTheDocument();

    // Expand alias 1
    fireEvent.click(toggleBtn);
    expect(screen.getByLabelText('Alias 1 name')).toHaveValue('custom-name');
  });

  it('displays a validation error badge on a collapsed alias header and expands on click', () => {
    const invalidAlias = [
      {
        name: 'broken',
        targets: [
          { harness: 'pi', model: 'google::m1', percent: 60 },
          { harness: 'custom', model: '', percent: 20 },
        ],
      },
    ];

    render(
      <ModelAliasesSection aliases={invalidAlias} onChange={() => {}} harnesses={HARNESSES} />,
    );

    const toggleBtn = screen.getByTestId('model-alias-toggle-0');

    // Collapsed by default: error badge is already on the header.
    const errorBadge = screen.getByTestId('model-alias-error-badge-0');
    expect(errorBadge).toBeInTheDocument();
    const collapsedAlert = screen.getByRole('alert');
    expect(collapsedAlert).toContainElement(errorBadge);
    expect(collapsedAlert).toHaveTextContent('100%');

    // Clicking error badge automatically expands the card
    fireEvent.click(errorBadge);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Alias 1 name')).toBeInTheDocument();
  });

  it('collapses all aliases with "Collapse All" and expands all with "Expand All"', () => {
    render(<ModelAliasesSection aliases={ALIAS_ROWS} onChange={() => {}} harnesses={HARNESSES} />);

    expect(screen.getByTestId('model-aliases-count')).toHaveTextContent('2 configured aliases');
    const collapseAllBtn = screen.getByTestId('model-aliases-collapse-all-toggle');
    // Cards start collapsed, so the toggle offers "Expand All".
    expect(collapseAllBtn).toHaveTextContent('Expand All');

    // Click "Expand All"
    fireEvent.click(collapseAllBtn);
    expect(screen.getByTestId('model-alias-toggle-0')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('model-alias-toggle-1')).toHaveAttribute('aria-expanded', 'true');
    expect(collapseAllBtn).toHaveTextContent('Collapse All');

    // Click "Collapse All"
    fireEvent.click(collapseAllBtn);
    expect(screen.getByTestId('model-alias-toggle-0')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('model-alias-toggle-1')).toHaveAttribute('aria-expanded', 'false');
    expect(collapseAllBtn).toHaveTextContent('Expand All');
  });

  it('ensures a newly added alias starts expanded and receives focus', () => {
    let currentAliases = [];
    const onChange = vi.fn((next) => {
      currentAliases = next;
    });

    const { rerender } = render(
      <ModelAliasesSection aliases={currentAliases} onChange={onChange} harnesses={HARNESSES} />,
    );

    fireEvent.click(screen.getByText('+ Add alias'));
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(
      <ModelAliasesSection aliases={currentAliases} onChange={onChange} harnesses={HARNESSES} />,
    );

    const toggleBtn = screen.getByTestId('model-alias-toggle-0');
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    const nameInput = screen.getByLabelText('Alias 1 name');
    expect(nameInput).toBeInTheDocument();
    expect(document.activeElement).toBe(nameInput);
  });

  it('deleting an alias does not corrupt collapse state of remaining aliases', () => {
    const threeAliases = [
      { name: 'alias-a', targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }] },
      { name: 'alias-b', targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }] },
      { name: 'alias-c', targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }] },
    ];

    let currentAliases = [...threeAliases];
    const onChange = vi.fn((next) => {
      currentAliases = next;
    });

    const { rerender } = render(
      <ModelAliasesSection aliases={currentAliases} onChange={onChange} harnesses={HARNESSES} />,
    );

    // Cards start collapsed; expand alias-a and alias-c, keep alias-b collapsed.
    fireEvent.click(screen.getByTestId('model-alias-toggle-0'));
    fireEvent.click(screen.getByTestId('model-alias-toggle-2'));

    expect(screen.getByTestId('model-alias-toggle-0')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('model-alias-toggle-1')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('model-alias-toggle-2')).toHaveAttribute('aria-expanded', 'true');

    // Delete alias-a (index 0)
    fireEvent.click(screen.getByLabelText('Delete alias alias-a'));
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(
      <ModelAliasesSection aliases={currentAliases} onChange={onChange} harnesses={HARNESSES} />,
    );

    // After deleting alias-a, alias-b is now at index 0 and alias-c is at index 1
    // alias-b must STILL be collapsed, and alias-c must STILL be expanded!
    expect(screen.getByTestId('model-alias-toggle-0')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('model-alias-toggle-1')).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not display Collapse All toolbar when 1 or 0 aliases exist', () => {
    const { rerender } = render(
      <ModelAliasesSection aliases={[]} onChange={() => {}} harnesses={HARNESSES} />,
    );
    expect(screen.queryByTestId('model-aliases-collapse-all-toggle')).not.toBeInTheDocument();

    rerender(
      <ModelAliasesSection
        aliases={[{ name: 'single', targets: [{ harness: 'pi', model: 'm1', percent: 100 }] }]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );
    expect(screen.queryByTestId('model-aliases-collapse-all-toggle')).not.toBeInTheDocument();
  });
});

describe('ModelAliasesSection collapse edge cases', () => {
  const TWO_ROWS = [
    {
      name: 'small',
      harness: 'pi',
      model: 'google::m1',
      targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }],
    },
    {
      name: 'worker',
      harness: 'pi',
      model: 'google::m1',
      targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }],
    },
  ];

  it('tolerates null or non-array aliases with the empty state (fail-safe)', () => {
    const { rerender } = render(
      <ModelAliasesSection aliases={null} onChange={() => {}} harnesses={HARNESSES} />,
    );
    expect(screen.getByTestId('model-aliases-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('model-aliases-collapse-all-toggle')).not.toBeInTheDocument();

    rerender(
      <ModelAliasesSection aliases="not-an-array" onChange={() => {}} harnesses={HARNESSES} />,
    );
    expect(screen.getByTestId('model-aliases-empty')).toBeInTheDocument();
  });

  it('survives an external same-length reset (discard flow) with consistent toggles', () => {
    const reset = [
      { name: 'fresh-a', targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }] },
      { name: 'fresh-b', targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }] },
    ];
    const { rerender } = render(
      <ModelAliasesSection aliases={TWO_ROWS} onChange={() => {}} harnesses={HARNESSES} />,
    );
    expect(screen.getByTestId('model-alias-toggle-0')).toHaveAttribute('aria-expanded', 'false');

    rerender(<ModelAliasesSection aliases={reset} onChange={() => {}} harnesses={HARNESSES} />);
    expect(screen.getAllByTestId('model-alias-row')).toHaveLength(2);
    expect(screen.getByTestId('model-alias-toggle-0')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('model-alias-summary-0')).toHaveTextContent(
      '1 target · 100% pi (google::m1)',
    );
  });

  it('survives an external shrink (parent drops a row) without crashing', () => {
    const { rerender } = render(
      <ModelAliasesSection aliases={TWO_ROWS} onChange={() => {}} harnesses={HARNESSES} />,
    );
    fireEvent.click(screen.getByTestId('model-aliases-collapse-all-toggle'));
    rerender(
      <ModelAliasesSection aliases={[TWO_ROWS[0]]} onChange={() => {}} harnesses={HARNESSES} />,
    );
    expect(screen.getAllByTestId('model-alias-row')).toHaveLength(1);
    expect(screen.queryByTestId('model-aliases-collapse-all-toggle')).not.toBeInTheDocument();
  });

  it('disables toggles and Collapse All when the section is disabled', () => {
    render(
      <ModelAliasesSection aliases={TWO_ROWS} onChange={() => {}} harnesses={HARNESSES} disabled />,
    );
    expect(screen.getByTestId('model-alias-toggle-0')).toBeDisabled();
    expect(screen.getByTestId('model-alias-toggle-1')).toBeDisabled();
    expect(screen.getByTestId('model-aliases-collapse-all-toggle')).toBeDisabled();
  });

  it('validates collapsed rows exactly like expanded ones (save parity)', () => {
    const mixed = [
      ...TWO_ROWS,
      {
        name: 'broken',
        targets: [
          { harness: 'pi', model: 'google::m1', percent: 60 },
          { harness: 'custom', model: '', percent: 20 },
        ],
      },
    ];
    render(<ModelAliasesSection aliases={mixed} onChange={() => {}} harnesses={HARNESSES} />);

    const expectedErrors = validateAliasList(mixed, HARNESSES);
    expect(expectedErrors).toHaveLength(1);
    expect(screen.getByTestId('model-alias-error-badge-2')).toHaveTextContent('100%');
    expect(screen.queryByTestId('model-alias-error-badge-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-alias-error-badge-1')).not.toBeInTheDocument();
  });

  it('keeps two mounted sections isolated from each other', () => {
    render(
      <>
        <ModelAliasesSection aliases={TWO_ROWS} onChange={() => {}} harnesses={HARNESSES} />
        <ModelAliasesSection aliases={TWO_ROWS} onChange={() => {}} harnesses={HARNESSES} />
      </>,
    );
    const toggles = screen.getAllByTestId('model-alias-toggle-0');
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ModelAliasesSection reasoning level picker', () => {
  const REASON_HARNESSES = [
    {
      id: 'pi',
      label: 'pi',
      description: 'pi',
      modelSelection: 'list',
      reasoningLevels: ['low', 'medium', 'high'],
      models: [
        { id: 'm1', name: 'M1', provider: 'google', key: 'pi::google::m1' },
        {
          id: 'm2',
          name: 'M2',
          provider: 'anthropic',
          key: 'pi::anthropic::m2',
          supportedReasoning: ['ultra'],
        },
        {
          id: 'glm-5.3-flash:cloud',
          name: 'GLM 5.3 Flash',
          provider: 'ollama-cloud',
          key: 'pi::ollama-cloud::glm-5.3-flash:cloud',
        },
      ],
    },
    {
      id: 'muse',
      label: 'Muse',
      description: 'muse',
      modelSelection: 'list',
      models: [{ id: 'c1', name: 'C1', provider: 'anthropic', key: 'muse::anthropic::c1' }],
    },
  ];

  it('shows the Reasoning dropdown per capable target, hidden for null harnesses', () => {
    const onChange = vi.fn();
    const capable = render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByRole('combobox', { name: 'Reasoning' })).toBeInTheDocument();
    capable.unmount();

    render(
      <ModelAliasesSection
        aliases={[{ name: 'cli', harness: 'muse', model: 'muse::anthropic::c1' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.queryByRole('combobox', { name: 'Reasoning' })).not.toBeInTheDocument();
  });

  it('names the Reasoning dropdown and Default meaning in the section copy', () => {
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1' }]}
        onChange={() => {}}
        harnesses={REASON_HARNESSES}
      />,
    );
    expect(screen.getByText(/Reasoning dropdown/)).toBeInTheDocument();
    expect(screen.getByText(/Default \(no level\)/)).toBeInTheDocument();
  });

  it('persists the ::level suffix on save when a level is picked', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    fireEvent.click(screen.getByRole('option', { name: 'high' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0];
    expect(saved[0].targets[0].model).toBe('pi::google::m1::high');
    expect(saved[0].model).toBe('pi::google::m1::high');
  });

  it('stores the bare ref when Default (no level) is picked (Q4)', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1::high' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    expect(screen.getByRole('combobox', { name: 'Reasoning' })).toHaveTextContent('high');
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    fireEvent.click(screen.getByRole('option', { name: 'Default (no level)' }));
    const saved = onChange.mock.calls[0][0];
    expect(saved[0].targets[0].model).toBe('pi::google::m1');
  });

  it('narrows Reasoning options to the model supportedReasoning set (Q5)', () => {
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::anthropic::m2' }]}
        onChange={() => {}}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    expect(screen.getByRole('option', { name: 'ultra' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'low' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'high' })).not.toBeInTheDocument();
  });

  it('preserves the current level when the model changes', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1::high' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.click(screen.getByLabelText('Alias 1 model'));
    fireEvent.click(screen.getByRole('option', { name: 'M1' }));
    // Same-model reselect keeps the suffix intact.
    const saved = onChange.mock.calls[0][0];
    expect(saved[0].targets[0].model).toBe('pi::google::m1::high');
  });

  it('strips a stored suffix on load for null-harness targets, keeps capable ones (Q2)', () => {
    const onChange = vi.fn();
    const stripped = render(
      <ModelAliasesSection
        aliases={[{ name: 'cli', harness: 'muse', model: 'muse::anthropic::c1::high' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    // Legacy shape preserved — only the model string changes.
    expect(onChange).toHaveBeenCalledWith([
      { name: 'cli', harness: 'muse', model: 'muse::anthropic::c1' },
    ]);
    stripped.unmount();

    const kept = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1::high' }]}
        onChange={kept}
        harnesses={REASON_HARNESSES}
      />,
    );
    expect(kept).not.toHaveBeenCalled();
  });

  it('strips a stored suffix inside weighted splits on load (Q2)', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[
          {
            name: 'mix',
            targets: [
              { harness: 'pi', model: 'pi::google::m1::high', percent: 50 },
              { harness: 'muse', model: 'muse::anthropic::c1::high', percent: 50 },
            ],
          },
        ]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    // The capable target keeps its level; the null-harness one is stripped.
    expect(next[0].targets[0].model).toBe('pi::google::m1::high');
    expect(next[0].targets[1].model).toBe('muse::anthropic::c1');
  });

  it('blocks switching to a null harness with a level set until Clear completes the switch (Q3)', () => {
    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1::high' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.click(screen.getByLabelText('Alias 1 harness'));
    fireEvent.click(screen.getByRole('option', { name: 'Muse' }));

    // Blocked: the harness stays put and the inline notice names the fix.
    expect(screen.getByLabelText('Alias 1 harness')).toHaveTextContent('pi');
    expect(screen.getByTestId('reasoning-clear-notice')).toHaveTextContent(
      'Clear the reasoning level first',
    );

    // One click drops the level AND completes the pending switch (the model
    // resets, exactly like the row's normal harness-switch path).
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const saved = onChange.mock.calls[0][0];
    expect(saved[0].targets[0]).toEqual({ harness: 'muse', model: '', percent: 100 });
    expect(screen.queryByTestId('reasoning-clear-notice')).not.toBeInTheDocument();
  });

  it('retires the blocked-switch notice when the level is cleared through the Reasoning dropdown', () => {
    const onChange = vi.fn();
    const view = render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1::high' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.click(screen.getByLabelText('Alias 1 harness'));
    fireEvent.click(screen.getByRole('option', { name: 'Muse' }));
    expect(screen.getByTestId('reasoning-clear-notice')).toBeInTheDocument();

    // The level is dropped via the Reasoning dropdown instead of the
    // notice's Clear button: the re-rendered row carries no level, so the
    // notice retires even though the pending switch was never completed.
    view.rerender(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::google::m1' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expect(screen.queryByTestId('reasoning-clear-notice')).not.toBeInTheDocument();
  });

  it('keeps single-colon model ids intact through level validation and selection', () => {
    expect(
      targetValidity(
        { harness: 'pi', model: 'pi::ollama-cloud::glm-5.3-flash:cloud::high' },
        REASON_HARNESSES,
      ),
    ).toEqual({ status: 'valid', message: null });

    const onChange = vi.fn();
    render(
      <ModelAliasesSection
        aliases={[{ name: 'fast', harness: 'pi', model: 'pi::ollama-cloud::glm-5.3-flash:cloud' }]}
        onChange={onChange}
        harnesses={REASON_HARNESSES}
      />,
    );
    expandAllCards();
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    fireEvent.click(screen.getByRole('option', { name: 'medium' }));
    const saved = onChange.mock.calls[0][0];
    expect(saved[0].targets[0].model).toBe('pi::ollama-cloud::glm-5.3-flash:cloud::medium');
  });

  it('round-trips a legacy 4-part model string through edit to save untouched', () => {
    const targets = rowTargetsForEdit({
      name: 'fast',
      harness: 'pi',
      model: 'pi::google::m1::high',
    });
    expect(targets).toEqual([{ harness: 'pi', model: 'pi::google::m1::high', percent: 100 }]);
    const saved = canonicalRowForSave('fast', targets);
    expect(saved.model).toBe('pi::google::m1::high');
    expect(saved.targets[0].model).toBe('pi::google::m1::high');
  });
});

describe('ModelAliasesSection reasoning validation', () => {
  const REASON_HARNESSES = [
    {
      id: 'pi',
      label: 'pi',
      description: 'pi',
      modelSelection: 'list',
      reasoningLevels: ['low', 'medium', 'high'],
      models: [
        { id: 'm1', name: 'M1', provider: 'google', key: 'pi::google::m1' },
        {
          id: 'm2',
          name: 'M2',
          provider: 'anthropic',
          key: 'pi::anthropic::m2',
          supportedReasoning: ['ultra'],
        },
      ],
    },
    {
      id: 'muse',
      label: 'Muse',
      description: 'muse',
      modelSelection: 'list',
      models: [{ id: 'c1', name: 'C1', provider: 'anthropic', key: 'muse::anthropic::c1' }],
    },
  ];

  it('accepts an advertised level on a capable harness', () => {
    expect(
      targetValidity({ harness: 'pi', model: 'pi::google::m1::high' }, REASON_HARNESSES),
    ).toEqual({ status: 'valid', message: null });
    expect(
      validateAliasList(
        [{ name: 'fast', harness: 'pi', model: 'pi::google::m1::high' }],
        REASON_HARNESSES,
      ),
    ).toEqual([]);
  });

  it('refuses an unadvertised level on a capable harness, mirroring the backend', () => {
    const validity = targetValidity(
      { harness: 'pi', model: 'pi::google::m1::bogus' },
      REASON_HARNESSES,
    );
    expect(validity.status).toBe('invalid');
    expect(validity.message).toMatch(/not supported/);
    const errors = validateAliasList(
      [{ name: 'fast', harness: 'pi', model: 'pi::google::m1::bogus' }],
      REASON_HARNESSES,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/not supported/);
  });

  it('refuses a level on a null-reasoning harness (defense in depth behind the load strip)', () => {
    const validity = targetValidity(
      { harness: 'muse', model: 'muse::anthropic::c1::high' },
      REASON_HARNESSES,
    );
    expect(validity.status).toBe('invalid');
    expect(validity.message).toMatch(/does not support adjustable reasoning/);
  });

  it('refuses a malformed level with a specific message', () => {
    const validity = targetValidity(
      { harness: 'pi', model: 'pi::google::m1:: high' },
      REASON_HARNESSES,
    );
    expect(validity.status).toBe('invalid');
    expect(validity.message).toMatch(/invalid reasoning level/);
  });

  it('prefers the model supportedReasoning set over the harness set (Q5)', () => {
    expect(
      targetValidity({ harness: 'pi', model: 'pi::anthropic::m2::ultra' }, REASON_HARNESSES),
    ).toEqual({ status: 'valid', message: null });
    const validity = targetValidity(
      { harness: 'pi', model: 'pi::anthropic::m2::high' },
      REASON_HARNESSES,
    );
    expect(validity.status).toBe('invalid');
    expect(validity.message).toMatch(/not supported/);
  });

  it('keeps the unknown-model soft warning for levelled refs to missing models', () => {
    const validity = targetValidity(
      { harness: 'pi', model: 'pi::google::nope::high' },
      REASON_HARNESSES,
    );
    expect(validity.status).toBe('unknown-model');
    expect(
      validateAliasList(
        [{ name: 'fast', harness: 'pi', model: 'pi::google::nope::high' }],
        REASON_HARNESSES,
      ),
    ).toEqual([]);
  });
});
