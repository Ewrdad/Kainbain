import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AliasTargetChip } from './AliasTargetChip';
import { aliasTargetSummary } from './aliasTargetSummary';

/***
 * MARK: AliasTargetChip tests
 * @description Locks the collapsed-row target chip contract: percent +
 *   harness label + provider badge + wrapping model id, the complete stored
 *   ref on `title` AND in an sr-only span (accessibility tree), the
 *   `break-all` wrap class on the model text (no mid-name ellipsis), and the
 *   self-managed/blank-model variants.
 ***/

const HARNESSES = [
  { id: 'pi', label: 'pi', modelSelection: 'list', models: [] },
  { id: 'muse', label: 'Muse', modelSelection: 'list', models: [] },
  { id: 'custom', label: 'Custom', modelSelection: 'none', models: [] },
];

describe('AliasTargetChip', () => {
  it('renders percent, harness label, provider badge, and model id', () => {
    const summary = aliasTargetSummary(
      { harness: 'muse', model: 'google::gemini-3-pro-preview', percent: 50 },
      HARNESSES,
    );
    render(<AliasTargetChip summary={summary} testId="model-alias-summary-chip-0-0" />);
    const chip = screen.getByTestId('model-alias-summary-chip-0-0');
    expect(chip).toHaveTextContent('50%');
    expect(chip).toHaveTextContent('Muse');
    expect(chip).toHaveTextContent('google');
    expect(chip).toHaveTextContent('gemini-3-pro-preview');
    // The full stored ref rides on the tooltip…
    expect(chip).toHaveAttribute('title', '50% Muse (google::gemini-3-pro-preview)');
  });

  it('keeps the complete stored ref in the accessibility tree via sr-only text', () => {
    const summary = aliasTargetSummary(
      { harness: 'pi', model: 'pi::anthropic::claude-sonnet-4-5::high', percent: 100 },
      HARNESSES,
    );
    const { container } = render(<AliasTargetChip summary={summary} testId="chip" />);
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly).not.toBeNull();
    expect(srOnly.textContent).toBe('pi::anthropic::claude-sonnet-4-5::high');
    expect(srOnly).toHaveTextContent('claude-sonnet-4-5');
  });

  it('wraps the model id instead of truncating it (break-all, no truncate class)', () => {
    const longRef = `google::quarterly-release-router-${'m'.repeat(140)}`;
    const summary = aliasTargetSummary({ harness: 'pi', model: longRef, percent: 100 }, HARNESSES);
    const { container } = render(<AliasTargetChip summary={summary} testId="chip" />);
    const modelText = container.querySelector('.break-all');
    expect(modelText).not.toBeNull();
    expect(modelText.textContent).toContain('quarterly-release-router-');
    expect(modelText).not.toHaveClass('truncate');
    // The full long ref is present verbatim in the DOM (sr-only).
    expect(container.querySelector('.sr-only').textContent).toBe(longRef);
    expect(screen.getByTestId('chip')).toHaveAttribute('title', `100% pi (${longRef})`);
  });

  it('shows the reasoning level as a muted suffix when present', () => {
    const summary = aliasTargetSummary(
      { harness: 'pi', model: 'google::m1::high', percent: 100 },
      HARNESSES,
    );
    render(<AliasTargetChip summary={summary} testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent('::high');
  });

  it('omits the provider badge for bare model ids', () => {
    const summary = aliasTargetSummary({ harness: 'pi', model: 'm1', percent: 100 }, HARNESSES);
    render(<AliasTargetChip summary={summary} testId="chip" />);
    const chip = screen.getByTestId('chip');
    expect(chip).toHaveTextContent('m1');
    // No uppercase badge span rendered.
    expect(chip.querySelector('.uppercase')).toBeNull();
  });

  it('renders only percent + harness label for a self-managed harness or blank model', () => {
    const noneSummary = aliasTargetSummary({ harness: 'custom', model: 'ignored', percent: 20 }, HARNESSES);
    const { rerender } = render(<AliasTargetChip summary={noneSummary} testId="chip" />);
    const chip = screen.getByTestId('chip');
    expect(chip).toHaveTextContent('20%');
    expect(chip).toHaveTextContent('Custom');
    expect(chip).not.toHaveTextContent('ignored');
    expect(chip).toHaveAttribute('title', '20% Custom');

    const blankSummary = aliasTargetSummary({ harness: 'pi', model: '', percent: 80 }, HARNESSES);
    rerender(<AliasTargetChip summary={blankSummary} testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent('80%');
    expect(screen.getByTestId('chip')).toHaveTextContent('pi');
  });

  it('fails safe on a missing or partial summary prop (empty chip, no crash)', () => {
    const { container, rerender } = render(<AliasTargetChip summary={null} testId="chip" />);
    expect(screen.getByTestId('chip')).toBeInTheDocument();
    expect(screen.getByTestId('chip').textContent).toBe('');
    expect(container.querySelector('.sr-only')).toBeNull();

    rerender(<AliasTargetChip summary={{ percentText: '50%' }} testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent('50%');
    expect(screen.getByTestId('chip').textContent).not.toContain('undefined');
  });
});
