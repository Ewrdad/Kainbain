import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassesViewportGate } from './GlassesViewportGate.jsx';
import { setGlassesViewportOverride } from '../util/viewport.js';
import '@testing-library/jest-dom';

/***
 * MARK: GlassesViewportGate tests
 * @description Guards the subtree swap: glasses content renders only in
 *   glasses mode, normal children render everywhere else.
 ***/
describe('GlassesViewportGate', () => {
  afterEach(() => {
    setGlassesViewportOverride(null);
  });

  it('renders glasses content in glasses mode', () => {
    setGlassesViewportOverride(true);
    render(
      <GlassesViewportGate glasses={<div data-testid="glasses-only" />}>
        <div data-testid="normal-only" />
      </GlassesViewportGate>,
    );
    expect(screen.getByTestId('glasses-only')).toBeInTheDocument();
    expect(screen.queryByTestId('normal-only')).not.toBeInTheDocument();
  });

  it('renders normal children outside glasses mode', () => {
    setGlassesViewportOverride(false);
    render(
      <GlassesViewportGate glasses={<div data-testid="glasses-only" />}>
        <div data-testid="normal-only" />
      </GlassesViewportGate>,
    );
    expect(screen.getByTestId('normal-only')).toBeInTheDocument();
    expect(screen.queryByTestId('glasses-only')).not.toBeInTheDocument();
  });
});
