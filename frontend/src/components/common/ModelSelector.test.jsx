import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ModelSelector, resolveStoredModelValidity } from './ModelSelector';

/**
 * MARK: ModelSelector tests
 * @description Verifies the shared model dropdown: resolves stored references
 *   (composite keys and legacy bare ids) to the right option, emits composite
 *   option values on change, and only shows the inherit/empty choice when
 *   allowEmpty is set.
 */
const MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek v4 Flash', provider: 'ollama-cloud', key: 'ollama-cloud::deepseek-v4-flash' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', key: 'google::gemini-2.5-pro' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', key: 'anthropic::claude-3-7-sonnet' },
];

// A second catalogue scoped to the pi harness (distinct from the flat list).
const PI_MODELS = [
  { id: 'glm-5.3-flash:cloud', name: 'GLM 5.3 Flash', provider: 'pi', key: 'pi::glm-5.3-flash:cloud' },
];

describe('ModelSelector', () => {
  it('renders model options grouped by provider (plain labels, no suffix)', () => {
    render(<ModelSelector models={MODELS} ariaLabel="Default AI Model" />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Default AI Model' }));
    // Plain model names — the provider moves into the group header.
    expect(screen.getByRole('option', { name: 'DeepSeek v4 Flash' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gemini 2.5 Pro' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Claude 3.7 Sonnet' })).toBeInTheDocument();
    // Group headers render for each provider.
    expect(screen.getByText('ollama-cloud')).toBeInTheDocument();
    expect(screen.getByText('google')).toBeInTheDocument();
    expect(screen.getByText('anthropic')).toBeInTheDocument();
  });

  it('keeps emitting composite option values on selection (stored-format guard)', () => {
    const onChange = vi.fn();
    render(<ModelSelector models={MODELS} value="" onChange={onChange} ariaLabel="Default AI Model" />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Default AI Model' }));
    fireEvent.click(screen.getByRole('option', { name: 'Gemini 2.5 Pro' }));
    expect(onChange).toHaveBeenCalledWith('google::gemini-2.5-pro', expect.anything());
  });

  it('resolves a stored legacy bare id to a valid option and highlights it', () => {
    render(<ModelSelector models={MODELS} value="gemini-2.5-pro" ariaLabel="Default AI Model" />);
    expect(screen.getByRole('combobox', { name: 'Default AI Model' })).toHaveTextContent(
      'Gemini 2.5 Pro',
    );
  });

  it('resolves a stored composite key to the exact matching option', () => {
    render(
      <ModelSelector models={MODELS} value="anthropic::claude-3-7-sonnet" ariaLabel="Default AI Model" />,
    );
    expect(screen.getByRole('combobox', { name: 'Default AI Model' })).toHaveTextContent(
      'Claude 3.7 Sonnet',
    );
  });

  it('shows the empty/inherit choice only when allowEmpty is set and emits "" on selection', () => {
    const onChange = vi.fn();
    const withoutEmpty = render(
      <ModelSelector models={MODELS} value="" onChange={onChange} ariaLabel="Stage Model" />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Stage Model' }));
    expect(screen.queryByRole('option', { name: 'Inherit Project Default' })).not.toBeInTheDocument();
    withoutEmpty.unmount();

    render(
      <ModelSelector
        models={MODELS}
        value=""
        onChange={onChange}
        ariaLabel="Stage Model"
        allowEmpty
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Stage Model' }));
    fireEvent.click(screen.getByRole('option', { name: 'Inherit Project Default' }));
    expect(onChange).toHaveBeenCalledWith('', expect.anything());
  });

  it('forwards disabled state and size to the underlying dropdown', () => {
    render(
      <ModelSelector models={MODELS} disabled size="sm" ariaLabel="Stage Model" />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Stage Model' });
    expect(trigger).toBeDisabled();
    expect(trigger.className).toContain('text-[10px]');
  });

  it('renders the optional model label node above the dropdown', () => {
    render(
      <ModelSelector
        models={MODELS}
        ariaLabel="Default AI Model"
        id="project-default-model-select"
        modelLabelNode={<label htmlFor="project-default-model-select">Default AI Model</label>}
      />,
    );
    expect(screen.getByText('Default AI Model')).toBeInTheDocument();
    // The label is wired to the dropdown trigger's id.
    expect(screen.getByRole('combobox', { name: 'Default AI Model' }).id).toBe(
      'project-default-model-select',
    );
  });
});

describe('ModelSelector harness-first selector', () => {
  it('wraps a harness-less catalogue as the single pi harness (older backend)', () => {
    render(
      <ModelSelector models={MODELS} harnesses={[]} ariaLabel="Default AI Model" harnessAriaLabel="AI Harness" />,
    );
    const harnessTrigger = screen.getByRole('combobox', { name: 'AI Harness' });
    expect(harnessTrigger).toHaveTextContent('pi');
    // Single registered harness today: visible but disabled.
    expect(harnessTrigger).toBeDisabled();
  });

  it('scopes the model list to the selected harness and disables the row when only one harness exists', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={[
          { id: 'pi', label: 'pi', description: 'pi coding-agent harness', models: PI_MODELS },
        ]}
        value="pi::glm-5.3-flash:cloud"
        ariaLabel="Default AI Model"
        harnessAriaLabel="AI Harness"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'AI Harness' })).toBeDisabled();
    fireEvent.click(screen.getByRole('combobox', { name: 'Default AI Model' }));
    // The model list is the harness's models, not the flat fallback list.
    expect(screen.getByRole('option', { name: 'GLM 5.3 Flash' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Claude 3.7 Sonnet' })).not.toBeInTheDocument();
  });

  it('switches the model list when the harness changes and resets to a valid option', () => {
    const harnesses = [
      { id: 'pi', label: 'pi', description: 'pi coding-agent harness', models: PI_MODELS },
      {
        id: 'cloud-b',
        label: 'cloud-b',
        description: 'second harness',
        models: [{ id: 'b-model', name: 'Model B', provider: 'cloud-b' }],
      },
    ];
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={harnesses}
        value="pi::glm-5.3-flash:cloud"
        onChange={onChange}
        ariaLabel="Stage Model"
        harnessAriaLabel="Stage Harness"
      />,
    );

    // Harness selection is enabled with two harnesses.
    const harnessTrigger = screen.getByRole('combobox', { name: 'Stage Harness' });
    expect(harnessTrigger).not.toBeDisabled();

    fireEvent.click(harnessTrigger);
    fireEvent.click(screen.getByRole('option', { name: 'cloud-b' }));

    // The model dropdown now lists harness b's models only.
    fireEvent.click(screen.getByRole('combobox', { name: 'Stage Model' }));
    expect(screen.getByRole('option', { name: 'Model B' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'GLM 5.3 Flash' })).not.toBeInTheDocument();

    // Switching harness is navigation only: the stored model value is NOT
    // rewritten (no onChange fired), and the pi value that no longer exists
    // in harness b's list renders as the placeholder — a valid state.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Stage Model' })).toHaveTextContent('Select...');
  });

  it('falls back to the first harness when the controlled harness id is unknown', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={[
          { id: 'pi', label: 'pi', description: 'pi', models: PI_MODELS },
          { id: 'cloud-b', label: 'cloud-b', description: 'b', models: [{ id: 'b-model', name: 'Model B', provider: 'cloud-b' }] },
        ]}
        harnessId="does-not-exist"
        ariaLabel="Stage Model"
        harnessAriaLabel="Stage Harness"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Stage Harness' })).toHaveTextContent('pi');
  });

  it('disables harness options with a reason via isHarnessDisabled', () => {
    const onHarnessChange = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={[
          { id: 'pi', label: 'pi', description: 'pi', models: PI_MODELS },
          { id: 'custom', label: 'custom', description: 'custom', models: [] },
        ]}
        harnessId="pi"
        onHarnessChange={onHarnessChange}
        isHarnessDisabled={(h) => (h.id === 'custom' ? 'stuck check unavailable' : null)}
        ariaLabel="Stage Model"
        harnessAriaLabel="Stage Harness"
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Stage Harness' }));
    const customOption = screen.getByRole('option', { name: /custom/i });
    expect(customOption).toHaveAttribute('aria-disabled', 'true');
    expect(customOption).toHaveTextContent(/stuck check unavailable/i);

    // Disabled rows are not selectable: the predicate blocks the change.
    fireEvent.click(customOption);
    expect(onHarnessChange).not.toHaveBeenCalled();
  });

  it('propagates harness selection through onHarnessChange in controlled mode', () => {
    const onHarnessChange = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={[
          { id: 'pi', label: 'pi', description: 'pi', models: PI_MODELS },
          { id: 'cloud-b', label: 'cloud-b', description: 'b', models: [{ id: 'b-model', name: 'Model B', provider: 'cloud-b' }] },
        ]}
        harnessId="pi"
        onHarnessChange={onHarnessChange}
        ariaLabel="Stage Model"
        harnessAriaLabel="Stage Harness"
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Stage Harness' }));
    fireEvent.click(screen.getByRole('option', { name: 'cloud-b' }));
    expect(onHarnessChange).toHaveBeenCalledWith('cloud-b', expect.anything());
  });
});

describe('ModelSelector modelSelection none (custom: model baked into the command)', () => {
  const NONE_HARNESSES = [
    { id: 'pi', label: 'pi', description: 'pi', modelSelection: 'list', models: PI_MODELS },
    {
      id: 'custom',
      label: 'Custom command',
      description: 'custom',
      modelSelection: 'none',
      models: [],
    },
  ];

  it('hides the model control entirely for harnesses with modelSelection none', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={NONE_HARNESSES}
        harnessId="custom"
        value=""
        ariaLabel="Default AI Model"
        harnessAriaLabel="AI Harness"
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Default AI Model' })).not.toBeInTheDocument();
    expect(screen.getByTestId('model-none-note')).toBeInTheDocument();
  });

  it('hideHarness renders only the model control scoped to the given harness', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={NONE_HARNESSES}
        harnessId="pi"
        hideHarness
        value=""
        ariaLabel="Model for Idea"
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'AI Harness' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Model for Idea' })).toBeInTheDocument();
  });
});

describe('ModelSelector harness inherit option (stage-level default)', () => {
  const TWO_HARNESSES = [
    { id: 'pi', label: 'pi coding agent', description: 'pi', modelSelection: 'list', models: PI_MODELS },
    { id: 'agy', label: 'Antigravity', description: 'agy', modelSelection: 'list', models: MODELS },
  ];

  it('offers an explicit inherit choice that scopes models to the inherited harness', () => {
    const onHarnessChange = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={TWO_HARNESSES}
        harnessId=""
        onHarnessChange={onHarnessChange}
        fallbackHarnessId="pi"
        harnessAllowEmpty
        harnessEmptyLabel="Inherit project default (pi coding agent)"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
      />,
    );

    // The inherit choice displays as selected (not the raw ''), and the
    // model dropdown scopes to the inherited (pi) catalogue.
    expect(screen.getByRole('combobox', { name: 'Harness for Idea' })).toHaveTextContent(
      'Inherit project default (pi coding agent)',
    );
    const modelTrigger = screen.getByRole('combobox', { name: 'Model for Idea' });
    fireEvent.click(modelTrigger);
    expect(screen.getByRole('option', { name: 'GLM 5.3 Flash' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'DeepSeek v4 Flash' })).not.toBeInTheDocument();
  });

  it('selecting the inherit choice emits the empty value (callers store inherit)', () => {
    const onHarnessChange = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={TWO_HARNESSES}
        harnessId="agy"
        onHarnessChange={onHarnessChange}
        fallbackHarnessId="pi"
        harnessAllowEmpty
        harnessEmptyLabel="Inherit project default (pi coding agent)"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Harness for Idea' }));
    fireEvent.click(screen.getByRole('option', { name: 'Inherit project default (pi coding agent)' }));
    expect(onHarnessChange).toHaveBeenCalledWith('', expect.anything());
  });
});

describe('ModelSelector empty catalogue state', () => {
  const EMPTY_HARNESSES = [
    { id: 'pi', label: 'pi', description: 'pi', modelSelection: 'list', models: PI_MODELS },
    { id: 'agy', label: 'Antigravity', description: 'agy', modelSelection: 'list', models: [] },
  ];

  it('renders an honest empty state (never another harness models) with a Refresh action', () => {
    const onRefresh = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={EMPTY_HARNESSES}
        harnessId="agy"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
        onRefresh={onRefresh}
      />,
    );

    // No model dropdown at all — and no pi models leaking in.
    expect(screen.queryByRole('combobox', { name: 'Model for Idea' })).not.toBeInTheDocument();
    expect(screen.getByTestId('model-empty-note')).toHaveTextContent('Antigravity');

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshButton);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables Refresh while a refresh is in flight', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={EMPTY_HARNESSES}
        harnessId="agy"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
        onRefresh={() => {}}
        refreshing
      />,
    );
    expect(screen.getByRole('button', { name: /Refreshing/ })).toBeDisabled();
  });

  it('shows the specific discovery reason + fix when the harness reports a discoveryError', () => {
    const onRefresh = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={[
          { id: 'pi', label: 'pi', description: 'pi', modelSelection: 'list', models: PI_MODELS },
          {
            id: 'antigravity',
            label: 'Antigravity',
            description: 'agy',
            modelSelection: 'list',
            models: [],
            discoveryError: {
              code: 'AGY_BIN_MISSING',
              message: 'The agy CLI was not found.',
              hint: 'Install the Antigravity CLI.',
            },
          },
        ]}
        harnessId="antigravity"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
        onRefresh={onRefresh}
      />,
    );
    const note = screen.getByTestId('model-empty-note');
    expect(note).toHaveTextContent('The agy CLI was not found.');
    expect(note).toHaveTextContent('Install the Antigravity CLI.');
    // The generic shrug is replaced by the specific reason — Refresh stays.
    expect(note).not.toHaveTextContent('check harness availability');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the generic line when the harness reports no discoveryError', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={EMPTY_HARNESSES}
        harnessId="agy"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByTestId('model-empty-note')).toHaveTextContent('check harness availability');
  });

  it('shows the backend hint in the empty state when no discoveryError is reported', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={[
          {
            id: 'agy',
            label: 'Agy',
            description: 'agy',
            modelSelection: 'list',
            models: [],
            available: false,
            detectionSource: 'not-found',
            hint: 'Install the Antigravity CLI or set KAINBAIN_AGY_BIN.',
          },
        ]}
        harnessId="agy"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
        onRefresh={() => {}}
      />,
    );
    const note = screen.getByTestId('model-empty-note');
    expect(note).toHaveTextContent('Install the Antigravity CLI or set KAINBAIN_AGY_BIN.');
    expect(note).not.toHaveTextContent('check harness availability');
  });
});

describe('ModelSelector alias harness entry', () => {
  const ALIAS_HARNESSES = [
    { id: 'pi', label: 'pi', description: 'pi', modelSelection: 'list', models: PI_MODELS },
    {
      id: 'alias',
      label: 'Alias',
      description: 'aliases',
      modelSelection: 'list',
      models: [{ id: 'small', name: 'small', provider: 'alias', key: 'small', harness: 'alias' }],
    },
  ];

  it('lists alias names under the alias harness and emits the name on selection', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={ALIAS_HARNESSES}
        harnessId="alias"
        value=""
        onChange={onChange}
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Model for Idea' }));
    fireEvent.click(screen.getByRole('option', { name: 'small' }));
    expect(onChange).toHaveBeenCalledWith('small', expect.anything());
  });

  it('resolves a stored alias name to its option', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={ALIAS_HARNESSES}
        harnessId="alias"
        value="small"
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Model for Idea' })).toHaveTextContent('small');
  });

  it('shows the Settings pointer (no Refresh) when the alias list is empty', () => {
    const onRefresh = vi.fn();
    render(
      <ModelSelector
        models={MODELS}
        harnesses={[
          { id: 'pi', label: 'pi', description: 'pi', modelSelection: 'list', models: PI_MODELS },
          { id: 'alias', label: 'Alias', description: 'aliases', modelSelection: 'list', models: [] },
        ]}
        harnessId="alias"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId('model-empty-note')).toHaveTextContent('Settings');
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });
});

describe('ModelSelector harness availability', () => {
  const AVAILABILITY_HARNESSES = [
    {
      id: 'pi',
      label: 'pi coding agent',
      description: 'pi',
      modelSelection: 'list',
      models: PI_MODELS,
      available: true,
      detectionSource: 'pi-snapshot',
    },
    {
      id: 'agy',
      label: 'Agy',
      description: 'agy',
      modelSelection: 'list',
      models: [],
      available: false,
      detectionSource: 'not-found',
      hint: 'Install the Antigravity CLI or set KAINBAIN_AGY_BIN.',
    },
    {
      id: 'legacy',
      label: 'Legacy',
      description: 'legacy',
      modelSelection: 'list',
      models: PI_MODELS,
    },
  ];

  it('badges harness options from the backend discovery projection', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={AVAILABILITY_HARNESSES}
        harnessId="pi"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
      />,
    );

    // The selected option's badge renders in the trigger.
    expect(screen.getByRole('combobox', { name: 'Harness for Idea' })).toHaveTextContent('Detected');
    fireEvent.click(screen.getByRole('combobox', { name: 'Harness for Idea' }));
    expect(screen.getByRole('option', { name: /Agy/ })).toHaveTextContent('Unavailable');
    // Entries from older backends (no available field) stay badge-free.
    expect(screen.getByRole('option', { name: 'Legacy' })).not.toHaveTextContent('Detected');
    expect(screen.getByRole('option', { name: 'Legacy' })).not.toHaveTextContent('Unavailable');
    expect(screen.getByRole('option', { name: 'Legacy' })).not.toHaveTextContent('Unknown');
  });

  it('shows the selected harness hint as helper text', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={AVAILABILITY_HARNESSES}
        harnessId="agy"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
      />,
    );
    expect(screen.getByTestId('harness-availability-hint')).toHaveTextContent(
      'Install the Antigravity CLI or set KAINBAIN_AGY_BIN.',
    );
  });

  it('shows no hint when the selected harness reports none', () => {
    render(
      <ModelSelector
        models={MODELS}
        harnesses={AVAILABILITY_HARNESSES}
        harnessId="pi"
        value=""
        ariaLabel="Model for Idea"
        harnessAriaLabel="Harness for Idea"
      />,
    );
    expect(screen.queryByTestId('harness-availability-hint')).not.toBeInTheDocument();
  });
});

describe('ModelSelector reasoning level picker', () => {
  const PI_REASONING_MODELS = [
    { id: 'm1', name: 'M1', provider: 'google', key: 'pi::google::m1' },
    {
      id: 'm2',
      name: 'M2',
      provider: 'anthropic',
      key: 'pi::anthropic::m2',
      supportedReasoning: ['high'],
    },
    {
      id: 'glm-5.3-flash:cloud',
      name: 'GLM 5.3 Flash',
      provider: 'ollama-cloud',
      key: 'pi::ollama-cloud::glm-5.3-flash:cloud',
    },
  ];
  const REASONING_HARNESSES = [
    {
      id: 'pi',
      label: 'pi',
      description: 'pi',
      modelSelection: 'list',
      reasoningLevels: ['low', 'medium', 'high'],
      models: PI_REASONING_MODELS,
    },
    {
      id: 'muse',
      label: 'Muse',
      description: 'muse',
      modelSelection: 'list',
      models: [{ id: 'c1', name: 'C1', provider: 'anthropic', key: 'muse::anthropic::c1' }],
    },
  ];

  it('shows the Reasoning dropdown only for reasoning-capable harnesses', () => {
    const first = render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="pi"
        value="pi::google::m1"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
        id="default-model-select"
        reasoningLabelNode={
          <label htmlFor="default-model-select-reasoning">Reasoning</label>
        }
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Reasoning' })).toBeInTheDocument();
    expect(screen.getByText('Reasoning', { selector: 'label' })).toHaveAttribute(
      'for',
      'default-model-select-reasoning',
    );
    first.unmount();

    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="muse"
        value="muse::anthropic::c1"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Reasoning' })).not.toBeInTheDocument();
  });

  it('hides the Reasoning dropdown on the virtual alias entry (level-free)', () => {
    render(
      <ModelSelector
        models={[]}
        harnesses={[
          ...REASONING_HARNESSES,
          {
            id: 'alias',
            label: 'Alias',
            description: 'aliases',
            modelSelection: 'list',
            models: [{ id: 'small', name: 'small', provider: 'alias', key: 'small' }],
          },
        ]}
        harnessId="alias"
        value="small"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Reasoning' })).not.toBeInTheDocument();
  });

  it('narrows Reasoning options to the model supportedReasoning set when present (Q5)', () => {
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="pi"
        value="pi::anthropic::m2"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    expect(screen.getByRole('option', { name: 'Default (no level)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'high' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'low' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'medium' })).not.toBeInTheDocument();
  });

  it('persists the ::level suffix on save when a level is picked', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="pi"
        value="pi::google::m1"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    fireEvent.click(screen.getByRole('option', { name: 'high' }));
    expect(onChange).toHaveBeenCalledWith('pi::google::m1::high', expect.anything());
  });

  it('stores the bare ref (no suffix) when Default (no level) is picked (Q4)', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="pi"
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Reasoning' })).toHaveTextContent('high');
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    fireEvent.click(screen.getByRole('option', { name: 'Default (no level)' }));
    expect(onChange).toHaveBeenCalledWith('pi::google::m1', expect.anything());
  });

  it('preserves the current level when the model changes', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="pi"
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
    fireEvent.click(screen.getByRole('option', { name: 'M2' }));
    expect(onChange).toHaveBeenCalledWith('pi::anthropic::m2::high', expect.anything());
  });

  it('strips a stored suffix on load for null-harness targets, keeps it on capable ones (Q2)', () => {
    const onChange = vi.fn();
    const stripped = render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="muse"
        value="muse::anthropic::c1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(onChange).toHaveBeenCalledWith('muse::anthropic::c1');
    stripped.unmount();

    const kept = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="pi"
        value="pi::google::m1::high"
        onChange={kept}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(kept).not.toHaveBeenCalled();
  });

  it('does not strip a level that belongs to a capable stored harness when the picker is scoped to a null one', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="muse"
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves a saved level untouched when its harness is missing from the catalogue (loading races)', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES.filter((h) => h.id !== 'pi')}
        harnessId="muse"
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    // The stored harness is momentarily undiscovered — destroying the level
    // now would lose the saved choice, so load leaves it verbatim.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the saved level once the catalogue arrives after a reload with no harnesses', () => {
    const onChange = vi.fn();
    const view = render(
      <ModelSelector
        models={[]}
        harnesses={[]}
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    // No catalogue yet: no Reasoning control and no destructive rewrite.
    expect(screen.queryByRole('combobox', { name: 'Reasoning' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    // Reload lands the catalogue: the dropdown appears with the saved level
    // selected (never reset to "Default (no level)").
    view.rerender(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Reasoning' })).toHaveTextContent('high');
    expect(onChange).not.toHaveBeenCalledWith(
      expect.stringMatching(/^pi::google::m1$/),
      expect.anything(),
    );
  });

  it('blocks switching to a null harness with a level set until Clear completes the switch (Q3)', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Harness' }));
    fireEvent.click(screen.getByRole('option', { name: 'Muse' }));

    // Blocked: the harness stays put and the inline notice names the fix.
    expect(screen.getByRole('combobox', { name: 'Harness' })).toHaveTextContent('pi');
    expect(screen.getByTestId('reasoning-clear-notice')).toHaveTextContent(
      'Clear the reasoning level first',
    );

    // One click clears the level AND completes the pending switch.
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith('pi::google::m1');
    expect(screen.getByRole('combobox', { name: 'Harness' })).toHaveTextContent('Muse');
    expect(screen.queryByTestId('reasoning-clear-notice')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Reasoning' })).not.toBeInTheDocument();
  });

  it('retires the blocked-switch notice when the level is cleared through the Reasoning dropdown', () => {
    const onChange = vi.fn();
    const view = render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        value="pi::google::m1::high"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Harness' }));
    fireEvent.click(screen.getByRole('option', { name: 'Muse' }));
    expect(screen.getByTestId('reasoning-clear-notice')).toBeInTheDocument();

    // The level is dropped via the Reasoning dropdown instead of the
    // notice's Clear button: the re-rendered picker carries no level, so
    // the notice retires even though the pending switch was never completed.
    view.rerender(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        value="pi::google::m1"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.queryByTestId('reasoning-clear-notice')).not.toBeInTheDocument();
  });

  it('keeps single-colon model ids intact through level changes', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="pi"
        value="pi::ollama-cloud::glm-5.3-flash:cloud"
        onChange={onChange}
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('GLM 5.3 Flash');
    fireEvent.click(screen.getByRole('combobox', { name: 'Reasoning' }));
    fireEvent.click(screen.getByRole('option', { name: 'medium' }));
    expect(onChange).toHaveBeenCalledWith(
      'pi::ollama-cloud::glm-5.3-flash:cloud::medium',
      expect.anything(),
    );
  });

  it('explains the missing Reasoning dropdown on level-free harnesses (real catalogue)', () => {
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="muse"
        value="muse::anthropic::c1"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Reasoning' })).not.toBeInTheDocument();
    expect(screen.getByTestId('reasoning-unavailable-note')).toHaveTextContent(
      /doesn't support adjustable reasoning/,
    );
  });

  it('stays silent about reasoning on the synthetic fallback (older backend judges nothing)', () => {
    render(
      <ModelSelector
        models={PI_REASONING_MODELS}
        harnesses={[]}
        value="pi::google::m1"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.queryByTestId('reasoning-unavailable-note')).not.toBeInTheDocument();
  });

  it('shows the Reasoning dropdown instead of the note when a model advertises its own levels (Q5)', () => {
    render(
      <ModelSelector
        models={[]}
        harnesses={REASONING_HARNESSES}
        harnessId="muse"
        value="muse::anthropic::c1"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    // The muse entry itself is level-free…
    expect(screen.getByTestId('reasoning-unavailable-note')).toBeInTheDocument();
    // …but a model advertising supportedReasoning still earns the dropdown.
    const withModelLevels = render(
      <ModelSelector
        models={[]}
        harnesses={[
          {
            ...REASONING_HARNESSES[1],
            models: [
              {
                id: 'c1',
                name: 'C1',
                provider: 'anthropic',
                key: 'muse::anthropic::c1',
                supportedReasoning: ['low'],
              },
            ],
          },
        ]}
        harnessId="muse"
        value="muse::anthropic::c1"
        ariaLabel="Model"
        harnessAriaLabel="Harness"
      />,
    );
    expect(screen.getAllByTestId('reasoning-unavailable-note')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Reasoning' })).toBeInTheDocument();
    withModelLevels.unmount();
  });
});

describe('resolveStoredModelValidity', () => {
  it('reports known refs with their resolved dropdown value', () => {
    expect(resolveStoredModelValidity(MODELS, 'google::gemini-2.5-pro')).toEqual({
      status: 'known',
      resolvedValue: 'google::gemini-2.5-pro',
    });
    // Legacy bare ids remap onto the catalogued option.
    expect(resolveStoredModelValidity(MODELS, 'gemini-2.5-pro')).toEqual({
      status: 'known',
      resolvedValue: 'google::gemini-2.5-pro',
    });
  });

  it('reports stale/foreign refs as unknown (badge, never block)', () => {
    expect(resolveStoredModelValidity(MODELS, 'antigravity::google::stale')).toEqual({
      status: 'unknown',
      resolvedValue: 'antigravity::google::stale',
    });
  });

  it('reports blank values as blank', () => {
    expect(resolveStoredModelValidity(MODELS, '')).toEqual({ status: 'blank', resolvedValue: '' });
    expect(resolveStoredModelValidity(MODELS, undefined)).toEqual({ status: 'blank', resolvedValue: '' });
  });
});