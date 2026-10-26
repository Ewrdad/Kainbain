import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithKainBain } from '../../testUtils';
import { DocsView, slugFromHash } from './DocsView';
import { api } from '../../services/api';
import '@testing-library/jest-dom';

/***
 * MARK: RouteLocation
 * @description Test-only probe exposing the router pathname for assertions.
 ***/
function RouteLocation() {
  const { pathname } = useLocation();
  return <div data-testid="route-location">{pathname}</div>;
}

vi.mock('../../services/api', () => ({
  api: {
    docsIndex: vi.fn(),
    docsArticle: vi.fn(),
  },
}));

vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn() },
}));

/***
 * MARK: DocsView tests
 * @description Verifies the markdown-driven docs browser: both avenues list,
 *   article select renders markdown via the shared viewer, title filter,
 *   empty/error states, and XSS payloads render inert.
 */
const INDEX = {
  sections: ['how-it-works', 'working-with'],
  docs: [
    { slug: 'architecture', title: 'System Architecture', section: 'how-it-works', order: 10 },
    { slug: 'install-run', title: 'Install & Run', section: 'working-with', order: 10 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.docsIndex.mockResolvedValue(INDEX);
  api.docsArticle.mockImplementation(async (slug) =>
    slug === 'architecture' ? '# System Architecture\n\nBody.' : '# Install & Run\n\nSteps.',
  );
});

test('slugFromHash parses deep links', () => {
  expect(slugFromHash('#/docs/architecture')).toBe('architecture');
  expect(slugFromHash('#/docs')).toBeNull();
  expect(slugFromHash('#/orchestrator')).toBeNull();
  expect(slugFromHash('')).toBeNull();
});

test('lists both avenues and renders the first article', async () => {
  renderWithKainBain(<DocsView />);
  expect(await screen.findByText('How KainBain works')).toBeInTheDocument();
  expect(screen.getByText('How to work with KainBain')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Install & Run' })).toBeInTheDocument();
  // First article auto-selected and rendered as markdown.
  expect(await screen.findByRole('heading', { name: 'System Architecture' })).toBeInTheDocument();
});

test('marks the view as platform documentation, not project docs', async () => {
  renderWithKainBain(<DocsView />);
  await screen.findByText('How KainBain works');
  const eyebrow = screen.getByTestId('docs-platform-eyebrow');
  expect(eyebrow).toBeInTheDocument();
  expect(eyebrow.textContent).toMatch(/Platform documentation/i);
  expect(eyebrow.textContent).toMatch(/not just the selected one/i);
});

test('selecting an article renders its markdown and navigates the route', async () => {
  renderWithKainBain(
    <>
      <DocsView />
      <RouteLocation />
    </>,
  );
  await screen.findByText('How KainBain works');
  fireEvent.click(screen.getByRole('button', { name: 'Install & Run' }));
  expect(await screen.findByRole('heading', { name: 'Install & Run' })).toBeInTheDocument();
  // Selecting IS a navigation: the router location carries the slug, so no
  // stale docs hash can survive leaving the view later.
  expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/install-run');
  expect(screen.getByRole('button', { name: 'Install & Run' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('explicit selection survives a late bare-route normalisation', async () => {
  // Regression: when the index resolves just as the user clicks, the
  // bare-route normalise (replace to the first article) must not clobber the
  // explicit selection back to the first article.
  renderWithKainBain(
    <>
      <DocsView />
      <RouteLocation />
    </>,
  );
  await screen.findByText('How KainBain works');
  fireEvent.click(screen.getByRole('button', { name: 'Install & Run' }));
  expect(await screen.findByRole('heading', { name: 'Install & Run' })).toBeInTheDocument();
  expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/install-run');
  // Let any stale-scheduled normalise effect flush, then re-assert: the route
  // and article must still be the user's choice, not the first article.
  await waitFor(() => expect(api.docsArticle).toHaveBeenCalledWith('install-run'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/install-run');
  expect(screen.getByRole('heading', { name: 'Install & Run' })).toBeInTheDocument();
});

test('title filter narrows the sidebar and shows an empty-search state', async () => {
  renderWithKainBain(<DocsView />);
  await screen.findByText('How KainBain works');
  fireEvent.change(screen.getByLabelText('Filter docs articles'), {
    target: { value: 'install' },
  });
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Install & Run' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filter docs articles'), {
    target: { value: 'zzz-no-match' },
  });
  expect(await screen.findByText(/No articles match/)).toBeInTheDocument();
});

test('shows an empty state when the index has no docs', async () => {
  api.docsIndex.mockResolvedValue({ sections: [], docs: [] });
  renderWithKainBain(<DocsView />);
  expect(await screen.findByText('No docs articles yet.')).toBeInTheDocument();
});

test('shows error states when the API fails', async () => {
  api.docsIndex.mockRejectedValue(new Error('down'));
  api.docsArticle.mockRejectedValue(new Error('down'));
  renderWithKainBain(<DocsView />);
  expect(await screen.findByText(/Could not load the docs index/)).toBeInTheDocument();
});

test('renders an XSS payload inert via the shared sanitizer', async () => {
  api.docsArticle.mockResolvedValue('[click me](javascript:alert(1))');
  renderWithKainBain(<DocsView />);
  const link = await screen.findByText('click me');
  expect(link.closest('a').getAttribute('href')).toBe('#');
});

test('bare /docs normalises to the first article route', async () => {
  renderWithKainBain(
    <>
      <DocsView />
      <RouteLocation />
    </>,
    {},
    { initialEntries: ['/docs'] },
  );
  await waitFor(() => expect(api.docsArticle).toHaveBeenCalledWith('architecture'));
  expect(await screen.findByRole('heading', { name: 'System Architecture' })).toBeInTheDocument();
  // Bare entry is replaced with the canonical slug route (no extra history).
  // The heading renders from the non-route fetch before the replace-navigate
  // reaches RouteLocation under gate load, so wait for the route to settle.
  await waitFor(() =>
    expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/architecture'),
  );
});

test('deep link route selects the matching article', async () => {
  renderWithKainBain(<DocsView />, {}, { initialEntries: ['/docs/install-run'] });
  await waitFor(() => expect(api.docsArticle).toHaveBeenCalledWith('install-run'));
  expect(await screen.findByRole('heading', { name: 'Install & Run' })).toBeInTheDocument();
});

/***
 * MARK: DocsView heading order
 * @description The sidebar avenue headings are h2, so the article's h1 never
 *   follows an h3 (WCAG 1.3.1/2.4.10; axe heading-order).
 ***/
test('sidebar avenue headings are h2 so heading order never skips', async () => {
  renderWithKainBain(<DocsView />);
  await waitFor(() => expect(api.docsIndex).toHaveBeenCalled());
  expect(
    await screen.findByRole('heading', { level: 2, name: 'How KainBain works' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 2, name: 'How to work with KainBain' }),
  ).toBeInTheDocument();
});
