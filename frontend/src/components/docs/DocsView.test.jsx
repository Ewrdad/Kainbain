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
  sections: ['getting-started', 'concepts', 'workflows', 'reference'],
  sectionLabels: {
    'getting-started': 'Getting started',
    concepts: 'Concepts',
    workflows: 'Everyday workflows',
    reference: 'Reference & runbooks',
  },
  docs: [
    { slug: 'getting-started', title: 'Getting Started', section: 'getting-started', order: 5 },
    { slug: 'install-run', title: 'Install & Run', section: 'getting-started', order: 10 },
    { slug: 'architecture', title: 'System Architecture', section: 'concepts', order: 10 },
    {
      slug: 'pipeline-stages',
      title: 'Workflow Pipeline & Stage Types',
      section: 'concepts',
      order: 20,
    },
    { slug: 'submit-track-task', title: 'Submitting & Tracking a Task', section: 'workflows', order: 10 },
    { slug: 'api-reference', title: 'API reference', section: 'reference', order: 80 },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  api.docsIndex.mockResolvedValue(INDEX);
  api.docsArticle.mockImplementation(async (slug) => {
    const doc = INDEX.docs.find((d) => d.slug === slug);
    return `# ${doc ? doc.title : slug}\n\nBody.`;
  });
});

test('slugFromHash parses deep links', () => {
  expect(slugFromHash('#/docs/architecture')).toBe('architecture');
  expect(slugFromHash('#/docs')).toBeNull();
  expect(slugFromHash('#/orchestrator')).toBeNull();
  expect(slugFromHash('')).toBeNull();
});

test('lists all four groups and renders the first article', async () => {
  renderWithKainBain(<DocsView />);
  expect(await screen.findByText('Getting started')).toBeInTheDocument();
  expect(screen.getByText('Concepts')).toBeInTheDocument();
  expect(screen.getByText('Everyday workflows')).toBeInTheDocument();
  expect(screen.getByText('Reference & runbooks')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Install & Run' })).toBeInTheDocument();
  // First article auto-selected and rendered as markdown.
  expect(await screen.findByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
});

test('marks the view as platform documentation, not project docs', async () => {
  renderWithKainBain(<DocsView />);
  await screen.findByText('Getting started');
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
  await screen.findByText('Getting started');
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
  await screen.findByText('Getting started');
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
  await screen.findByText('Getting started');
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
  await waitFor(() => expect(api.docsArticle).toHaveBeenCalledWith('getting-started'));
  expect(await screen.findByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
  // Bare entry is replaced with the canonical slug route (no extra history).
  // The heading renders from the non-route fetch before the replace-navigate
  // reaches RouteLocation under gate load, so wait for the route to settle.
  await waitFor(() =>
    expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/getting-started'),
  );
});

test('deep link route selects the matching article', async () => {
  renderWithKainBain(<DocsView />, {}, { initialEntries: ['/docs/install-run'] });
  await waitFor(() => expect(api.docsArticle).toHaveBeenCalledWith('install-run'));
  expect(await screen.findByRole('heading', { name: 'Install & Run' })).toBeInTheDocument();
});

/***
 * MARK: DocsView collapsible sections
 * @description The article viewer opts into collapsible `h2` sections with
 *   Expand all / Collapse all controls, shown only when the article holds
 *   sections. Sections start open; collapsing hides one body only.
 ***/
const SECTIONED_ARTICLE = [
  '# System Architecture',
  '',
  'Intro stays visible.',
  '',
  '## First Section',
  '',
  'First body.',
  '',
  '## Second Section',
  '',
  'Second body.',
].join('\n');

test('article h2 headers collapse and expand individually', async () => {
  api.docsArticle.mockResolvedValue(SECTIONED_ARTICLE);
  renderWithKainBain(<DocsView />);
  expect(await screen.findByRole('button', { name: 'First Section' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
  expect(screen.queryByText('First body.')).not.toBeInTheDocument();
  expect(screen.getByText('Second body.')).toBeInTheDocument();
  expect(screen.getByText('Intro stays visible.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
  expect(screen.getByText('First body.')).toBeInTheDocument();
});

test('expand-all and collapse-all controls flip every section at once', async () => {
  api.docsArticle.mockResolvedValue(SECTIONED_ARTICLE);
  renderWithKainBain(<DocsView />);
  await screen.findByRole('button', { name: 'First Section' });
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
  expect(screen.queryByText('First body.')).not.toBeInTheDocument();
  expect(screen.queryByText('Second body.')).not.toBeInTheDocument();
  expect(screen.getByText('Intro stays visible.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
  expect(screen.getByText('First body.')).toBeInTheDocument();
  expect(screen.getByText('Second body.')).toBeInTheDocument();
});

test('expand/collapse controls hide when the article has no sections', async () => {
  api.docsArticle.mockResolvedValue('# Short Note\n\nJust a paragraph.');
  renderWithKainBain(<DocsView />);
  await screen.findByRole('heading', { name: 'Short Note' });
  expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Collapse all' })).not.toBeInTheDocument();
});

const OTHER_SECTIONED_ARTICLE = ['# Install & Run', '', '## Other Section', '', 'Other body.'].join(
  '\n',
);

test('a collapse-all never leaks into the next article', async () => {
  api.docsArticle.mockImplementation(async (slug) =>
    slug === 'architecture' ? SECTIONED_ARTICLE : OTHER_SECTIONED_ARTICLE,
  );
  renderWithKainBain(<DocsView />, {}, { initialEntries: ['/docs/architecture'] });
  expect(await screen.findByRole('button', { name: 'First Section' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
  expect(screen.queryByText('First body.')).not.toBeInTheDocument();
  // Switching articles remounts the viewer: the stale collapse-all must not
  // apply to the new article — it opens in its default all-open state.
  fireEvent.click(screen.getByRole('button', { name: 'Install & Run' }));
  expect(await screen.findByText('Other body.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Other Section' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

/***
 * MARK: DocsView heading order
 * @description The sidebar group headers are h2 with the collapse toggle as
 *   the button inside them, so the article's h1 never follows an h3
 *   (WCAG 1.3.1/2.4.10; axe heading-order). Collapsible headers are
 *   interactive by design, hence h2 > button[aria-expanded] instead of a
 *   plain h2 — an intentional, reviewed contract evolution.
 ***/
test('sidebar group headers are h2 with an inner toggle so heading order never skips', async () => {
  renderWithKainBain(<DocsView />);
  await waitFor(() => expect(api.docsIndex).toHaveBeenCalled());
  // The h2 carries the visible group label; the toggle button inside it
  // carries the Collapse/Expand action name plus aria-expanded.
  for (const [label, action] of [
    ['Getting started', 'Collapse Getting started'],
    ['Concepts', 'Collapse Concepts'],
    ['Everyday workflows', 'Collapse Everyday workflows'],
    ['Reference & runbooks', 'Collapse Reference & runbooks'],
  ]) {
    const heading = await screen.findByRole('heading', { level: 2, name: label });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H2');
    const button = screen.getByRole('button', { name: action });
    expect(heading.contains(button)).toBe(true);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  }
});

/***
 * MARK: DocsView collapsible sidebar
 * @description The badge-style group headers collapse their article list,
 *   persist across visits, yield to the title filter and the active article,
 *   and never touch the route.
 ***/
test('clicking a header chevron collapses only that group', async () => {
  renderWithKainBain(<DocsView />);
  await screen.findByText('Getting started');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Concepts' }));
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Workflow Pipeline & Stage Types' }),
  ).not.toBeInTheDocument();
  // Other groups stay open.
  expect(screen.getByRole('button', { name: 'Install & Run' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Collapse Getting started' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Expand Concepts (2)' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Expand Concepts (2)' }));
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
});

test('collapsing the group that holds the active article folds it in-session', async () => {
  renderWithKainBain(
    <>
      <DocsView />
      <RouteLocation />
    </>,
    {},
    { initialEntries: ['/docs/architecture'] },
  );
  await screen.findByText('Getting started');
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
  // The explicit click wins over the deep-link force-open for this session:
  // the active group folds instead of reading as a dead control.
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Concepts' }));
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand Concepts (2)' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/architecture');
  // Reopening works, and moving to another article clears the pin: the new
  // selection forces its own group open while the stored collapse stands.
  fireEvent.click(screen.getByRole('button', { name: 'Install & Run' }));
  expect(screen.getByRole('button', { name: 'Install & Run' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand Concepts (2)' }));
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
});

test('collapsed state persists across remounts via localStorage', async () => {
  const first = renderWithKainBain(<DocsView />);
  await screen.findByText('Getting started');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Concepts' }));
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  first.unmount();
  renderWithKainBain(<DocsView />);
  await screen.findByText('Getting started');
  // Stored-collapsed group stays folded; the rest reopen.
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Install & Run' })).toBeInTheDocument();
});

test('filter auto-expands matching groups and restores collapse on clear', async () => {
  renderWithKainBain(<DocsView />);
  await screen.findByText('Getting started');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Concepts' }));
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filter docs articles'), {
    target: { value: 'architecture' },
  });
  // Filter overrides the stored collapse: the match is visible.
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse Concepts' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  fireEvent.change(screen.getByLabelText('Filter docs articles'), { target: { value: '' } });
  // Clearing restores the stored collapsed state.
  expect(screen.getByRole('button', { name: 'Expand Concepts (2)' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
});

test('deep link into a stored-collapsed group forces that group open', async () => {
  window.localStorage.setItem(
    'kainbain.docsSidebar.collapsed.v1',
    JSON.stringify(['concepts']),
  );
  renderWithKainBain(<DocsView />, {}, { initialEntries: ['/docs/architecture'] });
  await waitFor(() => expect(api.docsArticle).toHaveBeenCalledWith('architecture'));
  expect(await screen.findByRole('heading', { name: 'System Architecture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse Concepts' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('articles in a section the bundle does not know render under their id', async () => {
  api.docsIndex.mockResolvedValue({
    sections: ['getting-started', 'concepts', 'workflows', 'reference'],
    docs: [
      { slug: 'getting-started', title: 'Getting Started', section: 'getting-started', order: 5 },
      { slug: 'future-thing', title: 'Future Thing', section: 'future-group', order: 10 },
    ],
  });
  renderWithKainBain(<DocsView />);
  // The unknown group appends after the known order under its own id, so a
  // backend regroup shipped ahead of the frontend never hides articles.
  expect(await screen.findByText('future-group')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Future Thing' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Getting Started' })).toBeInTheDocument();
});

test('a duplicated id in the index sections renders the group only once', async () => {
  api.docsIndex.mockResolvedValue({
    sections: ['concepts', 'concepts', 'getting-started'],
    sectionLabels: { concepts: 'Concepts', 'getting-started': 'Getting started' },
    docs: [
      { slug: 'architecture', title: 'System Architecture', section: 'concepts', order: 10 },
      { slug: 'getting-started', title: 'Getting Started', section: 'getting-started', order: 5 },
    ],
  });
  renderWithKainBain(<DocsView />);
  await screen.findByText('Concepts');
  // Exactly one group header per id: a malformed index must not duplicate
  // the sidebar group (which would also trip React duplicate keys).
  expect(screen.getAllByText('Concepts')).toHaveLength(1);
  expect(screen.getAllByText('Getting started')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
});

test('a malformed index entry cannot break the filter or sidebar', async () => {
  api.docsIndex.mockResolvedValue({
    sections: ['getting-started'],
    sectionLabels: { 'getting-started': 'Getting started' },
    docs: [
      { slug: 'getting-started', title: 'Getting Started', section: 'getting-started', order: 5 },
      { slug: 'broken-entry', section: 'getting-started', order: 99 },
      null,
    ],
  });
  renderWithKainBain(<DocsView />);
  await screen.findByText('Getting started');
  // The bad entry renders under its slug and stays searchable by slug.
  expect(screen.getByRole('button', { name: 'broken-entry' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filter docs articles'), {
    target: { value: 'broken' },
  });
  expect(screen.getByRole('button', { name: 'broken-entry' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Getting Started' })).not.toBeInTheDocument();
});

test('a non-array docs payload renders the empty state instead of throwing', async () => {
  api.docsIndex.mockResolvedValue({ sections: [], docs: null });
  renderWithKainBain(<DocsView />);
  expect(await screen.findByText('No docs articles yet.')).toBeInTheDocument();
});

test('collapsing a group never changes the route', async () => {
  renderWithKainBain(
    <>
      <DocsView />
      <RouteLocation />
    </>,
    {},
    { initialEntries: ['/docs/architecture'] },
  );
  await screen.findByText('Getting started');
  expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/architecture');
  // Collapse a group that does NOT hold the active article: its list folds
  // away while the route stays exactly where it was.
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Getting started' }));
  expect(screen.queryByRole('button', { name: 'Install & Run' })).not.toBeInTheDocument();
  expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/architecture');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Everyday workflows' }));
  expect(screen.getByTestId('route-location')).toHaveTextContent('/docs/architecture');
});
