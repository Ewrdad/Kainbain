import React from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocsSidebarGroup } from './DocsSidebarGroup';
import '@testing-library/jest-dom';

/***
 * MARK: DocsSidebarGroup tests
 * @description Verifies the collapsible sidebar group: the header renders the
 *   badge-style label inside an `h2 > button` (heading order holds), the
 *   chevron toggle collapses only its own list, articles indent underneath,
 *   and the control is keyboard-focusable with `aria-expanded`.
 ***/

const DOCS = [
  { slug: 'architecture', title: 'System Architecture' },
  { slug: 'pipeline-stages', title: 'Workflow Pipeline & Stage Types' },
];

function groupProps(overrides = {}) {
  return {
    section: 'concepts',
    label: 'Concepts',
    docs: DOCS,
    activeSlug: 'architecture',
    collapsed: false,
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  };
}

test('header keeps h2 > button so heading order never skips', () => {
  render(<DocsSidebarGroup {...groupProps()} />);
  const heading = screen.getByRole('heading', { level: 2, name: 'Concepts' });
  expect(heading).toBeInTheDocument();
  expect(heading.tagName).toBe('H2');
  const button = screen.getByRole('button', { name: 'Collapse Concepts' });
  expect(heading.contains(button)).toBe(true);
  expect(button).toHaveAttribute('aria-expanded', 'true');
});

test('header renders the badge label, article count, and indented articles', () => {
  const { container } = render(<DocsSidebarGroup {...groupProps()} />);
  const badge = container.querySelector('.bg-docs-badge');
  expect(badge).not.toBeNull();
  expect(badge.textContent).toBe('Concepts');
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'System Architecture' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Workflow Pipeline & Stage Types' }),
  ).toBeInTheDocument();
  expect(container.querySelector('ul').className).toContain('pl-4');
});

test('collapsed group shows badge and count but hides the article list', () => {
  const { container } = render(<DocsSidebarGroup {...groupProps()} collapsed />);
  expect(screen.getByRole('button', { name: 'Expand Concepts (2)' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.queryByRole('button', { name: 'System Architecture' })).not.toBeInTheDocument();
  expect(container.querySelector('ul')).toBeNull();
  // The badge stays visible so the group can be found and reopened.
  expect(container.querySelector('.bg-docs-badge').textContent).toBe('Concepts');
});

test('header toggle calls onToggle with the section id only', () => {
  const props = groupProps();
  render(<DocsSidebarGroup {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Concepts' }));
  expect(props.onToggle).toHaveBeenCalledTimes(1);
  expect(props.onToggle).toHaveBeenCalledWith('concepts');
  expect(props.onSelect).not.toHaveBeenCalled();
});

test('article click selects without toggling the group', () => {
  const props = groupProps();
  render(<DocsSidebarGroup {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Workflow Pipeline & Stage Types' }));
  expect(props.onSelect).toHaveBeenCalledWith('pipeline-stages');
  expect(props.onToggle).not.toHaveBeenCalled();
});

test('active article keeps its aria-current marker', () => {
  render(<DocsSidebarGroup {...groupProps()} activeSlug="pipeline-stages" />);
  expect(screen.getByRole('button', { name: 'Workflow Pipeline & Stage Types' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('button', { name: 'System Architecture' })).not.toHaveAttribute(
    'aria-current',
  );
});

test('header toggle is reachable by keyboard focus', () => {
  render(<DocsSidebarGroup {...groupProps()} />);
  const button = screen.getByRole('button', { name: 'Collapse Concepts' });
  button.focus();
  expect(document.activeElement).toBe(button);
});
