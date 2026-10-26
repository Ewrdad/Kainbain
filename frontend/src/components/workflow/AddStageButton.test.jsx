import { expect, test, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import { AddStageButton } from './AddStageButton';
import { STAGE_KEYWORD_TOKENS, STAGE_TAB_PILL_CLASS } from './stageTokens';
import '@testing-library/jest-dom';

/***
 * MARK: AddStageButton + stageTokens tests
 * @description Colocated tests for the Wave-A extraction: both AddStageButton
 *   variants share the accessible name and the `onAdd` path, and the token
 *   module keeps its shape (WorkflowCanvas re-exports both names).
 ***/

test('column variant calls onAdd on click and Enter', () => {
  const onAdd = vi.fn();
  render(<AddStageButton variant="column" onAdd={onAdd} />);
  const btn = screen.getByLabelText('Add new pipeline stage');
  expect(btn).toHaveTextContent('Add Stage');
  fireEvent.click(btn);
  expect(onAdd).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(btn, { key: 'Enter' });
  expect(onAdd).toHaveBeenCalledTimes(2);
});

test('tab variant renders compact pill and calls onAdd', () => {
  const onAdd = vi.fn();
  render(<AddStageButton variant="tab" onAdd={onAdd} />);
  const btn = screen.getByRole('button', { name: 'Add new pipeline stage' });
  expect(btn).toHaveTextContent('Add stage');
  fireEvent.click(btn);
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test('missing onAdd never throws', () => {
  render(<AddStageButton variant="tab" />);
  expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
});

test('stageTokens keep prompt keywords and pill class', () => {
  const tokens = STAGE_KEYWORD_TOKENS.map((t) => t.token);
  expect(tokens).toContain('{{project}}');
  expect(tokens).toContain('{{taskId}}');
  expect(tokens).toContain('{{stageName}}');
  // The catalogue carries one parametric example token (the plan slug stands
  // in for any stage slug); every other token is a bare keyword.
  expect(tokens).toContain('{{latestReportPath:plan}}');
  for (const entry of STAGE_KEYWORD_TOKENS) {
    expect(entry.token.startsWith('{{')).toBe(true);
    expect(entry.token.endsWith('}}')).toBe(true);
    // Bare keywords plus the single parametric example (name or name:example).
    const parts = entry.token.slice(2, -2).split(':');
    expect(parts.length === 1 || parts.length === 2).toBe(true);
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(/[^A-Za-z]/.test(part)).toBe(false);
    }
    expect(entry.label.length).toBeGreaterThan(0);
  }
  expect(STAGE_TAB_PILL_CLASS).toContain('min-h-[44px]');
});
