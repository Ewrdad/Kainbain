// Domain: Watching the Work — reports, reviews, and stuck checks.
/***
 * MARK: watchRequests
 * @description Describes the watch requests using the application's existing connection.
 * @example const requests = watchRequests(request);
 */
export function watchRequests(request) {
  return {
    getTaskReports: (projectId, taskId) =>
      request(`/tasks/${taskId}/reports${projectId ? `?projectId=${projectId}` : ''}`),
    rejectTaskWithFeedback: (projectId, taskId, feedback) =>
      request(`/tasks/${taskId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ projectId, feedback }),
      }),
    getTaskReview: (projectId, taskId) =>
      request(`/projects/${projectId}/tasks/${taskId}/review?projectId=${projectId}`),
    addReviewComment: (projectId, taskId, payload) =>
      request(`/projects/${projectId}/tasks/${taskId}/review/comments?projectId=${projectId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateReviewComment: (projectId, taskId, commentId, updates) =>
      request(
        `/projects/${projectId}/tasks/${taskId}/review/comments/${commentId}?projectId=${projectId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        },
      ),
    addReviewCommentReply: (projectId, taskId, commentId, body) =>
      request(
        `/projects/${projectId}/tasks/${taskId}/review/comments/${commentId}/replies?projectId=${projectId}`,
        {
          method: 'POST',
          body: JSON.stringify({ body }),
        },
      ),
    deleteReviewComment: (projectId, taskId, commentId) =>
      request(
        `/projects/${projectId}/tasks/${taskId}/review/comments/${commentId}?projectId=${projectId}`,
        {
          method: 'DELETE',
        },
      ),
    checkTaskStuck: (projectId, taskId, { model, harness, question } = {}) =>
      request(`/tasks/${taskId}/stuck-check`, {
        method: 'POST',
        body: JSON.stringify({ projectId, model, harness, question }),
      }),
  };
}
