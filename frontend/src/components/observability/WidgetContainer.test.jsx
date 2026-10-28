import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetContainer } from './WidgetContainer';
import '@testing-library/jest-dom';

/***
 * MARK: WidgetContainer tests
 * @description Proves a widget copy is keyed and labelled by its instance id,
 *   so two copies of one widget type stay independently targetable.
 ***/

describe('WidgetContainer', () => {
  it('keys the DOM by instance id and shows the catalog title for the first copy', () => {
    render(
      <WidgetContainer id="queue" instanceId="queue" title="Execution Queue Order">
        <p>body</p>
      </WidgetContainer>,
    );

    expect(screen.getByTestId('widget-queue')).toBeInTheDocument();
    expect(screen.getByText('Execution Queue Order')).toBeInTheDocument();
  });

  it('disambiguates a second copy with its instance id in the DOM and labels', () => {
    render(
      <WidgetContainer id="queue" instanceId="queue-2" title="Execution Queue Order" isEditMode>
        <p>body</p>
      </WidgetContainer>,
    );

    expect(screen.getByTestId('widget-queue-2')).toBeInTheDocument();
    expect(screen.getByLabelText('Move Execution Queue Order (queue-2) down')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Resize width for Execution Queue Order (queue-2)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Hide Execution Queue Order (queue-2)')).toBeInTheDocument();
  });

  it('lets a per-instance config title override the catalog title', () => {
    render(
      <WidgetContainer
        id="queue"
        instanceId="queue"
        title="Execution Queue Order"
        titleOverride="Queue (prod)"
      >
        <p>body</p>
      </WidgetContainer>,
    );

    expect(screen.getByText('Queue (prod)')).toBeInTheDocument();
    expect(screen.queryByText('Execution Queue Order')).not.toBeInTheDocument();
  });

  it('reports resize, move, and hide actions from the header controls', () => {
    const onResizeWidth = vi.fn();
    const onResizeHeight = vi.fn();
    const onToggleVisibility = vi.fn();
    const onMoveDown = vi.fn();

    render(
      <WidgetContainer
        id="queue"
        instanceId="queue"
        title="Execution Queue Order"
        isEditMode
        canMoveDown
        onResizeWidth={onResizeWidth}
        onResizeHeight={onResizeHeight}
        onToggleVisibility={onToggleVisibility}
        onMoveDown={onMoveDown}
      >
        <p>body</p>
      </WidgetContainer>,
    );

    fireEvent.change(screen.getByLabelText('Resize width for Execution Queue Order'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('Resize height for Execution Queue Order'), {
      target: { value: 'tall' },
    });
    fireEvent.click(screen.getByLabelText('Hide Execution Queue Order'));
    fireEvent.click(screen.getByLabelText('Move Execution Queue Order down'));

    expect(onResizeWidth).toHaveBeenCalledWith(6);
    expect(onResizeHeight).toHaveBeenCalledWith('tall');
    expect(onToggleVisibility).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('coerces out-of-range sizes to safe defaults instead of a blank select', () => {
    render(
      <WidgetContainer
        id="queue"
        instanceId="queue"
        title="Execution Queue Order"
        colSpan={5}
        height="gigantic"
        isEditMode
      >
        <p>body</p>
      </WidgetContainer>,
    );

    // Half-width grid and the standard height, with working selects.
    expect(screen.getByTestId('widget-queue').className).toContain('lg:col-span-6');
    expect(screen.getByLabelText('Resize width for Execution Queue Order')).toHaveValue('6');
    expect(screen.getByLabelText('Resize height for Execution Queue Order')).toHaveValue('normal');
  });
});
