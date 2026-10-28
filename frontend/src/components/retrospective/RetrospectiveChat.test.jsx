import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { RetrospectiveChat } from './RetrospectiveChat';
import { ChatTurnProvider } from './ChatTurnProvider';
import { RetrospectiveProvider, useRetrospective } from './useRetrospective';
import {
  retrospectiveTaskFixtures,
  retrospectiveChatTurnFixture,
  retrospectiveDegradedResponseFixture,
  retrospectiveTimeoutErrorFixture,
  retrospectiveTimeoutWithOutputFixture,
  retrospectiveModelFailedFixture,
  retrospectiveModelFailedWithOutputFixture,
  retrospectiveTaskNotFoundFixture,
  retrospectiveLenientUnknownFixture,
  retrospectiveTruncatedContextFixture,
  retrospectiveEmptyReplyFixture,
  retrospectiveOversizedInputFixture,
} from './__fixtures__/index.js';
import '@testing-library/jest-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      retrospectiveChat: vi.fn(),
      createTask: vi.fn(),
      // Empty catalogue by default: the picker renders its honest empty
      // state, exactly as when the module mock omits getModels entirely.
      getModels: vi.fn(async () => ({ models: [], harnesses: [] })),
    },
  };
});
import { api } from '../../services/api';

/***
 * MARK: RetrospectiveChat tests
 * @description Locks the chat contract: context chips from the selection,
 *   stateless turns with reply + suggestions, 501 degraded notice, errors,
 *   and Confirm/Edit ticket creation (never unconfirmed).
 ***/
function SeedButton({ text }) {
  const { seedChat } = useRetrospective();
  return (
    <button type="button" onClick={() => seedChat(text)}>
      seed-it
    </button>
  );
}

function renderChat(selectedIds = ['task-failed-2'], overrides = {}, options = {}) {
  // The provider owns the turn in the shipped tree, so the suite renders
  // through it (MemoryRouter from renderWithKainBain feeds its location).
  return renderWithKainBain(
    <ChatTurnProvider>
      <RetrospectiveProvider initialSelectedIds={selectedIds}>
        <RetrospectiveChat tasks={retrospectiveTaskFixtures} />
        <SeedButton text="Seeded trends prompt" />
      </RetrospectiveProvider>
    </ChatTurnProvider>,
    { activeProjectId: 'proj-1', projects: [{ id: 'proj-1', harness: 'pi' }], ...overrides },
    options,
  );
}

describe('RetrospectiveChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    api.retrospectiveChat.mockResolvedValue(retrospectiveChatTurnFixture.response);
    api.createTask.mockResolvedValue({ id: 'new-1', title: 'Stabilize migration tests' });
  });

  function transportError(fixture, message) {
    const err = new Error(message || 'API error');
    err.status = fixture.status;
    err.body = fixture.body;
    return err;
  }

  it('syncs context chips from the selection and removes them per chip', () => {
    renderChat();
    expect(screen.getByText('No task context — general chat.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Use selection (1)'));
    expect(screen.getByTestId('retrospective-chat-chip-task-failed-2')).toHaveTextContent(
      'Migrate the session store',
    );
    fireEvent.click(screen.getByLabelText('Remove Migrate the session store from chat context'));
    expect(screen.queryByTestId('retrospective-chat-chip-task-failed-2')).not.toBeInTheDocument();
  });

  it('guides no-context chats toward recent-task review', () => {
    renderChat([]);
    expect(screen.getByText('No task context — general chat.')).toBeInTheDocument();
    expect(screen.getByText('The agent may search recent tasks.')).toBeInTheDocument();
    expect(screen.getByText(/the agent can still review recent jobs/)).toBeInTheDocument();
  });

  it('sends a stateless turn and renders the reply with suggestions', async () => {
    renderChat();
    fireEvent.click(screen.getByText('Use selection (1)'));
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'What failed recently?' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      // The hook threads a per-turn AbortSignal as the 3rd transport arg so
      // Cancel can abort the in-flight request (additive transport change),
      // plus a turnId correlating live progress frames to this turn.
      expect(api.retrospectiveChat).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          messages: [{ role: 'user', content: 'What failed recently?' }],
          taskIds: ['task-failed-2'],
          turnId: expect.any(String),
        }),
        expect.objectContaining({ signal: expect.anything() }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toHaveTextContent(
        'The migration task failed its tests.',
      );
    });
    expect(screen.getByTestId('retrospective-suggestion-1:0')).toHaveTextContent(
      'Stabilize migration tests',
    );
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent(
      'Reply received with 1 ticket suggestion(s).',
    );
  });

  it('ignores a rapid double-send while a turn is already pending', async () => {
    let resolveTurn;
    api.retrospectiveChat.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTurn = resolve;
      }),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'one turn only' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-pending')).toBeInTheDocument();
    });
    // While pending the Send button is gone (Cancel takes its place), and an
    // Enter keystroke on the disabled input must not start a second turn.
    expect(screen.queryByTestId('retrospective-chat-send')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('retrospective-chat-input'), {
      key: 'Enter',
      shiftKey: false,
    });
    expect(api.retrospectiveChat).toHaveBeenCalledTimes(1);
    resolveTurn(retrospectiveChatTurnFixture.response);
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toBeInTheDocument();
    });
    // Exactly one user bubble and one reply — no duplicate turn ran.
    expect(screen.getByTestId('retrospective-chat-message-0')).toHaveTextContent('one turn only');
    expect(screen.queryByTestId('retrospective-chat-message-2')).not.toBeInTheDocument();
  });

  it('applies quick-action seeds to the draft', () => {
    renderChat();
    fireEvent.click(screen.getByText('seed-it'));
    expect(screen.getByTestId('retrospective-chat-input')).toHaveValue('Seeded trends prompt');
  });

  it('renders the degraded notice for a 501 harness', async () => {
    const err = new Error('API 501 on /retrospective/chat');
    err.status = retrospectiveDegradedResponseFixture.status;
    err.body = JSON.stringify(retrospectiveDegradedResponseFixture.body);
    api.retrospectiveChat.mockRejectedValueOnce(err);
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-degraded')).toHaveTextContent(
        'This harness can’t chat yet',
      );
    });
  });

  it('surfaces turn failures as errors', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(new Error('boom'));
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent('boom');
    });
  });

  it('confirms a suggestion into a real ticket', async () => {
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'Suggest tickets' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-suggestion-1:0')).toBeInTheDocument();
    });
    expect(api.createTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm ticket'));
    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith('proj-1', {
        title: 'Stabilize migration tests',
        goal: 'Fix the failing migration tests.',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-suggestion-1:0')).toHaveTextContent(
        'Ticket created: Stabilize migration tests',
      );
    });
  });

  it('edits a suggestion before confirming', async () => {
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'Suggest tickets' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-suggestion-1:0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Suggested ticket title'), {
      target: { value: 'Edited title' },
    });
    fireEvent.click(screen.getByText('Confirm ticket'));
    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ title: 'Edited title' }),
      );
    });
  });

  it('cancels a pending turn silently, aborts the request, and restores the draft', async () => {
    let resolveTurn;
    api.retrospectiveChat.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTurn = resolve;
      }),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'Will cancel this' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-cancel')).toBeInTheDocument();
    });
    const sentSignal = api.retrospectiveChat.mock.calls[0][2]?.signal;
    expect(sentSignal).toBeInstanceOf(AbortSignal);
    fireEvent.click(screen.getByTestId('retrospective-chat-cancel'));
    expect(sentSignal.aborted).toBe(true);
    // Silent: no error banner, draft restored, in-flight user message back in the box.
    expect(screen.queryByTestId('retrospective-chat-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('retrospective-chat-input')).toHaveValue('Will cancel this');
    expect(screen.queryByTestId('retrospective-chat-message-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Chat turn cancelled.');
    // The late resolution is ignored: no reply overwrites the cancelled state.
    resolveTurn(retrospectiveChatTurnFixture.response);
    await waitFor(() => {
      expect(api.retrospectiveChat).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('retrospective-chat-message-0')).not.toBeInTheDocument();
  });

  it('ticks elapsed seconds while a turn is pending and announces sparingly', () => {
    vi.useFakeTimers();
    try {
      api.retrospectiveChat.mockReturnValueOnce(new Promise(() => {})); // never settles
      renderChat([]);
      fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
        target: { value: 'hi' },
      });
      fireEvent.click(screen.getByTestId('retrospective-chat-send'));
      expect(screen.getByTestId('retrospective-chat-pending')).toHaveTextContent('Agent working…');
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('0s elapsed');
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('5s elapsed');
      // No screen-reader spam before the 30s mark.
      expect(screen.getByTestId('a11y-announcer')).not.toHaveTextContent('Still working');
      act(() => {
        vi.advanceTimersByTime(25000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('30s elapsed');
      expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Still working… 30s elapsed.');
      // Cancel still works mid-tick and clears the pending state.
      fireEvent.click(screen.getByTestId('retrospective-chat-cancel'));
      expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves elapsed seconds across remount and avoids double announcements in the same 30s bucket', () => {
    vi.useFakeTimers();
    try {
      api.retrospectiveChat.mockReturnValueOnce(new Promise(() => {})); // never settles

      function Host() {
        const [showChat, setShowChat] = React.useState(true);
        return (
          <ChatTurnProvider>
            <button
              type="button"
              data-testid="toggle-chat"
              onClick={() => setShowChat((prev) => !prev)}
            >
              toggle
            </button>
            <RetrospectiveProvider initialSelectedIds={[]}>
              {showChat ? (
                <RetrospectiveChat tasks={retrospectiveTaskFixtures} />
              ) : (
                <div data-testid="other-view">Other view</div>
              )}
            </RetrospectiveProvider>
          </ChatTurnProvider>
        );
      }

      renderWithKainBain(<Host />, {
        activeProjectId: 'proj-1',
        projects: [{ id: 'proj-1', harness: 'pi' }],
      });

      fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
        target: { value: 'hi' },
      });
      fireEvent.click(screen.getByTestId('retrospective-chat-send'));
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('0s elapsed');

      act(() => {
        vi.advanceTimersByTime(20000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('20s elapsed');

      // Unmount chat pane while preserving provider (simulates navigating away)
      fireEvent.click(screen.getByTestId('toggle-chat'));
      expect(screen.queryByTestId('retrospective-chat-elapsed')).not.toBeInTheDocument();
      expect(screen.getByTestId('other-view')).toBeInTheDocument();

      // Remount chat pane (simulates navigating back): elapsed counter still reflects 20s elapsed (not 0s)
      fireEvent.click(screen.getByTestId('toggle-chat'));
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('20s elapsed');

      // Advance 10s: ticks to 30s and triggers announcement
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('30s elapsed');
      expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Still working… 30s elapsed.');

      // Advance 5s (now 35s, inside the same 30s bucket)
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('35s elapsed');

      // Remount within the same 30s bucket (e.g. user toggles away and back)
      fireEvent.click(screen.getByTestId('toggle-chat'));
      fireEvent.click(screen.getByTestId('toggle-chat'));
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('35s elapsed');

      // Advance 1s (36s): no duplicate Still-working announcement
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('36s elapsed');
      expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Still working… 30s elapsed.');

      // Advance 24s to reach 60s (next bucket): triggers next announcement
      act(() => {
        vi.advanceTimersByTime(24000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('1m 0s elapsed');
      expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Still working… 60s elapsed.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a failed turn with the identical payload', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(new Error('boom'));
    renderChat();
    fireEvent.click(screen.getByText('Use selection (1)'));
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'Retry me' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent('boom');
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-retry'));
    await waitFor(() => {
      expect(api.retrospectiveChat).toHaveBeenCalledTimes(2);
    });
    // Identical payload except the turnId: every attempt mints a fresh
    // progress correlator, so frames from the failed turn never land on
    // the retry's card.
    const [firstPayload, secondPayload] = [
      api.retrospectiveChat.mock.calls[0][1],
      api.retrospectiveChat.mock.calls[1][1],
    ];
    expect(firstPayload.turnId).toEqual(expect.any(String));
    expect(secondPayload.turnId).toEqual(expect.any(String));
    expect(secondPayload.turnId).not.toBe(firstPayload.turnId);
    expect({ ...secondPayload, turnId: firstPayload.turnId }).toEqual(firstPayload);
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toHaveTextContent(
        'The migration task failed its tests.',
      );
    });
  });

  it('shows the timeout notice with retry for server 504s and client aborts', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(
      transportError(retrospectiveTimeoutErrorFixture, 'API 504 on /retrospective/chat'),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent(
        'The server stopped waiting for the model. Retry?',
      );
    });
    expect(screen.getByTestId('retrospective-chat-retry')).toBeInTheDocument();
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Chat did not finish.');
    // No tail in the payload → no partial panel.
    expect(screen.queryByTestId('retrospective-chat-partial')).not.toBeInTheDocument();
  });

  it('shows partial output inside the timeout notice when the server sends a tail', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(
      transportError(retrospectiveTimeoutWithOutputFixture, 'API 504 on /retrospective/chat'),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-partial')).toHaveTextContent(
        'Partial output before it stopped:',
      );
    });
    expect(screen.getByTestId('retrospective-chat-partial-output')).toHaveTextContent(
      'warming up…',
    );
    expect(screen.getByTestId('retrospective-chat-retry')).toBeInTheDocument();
  });

  it('shows partial output inside the model-failed notice when the server sends a tail', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(
      transportError(retrospectiveModelFailedWithOutputFixture, 'API 502 on /retrospective/chat'),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-partial')).toHaveTextContent(
        'Partial output before the failure:',
      );
    });
    expect(screen.getByTestId('retrospective-chat-partial-output')).toHaveTextContent(
      'before the boom',
    );
  });

  it('names the interruption (not a budget) when the request itself aborts', async () => {
    // No-timeout default: a bare AbortError means the request was
    // interrupted, never a budget expiry — the notice must not name one.
    const abort = new Error('API request aborted on /retrospective/chat');
    abort.name = 'AbortError';
    api.retrospectiveChat.mockRejectedValueOnce(abort);
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent(
        'The request was interrupted before the model answered. Retry?',
      );
    });
  });

  it('prunes stale chips with an inline notice instead of an error', async () => {
    api.retrospectiveChat.mockResolvedValueOnce({
      ...retrospectiveLenientUnknownFixture,
      unknownTaskIds: ['task-failed-2'],
    });
    renderChat();
    fireEvent.click(screen.getByText('Use selection (1)'));
    expect(screen.getByTestId('retrospective-chat-chip-task-failed-2')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.queryByTestId('retrospective-chat-chip-task-failed-2')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('retrospective-chat-notice')).toHaveTextContent(
      '1 task(s) no longer exist and were removed from context.',
    );
    expect(screen.getByTestId('retrospective-chat-notice')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('retrospective-chat-error')).not.toBeInTheDocument();
  });

  it('shows a truncation notice naming how many tasks were injected', async () => {
    api.retrospectiveChat.mockResolvedValueOnce(retrospectiveTruncatedContextFixture);
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-notice')).toHaveTextContent(
        'Context truncated: oldest tasks were dropped to fit the budget (1 tasks included).',
      );
    });
  });

  it('renders a designed no-content state with retry for empty replies', async () => {
    api.retrospectiveChat.mockResolvedValueOnce(retrospectiveEmptyReplyFixture);
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-empty-1')).toHaveTextContent(
        'The model returned no content.',
      );
    });
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent(
      'The model returned no content.',
    );
    api.retrospectiveChat.mockResolvedValueOnce(retrospectiveChatTurnFixture.response);
    fireEvent.click(screen.getByLabelText('Retry the unanswered turn'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toHaveTextContent(
        'The migration task failed its tests.',
      );
    });
  });

  it('shows the output tail in the empty-reply state when the server sends one', async () => {
    api.retrospectiveChat.mockResolvedValueOnce({
      ...retrospectiveEmptyReplyFixture,
      output: 'half a thought',
    });
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-output-1')).toHaveTextContent(
        'Partial output before the empty reply:',
      );
    });
    expect(screen.getByTestId('retrospective-chat-message-output-1')).toHaveTextContent(
      'half a thought',
    );
  });

  it('collapses the output tail under a normal reply and renders nothing without one', async () => {
    api.retrospectiveChat.mockResolvedValueOnce({
      ...retrospectiveChatTurnFixture.response,
      output: 'trace tail',
    });
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-output-1')).toHaveTextContent(
        'Model output trace',
      );
    });
    expect(screen.getByTestId('retrospective-chat-message-output-1')).toHaveTextContent(
      'trace tail',
    );
    // A reply without a tail renders no trace block.
    api.retrospectiveChat.mockResolvedValueOnce(retrospectiveChatTurnFixture.response);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'again' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-3')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('retrospective-chat-message-output-3')).not.toBeInTheDocument();
  });

  it('drops stale partial output when ticket creation fails after a tailed error', async () => {
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toHaveTextContent(
        'The migration task failed its tests.',
      );
    });
    api.retrospectiveChat.mockRejectedValueOnce(
      transportError(retrospectiveTimeoutWithOutputFixture, 'API 504 on /retrospective/chat'),
    );
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'again' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-partial')).toBeInTheDocument();
    });
    // The ticket failure reuses the error banner: the turn's tail must not
    // linger under the unrelated error.
    api.createTask.mockRejectedValueOnce(new Error('ticket boom'));
    fireEvent.click(screen.getByText('Confirm ticket'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent('ticket boom');
    });
    expect(screen.queryByTestId('retrospective-chat-partial')).not.toBeInTheDocument();
  });

  it('keeps the full-404 path on the error banner', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(
      transportError(retrospectiveTaskNotFoundFixture, 'API 404 on /retrospective/chat'),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent(
        'Task bogus-id not found',
      );
    });
  });

  it('surfaces oversized-input 400s as errors', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(
      transportError(retrospectiveOversizedInputFixture, 'API 400 on /retrospective/chat'),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent(
        'Chat input exceeds limits',
      );
    });
  });

  it('maps a server 502 chat_prompt_failed onto the error banner with retry', async () => {
    api.retrospectiveChat.mockRejectedValueOnce(
      transportError(retrospectiveModelFailedFixture, 'API 502 on /retrospective/chat'),
    );
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent(
        'The model failed to answer this turn. Retry?',
      );
    });
    expect(screen.getByTestId('retrospective-chat-retry')).toBeInTheDocument();
  });

  it('names the session-default fallback when the requested model is refused', async () => {
    api.retrospectiveChat.mockResolvedValueOnce({
      ...retrospectiveChatTurnFixture.response,
      modelRequested: false,
      model: 'session-default-m1',
    });
    renderChat([]);
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-model-notice')).toHaveTextContent(
        'Requested model unavailable — answered on session default (session-default-m1).',
      );
    });
  });

  it('caps input length with a live counter', () => {
    renderChat([]);
    const input = screen.getByTestId('retrospective-chat-input');
    expect(input).toHaveAttribute('maxLength', '8000');
    expect(screen.getByTestId('retrospective-chat-counter')).toHaveTextContent('0 / 8000');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(screen.getByTestId('retrospective-chat-counter')).toHaveTextContent('5 / 8000');
  });

  it('clears transcript, chips, and storage on Clear chat', async () => {
    renderChat();
    fireEvent.click(screen.getByText('Use selection (1)'));
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-clear'));
    expect(screen.queryByTestId('retrospective-chat-message-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('retrospective-chat-chip-task-failed-2')).not.toBeInTheDocument();
    // Storage holds the cleared (empty) transcript — a reload restores nothing.
    expect(JSON.parse(window.sessionStorage.getItem('kb.retroChat.v2.proj-1'))).toEqual(
      expect.objectContaining({ messages: [], chatTaskIds: [] }),
    );
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Chat cleared.');
  });

  it('restores transcript and chips from sessionStorage on mount', async () => {
    const first = renderChat();
    fireEvent.click(screen.getByText('Use selection (1)'));
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'Persist me' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toBeInTheDocument();
    });
    first.unmount();
    renderChat([]);
    expect(screen.getByTestId('retrospective-chat-message-0')).toHaveTextContent('Persist me');
    expect(screen.getByTestId('retrospective-chat-message-1')).toHaveTextContent(
      'The migration task failed its tests.',
    );
    expect(screen.getByTestId('retrospective-chat-chip-task-failed-2')).toBeInTheDocument();
  });

  it('starts fresh when stored chat state is corrupt', () => {
    window.sessionStorage.setItem('kb.retroChat.v2.proj-1', 'not-json{{{');
    renderChat([]);
    expect(screen.queryByTestId('retrospective-chat-message-0')).not.toBeInTheDocument();
    expect(screen.getByText('No task context — general chat.')).toBeInTheDocument();
  });

  it('shows a labeled Reasoning dropdown for reasoning-capable harnesses', async () => {
    api.getModels.mockResolvedValueOnce({
      models: [{ id: 'm1', name: 'M1', provider: 'google', key: 'google::m1' }],
      harnesses: [
        {
          id: 'pi',
          label: 'pi',
          description: 'pi coding-agent harness',
          modelSelection: 'list',
          reasoningLevels: ['low', 'medium', 'high'],
          models: [{ id: 'm1', name: 'M1', provider: 'google', key: 'pi::google::m1' }],
        },
      ],
    });
    renderChat();
    // Visible label (not just the combobox accessible name) so the control is
    // recognizable next to the model dropdown.
    expect(await screen.findByRole('combobox', { name: 'Reasoning' })).toBeInTheDocument();
    expect(screen.getByText('Reasoning', { selector: 'label' })).toHaveAttribute(
      'for',
      'retrospective-chat-model-reasoning',
    );
  });

  it('only auto-scrolls near the bottom and offers a jump button otherwise', async () => {
    renderChat([]);
    const list = screen.getByTestId('retrospective-chat-messages');
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'first' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toBeInTheDocument();
    });
    // Near the bottom: the reply auto-scrolls into view.
    expect(list.scrollTop).toBe(1000);
    // Scrolled up: the jump button appears and the next reply does not yank.
    list.scrollTop = 100;
    fireEvent.scroll(list);
    expect(screen.getByTestId('retrospective-chat-jump')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'second' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-3')).toBeInTheDocument();
    });
    expect(list.scrollTop).toBe(100);
    fireEvent.click(screen.getByTestId('retrospective-chat-jump'));
    expect(list.scrollTop).toBe(1000);
    expect(screen.queryByTestId('retrospective-chat-jump')).not.toBeInTheDocument();
  });
});
