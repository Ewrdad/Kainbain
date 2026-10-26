import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { InfoTooltip, HOVER_DELAY_MS, HIDE_DELAY_MS } from './InfoTooltip';
import { setTouchInputOverride } from '../../hooks/useTapGuard';

describe('InfoTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore real coarse-pointer detection for other suites.
    setTouchInputOverride(null);
  });

  it('renders default info icon when no children provided', () => {
    render(
      <InfoTooltip
        title="Test Tooltip"
        description="Explains a backend feature."
      />
    );
    const trigger = screen.getByRole('button', { name: /Learn more about Test Tooltip/i });
    expect(trigger).toBeInTheDocument();
  });

  it('renders custom trigger element and reveals tooltip on mouse enter', () => {
    render(
      <InfoTooltip
        title="Architecture Guide"
        description="Detailed system design."
        behindTheScenes="Runs via LiteLLM proxy"
        shortcut="Alt+A"
        tip="Press Esc to close"
      >
        <button type="button">Trigger Button</button>
      </InfoTooltip>
    );

    const trigger = screen.getByText('Trigger Button');
    expect(trigger).toBeInTheDocument();

    // Hover to reveal
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });

    expect(screen.getByText('Architecture Guide')).toBeInTheDocument();
    expect(screen.getByText('Detailed system design.')).toBeInTheDocument();
    expect(screen.getByText('Runs via LiteLLM proxy')).toBeInTheDocument();
    expect(screen.getByText('Alt+A')).toBeInTheDocument();
    expect(screen.getByText('Press Esc to close')).toBeInTheDocument();

    // Mouse leave hides tooltip
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS + 50);
    });
    expect(screen.queryByText('Architecture Guide')).not.toBeInTheDocument();
  });

  it('pins tooltip open on click and unpins on Escape key', () => {
    render(
      <InfoTooltip
        title="Pinnable Tooltip"
        description="Stays open when clicked."
      />
    );

    const trigger = screen.getByRole('button', { name: /Learn more about Pinnable Tooltip/i });

    // Click to pin
    fireEvent.click(trigger);
    expect(screen.getByText('Pinnable Tooltip')).toBeInTheDocument();

    // Mouse leave should keep it open because it is pinned
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS + 50);
    });
    expect(screen.getByText('Pinnable Tooltip')).toBeInTheDocument();

    // Press Escape to dismiss
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Pinnable Tooltip')).not.toBeInTheDocument();
  });

  it('supports focus and blur for keyboard accessibility', () => {
    render(
      <InfoTooltip
        title="Accessible Tooltip"
        description="Visible on keyboard focus."
      >
        <button type="button">Focusable</button>
      </InfoTooltip>
    );

    const trigger = screen.getByText('Focusable');

    fireEvent.focus(trigger);
    expect(screen.getByText('Accessible Tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);
    expect(screen.queryByText('Accessible Tooltip')).not.toBeInTheDocument();
  });

  /***
   * MARK: mobile tap-guard tests (task e2cf55ac)
   * @description On coarse-pointer (touch) devices a tap on a button/dropdown
   *   wrapped by InfoTooltip must actuate the control and NEVER open the
   *   popover; a tap on a non-button region pins the popover (without
   *   bubbling into e.g. the task inspector). Desktop hover/focus behaviour
   *   and the default ⓘ icon's click-pin are regression-guarded below.
   ***/
  it('does not open the popover when a wrapped button is tapped in touch mode', () => {
    setTouchInputOverride(true);
    render(
      <InfoTooltip title="Switcher Tooltip" description="Should never appear.">
        <button type="button" aria-haspopup="menu">Select pipeline workflow</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Select pipeline workflow' });
    fireEvent.focus(trigger);
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 100);
    });

    expect(screen.queryByText('Switcher Tooltip')).not.toBeInTheDocument();
  });

  it('does not open the popover when a wrapped input is tapped in touch mode', () => {
    setTouchInputOverride(true);
    render(
      <InfoTooltip title="Search Tooltip" description="Should never appear.">
      	<input type="text" aria-label="Search tasks" />
      </InfoTooltip>
    );

    const input = screen.getByLabelText('Search tasks');
    fireEvent.focus(input);
    fireEvent.mouseEnter(input);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 100);
    });

    expect(screen.queryByText('Search Tooltip')).not.toBeInTheDocument();
  });

  it('pins the popover open when a wrapped non-interactive span is tapped in touch mode and stops propagation', () => {
    setTouchInputOverride(true);
    const onOutsideClick = vi.fn(); // stands in for the task card's onClick
    render(
      <div onClick={onOutsideClick}>
        <InfoTooltip title="Task ID Tooltip" description="Unique task identifier.">
          <span>#KB-ABC1</span>
        </InfoTooltip>
      </div>
    );

    fireEvent.click(screen.getByText('#KB-ABC1'));

    // Pinned open with the dialog role, and the card-level click was suppressed.
    expect(screen.getByText('Task ID Tooltip')).toBeInTheDocument();
    expect(screen.getByText('Unique task identifier.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Task ID Tooltip' })).toBeInTheDocument();
    expect(onOutsideClick).not.toHaveBeenCalled();

    // Tap outside closes the pinned popover.
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Task ID Tooltip')).not.toBeInTheDocument();
  });

  it('lets an interactive tap bubble to ancestors and never pins in touch mode', () => {
    setTouchInputOverride(true);
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <InfoTooltip title="Approve Tooltip" description="Should never appear.">
          <button type="button">Approve</button>
        </InfoTooltip>
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(screen.queryByText('Approve Tooltip')).not.toBeInTheDocument();
    // The tap must keep bubbling so the control's context (e.g. task card) sees it.
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('does not re-open the popover after a second tap unpins it (no emulated-hover ghost)', () => {
    setTouchInputOverride(true);
    render(
      <InfoTooltip title="Badge Tooltip" description="Pinned on tap.">
        <span>Done</span>
      </InfoTooltip>
    );

    const badge = screen.getByText('Done');
    fireEvent.click(badge);
    expect(screen.getByText('Badge Tooltip')).toBeInTheDocument();

    // Second tap on the badge unpins; emulated mouseenter fires on both taps.
    fireEvent.mouseEnter(badge);
    fireEvent.click(badge);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 100);
    });

    expect(screen.queryByText('Badge Tooltip')).not.toBeInTheDocument();
  });

  it('keeps desktop hover and focus behaviour unchanged (regression guard)', () => {
    setTouchInputOverride(false);
    render(
      <InfoTooltip title="Desktop Tooltip" description="Hover and focus still work.">
        <button type="button">Desktop Trigger</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Desktop Trigger' });

    // Hover opens after the delay.
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    expect(screen.getByText('Desktop Tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS + 50);
    });
    expect(screen.queryByText('Desktop Tooltip')).not.toBeInTheDocument();

    // Focus opens immediately (keyboard a11y).
    fireEvent.focus(trigger);
    expect(screen.getByText('Desktop Tooltip')).toBeInTheDocument();
  });

  it('keeps the default info icon click-to-pin in touch mode', () => {
    setTouchInputOverride(true);
    render(
      <InfoTooltip title="Icon Tooltip" description="Tapping the icon pins it." />
    );

    const icon = screen.getByRole('button', { name: /Learn more about Icon Tooltip/i });
    fireEvent.click(icon);
    expect(screen.getByText('Icon Tooltip')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Icon Tooltip' })).toBeInTheDocument();
  });
});
