import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../../testUtils';
import { PromptLayoutSection } from './PromptLayoutSection';
import { api } from '../../services/api';
import { DEFAULT_PROMPT_LAYOUT } from './promptLayoutTokens';

/**
 * MARK: PromptLayoutSection tests
 * @description Black-box coverage for the System Settings › Prompt Layout
 *   tab: initial load, token-chip insertion, mandatory-token guard blocking
 *   save, dry-run preview, save confirmation, and reset to default. The
 *   `api` client is mocked; all state is asserted from the rendered UI.
 */

vi.mock('../../services/api', () => ({
  api: {
    getPromptLayout: vi.fn(),
    updatePromptLayout: vi.fn(),
    resetPromptLayout: vi.fn(),
    dryRunPromptLayout: vi.fn(),
  },
}));

const DEFAULT_STATE = {
  layout: DEFAULT_PROMPT_LAYOUT,
  isDefault: true,
  consecutiveFallbacks: 0,
  degraded: false,
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getPromptLayout.mockResolvedValue({ ...DEFAULT_STATE });
  api.updatePromptLayout.mockImplementation(async (layout) => ({
    ...DEFAULT_STATE,
    layout,
    isDefault: false,
  }));
  api.resetPromptLayout.mockResolvedValue({ ...DEFAULT_STATE });
  api.dryRunPromptLayout.mockResolvedValue({
    renderedMarkdown: '# Task\nHello',
    warnings: [],
    autoReinjected: [],
    fallbackUsed: false,
  });
});

test('loads the saved layout with required badges and char count', async () => {
  renderWithKainBain(<PromptLayoutSection />);
  const textarea = await screen.findByTestId('prompt-layout-textarea');
  expect(textarea).toHaveValue(DEFAULT_PROMPT_LAYOUT);
  expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(3);
  expect(screen.getAllByText('Auto-added').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText(/\/ 20000 characters/)).toBeInTheDocument();
});

test('chip click inserts the token into the layout', async () => {
  renderWithKainBain(<PromptLayoutSection />);
  const textarea = await screen.findByTestId('prompt-layout-textarea');
  fireEvent.change(textarea, { target: { value: '# Custom\n\n{{task}}\n\n{{stage}}\n\n{{failureGuidance}}' } });
  fireEvent.click(screen.getByRole('button', { name: /{{taskImages}}/ }));
  await waitFor(() => expect(textarea.value).toContain('{{taskImages}}'));
});

test('removing a mandatory token blocks save with a named error', async () => {
  renderWithKainBain(<PromptLayoutSection />);
  const textarea = await screen.findByTestId('prompt-layout-textarea');
  fireEvent.change(textarea, { target: { value: '{{task}}\n\n{{stage}}' } });
  expect(await screen.findByTestId('layout-errors')).toHaveTextContent('{{failureGuidance}}');
  expect(screen.getByRole('button', { name: /Save Layout/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Preview with Sample Data/ })).toBeDisabled();
});

test('dry-run preview renders the markdown and auto-reinject notices', async () => {
  api.dryRunPromptLayout.mockResolvedValue({
    renderedMarkdown: '# Task\nHello',
    warnings: [],
    autoReinjected: ['failureDetails'],
    fallbackUsed: false,
  });
  renderWithKainBain(<PromptLayoutSection />);
  await screen.findByTestId('prompt-layout-textarea');
  fireEvent.click(screen.getByRole('button', { name: /Preview with Sample Data/ }));
  const pane = await screen.findByTestId('prompt-layout-preview-pane');
  expect(pane).toHaveTextContent('Hello');
  expect(pane).toHaveTextContent('{{failureDetails}}');
  expect(api.dryRunPromptLayout).toHaveBeenCalledTimes(1);
});

test('save persists the layout and confirms', async () => {
  renderWithKainBain(<PromptLayoutSection />);
  const textarea = await screen.findByTestId('prompt-layout-textarea');
  fireEvent.change(textarea, { target: { value: `${DEFAULT_PROMPT_LAYOUT}\n\n<!-- tweak -->` } });
  fireEvent.click(screen.getByRole('button', { name: /Save Layout/ }));
  await waitFor(() => expect(api.updatePromptLayout).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/saved successfully/i)).toBeInTheDocument();
});

test('reset asks for confirmation and restores the default', async () => {
  api.getPromptLayout.mockResolvedValue({ ...DEFAULT_STATE, isDefault: false });
  const previousConfirm = window.confirm;
  window.confirm = vi.fn(() => true);
  try {
    renderWithKainBain(<PromptLayoutSection />);
    const resetButton = await screen.findByRole('button', { name: /Reset to Default/ });
    expect(resetButton).not.toBeDisabled();
    fireEvent.click(resetButton);
    await waitFor(() => expect(api.resetPromptLayout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/factory default/i)).toBeInTheDocument();
  } finally {
    window.confirm = previousConfirm;
  }
});

test('fallback banner appears when the engine served the default', async () => {
  api.getPromptLayout.mockResolvedValue({
    ...DEFAULT_STATE,
    isDefault: false,
    consecutiveFallbacks: 3,
    degraded: false,
  });
  renderWithKainBain(<PromptLayoutSection />);
  expect(await screen.findByTestId('prompt-layout-fallback-banner')).toHaveTextContent(
    /serving default/,
  );
});
