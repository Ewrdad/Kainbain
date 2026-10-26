import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETROSPECTIVE_PANE,
  RETROSPECTIVE_MOBILE_BREAKPOINT,
  RETROSPECTIVE_PANES,
  isRetrospectivePaneId,
  normalizeRetrospectivePane,
  retrospectiveMobileTabClass,
  retrospectivePaneClass,
} from './retrospectiveMobile';

/***
 * MARK: retrospectiveMobile tests
 * @description Locks the mobile tab-strip helpers: the pane registry, pane-id
 *   validation, and the responsive visibility classes that show one pane on
 *   phones while every pane stays visible on desktop.
 ***/
describe('RETROSPECTIVE_PANES', () => {
  it('lists the three page panes in display order', () => {
    expect(RETROSPECTIVE_PANES.map((pane) => pane.id)).toEqual(['histories', 'actions', 'chat']);
  });

  it('gives every pane a label and a unique panel id', () => {
    for (const pane of RETROSPECTIVE_PANES) {
      expect(pane.label).toMatch(/\S/);
      expect(pane.panelId).toMatch(/\S/);
    }
    const panelIds = new Set(RETROSPECTIVE_PANES.map((pane) => pane.panelId));
    expect(panelIds.size).toBe(RETROSPECTIVE_PANES.length);
  });

  it('pins the mobile breakpoint to the page grid breakpoint', () => {
    // The page grid goes three-column at `lg:` — the tab strip must mirror
    // that exact breakpoint so tabs appear whenever the panes stack.
    expect(RETROSPECTIVE_MOBILE_BREAKPOINT).toBe('lg');
    expect(DEFAULT_RETROSPECTIVE_PANE).toBe('histories');
  });
});

describe('isRetrospectivePaneId / normalizeRetrospectivePane', () => {
  it('accepts only registered pane ids', () => {
    expect(isRetrospectivePaneId('histories')).toBe(true);
    expect(isRetrospectivePaneId('actions')).toBe(true);
    expect(isRetrospectivePaneId('chat')).toBe(true);
    expect(isRetrospectivePaneId('settings')).toBe(false);
    expect(isRetrospectivePaneId('')).toBe(false);
    expect(isRetrospectivePaneId(null)).toBe(false);
    expect(isRetrospectivePaneId(undefined)).toBe(false);
  });

  it('falls back to the default pane for unknown values', () => {
    expect(normalizeRetrospectivePane('chat')).toBe('chat');
    expect(normalizeRetrospectivePane('nope')).toBe(DEFAULT_RETROSPECTIVE_PANE);
    expect(normalizeRetrospectivePane(null)).toBe(DEFAULT_RETROSPECTIVE_PANE);
  });
});

describe('retrospectivePaneClass', () => {
  it('shows the active pane at every viewport', () => {
    const active = retrospectivePaneClass(true);
    expect(active).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('hides inactive panes on mobile but restores them on desktop', () => {
    const inactive = retrospectivePaneClass(false);
    expect(inactive).toMatch(/(^|\s)hidden(\s|$)/);
    expect(inactive).toMatch(/lg:block/);
  });
});

describe('retrospectiveMobileTabClass', () => {
  it('marks the selected tab and keeps a 44px touch target on both states', () => {
    const selected = retrospectiveMobileTabClass(true);
    const unselected = retrospectiveMobileTabClass(false);
    expect(selected).not.toBe(unselected);
    expect(selected).toMatch(/min-h-\[44px\]/);
    expect(unselected).toMatch(/min-h-\[44px\]/);
  });
});
