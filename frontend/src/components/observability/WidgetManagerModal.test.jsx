import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WidgetManagerModal } from './WidgetManagerModal';
import { WIDGET_CATALOG } from './widgetRegistry';
import '@testing-library/jest-dom';

/***
 * MARK: WidgetManagerModal tests
 * @description Proves the add-widget menu is grouped by category, lets any
 *   widget be added more than once, manages each instance independently, and
 *   upgrades a pasted version 1 layout.
 ***/

const TWO_QUEUE_INSTANCES = [
  {
    instanceId: 'kpi-queue',
    id: 'kpi-queue',
    colSpan: 3,
    height: 'compact',
    enabled: true,
    config: {},
  },
  {
    instanceId: 'kpi-queue-2',
    id: 'kpi-queue',
    colSpan: 3,
    height: 'compact',
    enabled: false,
    config: {},
  },
];

function renderModal({ layout = TWO_QUEUE_INSTANCES, ...handlers } = {}) {
  const onUpdateLayout = handlers.onUpdateLayout || vi.fn();
  const onClose = handlers.onClose || vi.fn();
  render(
    <WidgetManagerModal
      isOpen
      onClose={onClose}
      layout={layout}
      onUpdateLayout={onUpdateLayout}
      onApplyPreset={handlers.onApplyPreset || vi.fn()}
      onResetLayout={handlers.onResetLayout || vi.fn()}
    />,
  );
  return { onUpdateLayout, onClose };
}

describe('WidgetManagerModal widget catalog', () => {
  it('groups widgets by category', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Metrics & KPIs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Queue & Tasks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Logs & Console' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System & Health' })).toBeInTheDocument();

    // Every catalog widget is offered exactly once.
    for (const widget of WIDGET_CATALOG) {
      expect(screen.getByTestId(`widget-catalog-${widget.id}`)).toBeInTheDocument();
    }
  });

  it('lists each live instance of a widget with a count chip', () => {
    renderModal();

    const row = within(screen.getByTestId('widget-catalog-kpi-queue'));
    expect(row.getByTestId('widget-count-kpi-queue')).toHaveTextContent('×2');
    expect(row.getByTestId('widget-instance-kpi-queue')).toBeInTheDocument();
    expect(row.getByTestId('widget-instance-kpi-queue-2')).toBeInTheDocument();
  });

  it('adds a further copy with a fresh unique instance id', () => {
    const { onUpdateLayout } = renderModal();

    fireEvent.click(
      within(screen.getByTestId('widget-catalog-kpi-queue')).getByRole('button', {
        name: 'Add KPI: Queue Depth widget',
      }),
    );

    expect(onUpdateLayout).toHaveBeenCalledTimes(1);
    // Updates go through the updater form so rapid clicks read live state.
    const applyUpdate = onUpdateLayout.mock.calls[0][0];
    expect(typeof applyUpdate).toBe('function');
    const updated = applyUpdate(TWO_QUEUE_INSTANCES);
    expect(updated).toHaveLength(3);
    expect(updated[2]).toMatchObject({
      instanceId: 'kpi-queue-3',
      id: 'kpi-queue',
      enabled: true,
    });
  });

  it('computes each rapid add from live state so no two copies collide', () => {
    const { onUpdateLayout } = renderModal();
    const addButton = within(screen.getByTestId('widget-catalog-kpi-queue')).getByRole('button', {
      name: 'Add KPI: Queue Depth widget',
    });

    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(onUpdateLayout).toHaveBeenCalledTimes(2);
    // React runs the queued updaters in order against fresh state, exactly
    // like the dashboard's setLayout does.
    let live = [...TWO_QUEUE_INSTANCES];
    for (const applyUpdate of onUpdateLayout.mock.calls.map((call) => call[0])) {
      live = applyUpdate(live);
    }
    expect(live.map((entry) => entry.instanceId)).toEqual([
      'kpi-queue',
      'kpi-queue-2',
      'kpi-queue-3',
      'kpi-queue-4',
    ]);
  });

  it('adds a widget that is not placed yet with its catalog defaults', () => {
    const { onUpdateLayout } = renderModal({ layout: [] });

    fireEvent.click(
      within(screen.getByTestId('widget-catalog-health-litellm')).getByRole('button', {
        name: 'Add Health: LiteLLM Proxy widget',
      }),
    );

    const applyUpdate = onUpdateLayout.mock.calls[0][0];
    expect(applyUpdate([])).toEqual([
      {
        instanceId: 'health-litellm',
        id: 'health-litellm',
        colSpan: 3,
        height: 'compact',
        enabled: true,
        config: {},
      },
    ]);
  });
});

describe('WidgetManagerModal instance controls', () => {
  it('shows a hidden instance without changing its sibling', () => {
    const { onUpdateLayout } = renderModal();

    fireEvent.click(
      within(screen.getByTestId('widget-instance-kpi-queue-2')).getByRole('button', {
        name: 'Show kpi-queue-2',
      }),
    );

    const updated = onUpdateLayout.mock.calls[0][0](TWO_QUEUE_INSTANCES);
    expect(updated.find((entry) => entry.instanceId === 'kpi-queue-2').enabled).toBe(true);
    expect(updated.find((entry) => entry.instanceId === 'kpi-queue').enabled).toBe(true);
  });

  it('hides one visible instance on its own', () => {
    const { onUpdateLayout } = renderModal();

    fireEvent.click(
      within(screen.getByTestId('widget-instance-kpi-queue')).getByRole('button', {
        name: 'Hide kpi-queue',
      }),
    );

    const updated = onUpdateLayout.mock.calls[0][0](TWO_QUEUE_INSTANCES);
    expect(updated.find((entry) => entry.instanceId === 'kpi-queue').enabled).toBe(false);
    expect(updated.find((entry) => entry.instanceId === 'kpi-queue-2').enabled).toBe(false);
  });

  it('removes exactly one instance', () => {
    const { onUpdateLayout } = renderModal();

    fireEvent.click(
      within(screen.getByTestId('widget-instance-kpi-queue')).getByRole('button', {
        name: 'Remove kpi-queue',
      }),
    );

    const updated = onUpdateLayout.mock.calls[0][0](TWO_QUEUE_INSTANCES);
    expect(updated.map((entry) => entry.instanceId)).toEqual(['kpi-queue-2']);
  });
});

describe('WidgetManagerModal import', () => {
  it('upgrades a pasted version 1 layout through the shared validator', () => {
    const { onUpdateLayout, onClose } = renderModal({ layout: [] });

    fireEvent.click(screen.getByRole('button', { name: /Export \/ Import/i }));
    fireEvent.change(screen.getByPlaceholderText(/Paste dashboard layout JSON/i), {
      target: {
        value: JSON.stringify([
          { id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
          { id: 'removedWidget', colSpan: 6, height: 'normal', enabled: true },
        ]),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply Imported Layout/i }));

    expect(onUpdateLayout).toHaveBeenCalledTimes(1);
    expect(onUpdateLayout.mock.calls[0][0]).toEqual([
      { instanceId: 'kpis', id: 'kpis', colSpan: 12, height: 'compact', enabled: true, config: {} },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects a layout with no recognised widgets instead of silently resetting', () => {
    const { onUpdateLayout } = renderModal({ layout: [] });

    fireEvent.click(screen.getByRole('button', { name: /Export \/ Import/i }));
    fireEvent.change(screen.getByPlaceholderText(/Paste dashboard layout JSON/i), {
      target: { value: JSON.stringify([{ id: 'ghostWidget' }]) },
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply Imported Layout/i }));

    expect(onUpdateLayout).not.toHaveBeenCalled();
    expect(screen.getByText(/No recognised widgets/i)).toBeInTheDocument();
  });

  it('reports malformed JSON inline', () => {
    renderModal({ layout: [] });

    fireEvent.click(screen.getByRole('button', { name: /Export \/ Import/i }));
    fireEvent.change(screen.getByPlaceholderText(/Paste dashboard layout JSON/i), {
      target: { value: 'not-json{{' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply Imported Layout/i }));

    expect(screen.getByText(/Failed to parse JSON/i)).toBeInTheDocument();
  });
});

/***
 * MARK: WidgetManagerModal tab state tests
 * @description The tab strip's active state must not be colour-only:
 *   `aria-current` exposes it to assistive tech (WCAG 4.1.2 / 1.4.1), and the
 *   labels are written in normal case (WCAG 3.1.1).
 ***/
describe('WidgetManagerModal tab state', () => {
  it('marks exactly the active tab with aria-current', () => {
    renderModal({ layout: [] });

    expect(screen.getByRole('button', { name: /Widgets catalog/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Layout presets/i })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('button', { name: /Export \/ Import/i })).not.toHaveAttribute(
      'aria-current',
    );

    fireEvent.click(screen.getByRole('button', { name: /Layout presets/i }));
    expect(screen.getByRole('button', { name: /Layout presets/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Widgets catalog/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('writes tab labels in normal case (not literal all-caps, WCAG 3.1.1)', () => {
    renderModal({ layout: [] });
    const widgetsTab = screen.getByRole('button', { name: /Widgets Catalog/i });
    expect(widgetsTab.textContent).toContain('Widgets Catalog');
    expect(screen.getByRole('button', { name: /Layout Presets/i }).textContent).toContain(
      'Layout Presets',
    );
  });
});
