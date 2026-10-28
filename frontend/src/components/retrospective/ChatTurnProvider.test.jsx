import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { ChatTurnProvider, chatReplyExcerpt } from './ChatTurnProvider';
import { RetrospectiveProvider, useRetrospective } from './useRetrospective';
import { RetrospectiveChat } from './RetrospectiveChat';
import { saveStoredChat } from './useRetrospectiveChat';
import { retrospectiveTaskFixtures, retrospectiveChatTurnFixture } from './__fixtures__/index.js';
import '@testing-library/jest-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: { retrospectiveChat: vi.fn(), createTask: vi.fn() },
  };
});
import { api } from '../../services/api';

/***
 * MARK: ChatTurnProvider tests
 * @description Locks the app-level turn ownership: turns survive route
 *   navigation, settle with a completion toast (with a way back) when the
 *   chat isn't visible, stay silent when it is, match live progress by
 *   turnId, restore interrupted turns with Retry, and abort cleanly on
 *   project switch.
 ***/

function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid="probe-path">{pathname}</span>;
}

function NavButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" data-testid="go-away" onClick={() => navigate('/')}>
        away
      </button>
      <button type="button" data-testid="go-chat" onClick={() => navigate('/retrospective')}>
        chat
      </button>
    </>
  );
}

function ChatRoute() {
  return (
    <RetrospectiveProvider initialSelectedIds={[]}>
      <RetrospectiveChat tasks={retrospectiveTaskFixtures} />
    </RetrospectiveProvider>
  );
}

function buildTree() {
  return (
    <ChatTurnProvider>
      <NavButtons />
      <LocationProbe />
      <Routes>
        <Route path="/retrospective" element={<ChatRoute />} />
        <Route path="/" element={<div data-testid="away-view">away</div>} />
      </Routes>
    </ChatTurnProvider>
  );
}

function renderApp({ entries = ['/retrospective'], overrides = {} } = {}) {
  return renderWithKainBain(buildTree(), { ...overrides }, { initialEntries: entries });
}

function stubVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

describe('ChatTurnProvider', () => {
  const realVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    api.retrospectiveChat.mockResolvedValue(retrospectiveChatTurnFixture.response);
    api.createTask.mockResolvedValue({ id: 'new-1', title: 'Stabilize migration tests' });
  });

  afterEach(() => {
    if (realVisibility) {
      Object.defineProperty(document, 'visibilityState', realVisibility);
    }
  });

  it('continues the turn across navigation and toasts with a way back', async () => {
    const addNotification = vi.fn();
    const rendered = renderApp({ overrides: { addNotification } });
    expect(screen.getByTestId('probe-path')).toHaveTextContent('/retrospective');

    let resolveTurn;
    api.retrospectiveChat.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTurn = resolve;
      }),
    );
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'Long question' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-pending')).toBeInTheDocument();
    });

    // Navigate away mid-turn: the chat unmounts but the provider keeps working.
    fireEvent.click(screen.getByTestId('go-away'));
    expect(screen.getByTestId('away-view')).toBeInTheDocument();
    expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();

    resolveTurn(retrospectiveChatTurnFixture.response);
    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Retrospective chat',
          message: expect.stringContaining('Chat reply ready'),
          action: expect.objectContaining({ label: 'View chat' }),
        }),
      );
    });
    // The toast names the reply so the user can triage from anywhere.
    expect(addNotification.mock.calls[0][0].message).toContain('migration');

    // The action navigates back, where the reply replaced the working card.
    const { onClick } = addNotification.mock.calls[0][0].action;
    act(() => {
      onClick();
    });
    expect(screen.getByTestId('probe-path')).toHaveTextContent('/retrospective');
    expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('retrospective-chat-message-1')).toHaveTextContent(
      'The migration task failed its tests.',
    );
    expect(rendered.value).toBeDefined();
  });

  it('preserves elapsed seconds when navigating away and returning mid-turn', () => {
    vi.useFakeTimers();
    try {
      api.retrospectiveChat.mockReturnValueOnce(new Promise(() => {})); // never settles
      renderApp();
      expect(screen.getByTestId('probe-path')).toHaveTextContent('/retrospective');

      fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
        target: { value: 'Count across route changes' },
      });
      fireEvent.click(screen.getByTestId('retrospective-chat-send'));
      expect(screen.getByTestId('retrospective-chat-pending')).toBeInTheDocument();
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('0s elapsed');

      act(() => {
        vi.advanceTimersByTime(12000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('12s elapsed');

      // Navigate away mid-turn (e.g. to orchestrator or explorer)
      fireEvent.click(screen.getByTestId('go-away'));
      expect(screen.getByTestId('away-view')).toBeInTheDocument();
      expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();

      // Time elapses while away
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      // Navigate back to retrospective
      fireEvent.click(screen.getByTestId('go-chat'));
      expect(screen.getByTestId('probe-path')).toHaveTextContent('/retrospective');
      expect(screen.getByTestId('retrospective-chat-pending')).toBeInTheDocument();
      // Counter reflects total elapsed time (20s), not 0s
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('20s elapsed');

      // Continues ticking
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('retrospective-chat-elapsed')).toHaveTextContent('30s elapsed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays silent when the turn settles on the visible chat', async () => {
    stubVisibility('visible');
    const addNotification = vi.fn();
    renderApp({ overrides: { addNotification } });
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toBeInTheDocument();
    });
    expect(addNotification).not.toHaveBeenCalled();
  });

  it('fires a persistent error toast when a turn fails off-route', async () => {
    const addNotification = vi.fn();
    renderApp({ overrides: { addNotification } });
    let rejectTurn;
    api.retrospectiveChat.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectTurn = reject;
      }),
    );
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-pending')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('go-away'));
    rejectTurn(new Error('model blew up'));
    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Retrospective chat',
          duration: 0,
          message: expect.stringContaining('model blew up'),
          action: expect.objectContaining({ label: 'View chat' }),
        }),
      );
    });
    // Back on the chat: the designed error with Retry, exactly once.
    act(() => {
      addNotification.mock.calls[0][0].action.onClick();
    });
    expect(screen.getByTestId('retrospective-chat-error')).toHaveTextContent('model blew up');
    expect(screen.getByTestId('retrospective-chat-retry')).toBeInTheDocument();
  });

  it('never toasts for a cancelled turn', async () => {
    const addNotification = vi.fn();
    renderApp({ overrides: { addNotification } });
    let resolveTurn;
    api.retrospectiveChat.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTurn = resolve;
      }),
    );
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'Will cancel' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-cancel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-cancel'));
    fireEvent.click(screen.getByTestId('go-away'));
    // The late resolution is ignored: no toast, no phantom reply.
    resolveTurn(retrospectiveChatTurnFixture.response);
    await waitFor(() => {
      expect(api.retrospectiveChat).toHaveBeenCalledTimes(1);
    });
    expect(addNotification).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('go-chat'));
    expect(screen.queryByTestId('retrospective-chat-message-0')).not.toBeInTheDocument();
  });

  it('renders matching progress frames and ignores foreign turnIds', async () => {
    const rendered = renderApp();
    let resolveTurn;
    api.retrospectiveChat.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTurn = resolve;
      }),
    );
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-pending')).toBeInTheDocument();
    });
    const turnId = api.retrospectiveChat.mock.calls[0][1].turnId;
    expect(turnId).toEqual(expect.any(String));
    // Silent harness so far: honest idle copy, no output block.
    expect(screen.getByTestId('retrospective-chat-working-idle')).toHaveTextContent(
      'No live output from this harness yet',
    );

    const rerenderWithProgress = (lastChatProgress) => {
      rendered.rerender(
        <MemoryRouter initialEntries={['/retrospective']}>
          <KainBainContext.Provider value={{ ...rendered.value, lastChatProgress }}>
            {buildTree()}
          </KainBainContext.Provider>
        </MemoryRouter>,
      );
    };
    // Another tab's turn: ignored.
    rerenderWithProgress({ turnId: 'someone-else', tail: 'foreign text', _seq: 1 });
    expect(screen.queryByTestId('retrospective-chat-working-output')).not.toBeInTheDocument();
    // Our turn: the tail scrolls into the card (and replaces, never appends twice).
    rerenderWithProgress({ turnId, tail: 'warming up…', _seq: 2 });
    expect(screen.getByTestId('retrospective-chat-working-output')).toHaveTextContent(
      'warming up…',
    );
    rerenderWithProgress({ turnId, tail: 'warming up…\nalmost there', _seq: 3 });
    expect(screen.getByTestId('retrospective-chat-working-output')).toHaveTextContent(
      'almost there',
    );

    // The settled reply replaces the card exactly once.
    resolveTurn(retrospectiveChatTurnFixture.response);
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('retrospective-chat-working-output')).not.toBeInTheDocument();
  });

  it('restores an interrupted turn with Retry after a reload', async () => {
    saveStoredChat('proj-1', {
      messages: [{ role: 'user', content: 'long question' }],
      chatTaskIds: [],
      harnessId: 'pi',
      model: '',
      pendingTurn: {
        turnId: 'turn-interrupted',
        turnMessages: [{ role: 'user', content: 'long question' }],
        taskIds: [],
        userText: 'long question',
        startedAt: Date.now() - 60000,
        progressTail: 'half an answer',
      },
    });
    renderApp();
    // Honest state: transcript kept, no phantom working card, Retry offered.
    expect(screen.getByTestId('retrospective-chat-message-0')).toHaveTextContent('long question');
    expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('retrospective-chat-notice')).toHaveTextContent(
      'The previous turn was interrupted before it finished.',
    );
    fireEvent.click(screen.getByTestId('retrospective-chat-retry'));
    await waitFor(() => {
      expect(api.retrospectiveChat).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          messages: [{ role: 'user', content: 'long question' }],
        }),
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-message-1')).toHaveTextContent(
        'The migration task failed its tests.',
      );
    });
    expect(screen.queryByTestId('retrospective-chat-notice')).not.toBeInTheDocument();
  });

  it('aborts the in-flight turn and adopts the new project on project switch', async () => {
    const rendered = renderApp({
      overrides: {
        activeProjectId: 'proj-1',
        projects: [
          { id: 'proj-1', harness: 'pi' },
          { id: 'proj-2', harness: 'pi' },
        ],
      },
    });
    let resolveTurn;
    api.retrospectiveChat.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTurn = resolve;
      }),
    );
    fireEvent.change(screen.getByTestId('retrospective-chat-input'), {
      target: { value: 'for proj-1' },
    });
    fireEvent.click(screen.getByTestId('retrospective-chat-send'));
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-chat-pending')).toBeInTheDocument();
    });
    const sentSignal = api.retrospectiveChat.mock.calls[0][2]?.signal;

    rendered.rerender(
      <MemoryRouter initialEntries={['/retrospective']}>
        <KainBainContext.Provider value={{ ...rendered.value, activeProjectId: 'proj-2' }}>
          {buildTree()}
        </KainBainContext.Provider>
      </MemoryRouter>,
    );
    expect(sentSignal.aborted).toBe(true);
    expect(screen.queryByTestId('retrospective-chat-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('retrospective-chat-message-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent(
      'Chat switched to the new project.',
    );
    // The late proj-1 resolution never lands on proj-2's transcript.
    resolveTurn(retrospectiveChatTurnFixture.response);
    await waitFor(() => {
      expect(api.retrospectiveChat).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('retrospective-chat-message-0')).not.toBeInTheDocument();
  });
});

describe('chatReplyExcerpt', () => {
  it('collapses whitespace and ellipsizes past 80 chars', () => {
    expect(chatReplyExcerpt('hello world')).toBe('hello world');
    expect(chatReplyExcerpt('  spaced\n\nout\ttext ')).toBe('spaced out text');
    expect(chatReplyExcerpt('')).toBe('');
    expect(chatReplyExcerpt(null)).toBe('');
    const long = `x${'y'.repeat(200)}`;
    const excerpt = chatReplyExcerpt(long);
    expect(excerpt.length).toBe(81);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
