import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AliasCollapsedRow } from './AliasCollapsedRow';

/***
 * MARK: AliasCollapsedRow tests
 * @description Locks the redesigned collapsed alias row: two-line layout
 *   (header line + full-width wrapping chips line), one chip per target with
 *   correct percents, full long model refs in the DOM (chip title + sr-only),
 *   the error badge on its own full-width line with click-to-expand, all
 *   historic test ids, and toggle/delete wiring.
 ***/

const HARNESSES = [
  { id: 'pi', label: 'pi', modelSelection: 'list', models: [] },
  { id: 'muse', label: 'Muse', modelSelection: 'list', models: [] },
];

const TWO_TARGETS = [
  { harness: 'muse', model: 'google::gemini-3-pro-preview', percent: 50 },
  { harness: 'pi', model: 'anthropic::claude-sonnet-4-5', percent: 50 },
];

function renderRow(overrides = {}) {
  const props = {
    index: 0,
    aliasName: 'router',
    targets: TWO_TARGETS,
    targetHarnesses: HARNESSES,
    rowError: '',
    disabled: false,
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    reliabilityLine: null,
    ...overrides,
  };
  return { ...render(<AliasCollapsedRow {...props} />), props };
}

describe('AliasCollapsedRow', () => {
  it('renders the header line with toggle, name, reliability slot, and delete', () => {
    const { props } = renderRow({
      reliabilityLine: <span data-testid="rel">All-time 97.5% · 80 runs</span>,
    });
    const toggle = screen.getByTestId('model-alias-toggle-0');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'model-alias-body-0');
    expect(toggle).toHaveAttribute('aria-label', 'Expand alias router');
    expect(document.getElementById('model-alias-header-0')).toHaveTextContent('router');
    expect(screen.getByTestId('rel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete alias router' })).toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Delete alias router' }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders one chip per target with percents, harness labels, provider badges, and full refs', () => {
    renderRow();
    const summary = screen.getByTestId('model-alias-summary-0');
    expect(summary).toHaveTextContent('2 targets');

    const chip0 = screen.getByTestId('model-alias-summary-chip-0-0');
    expect(chip0).toHaveTextContent('50%');
    expect(chip0).toHaveTextContent('Muse');
    expect(chip0).toHaveTextContent('google');
    expect(chip0).toHaveTextContent('gemini-3-pro-preview');
    expect(chip0).toHaveAttribute('title', '50% Muse (google::gemini-3-pro-preview)');

    const chip1 = screen.getByTestId('model-alias-summary-chip-0-1');
    expect(chip1).toHaveTextContent('50%');
    expect(chip1).toHaveTextContent('pi');
    expect(chip1).toHaveTextContent('anthropic');
    expect(chip1).toHaveTextContent('claude-sonnet-4-5');
    expect(chip1).toHaveAttribute('title', '50% pi (anthropic::claude-sonnet-4-5)');

    // Complete stored refs live in the DOM (sr-only), not only on hover.
    expect(summary.textContent).toContain('google::gemini-3-pro-preview');
    expect(summary.textContent).toContain('anthropic::claude-sonnet-4-5');
  });

  it('keeps a 140-char model ref fully present and wrapping (break-all, no truncate)', () => {
    const longRef = `google::quarterly-release-router-${'m'.repeat(140)}`;
    const { container } = renderRow({
      targets: [{ harness: 'pi', model: longRef, percent: 100 }],
    });
    const summary = screen.getByTestId('model-alias-summary-0');
    expect(summary).toHaveTextContent('1 target');
    expect(summary.textContent).toContain(longRef);
    const modelText = container.querySelector('.break-all');
    expect(modelText).not.toBeNull();
    expect(modelText).not.toHaveClass('truncate');
    expect(screen.getByTestId('model-alias-summary-chip-0-0')).toHaveAttribute(
      'title',
      `100% pi (${longRef})`,
    );
  });

  it('renders the error badge on its own full-width line and expands on click', () => {
    const { props } = renderRow({ rowError: 'Alias "router" needs a model for the 50% pi target' });
    const alert = screen.getByTestId('model-alias-error-alert-0');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveClass('w-full');
    const badge = screen.getByTestId('model-alias-error-badge-0');
    expect(badge.textContent).toContain('needs a model');
    expect(badge).toHaveClass('break-all');
    fireEvent.click(badge);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no error line when the row is valid', () => {
    renderRow();
    expect(screen.queryByTestId('model-alias-error-alert-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-alias-error-badge-0')).not.toBeInTheDocument();
  });

  it('disables toggle and delete when disabled', () => {
    renderRow({ disabled: true });
    expect(screen.getByTestId('model-alias-toggle-0')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete alias router' })).toBeDisabled();
  });

  it('handles a blank/unassigned target row without crashing', () => {
    renderRow({ targets: [{}], aliasName: '' });
    expect(screen.getByTestId('model-alias-summary-0')).toHaveTextContent('1 target');
    expect(screen.getByTestId('model-alias-summary-chip-0-0')).toHaveTextContent('unassigned');
    expect(document.getElementById('model-alias-header-0')).toHaveTextContent('Alias 1');
  });

  it('fails safe on a non-array targets prop (empty chips line, no crash)', () => {
    renderRow({ targets: null });
    expect(screen.getByTestId('model-alias-summary-0')).toHaveTextContent('0 targets');
    expect(screen.queryByTestId('model-alias-summary-chip-0-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('model-alias-toggle-0')).toBeInTheDocument();
  });
});
