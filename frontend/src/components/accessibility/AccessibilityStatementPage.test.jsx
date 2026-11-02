import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccessibilityStatementPage } from './AccessibilityStatementPage';
import { api } from '../../services/api';
import { FALLBACK_ARTIFACT } from '../../a11y/statementResults';
import {
  assertAllNamed,
  assertHeadingOrder,
  assertSectionHeadings,
} from '../../a11y/a11yTestHelpers';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    accessibilityResults: vi.fn(),
    submitAccessibilityFeedback: vi.fn(),
  },
}));

/***
 * MARK: AccessibilityStatementPage tests
 * @description Verifies the dynamic statement view: loading state, live
 *   results grouped by user need with dual AAA + 3.0 statuses, honest
 *   fallback when the fetch fails, both report CTAs opening the dialog,
 *   and the shared a11y helper assertions (heading order, section
 *   headings, named controls).
 ***/

beforeEach(() => {
  vi.clearAllMocks();
});

test('shows a loading status while results arrive', () => {
  api.accessibilityResults.mockReturnValue(new Promise(() => {}));
  render(<AccessibilityStatementPage />);
  expect(screen.getByRole('status')).toHaveTextContent(/Loading the latest/i);
  expect(screen.getByRole('heading', { level: 1, name: 'Accessibility statement' })).toBeInTheDocument();
});

test('renders five need groups with AAA and 3.0 statuses plus the check date', async () => {
  api.accessibilityResults.mockResolvedValue(FALLBACK_ARTIFACT);
  render(<AccessibilityStatementPage />);
  for (const groupId of ['seeing', 'hearing', 'getting-around', 'thinking', 'helpful-tech']) {
    expect(await screen.findByTestId(`need-group-${groupId}`)).toBeInTheDocument();
  }
  expect(screen.getByTestId('statement-freshness')).toHaveTextContent(/25 Oct 2026/);
  expect(screen.getByTestId('statement-freshness')).toHaveTextContent(/App version 1\.0\.0/);
  // Dual statuses inside the groups, in the groups' own language.
  expect(screen.getByTestId('need-group-helpful-tech')).toHaveTextContent('Supported');
  expect(screen.getByTestId('need-group-helpful-tech')).toHaveTextContent('Ready');
  expect(screen.getByTestId('need-group-hearing')).toHaveTextContent('Does not apply here');
  // Full detail stays reachable without cluttering the simple view.
  expect(screen.getAllByText(/Show the .* checks behind this group/)).toHaveLength(5);
  expect(screen.getByText(/1\.4\.6 Contrast \(enhanced\)/)).toBeInTheDocument();
});

test('falls back honestly when the results fetch fails', async () => {
  api.accessibilityResults.mockRejectedValue(new Error('API down'));
  render(<AccessibilityStatementPage />);
  expect(await screen.findByTestId('need-group-seeing')).toBeInTheDocument();
  expect(screen.getByTestId('statement-freshness')).toHaveTextContent(/last-known statement/);
  expect(screen.getByTestId('statement-freshness')).toHaveTextContent(/could not be loaded/);
});

test('renders malformed payloads as unknown without crashing', async () => {
  api.accessibilityResults.mockResolvedValue({ wcag22aaa: 'nope' });
  render(<AccessibilityStatementPage />);
  expect(await screen.findByTestId('need-group-seeing')).toBeInTheDocument();
  expect(screen.getByTestId('need-group-seeing')).toHaveTextContent('Unknown');
});

test('both report calls to action open the report dialog', async () => {
  api.accessibilityResults.mockResolvedValue(FALLBACK_ARTIFACT);
  render(<AccessibilityStatementPage />);
  await screen.findByTestId('need-group-seeing');
  const ctas = screen.getAllByRole('button', { name: 'Report an accessibility problem' });
  expect(ctas).toHaveLength(2);
  fireEvent.click(ctas[0]);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Report an accessibility problem' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  fireEvent.click(ctas[1]);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('shows the team inbox link when the artifact configures one', async () => {
  api.accessibilityResults.mockResolvedValue({ ...FALLBACK_ARTIFACT, contactEmail: 'team@example.com' });
  render(<AccessibilityStatementPage />);
  await screen.findByTestId('need-group-seeing');
  const link = screen.getByRole('link', { name: 'team@example.com' });
  expect(link).toHaveAttribute('href', 'mailto:team@example.com');
});

test('meets the shared a11y assertions (headings, sections, named controls)', async () => {
  api.accessibilityResults.mockResolvedValue(FALLBACK_ARTIFACT);
  const { container } = render(<AccessibilityStatementPage />);
  await screen.findByTestId('need-group-seeing');
  assertHeadingOrder(container);
  const headings = assertSectionHeadings(container);
  expect(headings.length).toBeGreaterThanOrEqual(7);
  assertAllNamed(container);
});
