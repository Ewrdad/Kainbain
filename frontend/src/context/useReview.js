import { useCallback, useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';

/***
 * MARK: VIEWED_FILES_STORAGE_PREFIX
 * localStorage key prefix for the per-task "Viewed" checkbox state on review
 * files (GitHub-style). Each task gets its own key so the state is scoped.
 ***/
export const VIEWED_FILES_STORAGE_PREFIX = 'kainbain_review_viewed_';

/**
 * MARK: useReview
 * @description Owns the MR-style review payload for one task: branch diff,
 * commit list, sidecar comments, per-file viewed state, and the comment CRUD
 * actions with optimistic updates + rollback on failure.
 *
 * @param {Object} [opts]
 * @param {string} [opts.projectId] - Active project id.
 * @param {string} [opts.taskId] - Task being reviewed.
 * @returns {Object} { review, reviewLoading, reviewError, loadReview,
 *   addComment, updateComment, deleteComment, addReply, upsertComment,
 *   removeComment, viewedFiles, toggleFileViewed, applyReviewEvent }
 ***/
export function useReview({ projectId, taskId } = {}) {
  const [review, setReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [viewedFiles, setViewedFiles] = useState(() => new Set());

  const seqRef = useRef(0);
  const loadedTaskIdRef = useRef(null);
  // Keep the latest review reachable inside callbacks without re-creating them
  // on every review change (avoids stale rollback snapshots).
  const reviewRef = useRef(null);
  useEffect(() => {
    reviewRef.current = review;
  }, [review]);

  // Load the viewed-files set for a task from localStorage.
  const loadViewedFiles = useCallback((id) => {
    if (typeof window === 'undefined' || !window.localStorage || !id) return new Set();
    try {
      const raw = window.localStorage.getItem(`${VIEWED_FILES_STORAGE_PREFIX}${id}`);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      logger.error('Failed to load viewed files', e);
      return new Set();
    }
  }, []);

  const persistViewedFiles = useCallback((id, next) => {
    if (typeof window === 'undefined' || !window.localStorage || !id) return;
    try {
      window.localStorage.setItem(
        `${VIEWED_FILES_STORAGE_PREFIX}${id}`,
        JSON.stringify(Array.from(next)),
      );
    } catch (e) {
      logger.error('Failed to persist viewed files', e);
    }
  }, []);

  /***
   * MARK: loadReview
   * @description Fetches the full review payload (diff + commits + comments)
   *   for the task. Stale responses are discarded via a sequence guard.
   ***/
  const loadReview = useCallback(
    async (pid = projectId, tid = taskId) => {
      if (!pid || !tid) return null;
      const seq = ++seqRef.current;
      setReviewLoading(true);
      setReviewError(null);
      try {
        const data = await api.getTaskReview(pid, tid);
        if (seq !== seqRef.current) return null; // stale
        setReview(data);
        loadedTaskIdRef.current = tid;
        setViewedFiles(loadViewedFiles(tid));
        return data;
      } catch (e) {
        if (seq !== seqRef.current) return null;
        logger.error('Failed to load review', e);
        setReviewError(e?.message || 'Failed to load review');
        return null;
      } finally {
        if (seq === seqRef.current) setReviewLoading(false);
      }
    },
    [projectId, taskId, loadViewedFiles],
  );

  // Auto-load when bound to a task. The loader is declared inside the effect
  // (mirroring TaskDetailPage's reports loader) so state updates happen in the
  // effect-owned async path rather than synchronously in the effect body.
  useEffect(() => {
    if (!projectId || !taskId) return undefined;
    let isMounted = true;
    const load = async () => {
      const seq = ++seqRef.current;
      setReviewLoading(true);
      setReviewError(null);
      try {
        const data = await api.getTaskReview(projectId, taskId);
        if (!isMounted || seq !== seqRef.current) return;
        setReview(data);
        loadedTaskIdRef.current = taskId;
        setViewedFiles(loadViewedFiles(taskId));
      } catch (e) {
        if (!isMounted || seq !== seqRef.current) return;
        logger.error('Failed to load review', e);
        setReviewError(e?.message || 'Failed to load review');
      } finally {
        if (isMounted && seq === seqRef.current) setReviewLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [projectId, taskId, loadViewedFiles]);

  /***
   * MARK: upsertComment
   * @description Inserts or replaces a comment inside the loaded review
   *   (used by optimistic adds and WS REVIEW_UPDATED merges).
   ***/
  const upsertComment = useCallback((comment) => {
    if (!comment?.id) return;
    setReview((prev) => {
      if (!prev) return prev;
      const comments = prev.comments || [];
      const idx = comments.findIndex((c) => String(c.id) === String(comment.id));
      const next = [...comments];
      if (idx >= 0) next[idx] = comment;
      else next.push(comment);
      return { ...prev, comments: next };
    });
  }, []);

  /***
   * MARK: removeComment
   ***/
  const removeComment = useCallback((commentId) => {
    setReview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        comments: (prev.comments || []).filter((c) => String(c.id) !== String(commentId)),
      };
    });
  }, []);

  /***
   * MARK: addComment
   * @description Creates a per-line or per-file comment. Optimistic insert with
   *   a temp id, replaced by the server record on success; rollback on failure.
   ***/
  const addComment = useCallback(
    async (payload) => {
      if (!projectId || !taskId) return null;
      const tempId = `rc-temp-${Date.now()}`;
      const optimistic = {
        id: tempId,
        scope: payload.scope || 'line',
        filePath: payload.filePath || null,
        lineText: payload.lineText || null,
        author: payload.author || 'human',
        body: payload.body,
        resolved: false,
        replies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _optimistic: true,
      };
      upsertComment(optimistic);
      try {
        const created = await api.addReviewComment(projectId, taskId, payload);
        // Swap the optimistic temp entry for the server record (removal first
        // so an echo of the temp id can never linger in the list).
        removeComment(tempId);
        upsertComment(created);
        return created;
      } catch (e) {
        logger.error('Failed to add review comment', e);
        removeComment(tempId);
        setReviewError(e?.message || 'Failed to add comment');
        return null;
      }
    },
    [projectId, taskId, upsertComment, removeComment],
  );

  /***
   * MARK: updateComment
   * @description Edits body and/or resolved flag with optimistic update.
   ***/
  const updateComment = useCallback(
    async (commentId, updates) => {
      if (!projectId || !taskId || !commentId) return null;
      const previous = reviewRef.current;
      setReview((prev) => {
        if (!prev) return prev;
        const comments = (prev.comments || []).map((c) =>
          String(c.id) === String(commentId)
            ? { ...c, ...updates, updatedAt: new Date().toISOString() }
            : c,
        );
        return { ...prev, comments };
      });
      try {
        const updated = await api.updateReviewComment(projectId, taskId, commentId, updates);
        upsertComment(updated);
        return updated;
      } catch (e) {
        logger.error('Failed to update review comment', e);
        setReviewError(e?.message || 'Failed to update comment');
        if (previous) setReview(previous);
        return null;
      }
    },
    [projectId, taskId, review, upsertComment],
  );

  /***
   * MARK: deleteComment
   ***/
  const deleteComment = useCallback(
    async (commentId) => {
      if (!projectId || !taskId || !commentId) return false;
      const previous = reviewRef.current;
      removeComment(commentId);
      try {
        await api.deleteReviewComment(projectId, taskId, commentId);
        return true;
      } catch (e) {
        logger.error('Failed to delete review comment', e);
        setReviewError(e?.message || 'Failed to delete comment');
        if (previous) setReview(previous);
        return false;
      }
    },
    [projectId, taskId, removeComment],
  );

  /***
   * MARK: addReply
   * @description Appends a reply to a comment thread (optimistic insert).
   ***/
  const addReply = useCallback(
    async (commentId, body) => {
      if (!projectId || !taskId || !commentId) return null;
      const optimistic = {
        id: `rep-temp-${Date.now()}`,
        body,
        author: 'human',
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };
      setReview((prev) => {
        if (!prev) return prev;
        const comments = (prev.comments || []).map((c) =>
          String(c.id) === String(commentId)
            ? { ...c, replies: [...(c.replies || []), optimistic] }
            : c,
        );
        return { ...prev, comments };
      });
      try {
        const reply = await api.addReviewCommentReply(projectId, taskId, commentId, body);
        setReview((prev) => {
          if (!prev) return prev;
          const comments = (prev.comments || []).map((c) => {
            if (String(c.id) !== String(commentId)) return c;
            const replies = (c.replies || []).map((r) => (r._optimistic ? reply : r));
            return { ...c, replies };
          });
          return { ...prev, comments };
        });
        return reply;
      } catch (e) {
        logger.error('Failed to add reply', e);
        setReviewError(e?.message || 'Failed to add reply');
        if (previous) setReview(previous);
        return null;
      }
    },
    [projectId, taskId],
  );

  /***
   * MARK: applyReviewEvent
   * @description Merges a REVIEW_UPDATED WS payload into the loaded review.
   *   Types: comment_added / comment_updated (upsert), reply_added (append),
   *   comment_deleted (remove), snapshot (re-fetch).
   ***/
  const applyReviewEvent = useCallback(
    async (event) => {
      if (!event || !review) return;
      if (String(event.taskId) !== String(review.task?.id)) return;
      switch (event.type) {
        case 'comment_added':
        case 'comment_updated':
          if (event.comment) upsertComment(event.comment);
          break;
        case 'reply_added':
          if (event.commentId && event.reply) {
            setReview((prev) => {
              if (!prev) return prev;
              const comments = (prev.comments || []).map((c) => {
                if (String(c.id) !== String(event.commentId)) return c;
                if ((c.replies || []).some((r) => String(r.id) === String(event.reply.id)))
                  return c;
                return { ...c, replies: [...(c.replies || []), event.reply] };
              });
              return { ...prev, comments };
            });
          }
          break;
        case 'comment_deleted':
          removeComment(event.commentId);
          break;
        case 'snapshot':
          await loadReview();
          break;
        default:
          break;
      }
    },
    [review, upsertComment, removeComment, loadReview],
  );

  /***
   * MARK: toggleFileViewed
   * @description Toggles the per-file "Viewed" checkbox; persisted per task.
   ***/
  const toggleFileViewed = useCallback(
    (filePath) => {
      if (!filePath || !loadedTaskIdRef.current) return;
      setViewedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(filePath)) next.delete(filePath);
        else next.add(filePath);
        persistViewedFiles(loadedTaskIdRef.current, next);
        return next;
      });
    },
    [persistViewedFiles],
  );

  const unresolvedCount = (review?.comments || []).filter((c) => !c.resolved).length;

  return {
    review,
    reviewLoading,
    reviewError,
    loadReview,
    addComment,
    updateComment,
    deleteComment,
    addReply,
    upsertComment,
    removeComment,
    applyReviewEvent,
    viewedFiles,
    toggleFileViewed,
    unresolvedCount,
  };
}
