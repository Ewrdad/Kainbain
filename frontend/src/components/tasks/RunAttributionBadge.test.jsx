import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunAttributionBadge, formatRunAttribution } from './RunAttributionBadge';
import '@testing-library/jest-dom';
describe('RunAttributionBadge', () => {
  test('renders the harness and model for an attributed row', () => {
    render(<RunAttributionBadge entry={{ harnessId: 'pi', modelRef: 'mistral::large' }} />);
    expect(screen.getByText('pi · mistral::large')).toBeInTheDocument();
  });

  test('appends the alias when one resolved the pick', () => {
    render(
      <RunAttributionBadge
        entry={{
          harnessId: 'pi',
          modelRef: 'mistral::large',
          aliasName: 'worker',
          targetIndex: 0,
        }}
      />,
    );
    expect(screen.getByText('pi · mistral::large · alias worker')).toBeInTheDocument();
  });

  test('renders with a model alone (no harness)', () => {
    render(<RunAttributionBadge entry={{ modelRef: 'gemini-3.8-flash-low' }} />);
    expect(screen.getByText('gemini-3.8-flash-low')).toBeInTheDocument();
  });

  test('renders absolutely nothing for plain rows (no placeholder wording)', () => {
    const cases = [
      { stage: 'CI', status: 'Advanced', duration: '4s' },
      { stage: 'Review', status: 'Moved' },
      {},
      null,
    ];
    for (const entry of cases) {
      const { container } = render(<RunAttributionBadge entry={entry} />);
      expect(container).toBeEmptyDOMElement();
      expect(container.textContent).not.toContain('no model');
      expect(container.textContent).not.toContain('automated');
    }
  });

  test('ignores blank strings instead of wording them', () => {
    const { container } = render(
      <RunAttributionBadge entry={{ harnessId: '   ', modelRef: '' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('exposes the harness/model/alias expansion as an abbr (WCAG 3.1.4)', () => {
    render(
      <RunAttributionBadge
        entry={{ harnessId: 'pi', modelRef: 'mistral::large', aliasName: 'worker' }}
      />,
    );

    // The visible value is unchanged; the jargon expansion reaches AT through
    // the abbr title instead of a hover-only span tooltip.
    const abbr = screen.getByText('pi · mistral::large · alias worker');
    expect(abbr.tagName).toBe('ABBR');
    expect(abbr).toHaveAttribute(
      'title',
      'Stage run attribution — harness: pi, model: mistral::large, alias: worker',
    );
    // It adds no interactive semantics and no extra tab stop.
    expect(abbr).not.toHaveAttribute('tabindex');
    expect(abbr).not.toHaveAttribute('role');
  });

  test('names unknown fields honestly in the expansion', () => {
    render(<RunAttributionBadge entry={{ modelRef: 'glm' }} />);
    expect(screen.getByText('glm')).toHaveAttribute(
      'title',
      'Stage run attribution — harness: unknown, model: glm',
    );
  });
});

describe('formatRunAttribution', () => {
  test('returns null for unattributed rows and blank fields', () => {
    expect(formatRunAttribution({ stage: 'CI' })).toBeNull();
    expect(formatRunAttribution({ aliasName: 'worker' })).toBeNull();
    expect(formatRunAttribution(undefined)).toBeNull();
  });

  test('formats the shared harness · model · alias vocabulary', () => {
    expect(formatRunAttribution({ harnessId: 'pi', modelRef: 'glm' })).toBe('pi · glm');
    expect(formatRunAttribution({ harnessId: 'pi', modelRef: 'glm', aliasName: 'w' })).toBe(
      'pi · glm · alias w',
    );
  });
});
