import { useState, useEffect } from 'react';
import { api } from '../../services/api';

/***
 * MARK: SurveyBanner
 * @description Compact "survey needs you" banner for the task detail page.
 *   Renders only when the stage carries the `question-me` skill (see the
 *   `enabled` prop, resolved by the caller from the stage record) and the
 *   survey still needs a human (`pending`) or the agent wrote nothing yet
 *   (`none`). Otherwise it renders nothing — answered, explicitly empty, and
 *   skill-less tasks never see survey chrome. A failed status fetch still
 *   renders the entry link (fail-visible): the task is parked, so hiding
 *   would strand it with no way to answer.
 * @param {Object} [props]
 * @param {string} [props.taskId]
 * @param {string} [props.projectId]
 * @param {boolean} [props.enabled] - Whether the current stage attaches `question-me`.
 * @param {Object} [props.client] - API client override (tests).
 * @example <SurveyBanner taskId="t1" projectId="p1" enabled />
 ***/
export function SurveyBanner({ taskId, projectId, enabled, client }) {
  const http = client || api;
  // Fail-visible: a failed status fetch keeps the entry link (`failed: true`)
  // instead of hiding the banner — the task is parked, so hiding would strand
  // it with no way to answer. State only settles in async callbacks, never
  // synchronously in the effect.
  const [load, setLoad] = useState({ status: null, failed: false });
  const { status, failed: loadFailed } = load;

  useEffect(() => {
    if (!enabled || !taskId) return;
    let cancelled = false;
    http.getSurvey(projectId, taskId).then(
      (data) => {
        if (!cancelled) setLoad({ status: data?.status || 'none', failed: false });
      },
      () => {
        if (!cancelled) setLoad({ status: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [http, projectId, taskId, enabled]);

  if (!enabled) return null;
  if (!loadFailed && status !== 'pending' && status !== 'none') return null;

  const open = status === 'pending' ? 'answers' : 'review';
  return (
    <div
      role="region"
      aria-label="Survey awaiting answers"
      className="p-4 bg-human-fill/60 border border-secondary/50 rounded-sm space-y-2 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider text-secondary font-mono">
          Survey awaiting {open}
        </span>
      </div>
      <p className="text-xs text-on-surface leading-relaxed">
        This stage asked a set of questions before the work continues. Open the survey,
        answer what you can, and submit to move on.
      </p>
      <a
        href={`#/tasks/${encodeURIComponent(taskId)}/survey`}
        className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 transition-all cursor-pointer font-mono"
      >
        Open survey
      </a>
    </div>
  );
}

export default SurveyBanner;
