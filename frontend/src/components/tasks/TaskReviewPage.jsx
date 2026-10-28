import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { useReview } from '../../context/useReview';
import { usePendingAction } from '../../hooks/usePendingAction';
import { usePersistentState } from '../../hooks/usePersistentState';
import { scrollIntoViewRespectingMotion } from '../../a11y/reducedMotion';
import { copyToClipboard } from '../../services/clipboard';
import { approvalCopy, isTerminalHumanApproval } from '../stageTypes';
import { resolveCheckpointState } from './checkpointState';
import { formatTaskKey } from './taskFormatters';
import { buildCheckoutCommand } from './taskBranch';
import { MarkdownViewer } from '../common/MarkdownViewer';
import { DiffView } from '../review/DiffView';
import { FileDiffList } from '../review/FileDiffList';
import { ReportReviewView } from '../review/ReportReviewView';
import { ReportNavigator } from '../review/ReportNavigator';
import { normalizeReportPath } from '../review/reportPaths';
import { ReviewCommentThread } from '../review/ReviewCommentThread';
import { TaskImageAttach } from './TaskImageAttach';
import { appendImagesMarkdown, removeImageMarkdown } from '../../services/taskImages';

/***
 * MARK: TaskReviewPage
 * @description MR/PR-style human review page for a task's branch: shows every
 *   change between the task branch and main, with per-line and per-file
 *   commenting. Instead of merge/reject the terminal actions are **Pass Stage**
 *   (advance, optional guidance) and **Fail Stage** (reject with feedback
 *   pre-filled from unresolved comments). When the checkpoint is the last
 *   pipeline stage the pass action reads **Pass Stage & Complete**, because
 *   approving there finishes the task.
 *
 * Pass → `advanceTask(projectId, taskId, { guidance })` — the context's
 *   advanceTask already auto-executes the next stage when the task leaves the
 *   checkpoint. Fail → `rejectTaskWithFeedback(projectId, taskId, feedback)`.
 * @param {Object} [props]
 * @param {Object} [props.task] - Optional task override (tests).
 * @param {Function} [props.onBack] - Optional back callback (tests).
 * @example <TaskReviewPage />
 ***/
export function TaskReviewPage({ task: propTask, onBack }) {
  const {
    selectedTask: ctxSelectedTask,
    setView,
    activeProjectId,
    projects = [],
    lastReviewEvent,
    advanceTask,
    rejectTaskWithFeedback,
  } = useKainBain();

  // Resolve the task like TaskDetailPage does.
  const resolvedTask = useMemo(() => {
    if (propTask) return propTask;
    if (ctxSelectedTask) return ctxSelectedTask;
    return null;
  }, [propTask, ctxSelectedTask]);
  const task = resolvedTask;
  const taskId = task?.id;
  // Back to the detail page IS a navigation: the facade routes to the
  // canonical `/tasks/:id` path (falling back to the snapshot id, so the
  // detail location can never strand a review URL behind).
  const backToTaskDetail = () => {
    if (taskId) setView('task-detail', { taskId });
    else setView('task-detail');
  };
  const project = useMemo(
    () => projects.find((p) => String(p.id) === String(activeProjectId)) || projects[0] || null,
    [projects, activeProjectId],
  );

  const review = useReview({ projectId: activeProjectId, taskId });
  const { pendingKey, run: runAction } = usePendingAction();

  const [activeTab, setActiveTab] = usePersistentState('kainbain:review:activeTab', 'files', {
    validate: (v) => ['files', 'reports', 'conversation'].includes(v),
  }); // 'files' | 'reports' | 'conversation'
  const [selectedReportPath, setSelectedReportPath] = useState(null);
  const [showFailModal, setShowFailModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [copiedCheckout, setCopiedCheckout] = useState(false);
  const [passGuidance, setPassGuidance] = useState('');
  const [failFeedback, setFailFeedback] = useState('');
  // Screenshot uploads in the fail modal reuse the task's assets/ folder;
  // submit stays disabled mid-upload so the fail cannot beat its images.
  const [failImagesUploading, setFailImagesUploading] = useState(false);
  const failTextareaRef = useRef(null);
  // Guards double-merging of the same REVIEW_UPDATED payload.
  const handledReviewEventSeqRef = useRef(0);

  const data = review.review;

  // Preserved-diff split: the frozen merged change is the primary payload and
  // post-merge fix-ups render as a separate "New since merge" section (never
  // a silently merged union). Memoized so the sidebar memo below sees stable
  // inputs (react-hooks/exhaustive-deps).
  const newSinceFiles = useMemo(
    () => (Array.isArray(data?.newSinceMerge?.files) ? data.newSinceMerge.files : []),
    [data],
  );
  const newSinceCommits = useMemo(
    () => (Array.isArray(data?.newSinceMerge?.commits) ? data.newSinceMerge.commits : []),
    [data],
  );
  const showPreservedSplit = Boolean(data?.preserved && newSinceFiles.length > 0);
  const hasReviewFiles = (data?.files?.length || 0) > 0 || newSinceFiles.length > 0;
  // Stage reports (centralised docs) sit outside the git diff, so they are
  // browsed and line-commented in their own tab instead of the Files tab.
  const reports = useMemo(() => (Array.isArray(data?.reports) ? data.reports : []), [data]);
  const hasReports = reports.length > 0;
  const selectedReport = useMemo(() => {
    if (reports.length === 0) return null;
    // Match across `./` spellings: a previously selected path stored in either
    // form resolves to the same report instead of falling back to the first one.
    const target = normalizeReportPath(selectedReportPath || '');
    const match = target
      ? reports.find((r) => normalizeReportPath(r?.path || r?.filename || '') === target)
      : null;
    return match || reports[0];
  }, [reports, selectedReportPath]);
  const activeReportPath = selectedReport?.path || selectedReport?.filename || null;
  // Unresolved comment count per report (path canonicalised across `./` forms).
  const reportCommentCounts = useMemo(() => {
    const counts = new Map();
    for (const c of data?.comments || []) {
      if (c.resolved) continue;
      const key = normalizeReportPath(c.filePath);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [data]);
  // Sidebar lists every rendered file once (merged first, then new-only paths).
  const sidebarFiles = useMemo(() => {
    if (!data) return [];
    if (!showPreservedSplit) return data.files || [];
    const seen = new Set((data.files || []).map((f) => f.path));
    return (data.files || []).concat(newSinceFiles.filter((f) => !seen.has(f.path)));
  }, [data, showPreservedSplit, newSinceFiles]);

  const stage = useMemo(() => {
    const stages = project?.stages || [];
    return stages.find((s) => String(s.id) === String(task?.currentStageId)) || null;
  }, [project, task?.currentStageId]);

  // Same source of truth as the board card (task 8a056fc4): the resolved
  // stage record decides, never a stale `waiting_human` payload alone.
  const isWaitingHuman = resolveCheckpointState(task, stage).showCheckpoint;
  // A terminal-failed task has no stage to advance from (passing is a
  // backend 409): Pass/Fail hides and the note points at Retry Stage on the
  // task instead.
  const isTerminallyFailed = task?.status === 'failed';
  // Pass wording: a last-stage checkpoint completes the task, so the action
  // promises completion instead of a next stage that does not exist.
  const reviewCopy = approvalCopy(isTerminalHumanApproval(project?.stages || [], task));

  const unresolvedComments = useMemo(
    () => (data?.comments || []).filter((c) => !c.resolved),
    [data],
  );
  const unresolvedCount = unresolvedComments.length;

  // Compose the fail feedback from unresolved comments, grouped by file (D5).
  // Grouping is by canonical path so `./`-prefixed and bare anchors to the
  // same report share one section instead of splitting into two.
  const buildFailDraft = useCallback(() => {
    if (unresolvedComments.length === 0) return '';
    const lines = ['## Review comments'];
    let currentKey = null;
    for (const c of unresolvedComments) {
      const key = normalizeReportPath(c.filePath || '');
      if (key !== currentKey) {
        currentKey = key;
        lines.push('', `### \`${c.filePath}\``);
      }
      const anchor = c.scope === 'line' && c.line ? `:L${c.line}` : '';
      lines.push(`- \`${c.filePath}\`${anchor} — ${c.body}`);
    }
    lines.push('');
    lines.push('Please address these review comments, then the stage will be re-reviewed.');
    return lines.join('\n');
  }, [unresolvedComments]);

  // Live-merge REVIEW_UPDATED events for the loaded task (comments edited in
  // another tab land here without a manual refresh).
  useEffect(() => {
    if (!lastReviewEvent || !data) return undefined;
    if (String(lastReviewEvent.taskId) !== String(data.task?.id)) return undefined;
    const seq = Number(lastReviewEvent._seq) || 0;
    if (seq && seq <= handledReviewEventSeqRef.current) return undefined;
    handledReviewEventSeqRef.current = seq || handledReviewEventSeqRef.current;
    review.applyReviewEvent(lastReviewEvent);
    return undefined;
  }, [lastReviewEvent, data, review]);

  const scrollToFile = useCallback(
    (path) => {
      setActiveTab('files');
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-file-path="${CSS.escape(path)}"]`);
        scrollIntoViewRespectingMotion(el, { behavior: 'smooth', block: 'start' });
      });
    },
    [setActiveTab],
  );

  /***
   * MARK: handlePass
   * @description Pass Stage: POST /tasks/:id/advance with optional guidance
   *   (guidance becomes `## Human Guidance` on the task goal, plan D5).
   *   `guidanceOverride` avoids a stale-state race when the composer submits
   *   the guidance it just captured (setState would not be visible yet).
   ***/
  const handlePass = async (guidanceOverride) => {
    if (!activeProjectId || !taskId) return;
    const guidance = (guidanceOverride !== undefined ? guidanceOverride : passGuidance).trim();
    await runAction('pass', async () => {
      await advanceTask(activeProjectId, taskId, {
        guidance: guidance || undefined,
      });
      setPassGuidance('');
      setShowPassModal(false);
      onBack?.();
      backToTaskDetail();
    });
  };

  // Fail-modal image handlers: uploaded screenshots join the feedback draft
  // (the existing reject path carries them to the retry prompt verbatim).
  const handleFailImagesUploadedBatch = (images) => {
    if (!Array.isArray(images) || images.length === 0) return;
    setFailFeedback((draft) => appendImagesMarkdown(draft, images));
  };

  const handleFailImageRemoved = (name) => {
    setFailFeedback((draft) => removeImageMarkdown(draft, name));
  };

  /***
   * MARK: handleFail
   * @description Fail Stage: POST /tasks/:id/reject with the composed feedback.
   ***/
  const handleFail = async () => {
    if (!activeProjectId || !taskId) return;
    const feedback = failFeedback.trim();
    if (!feedback || failImagesUploading) return;
    try {
      await runAction('fail', async () => {
        await rejectTaskWithFeedback(activeProjectId, taskId, feedback);
        setShowFailModal(false);
        onBack?.();
        backToTaskDetail();
      });
    } catch {
      // The mutation layer already notified the failure; the modal stays
      // open with the draft intact so the reviewer can retry.
    }
  };

  /***
   * MARK: handleCopyCheckout
   * @description Copies a ready-to-paste `git fetch origin && git checkout
   *   <branch>` command for the authoritative review branch (`data.branch`
   *   from the review API) so the reviewer can open it in another tool or
   *   terminal. Shows `Copied ✓` for 2s on success.
   ***/
  const handleCopyCheckout = async () => {
    const command = buildCheckoutCommand(data?.branch);
    if (!command) return;
    const ok = await copyToClipboard(command);
    if (ok) {
      setCopiedCheckout(true);
      setTimeout(() => setCopiedCheckout(false), 2000);
    }
  };

  const upstreamCompareUrl = useMemo(() => {
    const remote = project?.gitRepo || project?.gitUrl;
    if (!remote || !data?.branch || !data?.baseBranch) return null;
    try {
      const url = new URL(remote.replace(/\.git$/, ''));
      // Branch refs are path segments on git forges: keep '/' as-is (e.g.
      // kb/<taskId>), only escaping characters that cannot appear in a ref.
      const escapeRef = (ref) => ref.replace(/[?#\s]/g, encodeURIComponent);
      return `${url.origin}${url.pathname}/compare/${escapeRef(data.baseBranch)}...${escapeRef(data.branch)}`;
    } catch {
      return null;
    }
  }, [project, data]);

  if (!taskId || !data) {
    return (
      <div className="flex-1 overflow-auto p-6" data-testid="task-review-page">
        <div className="p-6 bg-surface-container border border-border-standard rounded-sm text-xs font-mono text-text-muted">
          {review.reviewLoading
            ? 'Loading review…'
            : review.reviewError || 'No task selected. Open a task and click 🔍 Open PR Review.'}
        </div>
      </div>
    );
  }

  const branchLabel = `${data?.branch || 'no branch'} → ${data?.baseBranch || 'no base'}`;
  const formattedKey = task?.id ? formatTaskKey(task.id) : '';
  const isBusy = pendingKey !== null;

  return (
    <div className="flex-1 overflow-hidden flex flex-col" data-testid="task-review-page">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-border-standard bg-surface-container flex-wrap min-w-0 max-w-full overflow-x-hidden">
        <button
          type="button"
          onClick={() => {
            onBack?.();
            backToTaskDetail();
          }}
          className="shrink-0 text-xs font-mono text-text-muted hover:text-primary cursor-pointer min-h-[44px]"
        >
          ← Back
        </button>
        <span className="text-sm font-bold text-on-surface truncate max-w-[40ch] min-w-0">
          {formattedKey} · {task?.title || task?.goal?.slice(0, 40) || ''}
        </span>
        <span className="min-w-0 max-w-full truncate text-[11px] font-mono text-primary bg-surface-deep border border-border-standard rounded px-2 py-0.5">
          {branchLabel}
        </span>
        <span className="shrink-0 text-[11px] font-mono text-text-muted">
          ↓{data.behindBy} ↑{data.aheadBy}
        </span>
        {upstreamCompareUrl && (
          <a
            href={upstreamCompareUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-[11px] font-mono text-primary hover:underline"
            aria-label="Open the same comparison upstream"
          >
            Open upstream ↗
          </a>
        )}
        {data?.branch && (
          <button
            type="button"
            onClick={handleCopyCheckout}
            aria-label={`Copy checkout command for branch ${data.branch}`}
            title="Copy a git fetch + checkout command for this task branch"
            className="shrink-0 text-[11px] font-mono text-primary hover:underline cursor-pointer"
          >
            {copiedCheckout ? 'Copied ✓' : '⧉ Copy Checkout'}
          </button>
        )}
        {stage && (
          <span className="min-w-0 max-w-full truncate text-[10px] uppercase font-mono text-text-muted bg-surface-deep px-2 py-0.5 rounded border border-border-standard">
            Stage: {stage.name}
          </span>
        )}
        {data.uncommittedChanges && (
          <span
            className="min-w-0 max-w-full text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-warning/20 text-warning border border-warning/40 break-words"
            title="The shared worktree has uncommitted changes from another task; the review was computed from committed state only."
          >
            Uncommitted changes elsewhere
          </span>
        )}
      </div>

      {/* Preserved-diff / fallback notices. */}
      {data.preserved && (
        <div className="px-4 pt-2 bg-surface-container">
          <p className="text-[11px] font-mono text-text-muted">
            Showing the preserved diff from the merge — the task branch is already integrated.
            {newSinceFiles.length > 0
              ? ' Fix-up work since the merge is listed separately below.'
              : ' No new changes since the merge.'}
          </p>
        </div>
      )}
      {data.preserveNote && (
        <div className="px-4 pt-2 bg-surface-container">
          <p className="text-[11px] font-mono text-warning">{data.preserveNote}</p>
        </div>
      )}

      {/* Blocked / empty states (D7). Pass/Fail stay usable below. */}
      {!data.branchSupported && !hasReports ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md p-6 bg-surface-container border border-border-standard rounded-sm space-y-3">
            <div className="text-sm font-bold text-warning font-mono uppercase">
              PR review unavailable
            </div>
            <p className="text-xs text-on-surface leading-relaxed">
              {data.reason || 'Branch support is disabled for this project.'} Enable branch support
              in project settings to review code changes here. You can still Pass/Fail the stage
              below.
            </p>
          </div>
        </div>
      ) : !hasReviewFiles && !hasReports ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md p-6 bg-surface-container border border-border-standard rounded-sm text-xs font-mono text-text-muted">
            {data.reason || 'Nothing to review yet — the agent has not modified any files.'}
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 pt-2 border-b border-border-standard bg-surface-container">
            <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')}>
              Files Changed
            </TabButton>
            <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')}>
              Reports{reports.length > 0 ? ` (${reports.length})` : ''}
            </TabButton>
            <TabButton
              active={activeTab === 'conversation'}
              onClick={() => setActiveTab('conversation')}
            >
              Conversation{unresolvedCount > 0 ? ` (${unresolvedCount} unresolved)` : ''}
            </TabButton>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'files' ? (
              !hasReviewFiles ? (
                <div className="p-6 text-xs font-mono text-text-muted space-y-2">
                  <p>
                    {data.reason || 'Nothing to review yet — the agent has not modified any files.'}
                  </p>
                  {hasReports && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('reports')}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Review the stage reports instead →
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-4 p-4 items-start">
                  <div className="w-64 shrink-0 hidden md:block">
                    <FileDiffList
                      files={sidebarFiles}
                      viewedFiles={review.viewedFiles}
                      onSelectFile={scrollToFile}
                      onToggleViewed={review.toggleFileViewed}
                    />
                  </div>
                  {showPreservedSplit ? (
                    <div className="flex-1 min-w-0 space-y-6">
                      {data.files.length > 0 && (
                        <section aria-label="Merged change" className="space-y-4">
                          <h3 className="text-[11px] font-mono uppercase text-text-muted">
                            Merged change
                          </h3>
                          {data.files.map((file) => (
                            <DiffView
                              key={`merged-${file.path}`}
                              file={file}
                              comments={data.comments}
                              viewedFiles={review.viewedFiles}
                              onToggleViewed={review.toggleFileViewed}
                              addComment={review.addComment}
                              onReply={review.addReply}
                              onUpdate={review.updateComment}
                              onDelete={review.deleteComment}
                              headSha={data.headSha}
                              canComment={isWaitingHuman}
                            />
                          ))}
                        </section>
                      )}
                      <section aria-label="New since merge" className="space-y-4">
                        <h3 className="text-[11px] font-mono uppercase text-text-muted">
                          New since merge
                        </h3>
                        {newSinceFiles.map((file) => (
                          <DiffView
                            key={`new-${file.path}`}
                            file={file}
                            comments={data.comments}
                            viewedFiles={review.viewedFiles}
                            onToggleViewed={review.toggleFileViewed}
                            addComment={review.addComment}
                            onReply={review.addReply}
                            onUpdate={review.updateComment}
                            onDelete={review.deleteComment}
                            headSha={data.headSha}
                            canComment={isWaitingHuman}
                          />
                        ))}
                      </section>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 space-y-4">
                      {data.files.map((file) => (
                        <DiffView
                          key={file.path}
                          file={file}
                          comments={data.comments}
                          viewedFiles={review.viewedFiles}
                          onToggleViewed={review.toggleFileViewed}
                          addComment={review.addComment}
                          onReply={review.addReply}
                          onUpdate={review.updateComment}
                          onDelete={review.deleteComment}
                          headSha={data.headSha}
                          canComment={isWaitingHuman}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : activeTab === 'reports' ? (
              <div
                className="flex flex-col md:flex-row gap-2 md:gap-4 p-2 md:p-4 items-start w-full min-w-0 max-w-full overflow-x-hidden"
                data-testid="report-review-pane"
              >
                <ReportNavigator
                  reports={reports}
                  activeReportPath={activeReportPath}
                  commentCounts={reportCommentCounts}
                  onSelect={setSelectedReportPath}
                />
                <div className="flex-1 min-w-0 w-full max-w-full overflow-x-hidden">
                  {selectedReport ? (
                    <ReportReviewView
                      report={selectedReport}
                      comments={data.comments}
                      addComment={review.addComment}
                      onReply={review.addReply}
                      onUpdate={review.updateComment}
                      onDelete={review.deleteComment}
                      canComment={isWaitingHuman}
                      headSha={data.headSha}
                      activeProject={project}
                      taskId={taskId}
                    />
                  ) : (
                    <div className="text-xs font-mono text-text-muted">
                      No reports have been generated for this task yet.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto p-4 space-y-4">
                {/* Goal summary */}
                <div className="p-4 bg-surface-container border border-border-standard rounded-sm">
                  <div className="text-[11px] font-mono uppercase text-text-muted mb-2">
                    Task Goal
                  </div>
                  <MarkdownViewer
                    content={task?.goal || ''}
                    projectId={activeProjectId}
                    taskId={task?.id || null}
                  />
                </div>
                {/* Commit list (newest-first, D8) */}
                <div className="p-4 bg-surface-container border border-border-standard rounded-sm">
                  <div className="text-[11px] font-mono uppercase text-text-muted mb-2">
                    Commits ({data.commits.length})
                  </div>
                  {data.commits.length === 0 ? (
                    <div className="text-xs font-mono text-text-muted">No commits yet.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.commits.map((commit) => (
                        <li key={commit.sha} className="text-xs font-mono flex items-center gap-2">
                          <code className="text-primary">{commit.sha}</code>
                          <span className="text-on-surface truncate">{commit.message}</span>
                          <span className="text-text-muted ml-auto">{commit.author}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* Fix-up commits since the preserved merge (fail-back story) */}
                {newSinceCommits.length > 0 && (
                  <div className="p-4 bg-surface-container border border-border-standard rounded-sm">
                    <div className="text-[11px] font-mono uppercase text-text-muted mb-2">
                      New since merge ({newSinceCommits.length})
                    </div>
                    <ul className="space-y-1.5">
                      {newSinceCommits.map((commit) => (
                        <li key={commit.sha} className="text-xs font-mono flex items-center gap-2">
                          <code className="text-primary">{commit.sha}</code>
                          <span className="text-on-surface truncate">{commit.message}</span>
                          <span className="text-text-muted ml-auto">{commit.author}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* All threads */}
                <div className="p-4 bg-surface-container border border-border-standard rounded-sm">
                  <div className="text-[11px] font-mono uppercase text-text-muted mb-2">
                    Review Comments ({unresolvedCount} unresolved)
                  </div>
                  {(data.comments || []).length === 0 ? (
                    <div className="text-xs font-mono text-text-muted">
                      No comments yet. Comment on lines in the Files Changed or Reports tabs.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.comments.map((comment) => (
                        <ReviewCommentThread
                          key={comment.id}
                          comment={comment}
                          stale={Boolean(
                            comment.headSha &&
                            data.headSha &&
                            String(comment.headSha) !== String(data.headSha),
                          )}
                          canResolve={isWaitingHuman}
                          onReply={review.addReply}
                          onUpdate={review.updateComment}
                          onDelete={review.deleteComment}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer action bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-border-standard bg-surface-container flex-wrap">
        {isWaitingHuman && !isTerminallyFailed ? (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setShowPassModal(true)}
              aria-label={reviewCopy.reviewFooterAria}
              className="flex-1 min-w-[160px] py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm font-mono"
            >
              {pendingKey === 'pass' ? reviewCopy.reviewBusy : reviewCopy.reviewButton}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setFailFeedback(buildFailDraft());
                setShowFailModal(true);
              }}
              aria-label="Fail this stage with feedback"
              className="flex-1 min-w-[160px] py-2.5 min-h-[44px] bg-error-container text-on-error-container rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm font-mono"
            >
              {pendingKey === 'fail' ? 'Failing…' : '✕ Fail Stage'}
            </button>
          </>
        ) : (
          <div className="text-[11px] font-mono text-text-muted">
            {isTerminallyFailed
              ? 'This task failed — return to the task and use Retry Stage instead of passing.'
              : 'Read-only review — Pass/Fail is available while the task waits at a human checkpoint.'}
          </div>
        )}
      </div>

      {/* Pass modal (confirm + optional guidance) */}
      {showPassModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={reviewCopy.reviewDialogAria}
        >
          <div className="w-full max-w-xl bg-surface-container border border-border-standard rounded-sm p-4 space-y-3">
            <div className="text-sm font-bold uppercase font-mono text-secondary">
              {reviewCopy.reviewDialogTitle}
            </div>
            <p className="text-[11px] font-mono text-text-muted">{reviewCopy.reviewExplainer}</p>
            {(data?.comments || []).length > 0 && (
              <p className="text-[11px] font-mono text-primary">
                Your review comments (on code and reports) are attached to the approval report so
                downstream stages can consider them.
              </p>
            )}
            <textarea
              value={passGuidance}
              onChange={(e) => setPassGuidance(e.target.value)}
              rows={4}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- dialog opens from the user's explicit pass action
              autoFocus
              aria-label={reviewCopy.reviewGuidanceAria}
              placeholder="e.g. Please also cover the retry path…"
              className="w-full bg-surface-deep border border-border-standard rounded p-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPassModal(false)}
                disabled={pendingKey === 'pass'}
                className="px-3 py-2 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-[11px] font-mono uppercase text-on-surface cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePass()}
                disabled={isBusy}
                className="px-3 py-2 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-[11px] font-mono font-bold uppercase hover:brightness-110 cursor-pointer disabled:opacity-40"
              >
                {pendingKey === 'pass' ? reviewCopy.reviewBusy : reviewCopy.reviewButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fail modal (ReviewSummaryComposer) */}
      {showFailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Fail stage with feedback"
        >
          <div className="w-full max-w-xl bg-surface-container border border-border-standard rounded-sm p-4 space-y-3">
            <div className="text-sm font-bold uppercase font-mono text-error">✕ Fail Stage</div>
            <p className="text-[11px] font-mono text-text-muted">
              Feedback below is pre-filled from unresolved review comments (grouped by file). Edit
              freely — the agent receives this verbatim. You can attach or paste screenshots; they
              travel with the feedback so the agent can see the issue.
            </p>
            {activeProjectId && taskId && (
              <TaskImageAttach
                projectId={activeProjectId}
                taskId={taskId}
                textareaRef={failTextareaRef}
                onUploadedBatch={handleFailImagesUploadedBatch}
                onRemoved={handleFailImageRemoved}
                onUploadingChange={setFailImagesUploading}
              />
            )}
            <textarea
              ref={failTextareaRef}
              value={failFeedback}
              onChange={(e) => setFailFeedback(e.target.value)}
              rows={10}
              aria-label="Stage feedback"
              className="w-full bg-surface-deep border border-border-standard rounded p-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFailModal(false)}
                disabled={pendingKey === 'fail'}
                className="px-3 py-2 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-[11px] font-mono uppercase text-on-surface cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFail}
                disabled={!failFeedback.trim() || pendingKey === 'fail' || failImagesUploading}
                className="px-3 py-2 min-h-[44px] bg-error-container text-on-error-container rounded-sm text-[11px] font-mono font-bold uppercase hover:brightness-110 cursor-pointer disabled:opacity-40"
              >
                {pendingKey === 'fail' ? 'Failing…' : '✕ Fail Stage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/***
 * MARK: TabButton
 * @description Small underline-style tab button for the review page tabs.
 ***/
function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`px-3 py-2 min-h-[44px] text-[11px] font-mono font-bold uppercase tracking-wide border-b-2 -mb-px cursor-pointer transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-text-muted hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}
