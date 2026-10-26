import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RetrospectiveProvider, useRetrospective } from './useRetrospective';
import '@testing-library/jest-dom';

/***
 * MARK: useRetrospective tests
 * @description Locks the cross-pane selection contract: toggle/set/clear
 *   over the id set, and chat seeds that re-apply via a nonce.
 ***/
function Probe() {
  const { selectedIds, toggleSelected, setSelected, clearSelection, chatSeed, seedChat } =
    useRetrospective();
  return (
    <div>
      <span data-testid="selected">{[...selectedIds].sort().join(',')}</span>
      <span data-testid="seed">{`${chatSeed.nonce}:${chatSeed.text}`}</span>
      <button type="button" onClick={() => toggleSelected('t1')}>
        toggle-t1
      </button>
      <button type="button" onClick={() => setSelected('t2', true)}>
        select-t2
      </button>
      <button type="button" onClick={() => setSelected('t1', false)}>
        deselect-t1
      </button>
      <button type="button" onClick={clearSelection}>
        clear
      </button>
      <button type="button" onClick={() => seedChat('trends?')}>
        seed
      </button>
    </div>
  );
}

function renderProbe(props = {}) {
  return render(
    <RetrospectiveProvider {...props}>
      <Probe />
    </RetrospectiveProvider>,
  );
}

describe('useRetrospective', () => {
  it('toggles, sets, and clears the selection', () => {
    renderProbe({ initialSelectedIds: ['t9'] });
    expect(screen.getByTestId('selected')).toHaveTextContent('t9');
    fireEvent.click(screen.getByText('toggle-t1'));
    expect(screen.getByTestId('selected')).toHaveTextContent('t1,t9');
    fireEvent.click(screen.getByText('deselect-t1'));
    expect(screen.getByTestId('selected')).toHaveTextContent('t9');
    fireEvent.click(screen.getByText('select-t2'));
    expect(screen.getByTestId('selected')).toHaveTextContent('t2,t9');
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('selected')).toHaveTextContent('');
  });

  it('bumps the seed nonce on every seedChat call', () => {
    renderProbe();
    expect(screen.getByTestId('seed')).toHaveTextContent('0:');
    fireEvent.click(screen.getByText('seed'));
    expect(screen.getByTestId('seed')).toHaveTextContent('1:trends?');
    fireEvent.click(screen.getByText('seed'));
    expect(screen.getByTestId('seed')).toHaveTextContent('2:trends?');
  });

  it('throws outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/RetrospectiveProvider/);
  });
});
