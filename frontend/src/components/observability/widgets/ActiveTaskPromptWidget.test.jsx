import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveTaskPromptWidget } from './ActiveTaskPromptWidget';

it.each(['pi', 'antigravity'])(
  'shows %s harness, model and provider without Pi Agent fallback',
  (harness) => {
    render(
      <ActiveTaskPromptWidget
        activeTask={{
          title: 'Task',
          goal: 'Complete task goal',
          prompt: '# Actual prompt',
          model: `${harness}::provider::model:cloud`,
          harness,
          modelSelection: 'list',
          stageName: 'Build',
          stageType: 'agent',
          stageId: 'build',
          modelDetails: { source: 'session' },
        }}
      />,
    );
    expect(screen.getByText(harness)).toBeInTheDocument();
    expect(screen.getByText('model:cloud')).toBeInTheDocument();
    expect(screen.getByText(/Provider: provider · Source: session/)).toBeInTheDocument();
    expect(screen.queryByText('Pi Agent')).not.toBeInTheDocument();
    expect(screen.getByTestId('active-prompt-viewer')).toHaveTextContent('# Actual prompt');
    expect(screen.getByText('Complete task goal')).toBeInTheDocument();
  },
);

it.each(['custom', 'muse'])(
  'hides the model pill for %s harness without model selection',
  (harness) => {
    render(
      <ActiveTaskPromptWidget
        activeTask={{
          title: 'Task',
          prompt: '# Actual prompt',
          model: `${harness}::provider::model:cloud`,
          harness,
          modelSelection: 'none',
          stageName: 'Build',
          stageType: 'agent',
          stageId: 'build',
          modelDetails: { provider: null, id: null, key: null, source: 'harness-managed' },
        }}
      />,
    );
    expect(screen.getByText(harness)).toBeInTheDocument();
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
    expect(screen.queryByText('model:cloud')).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Stage ID: build/)).toBeInTheDocument();
    expect(screen.getByTestId('active-prompt-viewer')).toHaveTextContent('# Actual prompt');
  },
);

it('renders the model pill when modelSelection is absent (back-compat)', () => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        prompt: '# Actual prompt',
        model: 'custom::provider::model:cloud',
        harness: 'custom',
        stageName: 'Build',
        stageType: 'agent',
        modelDetails: { source: 'session' },
      }}
    />,
  );
  expect(screen.getByText('custom')).toBeInTheDocument();
  expect(screen.getByText('model:cloud')).toBeInTheDocument();
  expect(screen.getByText(/Provider: provider · Source: session/)).toBeInTheDocument();
});

it('does not pretend a goal is a dispatched curated prompt, or invent a model', () => {
  render(<ActiveTaskPromptWidget activeTask={{ goal: 'Only a goal', model: 'default' }} />);
  expect(screen.getAllByText('Unknown').length).toBeGreaterThan(1);
  expect(screen.getByTestId('active-prompt-viewer')).not.toHaveTextContent('Only a goal');
  expect(screen.getByText('No Prompt Payload Active')).toBeInTheDocument();
});

it.each(['merge', 'deploy', 'ci'])(
  'hides harness/model pills on scripted %s stages (backend flag)',
  (stageType) => {
    render(
      <ActiveTaskPromptWidget
        activeTask={{
          title: 'Task',
          prompt: '# Actual prompt',
          model: 'pi::provider::model:cloud',
          harness: 'pi',
          modelSelection: 'list',
          stageName: 'Step',
          stageType,
          stageId: 'step-1',
          isAutomatedStage: true,
          modelDetails: { provider: null, id: null, key: null, source: 'scripted' },
        }}
      />,
    );
    expect(screen.queryByText(/Harness:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider:/)).not.toBeInTheDocument();
    expect(screen.getByText('Automated — no model')).toBeInTheDocument();
    expect(screen.getByText('Step')).toBeInTheDocument();
    expect(screen.getByText(stageType)).toBeInTheDocument();
    expect(screen.getByText(/Stage ID: step-1/)).toBeInTheDocument();
    expect(screen.getByTestId('active-prompt-viewer')).toHaveTextContent('# Actual prompt');
  },
);

it.each(['merge', 'deploy', 'ci', 'script', 'Merge'])(
  'hides harness/model pills on scripted %s stages without the backend flag (legacy payload)',
  (stageType) => {
    render(
      <ActiveTaskPromptWidget
        activeTask={{
          title: 'Task',
          prompt: '# Actual prompt',
          model: 'pi::provider::model:cloud',
          harness: 'pi',
          modelSelection: 'list',
          stageName: 'Step',
          stageType,
          stageId: 'step-1',
          modelDetails: { source: 'stage' },
        }}
      />,
    );
    expect(screen.queryByText(/Harness:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider:/)).not.toBeInTheDocument();
    expect(screen.getByText('Automated — no model')).toBeInTheDocument();
    expect(screen.getByText(/Stage ID: step-1/)).toBeInTheDocument();
  },
);

it('hides pills on scripted stages even when config leakage sets model/harness', () => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        model: 'pi::provider::leaked',
        harness: 'pi',
        modelSelection: 'list',
        stageName: 'Deploy',
        stageType: 'deploy',
        modelDetails: { source: 'stage' },
      }}
    />,
  );
  expect(screen.queryByText('pi')).not.toBeInTheDocument();
  expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  expect(screen.getByText('Automated — no model')).toBeInTheDocument();
});

it('lets the backend flag win over the local stage-type predicate', () => {
  const { rerender } = render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        model: 'pi::p::m',
        harness: 'pi',
        stageName: 'Build',
        stageType: 'agent',
        isAutomatedStage: true,
      }}
    />,
  );
  expect(screen.queryByText(/Harness:/)).not.toBeInTheDocument();
  expect(screen.getByText('Automated — no model')).toBeInTheDocument();
  rerender(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        model: 'pi::p::m',
        harness: 'pi',
        stageName: 'Step',
        stageType: 'merge',
        isAutomatedStage: false,
      }}
    />,
  );
  expect(screen.getByText('pi')).toBeInTheDocument();
  expect(screen.queryByText('Automated — no model')).not.toBeInTheDocument();
});

it.each(['agent', 'human', 'unknown', undefined])(
  'keeps pills visible on %s stages (fail-visible)',
  (stageType) => {
    render(
      <ActiveTaskPromptWidget
        activeTask={{
          title: 'Task',
          prompt: '# Actual prompt',
          model: 'pi::provider::model:cloud',
          harness: 'pi',
          modelSelection: 'list',
          stageName: 'Step',
          stageType,
          modelDetails: { source: 'session' },
        }}
      />,
    );
    expect(screen.getByText('pi')).toBeInTheDocument();
    expect(screen.getByText('model:cloud')).toBeInTheDocument();
    expect(screen.queryByText('Automated — no model')).not.toBeInTheDocument();
  },
);

it('shows the alias pill next to the picked harness and model', () => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        prompt: '# Actual prompt',
        model: 'pi::provider::model:cloud',
        harness: 'pi',
        modelSelection: 'list',
        stageName: 'Build',
        stageType: 'agent',
        stageId: 'build',
        modelDetails: { source: 'alias' },
        alias: { name: 'small', targetIndex: 1 },
        aliasMissing: null,
      }}
    />,
  );
  expect(screen.getByText('small')).toBeInTheDocument();
  expect(screen.getByTitle('alias small, target 2')).toBeInTheDocument();
  expect(screen.getByText('pi')).toBeInTheDocument();
  expect(screen.getByText('model:cloud')).toBeInTheDocument();
  expect(screen.getByText(/Provider: provider · Source: alias/)).toBeInTheDocument();
});

it.each([
  ['explicit nulls', { alias: null, aliasMissing: null }],
  ['old payload', {}],
])('hides the alias pill for non-alias runs (%s)', (_, extra) => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        prompt: '# Actual prompt',
        model: 'pi::provider::model:cloud',
        harness: 'pi',
        modelSelection: 'list',
        stageName: 'Build',
        stageType: 'agent',
        modelDetails: { source: 'stage' },
        ...extra,
      }}
    />,
  );
  expect(screen.queryByText(/alias:/)).not.toBeInTheDocument();
  expect(screen.getByText('pi')).toBeInTheDocument();
  expect(screen.getByText('model:cloud')).toBeInTheDocument();
});

it('shows the unresolved alias with the fallback harness and model', () => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        prompt: '# Actual prompt',
        model: 'pi::provider::base',
        harness: 'pi',
        modelSelection: 'list',
        stageName: 'Build',
        stageType: 'agent',
        modelDetails: { source: 'project' },
        alias: null,
        aliasMissing: 'ghost',
      }}
    />,
  );
  expect(screen.getByText('ghost (unresolved)')).toBeInTheDocument();
  expect(screen.getByText('pi')).toBeInTheDocument();
  expect(screen.getByText('base')).toBeInTheDocument();
  expect(screen.getByText(/Provider: provider · Source: project/)).toBeInTheDocument();
});

it('shows alias and harness without the model pill when the harness manages its own model', () => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        prompt: '# Actual prompt',
        model: null,
        harness: 'custom',
        modelSelection: 'none',
        stageName: 'Build',
        stageType: 'agent',
        modelDetails: { provider: null, id: null, key: null, source: 'harness-managed' },
        alias: { name: 'cli', targetIndex: 0 },
        aliasMissing: null,
      }}
    />,
  );
  expect(screen.getByText('cli')).toBeInTheDocument();
  expect(screen.getByText('custom')).toBeInTheDocument();
  expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
});

it('hides the model pill from modelSelection even when a stale model field leaks through (muse + alias)', () => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        prompt: '# Actual prompt',
        model: 'antigravity::google::gemini-2.5-flash',
        harness: 'muse',
        modelSelection: 'none',
        stageName: 'Build',
        stageType: 'agent',
        modelDetails: {
          provider: 'google',
          id: 'gemini-2.5-flash',
          key: 'antigravity::google::gemini-2.5-flash',
          source: 'stage',
        },
        alias: { name: 'worker' },
        aliasMissing: null,
      }}
    />,
  );
  expect(screen.getByText('worker')).toBeInTheDocument();
  expect(screen.getByText('muse')).toBeInTheDocument();
  expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  expect(screen.queryByText('gemini-2.5-flash')).not.toBeInTheDocument();
  expect(screen.queryByText(/Provider:/)).not.toBeInTheDocument();
});

it.each(['merge', 'deploy'])('hides the alias pill on scripted %s stages', (stageType) => {
  render(
    <ActiveTaskPromptWidget
      activeTask={{
        title: 'Task',
        prompt: '# Actual prompt',
        model: 'pi::provider::model:cloud',
        harness: 'pi',
        modelSelection: 'list',
        stageName: 'Step',
        stageType,
        stageId: 'step-1',
        isAutomatedStage: true,
        modelDetails: { provider: null, id: null, key: null, source: 'scripted' },
        alias: { name: 'small', targetIndex: 0 },
        aliasMissing: null,
      }}
    />,
  );
  expect(screen.queryByText(/alias:/)).not.toBeInTheDocument();
  expect(screen.getByText('Automated — no model')).toBeInTheDocument();
});

it('preserves raw prompt bytes for copy and supports markdown view', () => {
  const writeText = vi.fn();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const prompt = '# Heading\n\nFull content';
  render(<ActiveTaskPromptWidget activeTask={{ prompt, model: 'bad::::ref' }} />);
  fireEvent.click(screen.getByTitle('Copy Full Prompt'));
  expect(writeText).toHaveBeenCalledWith(prompt);
  expect(screen.getByText('bad::::ref')).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Toggle Raw vs Markdown View'));
  expect(screen.getByTestId('active-prompt-viewer')).toHaveTextContent('Full content');
});
