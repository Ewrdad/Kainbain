import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Announcer, RouteAnnouncer, routeAnnouncement } from './Announce';

describe('routeAnnouncement (WCAG 4.1.3)', () => {
  it('names every in-scope view', () => {
    expect(routeAnnouncement('orchestrator')).toMatch(/Orchestrator/);
    expect(routeAnnouncement('explorer')).toMatch(/explorer/i);
    expect(routeAnnouncement('settings')).toMatch(/settings/i);
    expect(routeAnnouncement('observability')).toMatch(/Observability/);
    expect(routeAnnouncement('docs')).toMatch(/Documentation/);
    expect(routeAnnouncement('task-detail', 'task-9')).toMatch(/task-9/);
    expect(routeAnnouncement('task-review', 'task-9')).toMatch(/task-9/);
    expect(routeAnnouncement('retrospective')).toMatch(/retrospective/i);
  });

  it('falls back rather than announcing nothing', () => {
    expect(routeAnnouncement('nope')).toBeTruthy();
  });
});

describe('Announcer', () => {
  it('renders a polite live region by default', () => {
    render(<Announcer message="Task saved" />);
    const region = screen.getByTestId('a11y-announcer');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveRole('status');
    expect(region).toHaveTextContent('Task saved');
  });

  it('renders an assertive region for errors', () => {
    render(<Announcer message="Save failed" assertive />);
    const region = screen.getByTestId('a11y-announcer');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveRole('alert');
  });

  it('RouteAnnouncer voices the active view', () => {
    render(<RouteAnnouncer view="settings" />);
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent(
      'Project settings loaded.',
    );
  });
});
