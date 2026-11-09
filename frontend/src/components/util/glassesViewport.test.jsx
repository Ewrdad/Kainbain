import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useIsGlassesViewport, setGlassesViewportOverride } from './viewport.js';
import '@testing-library/jest-dom';

/***
 * MARK: useIsGlassesViewport tests
 * @description Guards the live glasses flag: it reads the real window
 *   dimensions on mount, flips as the window is resized into and out of
 *   the ~600x600 square, and honours the test override seam.
 ***/

function Probe() {
  const isGlasses = useIsGlassesViewport();
  return <div data-testid="glasses-probe">{isGlasses ? 'glasses' : 'full'}</div>;
}

function setWindowSize(width, height) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

describe('useIsGlassesViewport', () => {
  afterEach(() => {
    setGlassesViewportOverride(null);
    setWindowSize(1280, 800);
  });

  it('reads glasses-shaped windows as glasses on mount', () => {
    setWindowSize(600, 600);
    render(<Probe />);
    expect(screen.getByTestId('glasses-probe')).toHaveTextContent('glasses');
  });

  it('reads desktop windows as full on mount', () => {
    setWindowSize(1280, 800);
    render(<Probe />);
    expect(screen.getByTestId('glasses-probe')).toHaveTextContent('full');
  });

  it('flips live as the window crosses the glasses shape', () => {
    setWindowSize(1280, 800);
    render(<Probe />);
    expect(screen.getByTestId('glasses-probe')).toHaveTextContent('full');

    setWindowSize(600, 600);
    expect(screen.getByTestId('glasses-probe')).toHaveTextContent('glasses');

    setWindowSize(600, 900);
    expect(screen.getByTestId('glasses-probe')).toHaveTextContent('full');
  });

  it('test override wins over real dimensions', () => {
    setWindowSize(1280, 800);
    setGlassesViewportOverride(true);
    render(<Probe />);
    expect(screen.getByTestId('glasses-probe')).toHaveTextContent('glasses');
  });
});
