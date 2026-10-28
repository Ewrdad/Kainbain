import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiEngineWidget } from './KpiEngineWidget';
import '@testing-library/jest-dom';

/***
 * MARK: KpiEngineWidget tests
 * @description The Active Engine card's identity rules (ported from the
 *   composite ribbon test when the card was extracted): model, harness,
 *   autonomous fallback, and the resolved / unresolved alias lines.
 ***/

describe('KpiEngineWidget', () => {
  it('shows the model when one is reported', () => {
    render(<KpiEngineWidget activeTask={{ model: 'pi::provider::model:cloud', harness: 'pi' }} />);
    expect(screen.getByText('Model: pi::provider::model:cloud')).toBeInTheDocument();
  });

  it('shows the harness when no model is reported (harness-managed stage)', () => {
    render(
      <KpiEngineWidget activeTask={{ model: null, harness: 'custom', modelSelection: 'none' }} />,
    );
    expect(screen.getByText('Harness: custom')).toBeInTheDocument();
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  });

  it('falls back to Autonomous Agent with neither model nor harness', () => {
    render(<KpiEngineWidget activeTask={{}} />);
    expect(screen.getByText('Autonomous Agent')).toBeInTheDocument();
  });

  it('shows the stage name and type, and Idle when there is no run', () => {
    const { rerender } = render(
      <KpiEngineWidget
        engineState={{ activeStageName: 'Code Generation', activeStageType: 'agent' }}
      />,
    );
    expect(screen.getByText('Code Generation')).toBeInTheDocument();
    expect(screen.getByText('Type: agent')).toBeInTheDocument();

    rerender(<KpiEngineWidget />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('Type: none')).toBeInTheDocument();
  });

  it('shows the alias line above the model line for alias runs', () => {
    render(
      <KpiEngineWidget
        activeTask={{
          model: 'pi::provider::model:cloud',
          harness: 'pi',
          alias: { name: 'small', targetIndex: 0 },
          aliasMissing: null,
        }}
      />,
    );
    expect(screen.getByText('alias: small')).toBeInTheDocument();
    expect(screen.getByText('Model: pi::provider::model:cloud')).toBeInTheDocument();
  });

  it('shows the unresolved alias with the fallback identity', () => {
    render(
      <KpiEngineWidget
        activeTask={{
          model: 'pi::provider::base',
          harness: 'pi',
          alias: null,
          aliasMissing: 'ghost',
        }}
      />,
    );
    expect(screen.getByText('alias: ghost (unresolved)')).toBeInTheDocument();
    expect(screen.getByText('Model: pi::provider::base')).toBeInTheDocument();
  });

  it.each([
    ['explicit nulls', { alias: null, aliasMissing: null }],
    ['old payload', {}],
  ])('shows no alias line for non-alias runs (%s)', (_, extra) => {
    render(
      <KpiEngineWidget
        activeTask={{ model: 'pi::provider::model:cloud', harness: 'pi', ...extra }}
      />,
    );
    expect(screen.queryByText(/alias:/)).not.toBeInTheDocument();
    expect(screen.getByText('Model: pi::provider::model:cloud')).toBeInTheDocument();
  });
});
