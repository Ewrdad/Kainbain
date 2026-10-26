import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { isQuestionVisible, combinedAnswers, selectedValues } from '../../../../shared/survey.js';
import { SurveyTaskPanel } from './SurveyTaskPanel';

/***
 * MARK: SurveyPage
 * @description Human survey page for the `question-me` skill: renders every
 *   round of `SURVEY.md` as multiple-choice questions (radio group for
 *   `single`, checkboxes for `multiple`), each with a free-form Notes field.
 *   Conditional questions (`showIf`) hide until their condition is met —
 *   hidden required questions never block. Answers save without advancing
 *   (`Save answers`); `Submit & continue` advances the task once everything
 *   visible and required is answered. An explicitly empty survey (the agent
 *   had nothing to ask) offers `Continue` instead. On phone-narrow widths
 *   the survey stays a single column with 44px touch targets; on desktop
 *   widths (`md:` and up) a read-only task-context panel (description,
 *   reports, timeline) renders to the right of the survey in a half-and-half
 *   split so screenshots and prior reports stay visible while answering.
 * @param {Object} [props]
 * @param {string} [props.taskId] - Task id override (tests); defaults to the `:id` route param.
 * @param {string} [props.projectId] - Project id override (tests); defaults to the active project.
 * @param {Object} [props.client] - API client override (tests); defaults to the app client.
 * @param {Function} [props.onDone] - Called with the submit result after the task advances.
 * @param {Function} [props.onBack] - Back callback (tests); defaults to history back.
 * @param {Object} [props.task] - Task override (tests); defaults to the context/fetched task.
 * @example <SurveyPage />
 ***/
export function SurveyPage({
  taskId: propTaskId,
  projectId: propProjectId,
  client,
  onDone,
  onBack,
  task: propTask,
  reports: propReports,
}) {
  const { id: paramId } = useParams();
  const {
    activeProjectId,
    selectedTask,
    stages: workflowStages,
    tasks: contextTasks,
  } = useKainBain();
  const http = client || api;

  const taskId = propTaskId || paramId || selectedTask?.id || null;
  const projectId = propProjectId || activeProjectId || selectedTask?.projectId || null;

  const [survey, setSurvey] = useState(null);
  const [loadedTaskId, setLoadedTaskId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [panelTask, setPanelTask] = useState(null);
  const [fetchedReports, setFetchedReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingTask, setLoadingTask] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    http.getSurvey(projectId, taskId).then(
      (data) => {
        if (cancelled) return;
        setSurvey(data);
        setLoadedTaskId(taskId);
        setLoadError(null);
        const initial = {};
        for (const round of data?.rounds || []) {
          for (const [qid, entry] of Object.entries(round?.answers || {})) {
            initial[qid] = {
              selected: Array.isArray(entry?.selected) ? entry.selected.map(String) : [],
              notes: typeof entry?.notes === 'string' ? entry.notes : '',
            };
          }
        }
        setAnswers(initial);
      },
      (err) => {
        if (cancelled) return;
        setSurvey(null);
        setLoadedTaskId(taskId);
        setLoadError(err?.message || 'Could not load the survey');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [http, projectId, taskId]);

  // Task context panel data: the full task hydrates the description and
  // timeline tabs, and the stage reports fill the reports tab. Both fetches
  // are guarded so lightweight mock clients (survey-only) keep working, and
  // either may fail without breaking the survey form itself. When the caller
  // injects data via props (tests / direct embedding) no fetch runs.
  const hasInjectedTask = !!propTask;
  const hasInjectedReports = Array.isArray(propReports);

  useEffect(() => {
    const shouldFetch =
      !!taskId && !!projectId && typeof http.getTask === 'function' && !hasInjectedTask;
    if (!shouldFetch) return;
    let cancelled = false;
    const loadTask = async () => {
      setLoadingTask(true);
      try {
        const data = await http.getTask(projectId, taskId);
        if (cancelled) return;
        setPanelTask(data || null);
      } catch {
        if (cancelled) return;
        setPanelTask((prev) => (prev && prev.id === taskId ? prev : null));
      } finally {
        if (!cancelled) setLoadingTask(false);
      }
    };
    loadTask();
    return () => {
      cancelled = true;
    };
  }, [http, projectId, taskId, hasInjectedTask]);

  useEffect(() => {
    const shouldFetch =
      !!taskId && !!projectId && typeof http.getTaskReports === 'function' && !hasInjectedReports;
    if (!shouldFetch) return;
    let cancelled = false;
    const loadReports = async () => {
      setLoadingReports(true);
      try {
        const data = await http.getTaskReports(projectId, taskId);
        if (cancelled) return;
        setFetchedReports(Array.isArray(data) ? data : data?.reports || []);
      } catch {
        if (cancelled) return;
        setFetchedReports([]);
      } finally {
        if (!cancelled) setLoadingReports(false);
      }
    };
    loadReports();
    return () => {
      cancelled = true;
    };
  }, [http, projectId, taskId, hasInjectedReports]);

  // Resolve the task for the read-only panel: an explicit prop wins, then
  // the cached task list from context, then the selected task when it matches.
  // Computes defensively so a fetch failure can still fall back to context.
  const contextTask = useMemo(() => {
    if (propTask) return propTask;
    if (Array.isArray(contextTasks)) {
      const found = contextTasks.find((t) => t && (!taskId || t.id === taskId));
      if (found) return found;
    }
    if (selectedTask && (!selectedTask.id || selectedTask.id === taskId)) {
      return selectedTask;
    }
    return null;
  }, [propTask, contextTasks, selectedTask, taskId]);

  const task = propTask || panelTask || contextTask;
  const reports = hasInjectedReports ? propReports : fetchedReports;
  const stages = Array.isArray(workflowStages) ? workflowStages : [];

  const loadingFresh = loadedTaskId !== taskId;
  const rounds = useMemo(() => (loadingFresh ? [] : survey?.rounds || []), [loadingFresh, survey]);
  const knownIds = useMemo(() => {
    const ids = new Set();
    for (const round of rounds) for (const q of round?.questions || []) if (q?.id) ids.add(q.id);
    return ids;
  }, [rounds]);
  const merged = useMemo(() => {
    const base = combinedAnswers(rounds);
    const next = { ...base };
    for (const [qid, entry] of Object.entries(answers)) {
      next[qid] = { selected: entry.selected || [], notes: entry.notes || '' };
    }
    return next;
  }, [rounds, answers]);
  const missingSet = useMemo(() => new Set((survey?.missing || []).map((m) => m.id)), [survey]);

  const setSelected = useCallback((qid, value, checked, multi) => {
    setAnswers((prev) => {
      const current = prev[qid] || { selected: [], notes: '' };
      let selected;
      if (multi) {
        selected = checked
          ? [...new Set([...current.selected, value])]
          : current.selected.filter((v) => v !== value);
      } else {
        selected = checked ? [value] : [];
      }
      return { ...prev, [qid]: { ...current, selected } };
    });
  }, []);

  const setNotes = useCallback((qid, notes) => {
    setAnswers((prev) => {
      const current = prev[qid] || { selected: [], notes: '' };
      return { ...prev, [qid]: { ...current, notes } };
    });
  }, []);

  const answerPayload = useMemo(() => {
    const payload = {};
    for (const [qid, entry] of Object.entries(answers)) {
      payload[qid] = { selected: entry.selected || [], notes: entry.notes || '' };
    }
    return payload;
  }, [answers]);

  const refreshFrom = useCallback(
    (data) => {
      setSurvey(data);
      setNotice(
        data?.advanced
          ? 'Survey complete — the task moved to its next stage.'
          : 'Answers saved. Required questions still open are listed below.',
      );
      if (data?.advanced) {
        setAdvanced(true);
        if (onDone) onDone(data);
      }
    },
    [onDone],
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const data = await http.submitSurvey(projectId, taskId, { answers: answerPayload });
      refreshFrom(data);
    } catch (err) {
      setSaveError(err?.message || 'Could not save answers');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSaveError(null);
    setNotice(null);
    try {
      const data = await http.submitSurvey(projectId, taskId, { answers: answerPayload });
      if (!data?.advanced) {
        const open = (data?.missing || []).map((m) => m.id).join(', ');
        setSaveError(
          open
            ? `Still waiting on required questions: ${open}`
            : 'Not complete yet — answer the required questions above.',
        );
        setSurvey((prev) =>
          prev
            ? {
                ...prev,
                missing: data?.missing || prev.missing,
                status: data?.status || prev.status,
              }
            : prev,
        );
      } else {
        refreshFrom(data);
      }
    } catch (err) {
      setSaveError(err?.message || 'Could not submit the survey');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    setSaveError(null);
    setNotice(null);
    try {
      const data = await http.submitSurvey(projectId, taskId, { action: 'skip' });
      refreshFrom(data);
    } catch (err) {
      setSaveError(err?.message || 'Could not skip the survey');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (onBack) onBack();
    else if (typeof window !== 'undefined' && window.history) window.history.back();
  };

  const status = loadingFresh ? 'loading' : survey?.status || 'loading';
  const skippable = status === 'none' || status === 'empty';
  const totalQuestions = rounds.reduce((n, r) => n + (r?.questions?.length || 0), 0);
  const { visibleRounds, hiddenCount } = useMemo(() => {
    const list = rounds.map((round) => ({
      round,
      visible: (round?.questions || []).filter((q) => isQuestionVisible(q, merged, knownIds)),
    }));
    const shown = list.reduce((n, item) => n + item.visible.length, 0);
    return { visibleRounds: list, hiddenCount: totalQuestions - shown };
  }, [rounds, merged, knownIds, totalQuestions]);

  const skipButtonLabel = submitting ? 'Continuing…' : 'Continue without questions';
  const saveButtonLabel = saving ? 'Saving…' : 'Save answers';
  const actionButtons = skippable ? (
    <button
      type="button"
      disabled={submitting || advanced}
      onClick={handleSkip}
      className="flex-1 py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 transition-all disabled:opacity-40 cursor-pointer font-mono"
    >
      {skipButtonLabel}
    </button>
  ) : (
    <>
      <button
        type="button"
        disabled={saving || submitting || advanced}
        onClick={handleSave}
        className="flex-1 py-2.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface cursor-pointer disabled:opacity-40 font-mono"
      >
        {saveButtonLabel}
      </button>
      <button
        type="button"
        disabled={saving || submitting || advanced}
        onClick={handleSubmit}
        className="flex-1 py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 transition-all disabled:opacity-40 cursor-pointer font-mono"
      >
        {submitButtonLabel(submitting, advanced)}
      </button>
    </>
  );

  if (!taskId) {
    return (
      <div
        role="region"
        aria-label="Survey"
        className="flex-1 flex flex-col items-center justify-center p-8 text-center"
      >
        <p className="text-sm text-text-muted">No task selected for this survey.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 overflow-hidden bg-surface-deep">
      <div
        role="region"
        aria-label="Task survey"
        className="w-full md:w-1/2 flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6"
      >
        <div className="w-full max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back to task"
              className="px-3 py-2 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface cursor-pointer font-mono"
            >
              ← Task
            </button>
            <div>
              <h1 className="text-base font-bold text-on-surface font-headline-md">Survey</h1>
              <p className="text-[11px] font-mono text-text-muted">
                {status === 'loading'
                  ? 'Loading questions…'
                  : surveyStatusLine(survey, totalQuestions)}
              </p>
            </div>
          </div>

          {loadError && (
            <div
              role="alert"
              className="p-3 bg-error-container text-on-error-container rounded-sm text-xs"
            >
              {loadError}
            </div>
          )}
          {saveError && (
            <div
              role="alert"
              className="p-3 bg-error-container text-on-error-container rounded-sm text-xs"
            >
              {saveError}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="p-3 bg-agent-fill text-on-surface rounded-sm text-xs border border-primary/40"
            >
              {notice}
            </div>
          )}

          {status === 'none' && !loadError && (
            <div className="p-4 bg-surface-container border border-border-standard rounded-sm space-y-2">
              <p className="text-xs text-on-surface leading-relaxed">
                The agent did not write any survey questions. If there is genuinely nothing to ask,
                continue — the next stage will proceed without survey input.
              </p>
            </div>
          )}

          {status === 'empty' && (
            <div className="p-4 bg-surface-container border border-border-standard rounded-sm space-y-2">
              <p className="text-xs text-on-surface leading-relaxed">
                The agent considered this task and decided there was nothing worth asking. Continue
                to move on with no answers recorded.
              </p>
            </div>
          )}

          {visibleRounds.map(({ round, visible }) => {
            if (visible.length === 0) return null;
            return (
              <section
                key={`round-${round.round}`}
                aria-label={`Survey round ${round.round}`}
                className="space-y-3"
              >
                {rounds.length > 1 && (
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted font-mono">
                    Round {round.round}
                  </h2>
                )}
                {visible.map((q) => (
                  <QuestionField
                    key={`${round.round}-${q.id}`}
                    question={q}
                    selected={selectedValues(merged, q.id)}
                    notes={merged[q.id]?.notes || ''}
                    missing={missingSet.has(q.id)}
                    onSelect={setSelected}
                    onNotes={setNotes}
                  />
                ))}
              </section>
            );
          })}

          {hiddenCount > 0 && (
            <p className="text-[11px] font-mono text-text-muted">
              {hiddenCount} follow-up {hiddenCount === 1 ? 'question' : 'questions'} hidden by
              earlier answers.
            </p>
          )}

          {!loadError && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pb-6">{actionButtons}</div>
          )}
        </div>
      </div>

      {/* Right column: read-only task context, desktop widths only. Phones
          keep the single-column survey: `hidden md:flex` never renders below
          the `md` (768px) breakpoint. Each column scrolls independently so
          answering never displaces the task description or reports. */}
      <div className="hidden md:flex md:w-1/2 border-l border-border-standard bg-surface overflow-hidden">
        <SurveyTaskPanel
          key={taskId || 'no-task'}
          task={task}
          reports={reports}
          loadingReports={loadingReports}
          loadingTask={loadingTask}
          projectId={projectId}
          taskId={taskId}
          stages={stages}
        />
      </div>
    </div>
  );
}

/***
 * MARK: surveyStatusLine
 * @description One-line survey progress summary for the page header.
 ***/
function surveyStatusLine(survey, totalQuestions) {
  if (!survey) return '';
  const open = (survey.missing || []).length;
  if (survey.status === 'answered')
    return `All required questions answered (${totalQuestions} total).`;
  if (survey.status === 'pending')
    return `${open} required ${open === 1 ? 'question' : 'questions'} still open.`;
  return `${totalQuestions} ${totalQuestions === 1 ? 'question' : 'questions'}.`;
}

/***
 * MARK: QuestionField
 * @description One multiple-choice question: native radio/checkbox options
 *   (full-width 44px touch targets) plus an always-present Notes textarea.
 ***/
function QuestionField({ question, selected, notes, missing, onSelect, onNotes }) {
  const multi = question.type === 'multiple';
  const inputType = multi ? 'checkbox' : 'radio';
  return (
    <fieldset className="p-4 bg-surface-container border border-border-standard rounded-sm space-y-2.5">
      <legend className="text-sm text-on-surface leading-snug px-1">
        {question.text}
        {question.required && (
          <span className="ml-1.5 text-[10px] font-mono uppercase text-secondary">required</span>
        )}
      </legend>
      <div className="flex flex-col gap-1.5">
        {(question.options || []).map((option) => {
          const checked = selected.includes(String(option));
          const inputId = `survey-${question.id}-${encodeURIComponent(String(option))}`;
          return (
            <label
              key={option}
              htmlFor={inputId}
              className={`flex items-center gap-3 w-full min-h-[44px] px-3 py-2 rounded-sm border cursor-pointer text-sm transition-colors ${
                checked
                  ? 'border-secondary bg-human-fill/50 text-on-surface'
                  : 'border-border-standard text-on-surface hover:border-secondary/60'
              }`}
            >
              <input
                id={inputId}
                type={inputType}
                name={`survey-${question.id}`}
                value={String(option)}
                checked={checked}
                aria-label={`${question.text}: ${option}`}
                onChange={(e) => onSelect(question.id, String(option), e.target.checked, multi)}
                className="w-4 h-4 shrink-0 accent-secondary"
              />
              <span className="leading-snug">{option}</span>
            </label>
          );
        })}
      </div>
      <div className="space-y-1">
        <label
          htmlFor={`survey-notes-${question.id}`}
          className="text-[11px] font-mono text-text-muted"
        >
          Notes (optional)
        </label>
        <textarea
          id={`survey-notes-${question.id}`}
          value={notes}
          aria-label={`Notes for: ${question.text}`}
          onChange={(e) => onNotes(question.id, e.target.value)}
          placeholder="Anything the options did not cover…"
          rows={2}
          className="w-full bg-surface-deep border border-border-standard rounded-sm p-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
        />
      </div>
      {missing && selected.length === 0 && (
        <p className="text-[11px] font-mono text-error">This question still needs an answer.</p>
      )}
    </fieldset>
  );
}

function submitButtonLabel(submitting, advanced) {
  if (submitting) return 'Submitting…';
  if (advanced) return 'Completed';
  return 'Submit & continue';
}

export default SurveyPage;
