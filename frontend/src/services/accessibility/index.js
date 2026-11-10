// Domain: Accessibility — statement results and report submission.
/***
 * MARK: accessibilityRequests
 * @description Describes the accessibility-statement requests: fetching the
 *   versioned check-results artifact the statement view renders from, and
 *   submitting one accessibility report (any issue welcome whether or not
 *   a standard covers it).
 * @example const requests = accessibilityRequests(request);
 * @example requests.accessibilityResults() => request('/accessibility/results')
 ***/
export function accessibilityRequests(request) {
  return {
    accessibilityResults: () => request('/accessibility/results'),
    submitAccessibilityFeedback: ({ message, needGroup, contact, pageUrl } = {}) =>
      request('/accessibility/feedback', {
        method: 'POST',
        body: JSON.stringify({ message, needGroup, contact, pageUrl }),
      }),
  };
}
