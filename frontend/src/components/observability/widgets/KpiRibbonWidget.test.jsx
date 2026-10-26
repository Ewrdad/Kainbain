import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiRibbonWidget } from './KpiRibbonWidget';

/***
 * MARK: KpiRibbonWidget tests
 * @description Parity guard: the ribbon must render exactly the same shared
 *   cards as the five atomic KPI widgets. The card identity rules (model /
 *   harness / alias) are covered in depth by KpiEngineWidget.test.jsx.
 ***/

it('renders all five atomic KPI cards on one row', () => {
  render(
    <KpiRibbonWidget
      stats={{ completed: 7, failed: 1, waitingHuman: 2, successRate: 87.5, failureRate: 12.5 }}
      scheduledQueue={[{}, {}, {}]}
      engineState={{ activeStageName: 'Build' }}
      activeTask={{ model: 'pi::p::m', harness: 'pi' }}
    />,
  );

  expect(screen.getByTestId('kpi-successes')).toBeInTheDocument();
  expect(screen.getByTestId('kpi-failures')).toBeInTheDocument();
  expect(screen.getByTestId('kpi-queue')).toBeInTheDocument();
  expect(screen.getByTestId('kpi-checkpoints')).toBeInTheDocument();
  expect(screen.getByTestId('kpi-pipeline')).toBeInTheDocument();
});

it('renders the same values and engine identity as the atomic widgets', () => {
  render(
    <KpiRibbonWidget
      stats={{ completed: 7, failed: 1, successRate: 87.5, failureRate: 12.5 }}
      scheduledQueue={[]}
      activeTask={{ model: 'pi::provider::model:cloud', harness: 'pi' }}
    />,
  );

  expect(screen.getByText('(87.5%)')).toBeInTheDocument();
  expect(screen.getByText('(12.5%)')).toBeInTheDocument();
  expect(screen.getByText('Model: pi::provider::model:cloud')).toBeInTheDocument();
});
