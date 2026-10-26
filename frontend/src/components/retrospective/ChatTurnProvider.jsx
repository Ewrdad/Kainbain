import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useKainBain } from '../../context/KainBainContext';
import { useScreenWakeLock } from '../../hooks/useScreenWakeLock';
import { useChatTurnController } from './useRetrospectiveChat';
import { ChatTurnContext } from './ChatTurnContext.js';

/***
 * MARK: CHAT_ROUTE_PATH
 * @description The route that renders the chat: settling anywhere else (or
 *   in a hidden tab) fires the completion toast instead.
 ***/
export const CHAT_ROUTE_PATH = '/retrospective';

/***
 * MARK: CHAT_TOAST_SUCCESS_DURATION_MS
 * @description How long the "reply ready" toast stays up (failures persist
 *   until dismissed — they need a decision, not a glance).
 ***/
export const CHAT_TOAST_SUCCESS_DURATION_MS = 8000;

/***
 * MARK: chatReplyExcerpt
 * @description First ~80 chars of a reply for the completion toast (one line,
 *   ellipsized when cut).
 * @example chatReplyExcerpt('hello world') => 'hello world'
 * @param {string} reply - The assistant reply text.
 * @returns {string} The toast-safe excerpt ('' for blank input).
 ***/
export function chatReplyExcerpt(reply) {
  if (typeof reply !== 'string') return '';
  const oneLine = reply.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  if (oneLine.length <= 80) return oneLine;
  return `${oneLine.slice(0, 80)}…`;
}

/***
 * MARK: ChatTurnProvider
 * @description App-level owner of the retrospective chat turn: mounted above
 *   the route table so an in-flight turn survives navigation (the request,
 *   progress matching, and Cancel all live here, not in the unmounted
 *   route). Settles into the transcript wherever the user is, fires a
 *   completion toast when the chat itself isn't visible, and holds a screen
 *   wake lock while a turn runs so the device doesn't sleep mid-turn.
 * @example <ChatTurnProvider><App /></ChatTurnProvider>
 ***/
export function ChatTurnProvider({ children }) {
  const {
    activeProjectId,
    projects = [],
    lastChatProgress,
    addNotification,
    notifySuccess,
    notifyError,
  } = useKainBain();
  const location = useLocation();
  const navigate = useNavigate();

  const project = useMemo(
    () => projects.find((p) => String(p.id) === String(activeProjectId)) || null,
    [projects, activeProjectId],
  );

  const pathnameRef = useRef(location.pathname);
  const notifyRef = useRef({ addNotification, notifySuccess, notifyError });
  const navigateRef = useRef(navigate);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    notifyRef.current = { addNotification, notifySuccess, notifyError };
  }, [addNotification, notifySuccess, notifyError]);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const handleTurnSettled = useCallback((outcome) => {
    const { addNotification, notifySuccess, notifyError } = notifyRef.current;
    const chatVisible =
      pathnameRef.current === CHAT_ROUTE_PATH &&
      (typeof document === 'undefined' || document.visibilityState === 'visible');
    // On the visible chat the reply itself is the signal — no toast.
    if (chatVisible) return;
    const goToChat = () => navigateRef.current(CHAT_ROUTE_PATH);
    if (outcome?.ok) {
      const excerpt = chatReplyExcerpt(outcome.replyText);
      const message = excerpt ? `Chat reply ready — ${excerpt}` : 'Chat turn finished with no content.';
      if (typeof addNotification === 'function') {
        addNotification({
          type: 'success',
          title: 'Retrospective chat',
          message,
          duration: CHAT_TOAST_SUCCESS_DURATION_MS,
          action: { label: 'View chat', onClick: goToChat },
        });
      } else {
        notifySuccess?.(message, 'Retrospective chat', CHAT_TOAST_SUCCESS_DURATION_MS);
      }
    } else {
      const detail =
        typeof outcome?.errorMessage === 'string' && outcome.errorMessage
          ? ` ${outcome.errorMessage}`
          : '';
      const message = `Chat turn failed.${detail} View the chat to retry.`;
      if (typeof addNotification === 'function') {
        addNotification({
          type: 'error',
          title: 'Retrospective chat',
          message,
          duration: 0,
          action: { label: 'View chat', onClick: goToChat },
        });
      } else {
        notifyError?.(message, 'Retrospective chat');
      }
    }
  }, []);

  const chat = useChatTurnController({
    activeProjectId,
    initialHarnessId: project?.harness || undefined,
    initialModel: '',
    progressEvent: lastChatProgress,
    onTurnSettled: handleTurnSettled,
  });

  // Long turns must not let the device sleep (desktop or mobile); the hook
  // is a silent no-op where the Wake Lock API is missing.
  useScreenWakeLock({ wanted: chat.pending });

  const value = useMemo(() => ({ chat }), [chat]);
  return <ChatTurnContext.Provider value={value}>{children}</ChatTurnContext.Provider>;
}
