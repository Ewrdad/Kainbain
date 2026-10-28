import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffStatBadge } from './DiffStatBadge';
import '@testing-library/jest-dom';

describe('DiffStatBadge', () => {
  test('renders the added and removed counts for an entry with diff data', () => {
    render(<DiffStatBadge entry={{ additions: 12, deletions: 3 }} />);
    expect(screen.getByText('+12')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
  });

  test('renders nothing for a legacy entry without diff data', () => {
    const { container } = render(<DiffStatBadge entry={{ stage: 'Idea', status: 'Moved' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing for invalid counts', () => {
    const { container } = render(<DiffStatBadge entry={{ additions: 'many', deletions: 1 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
