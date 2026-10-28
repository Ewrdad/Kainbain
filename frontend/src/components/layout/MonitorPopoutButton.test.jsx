import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { MonitorPopoutButton } from './MonitorPopoutButton';
import { Header } from './Header';
import '@testing-library/jest-dom';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

test('left-click opens the popout, right-click opens the compact view', () => {
  const onOpenPopout = vi.fn();
  const onOpenCompact = vi.fn();
  renderWithKainBain(
    <MonitorPopoutButton onOpenPopout={onOpenPopout} onOpenCompact={onOpenCompact} />,
  );

  const button = screen.getByRole('button', { name: /Open Observability Screen/i });

  fireEvent.click(button);
  expect(onOpenPopout).toHaveBeenCalledTimes(1);
  expect(onOpenCompact).not.toHaveBeenCalled();

  const contextEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  const prevented = !button.dispatchEvent(contextEvent);
  expect(prevented).toBe(true);
  expect(onOpenCompact).toHaveBeenCalledTimes(1);
  expect(onOpenPopout).toHaveBeenCalledTimes(1);
});

test('mobile button taps straight into the compact view (no popout)', () => {
  const onOpenPopout = vi.fn();
  const onOpenCompact = vi.fn();
  renderWithKainBain(
    <MonitorPopoutButton onOpenPopout={onOpenPopout} onOpenCompact={onOpenCompact} />,
  );

  const mobileButton = screen.getByRole('button', { name: /Open Compact Monitor Logs View/i });
  // Mobile-only visibility: shown below `sm`, hidden where the popout shows.
  expect(mobileButton.className).toMatch(/sm:hidden/);

  fireEvent.click(mobileButton);
  expect(onOpenCompact).toHaveBeenCalledTimes(1);
  expect(onOpenPopout).not.toHaveBeenCalled();
});

test('desktop popout and mobile compact buttons coexist with distinct labels', () => {
  renderWithKainBain(<MonitorPopoutButton />);
  expect(screen.getByRole('button', { name: /Open Observability Screen/i })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Open Compact Monitor Logs View/i }),
  ).toBeInTheDocument();
});

test('header right-click requests compact and navigates; left-click pops out', () => {
  const setView = vi.fn();
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  renderWithKainBain(<Header />, {
    projects: [{ id: 'proj-1', name: 'Project Alpha', slug: 'project-alpha' }],
    activeProjectId: 'proj-1',
    setView,
  });

  const button = screen.getByRole('button', { name: /Open Observability Screen/i });

  fireEvent.click(button);
  expect(openSpy).toHaveBeenCalledWith(
    '#/observability',
    'kainbain_monitor',
    expect.stringContaining('width=1600'),
  );
  expect(setView).not.toHaveBeenCalled();

  fireEvent.contextMenu(button);
  expect(setView).toHaveBeenCalledWith('observability');
  expect(window.sessionStorage.getItem('kainbain:observability:compact')).toBe('1');

  openSpy.mockRestore();
});
