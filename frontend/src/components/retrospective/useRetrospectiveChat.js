import { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { api } from '../../services/api';
import {
  CHAT_PROGRESS_TAIL_MAX_CHARS,
  truncateProgressTail,
  newChatTurnId,
  readChatProgressEvent,
} from './chatProgress.js';
import { ChatTurnContext } from './ChatTurnContext.js';

/***
 * MARK: INTERRUPTED_TURN_NOTICE
 * @description Inline copy for a turn that was in flight when the page
 *   reloaded: the transcript survived, the turn itself did not, and Retry
 *   re-sends the identical payload.
 ***/
export const INTERRUPTED_TURN_NOTICE =
  'The previous turn was interrupted before it finished. Retry to run it again.';

/***
 * MARK: retrospective chat transport limits
 * @description Mirror of the backend caps (`MAX_CHAT_MESSAGES`,
 *   `MAX_CHAT_MESSAGE_CHARS` in `api/routes/retrospective.js`): the input
 *   counter and the stored-transcript cap pin the same values. The route
 *   test plus the counter test jointly guard against drift.
 ***/
export const MAX_CHAT_MESSAGES = 50;
export const MAX_CHAT_MESSAGE_CHARS = 8000;

/***
 * MARK: storageKeyForProject
 * @description Versioned sessionStorage key for one project's chat transcript.
 *   v2 adds the in-flight-turn descriptor (see `saveStoredChat`); v1 readers
 *   must never see v2 payloads, so the version bump is a key change, not a
 *   shape flag.
 * @example storageKeyForProject('proj-1') => 'kb.retroChat.v2.proj-1'
 ***/
export function storageKeyForProject(projectId) {
  return `kb.retroChat.v2.${projectId || 'default'}`;
}

/***
 * MARK: legacyStorageKeyForProject
 * @description The v1 key, read once for migrate-on-read and then removed.
 * @example legacyStorageKeyForProject('proj-1') => 'kb.retroChat.v1.proj-1'
 ***/
export function legacyStorageKeyForProject(projectId) {
  return `kb.retroChat.v1.${projectId || 'default'}`;
}

/***
 * MARK: cleanStoredMessages
 * @description Filters one stored message list the same way for transcripts
 *   and in-flight-turn descriptors: foreign shapes are dropped (never
 *   trusted), assistant extras (suggestions/empty/output) survive, and the
 *   transcript cap keeps the newest.
 ***/
function cleanStoredMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m) =>
        m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'),
    )
    .map((m) => ({
      role: m.role,
      content: m.content,
      ...(Array.isArray(m.suggestions) ? { suggestions: m.suggestions } : {}),
      ...(m.empty === true ? { empty: true } : {}),
      ...(typeof m.output === 'string' && m.output ? { output: m.output } : {}),
    }))
    .slice(-MAX_CHAT_MESSAGES);
}

/***
 * MARK: cleanPendingTurn
 * @description Validates one stored in-flight-turn descriptor: it must name
 *   a turnId and carry a non-empty turn payload, or it is dropped (a reload
 *   with a corrupt descriptor restores the transcript with no phantom turn).
 ***/
function cleanPendingTurn(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.turnId !== 'string' || !raw.turnId) return null;
  const turnMessages = cleanStoredMessages(raw.turnMessages);
  if (turnMessages.length === 0) return null;
  if (typeof raw.userText !== 'string' || !raw.userText) return null;
  return {
    turnId: raw.turnId,
    turnMessages,
    taskIds: Array.isArray(raw.taskIds)
      ? raw.taskIds.filter((id) => typeof id === 'string')
      : [],
    userText: raw.userText,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : null,
    progressTail:
      typeof raw.progressTail === 'string' && raw.progressTail
        ? truncateProgressTail(raw.progressTail, CHAT_PROGRESS_TAIL_MAX_CHARS)
        : '',
  };
}

/***
 * MARK: parseStoredChat
 * @description Parses one stored payload object into chat state (shared by
 *   the v2 read and the v1 migration read — both shapes parse identically,
 *   v1 simply never carries a pending turn).
 ***/
function parseStoredChat(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const messages = cleanStoredMessages(parsed.messages);
  const chatTaskIds = Array.isArray(parsed.chatTaskIds)
    ? parsed.chatTaskIds.filter((id) => typeof id === 'string')
    : [];
  const harnessId = typeof parsed.harnessId === 'string' ? parsed.harnessId : undefined;
  const model = typeof parsed.model === 'string' ? parsed.model : '';
  const interrupted = cleanPendingTurn(parsed.pendingTurn);
  return { messages, chatTaskIds, harnessId, model, interrupted };
}

/***
 * MARK: loadStoredChat
 * @description Restores a persisted transcript, or null when absent/corrupt.
 *   Corrupt JSON degrades to fresh state — it never throws into the render.
 *   Foreign item shapes are filtered (not trusted): a stored message without
 *   a valid role/content pair never reaches the render path. A v1 payload
 *   migrates to v2 on read (then the v1 key is removed). A stored
 *   in-flight-turn descriptor comes back as `interrupted` — the unary turn
 *   itself cannot survive a reload, so the UI restores the transcript and
 *   offers Retry instead of pretending the turn is still running.
 ***/
export function loadStoredChat(projectId) {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKeyForProject(projectId));
    if (raw) {
      try {
        return parseStoredChat(JSON.parse(raw));
      } catch {
        return null;
      }
    }
    // Migrate-on-read: a v1 payload moves to v2 once, then the v1 key goes
    // away so a stale v1 can never shadow a newer v2.
    const legacyRaw = window.sessionStorage.getItem(legacyStorageKeyForProject(projectId));
    if (!legacyRaw) return null;
    let migrated = null;
    try {
      migrated = parseStoredChat(JSON.parse(legacyRaw));
    } catch {
      return null;
    }
    if (migrated) {
      saveStoredChat(projectId, migrated);
      try {
        window.sessionStorage.removeItem(legacyStorageKeyForProject(projectId));
      } catch {
        // Removal is best-effort; the v2 copy is authoritative now.
      }
    }
    return migrated;
  } catch {
    return null;
  }
}

/***
 * MARK: saveStoredChat
 * @description Persists the transcript slice for one project (fail-soft on
 *   quota or security errors — chat keeps working without persistence).
 *   While a turn is in flight the caller also passes `pendingTurn`
 *   (`{ turnId, turnMessages, taskIds, userText, startedAt, progressTail }`)
 *   so a reload restores an honest interrupted state with Retry.
 ***/
export function saveStoredChat(projectId, data) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    const pendingTurn = cleanPendingTurn(data.pendingTurn);
    window.sessionStorage.setItem(
      storageKeyForProject(projectId),
      JSON.stringify({
        messages: (data.messages || []).slice(-MAX_CHAT_MESSAGES),
        chatTaskIds: data.chatTaskIds || [],
        harnessId: data.harnessId,
        model: data.model,
        ...(pendingTurn ? { pendingTurn } : {}),
      }),
    );
  } catch {
    // sessionStorage quota or security restriction; fail-soft
  }
}

/***
 * MARK: clearStoredChat
 * @description Drops one project's persisted transcript (explicit Clear chat)
 *   under both the current and the legacy key, so no migrated leftover can
 *   resurrect a cleared conversation.
 ***/
export function clearStoredChat(projectId) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(storageKeyForProject(projectId));
  } catch {
    // fail-soft
  }
  try {
    window.sessionStorage.removeItem(legacyStorageKeyForProject(projectId));
  } catch {
    // fail-soft
  }
}

/***
 * MARK: readChatError
 * @description Maps a transport failure onto a `{ kind, ... }` union parsed
 *   from `status` + JSON `body.code`. The 501 degraded check stays first so
 *   the existing degraded tests keep pinning it. Chat turns run with no
 *   client or server timeout by default, so a status-less AbortError means
 *   the request was interrupted (proxy abort, navigation race — user Cancel
 *   never reaches here, it is swallowed by the sequence guard), not a
 *   budget expiry. A 504 splits two ways: structured JSON
 *   (`code: chat_prompt_timeout`) is the app's own opt-in chat ceiling, so
 *   it blames the server; a bare 504 (proxy HTML page, empty or code-less
 *   body) means a reverse proxy in front of the app gave up first — the
 *   turn may still be running server-side, so the copy says so honestly
 *   instead of blaming the app server. A bare 408 is the app HTTP server's
 *   own request timeout (`KAINBAIN_SERVER_REQUEST_TIMEOUT_MS` set at or
 *   below the chat ceiling — see `checkTimeoutPairing`), so it maps to a
 *   server timeout with retry, never generic.
 ***/
export function readChatError(err) {
  if (!err) return null;
  const status = err?.status;
  let code = null;
  let detail = null;
  let errorMsg = err?.message || '';
  let parsedBody = null;

  try {
    parsedBody = typeof err.body === 'string' ? JSON.parse(err.body) : err.body || null;
  } catch {
    parsedBody = null;
  }

  if (parsedBody && typeof parsedBody === 'object') {
    code = parsedBody.code || null;
    detail = parsedBody.detail || null;
    if (parsedBody.error) errorMsg = parsedBody.error;
  }

  // Bounded assistant-output tail the server observed before the failure
  // (present on 504/502 when anything streamed; absent otherwise).
  const output =
    parsedBody && typeof parsedBody.output === 'string' && parsedBody.output
      ? parsedBody.output
      : null;

  if (status === 501 && code === 'unsupported_by_harness') {
    return {
      kind: 'degraded',
      capability: parsedBody?.capability || 'prompt',
      harness: parsedBody?.harness || '',
    };
  }
  if (err.name === 'AbortError' && status === undefined) {
    return {
      kind: 'timeout',
      source: 'client',
      message: 'The request was interrupted before the model answered. Retry?',
    };
  }
  if (status === 504 || status === 408 || code === 'chat_prompt_timeout') {
    // Structured 504 JSON is the app's own opt-in chat ceiling. A bare 504
    // (no such code: proxy HTML page, empty or code-less body) was emitted
    // in front of the app — the turn may still be running server-side, so
    // the copy must not blame the app server. A bare 408 is the app HTTP
    // server's own request timeout (see the MARK comment above), so it maps
    // to a server timeout, not generic. `kind` stays 'timeout' throughout
    // so the existing retry + partial-output flow handles all three
    // identically.
    if (code === 'chat_prompt_timeout') {
      return {
        kind: 'timeout',
        source: 'server',
        message: 'The server stopped waiting for the model. Retry?',
        ...(output ? { output } : {}),
      };
    }
    if (status === 408) {
      return {
        kind: 'timeout',
        source: 'server',
        message: 'The server connection timed out before the model finished. Retry?',
        ...(output ? { output } : {}),
      };
    }
    return {
      kind: 'timeout',
      source: 'proxy',
      message:
        'A proxy in front of the server timed out before the model finished. The turn may still be running — wait a moment, then Retry?',
      ...(output ? { output } : {}),
    };
  }
  if (status === 400 && code === 'chat_input_too_large') {
    return {
      kind: 'oversized',
      message: errorMsg || 'Message exceeds size limits.',
      detail,
    };
  }
  if (status === 404 && code === 'task_not_found') {
    return {
      kind: 'task_not_found',
      taskId: parsedBody?.taskId,
      unknownTaskIds: Array.isArray(parsedBody?.unknownTaskIds)
        ? parsedBody.unknownTaskIds
        : [],
      message: errorMsg || 'Task not found.',
    };
  }
  if (status === 502 || code === 'chat_prompt_failed') {
    return {
      kind: 'model-failed',
      message: 'The model failed to answer this turn. Retry?',
      ...(output ? { output } : {}),
    };
  }

  return {
    kind: 'generic',
    message: errorMsg || 'Chat failed. Try again.',
    ...(output ? { output } : {}),
  };
}

/***
 * MARK: useChatTurnController
 * @description State owner for one project's chat: transcript, draft, context
 *   chips, pending/error/degraded/notice states, send/cancel/retry/clear,
 *   per-turn abort plus sequence-token guards, live progress matching, and
 *   sessionStorage persistence (transcript plus the in-flight-turn
 *   descriptor). One instance lives in the app-level `ChatTurnProvider` (so
 *   turns survive route navigation); the `useRetrospectiveChat` adapter
 *   falls back to a local instance outside a provider. Rendering (chips,
 *   messages, suggestions, pickers) stays in `RetrospectiveChat.jsx`;
 *   ticket Confirm/Edit stays there too.
 * @param {Object} args
 * @param {string} args.activeProjectId - The project this state belongs to.
 * @param {string} [args.initialHarnessId] - Harness adopted when no stored one exists.
 * @param {string} [args.initialModel] - Model adopted when no stored one exists.
 * @param {Object} [args.progressEvent] - Latest raw CHAT_PROGRESS payload (matched by turnId).
 * @param {Function} [args.onTurnSettled] - Called once per settled turn with
 *   `{ ok, replyText?, errorMessage? }` (never for cancel/clear).
 * @param {boolean} [args.dormant] - When true, the instance skips persistence
 *   and project-switch handling (a shadow under a live provider).
 ***/
export function useChatTurnController({
  activeProjectId,
  initialHarnessId,
  initialModel = '',
  progressEvent = null,
  onTurnSettled = null,
  dormant = false,
}) {
  // Mount-only restore: the stored snapshot seeds the initial states below
  // (lazy initializer, so storage is read once — never a ref-in-render).
  const [stored] = useState(() => (dormant ? null : loadStoredChat(activeProjectId)));

  const [messages, setMessages] = useState(() => stored?.messages || []);
  const [draft, setDraft] = useState('');
  const [chatTaskIds, setChatTaskIds] = useState(() => stored?.chatTaskIds || []);
  const [harnessId, setHarnessId] = useState(() => stored?.harnessId ?? initialHarnessId);
  const [model, setModel] = useState(() => stored?.model ?? initialModel);

  const [pending, setPending] = useState(false);
  const [turnId, setTurnId] = useState(null);
  const [turnStartedAt, setTurnStartedAt] = useState(null);
  const [progressTail, setProgressTail] = useState('');
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState('');
  const [errorOutput, setErrorOutput] = useState('');
  const [degraded, setDegraded] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  // A reload with a stored in-flight descriptor restores the exact retry
  // payload plus the honest interrupted notice (the turn itself is gone).
  const [lastFailedTurn, setLastFailedTurn] = useState(() =>
    stored?.interrupted
      ? {
          turnMessages: stored.interrupted.turnMessages,
          taskIds: stored.interrupted.taskIds,
          draftText: stored.interrupted.userText,
        }
      : null,
  );
  const [inlineNotice, setInlineNotice] = useState(() =>
    stored?.interrupted ? INTERRUPTED_TURN_NOTICE : null,
  );
  const [modelNotice, setModelNotice] = useState('');

  const abortControllerRef = useRef(null);
  const cancelledRef = useRef(false);
  const turnSequenceRef = useRef(0);
  // The in-flight turn: base transcript length (before the turn's user
  // message was appended), the exact payload for retry, the user text
  // for draft restore on cancel, and the turnId progress frames match on.
  const currentTurnRef = useRef(null);
  const projectIdRef = useRef(activeProjectId);
  const onTurnSettledRef = useRef(onTurnSettled);
  useEffect(() => {
    onTurnSettledRef.current = onTurnSettled;
  }, [onTurnSettled]);

  // Sync persistence on change (transcript plus the in-flight descriptor,
  // so a reload restores an honest interrupted state with Retry).
  useEffect(() => {
    if (dormant) return;
    // The project-switch effect below adopts the new project's state after
    // this effect runs on the switch render — never persist the old
    // project's state under the new project's key in between.
    if (projectIdRef.current !== activeProjectId) return;
    const inFlight = pending ? currentTurnRef.current : null;
    saveStoredChat(activeProjectId, {
      messages,
      chatTaskIds,
      harnessId,
      model,
      ...(inFlight
        ? {
            pendingTurn: {
              turnId: inFlight.turnId,
              turnMessages: inFlight.turnMessages,
              taskIds: inFlight.taskIds,
              userText: inFlight.userText,
              startedAt: turnStartedAt,
              progressTail,
            },
          }
        : {}),
    });
  }, [dormant, activeProjectId, messages, chatTaskIds, harnessId, model, pending, turnStartedAt, progressTail]);

  // Live progress: a CHAT_PROGRESS frame only lands on the card when its
  // turnId matches the in-flight turn (other tabs' turns are ignored).
  useEffect(() => {
    if (dormant) return;
    const frame = readChatProgressEvent(progressEvent);
    if (!frame) return;
    if (!pending || currentTurnRef.current?.turnId !== frame.turnId) return;
    setProgressTail(frame.tail);
  }, [dormant, progressEvent, pending]);

  // Project switch (provider only; the route-level hook remounts per
  // project instead): the old turn belongs to the old project, so it is
  // aborted silently, then the new project's stored state is adopted.
  useEffect(() => {
    if (dormant || projectIdRef.current === activeProjectId) return;
    projectIdRef.current = activeProjectId;
    cancelledRef.current = true;
    turnSequenceRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentTurnRef.current = null;
    const next = loadStoredChat(activeProjectId);
    setMessages(next?.messages || []);
    setChatTaskIds(next?.chatTaskIds || []);
    setHarnessId(next?.harnessId ?? initialHarnessId);
    setModel(next?.model ?? initialModel);
    setPending(false);
    setTurnId(null);
    setTurnStartedAt(null);
    setProgressTail('');
    setError('');
    setErrorKind('');
    setErrorOutput('');
    setDegraded(null);
    setInlineNotice(next?.interrupted ? INTERRUPTED_TURN_NOTICE : null);
    setModelNotice('');
    setLastFailedTurn(
      next?.interrupted
        ? {
            turnMessages: next.interrupted.turnMessages,
            taskIds: next.interrupted.taskIds,
            draftText: next.interrupted.userText,
          }
        : null,
    );
    setAnnouncement('Chat switched to the new project.');
  }, [dormant, activeProjectId, initialHarnessId, initialModel]);

  // External error writes (ticket creation) always drop the turn-scoped
  // kind/tail with them, so a stale partial panel never renders under an
  // unrelated error. Turn failures set kind/tail explicitly after this.
  const setErrorAndClearOutput = useCallback((message) => {
    setError(message);
    setErrorKind('');
    setErrorOutput('');
  }, []);

  const cancel = useCallback(() => {
    if (!pending) return;
    cancelledRef.current = true;
    turnSequenceRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Silent cancel: no error banner. The in-flight user message drops back
    // into the draft so nothing is lost and re-send never duplicates.
    const turn = currentTurnRef.current;
    currentTurnRef.current = null;
    if (turn) {
      setMessages((prev) => prev.slice(0, turn.baseLength));
      setDraft(turn.userText);
      setLastFailedTurn({
        turnMessages: turn.turnMessages,
        taskIds: turn.taskIds,
        draftText: turn.userText,
      });
    }
    setPending(false);
    setTurnId(null);
    setTurnStartedAt(null);
    setProgressTail('');
    setAnnouncement('Chat turn cancelled.');
  }, [pending]);

  const clearChat = useCallback(() => {
    cancelledRef.current = true;
    turnSequenceRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentTurnRef.current = null;
    setMessages([]);
    setChatTaskIds([]);
    setDraft('');
    setPending(false);
    setTurnId(null);
    setTurnStartedAt(null);
    setProgressTail('');
    setError('');
    setErrorKind('');
    setErrorOutput('');
    setDegraded(null);
    setInlineNotice(null);
    setModelNotice('');
    setLastFailedTurn(null);
    clearStoredChat(activeProjectId);
    setAnnouncement('Chat cleared.');
  }, [activeProjectId]);

  const executeTurn = useCallback(
    async ({ turnMessages, taskIds, userText, baseLength }) => {
      const currentSeq = turnSequenceRef.current + 1;
      turnSequenceRef.current = currentSeq;
      cancelledRef.current = false;
      // The turnId keys live CHAT_PROGRESS frames and the stored
      // in-flight descriptor; the working card remounts on it.
      const startedTurnId = newChatTurnId();
      const startedAt = Date.now();
      currentTurnRef.current = { turnMessages, taskIds, userText, baseLength, turnId: startedTurnId };
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setPending(true);
      setTurnId(startedTurnId);
      setTurnStartedAt(startedAt);
      setProgressTail('');
      setError('');
      setErrorKind('');
      setErrorOutput('');
      setDegraded(null);
      setInlineNotice(null);
      setModelNotice('');

      try {
        const res = await api.retrospectiveChat(
          activeProjectId,
          {
            messages: turnMessages.map((m) => ({ role: m.role, content: m.content })),
            taskIds,
            harness: harnessId || undefined,
            model: model || undefined,
            turnId: startedTurnId,
          },
          { signal: controller.signal },
        );

        // Sequence guard: a late resolution after abort/cancel or a
        // superseding turn must never overwrite newer state.
        if (currentSeq !== turnSequenceRef.current || cancelledRef.current) {
          return;
        }
        currentTurnRef.current = null;

        const suggestions = Array.isArray(res?.suggestions) ? res.suggestions : [];
        const rawReply = typeof res?.reply === 'string' ? res.reply : '';
        const isEmptyReply = !rawReply.trim();
        const turnOutput = typeof res?.output === 'string' && res.output ? res.output : '';

        const assistantMsg = {
          role: 'assistant',
          content: isEmptyReply ? '' : rawReply,
          suggestions,
          empty: isEmptyReply,
          ...(turnOutput ? { output: turnOutput } : {}),
        };

        setMessages([...turnMessages, assistantMsg]);

        // A rejected model switch never fails the turn — but the UI names
        // the fallback instead of silently answering on another model.
        if (res?.modelRequested === false) {
          setModelNotice(
            `Requested model unavailable — answered on session default${res?.model ? ` (${res.model})` : ''}.`,
          );
        }

        // Stale chips prune with an inline notice (never the error banner);
        // truncation reports how many tasks were actually injected.
        if (Array.isArray(res?.unknownTaskIds) && res.unknownTaskIds.length > 0) {
          const count = res.unknownTaskIds.length;
          const stale = res.unknownTaskIds;
          setChatTaskIds((prev) => prev.filter((id) => !stale.includes(id)));
          setInlineNotice(
            `${count} task(s) no longer exist and were removed from context.`,
          );
        } else if (res?.contextTruncated) {
          const injectedCount = Array.isArray(res?.contextTaskIds)
            ? res.contextTaskIds.length
            : 0;
          setInlineNotice(
            `Context truncated: oldest tasks were dropped to fit the budget (${injectedCount} tasks included).`,
          );
        }

        if (isEmptyReply) {
          // Designed "no content" state with its own Retry: keep the turn
          // so the bubble's retry re-sends the identical payload.
          setLastFailedTurn({ turnMessages, taskIds, draftText: userText });
          setAnnouncement('The model returned no content.');
        } else {
          setLastFailedTurn(null);
          if (suggestions.length > 0) {
            setAnnouncement(`Reply received with ${suggestions.length} ticket suggestion(s).`);
          } else {
            setAnnouncement('Reply received.');
          }
        }
        onTurnSettledRef.current?.({ ok: true, replyText: isEmptyReply ? '' : rawReply });
      } catch (err) {
        if (currentSeq !== turnSequenceRef.current || cancelledRef.current) {
          return;
        }
        currentTurnRef.current = null;

        setLastFailedTurn({ turnMessages, taskIds, draftText: userText });
        const parsed = readChatError(err);

        if (parsed?.kind === 'degraded') {
          setDegraded(parsed);
          setAnnouncement('This harness cannot chat. Degraded notice shown.');
          onTurnSettledRef.current?.({
            ok: false,
            errorMessage: 'This harness can’t chat yet.',
            degraded: true,
          });
        } else if (parsed?.kind === 'timeout') {
          setError(parsed.message);
          setErrorKind('timeout');
          setErrorOutput(parsed.output || '');
          setAnnouncement('Chat did not finish.');
          onTurnSettledRef.current?.({ ok: false, errorMessage: parsed.message });
        } else if (parsed?.kind === 'model-failed') {
          // Designed 502 copy (the turn stays retryable via lastFailedTurn).
          setError(parsed.message);
          setErrorKind('model-failed');
          setErrorOutput(parsed.output || '');
          setAnnouncement('Chat failed.');
          onTurnSettledRef.current?.({ ok: false, errorMessage: parsed.message });
        } else {
          const message = parsed?.message || 'Chat failed. Try again.';
          setError(message);
          setErrorKind(parsed?.kind || 'generic');
          setErrorOutput(parsed?.output || '');
          setAnnouncement('Chat failed.');
          onTurnSettledRef.current?.({ ok: false, errorMessage: message });
        }
      } finally {
        if (currentSeq === turnSequenceRef.current) {
          setPending(false);
          setTurnId(null);
          setTurnStartedAt(null);
          setProgressTail('');
          abortControllerRef.current = null;
        }
      }
    },
    [activeProjectId, harnessId, model],
  );

  const send = useCallback(
    async (overrideText) => {
      const raw = typeof overrideText === 'string' ? overrideText : draft;
      const content = raw.trim();
      if (!content || pending) return;
      const baseLength = messages.length;
      const turnMessages = [...messages, { role: 'user', content }];
      setMessages(turnMessages);
      setDraft('');
      await executeTurn({
        turnMessages,
        taskIds: chatTaskIds,
        userText: content,
        baseLength,
      });
    },
    [draft, pending, messages, chatTaskIds, executeTurn],
  );

  const retry = useCallback(async () => {
    if (pending || !lastFailedTurn) return;
    const { turnMessages, taskIds, draftText } = lastFailedTurn;
    // Retry re-sends the identical turn; the transcript is already the
    // failed turn's messages (failures and cancels never append a reply),
    // except after an empty reply, which stays visible in history.
    const baseLength = turnMessages.length - 1;
    await executeTurn({ turnMessages, taskIds, userText: draftText, baseLength });
  }, [pending, lastFailedTurn, executeTurn]);

  return {
    messages,
    setMessages,
    draft,
    setDraft,
    chatTaskIds,
    setChatTaskIds,
    harnessId,
    setHarnessId,
    model,
    setModel,
    pending,
    turnId,
    turnStartedAt,
    progressTail,
    error,
    setError: setErrorAndClearOutput,
    errorKind,
    errorOutput,
    degraded,
    setDegraded,
    inlineNotice,
    setInlineNotice,
    modelNotice,
    announcement,
    setAnnouncement,
    send,
    cancel,
    retry,
    clearChat,
    canRetry: Boolean(lastFailedTurn && !pending),
  };
}

/***
 * MARK: useRetrospectiveChat
 * @description Chat state for the retrospective route: the app-level provider
 *   owns the turn when one is mounted (so navigation never drops a turn),
 *   otherwise a local controller instance owns it (route-level tests and
 *   embeds). The local instance stays dormant under a provider — same hook
 *   call shape either way, so the rules-of-hooks hold in both trees.
 ***/
export function useRetrospectiveChat({ activeProjectId, initialHarnessId, initialModel = '' }) {
  const fromProvider = useContext(ChatTurnContext);
  // Always instantiated (never conditional) so both trees keep a stable
  // hook order; dormant under a provider so it never persists or settles.
  const local = useChatTurnController({
    activeProjectId,
    initialHarnessId,
    initialModel,
    dormant: Boolean(fromProvider),
  });
  return fromProvider ? fromProvider.chat : local;
}
