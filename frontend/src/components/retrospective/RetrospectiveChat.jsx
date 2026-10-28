import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { Announcer } from '../../a11y/Announce';
import { ModelSelector } from '../common/ModelSelector';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { useHarnessPrefs } from '../../hooks/useHarnessPrefs';
import { formatTaskKey } from '../tasks/taskFormatters';
import { useRetrospective } from './useRetrospective';
import { useRetrospectiveChat, MAX_CHAT_MESSAGE_CHARS } from './useRetrospectiveChat';
import { formatChatElapsed, elapsedSecondsSince } from './chatProgress.js';

/***
 * MARK: RetrospectiveChat
 * @description Chat pane for the retrospective page: role-styled message
 *   list, task-context chips (synced from the shared selection on demand),
 *   harness/model picker (shared `ModelSelector`), pending/error/degraded
 *   states, cancel/retry/clear, interruption and truncation notices, and
 *   ticket-suggestion cards with Confirm/Edit into `POST /tasks`.
 *   The frontend holds the transcript; each send is one stateless backend
 *   turn. Tasks are never created without the user's Confirm click.
 * @param {Object} props
 * @param {Array<Object>} [props.tasks] - Summaries (for chip titles).
 * @example <RetrospectiveChat tasks={tasks} />
 ***/
export function RetrospectiveChat({ tasks = [] }) {
  const { activeProjectId, projects = [] } = useKainBain();
  const { selectedIds, chatSeed } = useRetrospective();
  const { models, harnesses, refreshing, refresh } = useModelCatalog([]);
  const { isHarnessDisabled } = useHarnessPrefs();

  const project = useMemo(
    () => projects.find((p) => String(p.id) === String(activeProjectId)) || null,
    [projects, activeProjectId],
  );
  const {
    messages,
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
    setError,
    errorKind,
    errorOutput,
    degraded,
    inlineNotice,
    announcement,
    setAnnouncement,
    send,
    cancel,
    retry,
    clearChat,
    canRetry,
    modelNotice,
  } = useRetrospectiveChat({
    activeProjectId,
    initialHarnessId: project?.harness || undefined,
    initialModel: '',
  });
  // The project loads after mount: adopt its harness once (during render,
  // never a sync effect) so the picker shows the harness turns actually use.
  // Once set — by this sync, by restore, or by the user — it is never
  // auto-touched again.
  if (harnessId === undefined && project?.harness) {
    setHarnessId(project.harness);
  }
  const [editing, setEditing] = useState(null);
  const [confirmed, setConfirmed] = useState({});
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [appliedSeedNonce, setAppliedSeedNonce] = useState(chatSeed.nonce);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef(null);
  const nearBottomRef = useRef(true);

  const tasksById = useMemo(() => new Map((tasks || []).map((t) => [t?.id, t])), [tasks]);
  const selection = useMemo(() => [...selectedIds], [selectedIds]);

  // Quick-action seeds land in the draft WITHOUT an effect
  // (react-hooks/set-state-in-effect): adjust state during render when the
  // seed nonce changes — the documented React alternative to sync-effects
  // (same pattern as ProjectSettings). The nonce re-applies identical seeds.
  if (chatSeed.nonce !== appliedSeedNonce) {
    setAppliedSeedNonce(chatSeed.nonce);
    if (chatSeed.text) {
      setDraft(chatSeed.text);
      setChatTaskIds((prev) => (prev.length > 0 ? prev : [...selectedIds]));
    }
  }

  // Auto-scroll only when already near the bottom (never yank a user who is
  // reading history). DOM mutation only — no setState in this effect
  // (react-hooks/set-state-in-effect); the jump button is driven by scroll
  // events, which programmatic scrolling also fires in real browsers.
  // Progress frames join the deps so the list follows the live stream.
  useEffect(() => {
    if (listRef.current && nearBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, pending, progressTail]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    nearBottomRef.current = near;
    setShowJump(!near);
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    nearBottomRef.current = true;
    setShowJump(false);
  };

  const syncSelection = () => {
    setChatTaskIds([...selectedIds]);
    setAnnouncement(
      selectedIds.size === 0
        ? 'Chat context cleared.'
        : `${selectedIds.size} selected task(s) added to the chat context.`,
    );
  };

  const removeContextTask = (taskId) => {
    setChatTaskIds((prev) => prev.filter((id) => id !== taskId));
  };

  const confirmSuggestion = async (messageIndex, suggestionIndex, draftTicket) => {
    const key = `${messageIndex}:${suggestionIndex}`;
    // eslint-disable-next-line security/detect-object-injection -- key is an internally computed "index:index" pair, never user input
    if (confirmingKey || confirmed[key]) return;
    setConfirmingKey(key);
    setError('');
    try {
      const created = await api.createTask(activeProjectId, {
        title: draftTicket.title,
        goal: draftTicket.goal,
      });
      setConfirmed((prev) => ({ ...prev, [key]: created }));
      setEditing(null);
      setAnnouncement(
        `Ticket created: ${created?.title || draftTicket.title}. It is now on the board.`,
      );
    } catch (err) {
      setError(err?.message || 'Ticket creation failed.');
      setAnnouncement('Ticket creation failed.');
    } finally {
      setConfirmingKey(null);
    }
  };

  return (
    <section
      aria-label="Retrospective chat"
      data-testid="retrospective-chat"
      className="flex flex-col gap-2 min-h-0"
    >
      <Announcer message={announcement} assertive={Boolean(error)} />
      <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Chat</h2>

      <div data-testid="retrospective-chat-picker">
        <ModelSelector
          models={models}
          harnesses={harnesses}
          value={model}
          onChange={setModel}
          size="sm"
          id="retrospective-chat-model"
          ariaLabel="Chat model"
          allowEmpty
          emptyLabel="Session default"
          reasoningLabelNode={
            <label
              htmlFor="retrospective-chat-model-reasoning"
              className="text-xs font-bold uppercase tracking-wider text-text-muted"
            >
              Reasoning
            </label>
          }
          harnessSelectId="retrospective-chat-harness"
          harnessAriaLabel="Chat harness"
          harnessId={harnessId}
          onHarnessChange={setHarnessId}
          onRefresh={refresh}
          refreshing={refreshing}
          isHarnessDisabled={isHarnessDisabled}
        />
        {modelNotice && (
          <p
            role="status"
            data-testid="retrospective-chat-model-notice"
            className="text-[0.6875rem] text-warning mt-1"
          >
            {modelNotice}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="retrospective-chat-context">
        <button
          type="button"
          onClick={syncSelection}
          title="Replace the chat context with the current task selection"
          className="px-3 py-2 lg:px-2 lg:py-1 min-h-[44px] lg:min-h-0 text-[0.6875rem] font-bold uppercase tracking-wider rounded-sm border border-border-standard bg-surface-deep text-on-surface hover:bg-surface-container-high cursor-pointer"
        >
          Use selection ({selection.length})
        </button>
        {chatTaskIds.map((id) => (
          <span
            key={id}
            data-testid={`retrospective-chat-chip-${id}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] font-mono rounded-sm bg-surface-deep border border-border-standard text-on-surface"
          >
            {tasksById.get(id)?.title || formatTaskKey(id)}
            <button
              type="button"
              onClick={() => removeContextTask(id)}
              aria-label={`Remove ${tasksById.get(id)?.title || id} from chat context`}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-text-muted hover:text-error cursor-pointer"
            >
              ×
            </button>
          </span>
        ))}
        {chatTaskIds.length === 0 && (
          <>
            <span className="text-[0.6875rem] text-text-muted">
              No task context — general chat.
            </span>
            <span className="text-[0.6875rem] text-text-muted">
              The agent may search recent tasks.
            </span>
          </>
        )}
      </div>

      <div
        ref={listRef}
        role="log"
        aria-label="Chat messages"
        data-testid="retrospective-chat-messages"
        onScroll={handleListScroll}
        className="flex flex-col gap-2 overflow-y-auto min-h-[8rem] max-h-96 p-2 bg-surface-deep border border-border-standard rounded-sm"
      >
        {messages.length === 0 && !pending && (
          <p className="text-xs text-text-muted">
            Ask about trends across the selected tasks — or pick tasks and use “Find trends in
            selection”. With no task context, the agent can still review recent jobs using its task
            tools.
          </p>
        )}
        {messages.map((message, index) => (
          <ChatMessage
            key={index}
            message={message}
            messageIndex={index}
            editing={editing}
            setEditing={setEditing}
            confirmed={confirmed}
            confirmingKey={confirmingKey}
            onConfirm={confirmSuggestion}
            onRetry={retry}
            canRetry={canRetry}
          />
        ))}
        {pending && (
          <WorkingCard
            key={turnId || 'turn'}
            harnessLabel={harnessId}
            modelLabel={model}
            progressTail={progressTail}
            startedAt={turnStartedAt}
            onAnnounce={setAnnouncement}
          />
        )}
      </div>
      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          data-testid="retrospective-chat-jump"
          aria-label="Jump to latest reply"
          className="self-center px-3 py-2 min-h-[44px] text-[0.6875rem] font-bold rounded-sm border border-border-standard bg-surface text-on-surface cursor-pointer"
        >
          ↓ New reply
        </button>
      )}

      {degraded && (
        <div
          role="status"
          data-testid="retrospective-chat-degraded"
          className="p-3 bg-surface-container border border-warning/40 rounded-sm text-xs"
        >
          <p className="font-bold text-warning">
            This harness can’t chat yet{degraded.harness ? ` (${degraded.harness})` : ''}.
          </p>
          <p className="text-text-muted mt-1">
            Retrospective chat needs conversational prompt support. Switch to a chat-capable harness
            above — your histories and quick actions keep working.
          </p>
        </div>
      )}
      {inlineNotice && (
        <div className="flex items-center gap-2">
          <p
            role="status"
            data-testid="retrospective-chat-notice"
            className="text-xs text-text-muted"
          >
            {inlineNotice}
          </p>
          {canRetry && !pending && !error && (
            <button
              type="button"
              onClick={retry}
              data-testid="retrospective-chat-retry"
              className="px-3 py-2 lg:px-2 lg:py-1 min-h-[44px] lg:min-h-0 text-[0.6875rem] font-bold uppercase tracking-wider rounded-sm border border-primary text-primary cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <p role="alert" data-testid="retrospective-chat-error" className="text-xs text-error">
              {error}
            </p>
            {canRetry && (
              <button
                type="button"
                onClick={retry}
                data-testid="retrospective-chat-retry"
                className="px-3 py-2 lg:px-2 lg:py-1 min-h-[44px] lg:min-h-0 text-[0.6875rem] font-bold uppercase tracking-wider rounded-sm border border-primary text-primary cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
          {errorOutput && (
            <div
              data-testid="retrospective-chat-partial"
              className="p-2 bg-surface-deep border border-border-standard rounded-sm"
            >
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-text-muted">
                {errorKind === 'timeout'
                  ? 'Partial output before it stopped:'
                  : 'Partial output before the failure:'}
              </p>
              <pre
                data-testid="retrospective-chat-partial-output"
                className="mt-1 text-xs text-on-surface whitespace-pre-wrap break-words max-h-40 overflow-y-auto"
              >
                {errorOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="retrospective-chat-input" className="sr-only">
          Chat message
        </label>
        <textarea
          id="retrospective-chat-input"
          data-testid="retrospective-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          placeholder="Ask about trends, failures, efficiency…"
          disabled={pending}
          maxLength={MAX_CHAT_MESSAGE_CHARS}
          className="w-full px-2 py-1.5 text-sm bg-surface-deep border border-border-standard rounded-sm text-on-surface placeholder:text-text-muted disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <span
            data-testid="retrospective-chat-counter"
            className="text-[0.6875rem] font-mono text-text-muted"
            aria-label={`${draft.length} of ${MAX_CHAT_MESSAGE_CHARS} characters used`}
          >
            {draft.length} / {MAX_CHAT_MESSAGE_CHARS}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={clearChat}
              data-testid="retrospective-chat-clear"
              className="px-3 py-1.5 min-h-[44px] text-xs font-bold uppercase tracking-wider rounded-sm border border-border-standard text-on-surface cursor-pointer"
            >
              Clear chat
            </button>
            {pending ? (
              <button
                type="button"
                onClick={cancel}
                data-testid="retrospective-chat-cancel"
                className="px-3 py-1.5 min-h-[44px] text-xs font-bold uppercase tracking-wider rounded-sm border border-error text-error cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => send()}
                disabled={!draft.trim()}
                data-testid="retrospective-chat-send"
                className="px-3 py-1.5 min-h-[44px] text-xs font-bold uppercase tracking-wider rounded-sm bg-primary text-on-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/***
 * MARK: WorkingCard
 * @description The in-flight turn, rendered in the message space: an "Agent
 *   working" card with an elapsed ticker plus the harness's scrolling live
 *   output when the turn streams any (harnesses that stay silent until
 *   settle show honest idle copy instead — never a fake stream). Restarts
 *   per turn (the parent keys this card by turnId, and each turn mints a
 *   fresh turnStartedAt), but survives route remounts of the same turn
 *   because elapsed time is derived from the wall clock
 *   (`elapsedSecondsSince(startedAt)`), not from a tick counter.
 *   Screen-reader announcements stay sparse (every 30s) so the 1s visual
 *   tick and the streaming text never spam the live region — neither is a
 *   live region itself.
 * Failure modes: missing/invalid `startedAt` renders `0s elapsed` and
 *   still ticks safely (the helper clamps to 0); a missing `onAnnounce`
 *   only skips the spoken updates. The interval is always cleared on
 *   unmount or `startedAt` change.
 ***/
function WorkingCard({ harnessLabel, modelLabel, progressTail, startedAt, onAnnounce }) {
  const [elapsed, setElapsed] = useState(() => elapsedSecondsSince(startedAt));
  // A new `startedAt` on a reused instance (new turns normally remount via
  // the turnId key; this is the defensive path) resyncs during render —
  // never a sync effect (react-hooks/set-state-in-effect).
  const [prevStartedAt, setPrevStartedAt] = useState(startedAt);
  if (prevStartedAt !== startedAt) {
    setPrevStartedAt(startedAt);
    setElapsed(elapsedSecondsSince(startedAt));
  }
  const lastBucketRef = useRef(Math.floor(elapsedSecondsSince(startedAt) / 30));
  // The announce callback is call-through only: parent re-renders must not
  // restart the 1s interval (which would stall the visible tick and reset
  // the 30s-bucket guard), so it lives in a ref, never in the effect deps.
  const onAnnounceRef = useRef(onAnnounce);
  useEffect(() => {
    onAnnounceRef.current = onAnnounce;
  }, [onAnnounce]);
  const outputRef = useRef(null);
  useEffect(() => {
    lastBucketRef.current = Math.floor(elapsedSecondsSince(startedAt) / 30);
    const timer = setInterval(() => {
      const currentElapsed = elapsedSecondsSince(startedAt);
      setElapsed(currentElapsed);
      const bucket = Math.floor(currentElapsed / 30);
      if (bucket > 0 && bucket > lastBucketRef.current) {
        lastBucketRef.current = bucket;
        onAnnounceRef.current?.(`Still working… ${bucket * 30}s elapsed.`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  // The stream pins to its newest line (DOM mutation only). Instant
  // scrollTop assignment — no animation, nothing to reduce-motion-gate.
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [progressTail]);
  const hasOutput = typeof progressTail === 'string' && progressTail.length > 0;
  return (
    <div
      data-testid="retrospective-chat-pending"
      className="p-2 rounded-sm border text-sm bg-[#7bdb85]/10 border-[#7bdb85]/40 text-on-surface self-start max-w-[95%]"
    >
      <p className="text-[0.625rem] font-mono uppercase tracking-wider text-text-muted mb-1">
        Agent
      </p>
      <p className="flex items-center gap-2 text-xs font-bold text-on-surface">
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full bg-primary motion-safe:animate-pulse"
        />
        Agent working…{' '}
        <span
          data-testid="retrospective-chat-elapsed"
          className="font-mono font-normal text-text-muted"
        >
          {formatChatElapsed(elapsed)}
        </span>
      </p>
      {harnessLabel && (
        <p className="mt-0.5 text-[0.6875rem] text-text-muted">
          {harnessLabel}
          {modelLabel ? ` · ${modelLabel}` : ' · session default'}
        </p>
      )}
      {hasOutput ? (
        <pre
          ref={outputRef}
          data-testid="retrospective-chat-working-output"
          aria-label="Live model output"
          className="mt-1.5 text-xs text-on-surface whitespace-pre-wrap break-words max-h-40 overflow-y-auto"
        >
          {progressTail}
        </pre>
      ) : (
        <p
          data-testid="retrospective-chat-working-idle"
          className="mt-1 text-xs text-text-muted italic"
        >
          No live output from this harness yet — still working.
        </p>
      )}
    </div>
  );
}

/***
 * MARK: ChatMessage
 * @description One transcript message with role chromatics (Agent Green for
 *   the assistant, Human Blue for the user) plus suggestion cards. An empty
 *   model reply renders a designed "no content" state with Retry — never a
 *   blank bubble.
 ***/
function ChatMessage({
  message,
  messageIndex,
  editing,
  setEditing,
  confirmed,
  confirmingKey,
  onConfirm,
  onRetry,
  canRetry,
}) {
  const isUser = message?.role === 'user';
  const suggestions = Array.isArray(message?.suggestions) ? message.suggestions : [];
  const isEmpty = !isUser && (message?.empty || !String(message?.content || '').trim());
  const output =
    !isUser && typeof message?.output === 'string' && message.output ? message.output : '';
  return (
    <div
      data-testid={`retrospective-chat-message-${messageIndex}`}
      className={`p-2 rounded-sm border text-sm whitespace-pre-wrap ${
        isUser
          ? 'bg-[#9acbff]/10 border-[#9acbff]/40 text-on-surface self-end max-w-[95%]'
          : 'bg-[#7bdb85]/10 border-[#7bdb85]/40 text-on-surface self-start max-w-[95%]'
      }`}
    >
      <p className="text-[0.625rem] font-mono uppercase tracking-wider text-text-muted mb-1">
        {isUser ? 'You' : 'Agent'}
      </p>
      {isEmpty ? (
        <>
          <p
            data-testid={`retrospective-chat-empty-${messageIndex}`}
            className="text-text-muted italic"
          >
            The model returned no content.{' '}
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                aria-label="Retry the unanswered turn"
                className="not-italic px-3 py-2 lg:px-2 lg:py-0.5 ml-1 min-h-[44px] lg:min-h-0 text-[0.6875rem] font-bold uppercase tracking-wider rounded-sm border border-primary text-primary cursor-pointer"
              >
                Retry
              </button>
            )}
          </p>
          {output && (
            <div
              data-testid={`retrospective-chat-message-output-${messageIndex}`}
              className="mt-1.5"
            >
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-text-muted not-italic">
                Partial output before the empty reply:
              </p>
              <pre className="mt-0.5 text-xs text-on-surface whitespace-pre-wrap break-words max-h-40 overflow-y-auto not-italic">
                {output}
              </pre>
            </div>
          )}
        </>
      ) : (
        <>
          <p>{message?.content}</p>
          {output && (
            <details
              data-testid={`retrospective-chat-message-output-${messageIndex}`}
              className="mt-1.5"
            >
              <summary className="text-[0.6875rem] font-bold uppercase tracking-wider text-text-muted cursor-pointer">
                Model output trace
              </summary>
              <pre className="mt-0.5 text-xs text-on-surface whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {output}
              </pre>
            </details>
          )}
        </>
      )}
      {suggestions.length > 0 && (
        <ul aria-label="Ticket suggestions" className="flex flex-col gap-1.5 mt-2">
          {suggestions.map((suggestion, suggestionIndex) => (
            <SuggestionCard
              key={suggestionIndex}
              messageIndex={messageIndex}
              suggestionIndex={suggestionIndex}
              suggestion={suggestion}
              editing={editing}
              setEditing={setEditing}
              confirmed={confirmed}
              confirmingKey={confirmingKey}
              onConfirm={onConfirm}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/***
 * MARK: SuggestionCard
 * @description One ticket draft with Confirm/Edit into `POST /tasks`. Edit
 *   opens inline title/goal fields; Confirm posts exactly what is shown.
 ***/
function SuggestionCard({
  messageIndex,
  suggestionIndex,
  suggestion,
  editing,
  setEditing,
  confirmed,
  confirmingKey,
  onConfirm,
}) {
  const key = `${messageIndex}:${suggestionIndex}`;
  const isEditing = editing?.key === key;
  // eslint-disable-next-line security/detect-object-injection -- key is an internally computed "index:index" pair, never user input
  const created = confirmed[key];
  const confirming = confirmingKey === key;
  const [title, setTitle] = useState(suggestion?.title || '');
  const [goal, setGoal] = useState(suggestion?.goal || '');

  const startEditing = () => {
    // Seed the edit fields from the click handler (never a sync effect).
    setTitle(suggestion?.title || '');
    setGoal(suggestion?.goal || '');
    setEditing({ key, title: suggestion?.title || '', goal: suggestion?.goal || '' });
  };

  if (created) {
    return (
      <li
        data-testid={`retrospective-suggestion-${key}`}
        className="p-2 rounded-sm border border-primary/50 bg-surface text-xs"
      >
        <p className="font-bold text-primary">✓ Ticket created: {created.title || title}</p>
      </li>
    );
  }

  return (
    <li
      data-testid={`retrospective-suggestion-${key}`}
      className="p-2 rounded-sm border border-border-standard bg-surface text-xs flex flex-col gap-1.5"
    >
      {isEditing ? (
        <>
          <label className="flex flex-col gap-0.5">
            <span className="text-[0.625rem] uppercase font-mono text-text-muted">Title</span>
            <input
              aria-label="Suggested ticket title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="px-2 py-1 text-xs bg-surface-deep border border-border-standard rounded-sm text-on-surface"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[0.625rem] uppercase font-mono text-text-muted">Goal</span>
            <textarea
              aria-label="Suggested ticket goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              className="px-2 py-1 text-xs bg-surface-deep border border-border-standard rounded-sm text-on-surface"
            />
          </label>
        </>
      ) : (
        <>
          <p className="font-bold text-on-surface">{suggestion?.title}</p>
          <p className="text-text-muted">{suggestion?.goal}</p>
        </>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={confirming || !title.trim() || !goal.trim()}
          onClick={() => onConfirm(messageIndex, suggestionIndex, { title, goal })}
          className="px-3 py-2 lg:px-2 lg:py-1 min-h-[44px] lg:min-h-0 text-[0.6875rem] font-bold uppercase tracking-wider rounded-sm bg-primary text-on-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {confirming ? 'Creating…' : 'Confirm ticket'}
        </button>
        <button
          type="button"
          onClick={() => (isEditing ? setEditing(null) : startEditing())}
          className="px-3 py-2 lg:px-2 lg:py-1 min-h-[44px] lg:min-h-0 text-[0.6875rem] font-bold uppercase tracking-wider rounded-sm border border-border-standard text-on-surface cursor-pointer"
        >
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>
    </li>
  );
}
