import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { Modal } from '../Modal';
import { usePendingAction } from '../../hooks/usePendingAction';
import { NEED_GROUPS } from '../../a11y/statementResults';

const MESSAGE_MAX_CHARS = 4000;
const CONTACT_MAX_CHARS = 320;
const PAGE_URL_MAX_CHARS = 2048;

const initialFieldErrors = () => ({});

/***
 * MARK: AccessibilityReportDialog
 * @description Short on-site form for reporting an accessibility problem —
 *   explicitly for any barrier, whether or not a standard covers it. Visible
 *   labels, named errors with fix suggestions, a single-flight submit guard,
 *   and a confirmation state (reusing the FeedbackDialog modal patterns).
 *   Server-side fixes ride back onto the same fields when the endpoint
 *   rejects the report; a mailto fallback appears when the endpoint is
 *   unreachable and the team inbox is configured.
 * @example <AccessibilityReportDialog contactEmail="team@example.com" onClose={() => setOpen(false)} />
 ***/
export function AccessibilityReportDialog({ contactEmail = '', onClose }) {
  const { pendingKey, run } = usePendingAction();
  const isSubmitting = pendingKey === 'submit';

  const [message, setMessage] = useState('');
  const [needGroup, setNeedGroup] = useState('');
  const [contact, setContact] = useState('');
  const [pageUrl, setPageUrl] = useState(
    () => (typeof window !== 'undefined' ? window.location.hash || '' : ''),
  );
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const confirmationRef = useRef(null);

  useEffect(() => {
    if (submitted) confirmationRef.current?.focus?.();
  }, [submitted]);

  const validate = () => {
    const errors = {};
    const trimmed = message.trim();
    if (trimmed === '') {
      errors.message = {
        message: 'Describe the problem you hit.',
        fix: 'Write a sentence or two about what happened — for example, which page and what got in your way.',
      };
    } else if (trimmed.length > MESSAGE_MAX_CHARS) {
      errors.message = {
        message: `Keep the description under ${MESSAGE_MAX_CHARS} characters (yours is ${trimmed.length}).`,
        fix: 'Shorten the description to the key details: the page, the barrier, and what you were trying to do.',
      };
    }
    if (contact.trim() !== '' && contact.trim().length > CONTACT_MAX_CHARS) {
      errors.contact = {
        message: `Keep contact details under ${CONTACT_MAX_CHARS} characters.`,
        fix: 'Shorten the contact details to just an email address or phone number.',
      };
    }
    if (pageUrl.trim() !== '' && pageUrl.trim().length > PAGE_URL_MAX_CHARS) {
      errors.pageUrl = {
        message: `Keep the page address under ${PAGE_URL_MAX_CHARS} characters.`,
        fix: 'Shorten the page address to just the page path.',
      };
    }
    return errors;
  };

  const applyServerErrors = (thrown) => {
    try {
      const payload = JSON.parse(thrown?.body || '');
      if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        const mapped = {};
        for (const entry of payload.errors) {
          if (entry && typeof entry.field === 'string' && typeof entry.message === 'string') {
            mapped[entry.field] = { message: entry.message, fix: entry.fix || '' };
          }
        }
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          return true;
        }
      }
    } catch {
      // Not a structured error body — fall through to the generic message.
    }
    return false;
  };

  const handleSubmit = (event) => {
    if (event) event.preventDefault();
    if (pendingKey || submitted) return;
    const errors = validate();
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0) return;
    void run('submit', () =>
      api
        .submitAccessibilityFeedback({
          message: message.trim(),
          needGroup: needGroup || null,
          contact: contact.trim() || null,
          pageUrl: pageUrl.trim() || null,
        })
        .then((response) => {
          setSubmitted({ id: response?.id || '' });
        })
        .catch((thrown) => {
          // Structured rejections land on the fields with fix suggestions;
          // anything else keeps the dialog open with the draft intact and
          // offers the email fallback, so reporting never dead-ends.
          if (!applyServerErrors(thrown)) {
            setSubmitError(
              'The report could not be sent. Check your connection and try again — your words are still here.',
            );
          }
        }),
    );
  };

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSubmit();
    }
  };

  const describeIds = (field) => (fieldErrors[field] ? `a11y-report-${field}-error` : undefined);
  const mailtoHref =
    contactEmail.trim() !== ''
      ? `mailto:${contactEmail.trim()}?subject=${encodeURIComponent('Accessibility problem report')}&body=${encodeURIComponent(message.trim())}`
      : null;

  return (
    <Modal
      onClose={onClose}
      labelledBy="a11y-report-title"
      dialogClassName="w-full max-w-xl bg-surface border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <header className="p-4 sm:p-6 border-b border-border-standard bg-surface-container">
        <h2
          id="a11y-report-title"
          className="text-base sm:text-lg font-bold text-on-surface tracking-tight"
        >
          Report an accessibility problem
        </h2>
        <p className="text-xs text-text-muted mt-1">
          Tell us about any barrier you hit — whether or not it appears in an accessibility
          standard. Press{' '}
          <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-text-high border border-border-standard">
            Ctrl+Enter
          </kbd>{' '}
          to send.
        </p>
      </header>

      {submitted ? (
        <div className="p-4 sm:p-6 space-y-4">
          <h3
            ref={confirmationRef}
            tabIndex={-1}
            className="text-base font-bold text-on-surface outline-none"
          >
            Report received — thank you
          </h3>
          <p role="status" className="text-sm text-text-muted">
            The website team will look into it and reply to every report.
            {submitted.id && (
              <>
                {' '}
                Your reference is <span className="font-mono">{submitted.id.slice(0, 8)}</span>.
              </>
            )}
          </p>
          <footer className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all cursor-pointer"
            >
              Close
            </button>
          </footer>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col" noValidate>
          <div className="p-4 sm:p-6 space-y-4">
            <div>
              <label
                htmlFor="a11y-report-message"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                What happened (required)
              </label>
              <textarea
                id="a11y-report-message"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- dialog opens from an explicit user action; initial focus in the composer is the expected pattern
                autoFocus
                onKeyDown={handleKeyDown}
                aria-invalid={fieldErrors.message ? true : undefined}
                aria-describedby={describeIds('message')}
                className="w-full p-3 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface leading-relaxed outline-none focus:border-primary transition-colors h-28 sm:h-32 resize-y"
                placeholder="For example: on the monitor page, the keyboard focus disappears after I press save…"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              {fieldErrors.message && (
                <p id="a11y-report-message-error" role="alert" className="text-xs text-error mt-1">
                  {fieldErrors.message.message} {fieldErrors.message.fix}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="a11y-report-need"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                What were you trying to do (optional)
              </label>
              <select
                id="a11y-report-need"
                aria-describedby={describeIds('needGroup')}
                className="w-full px-3 min-h-[44px] bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors"
                value={needGroup}
                onChange={(event) => setNeedGroup(event.target.value)}
              >
                <option value="">Choose an area (optional)</option>
                {NEED_GROUPS.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label} — {group.blurb}
                  </option>
                ))}
              </select>
              {fieldErrors.needGroup && (
                <p id="a11y-report-needGroup-error" role="alert" className="text-xs text-error mt-1">
                  {fieldErrors.needGroup.message} {fieldErrors.needGroup.fix}
                </p>
              )}
              <p className="text-xs text-text-muted mt-1">
                This only helps us triage your report — it never blocks sending.
              </p>
            </div>

            <div>
              <label
                htmlFor="a11y-report-contact"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                How can we reach you (optional)
              </label>
              <input
                id="a11y-report-contact"
                type="text"
                autoComplete="email"
                aria-invalid={fieldErrors.contact ? true : undefined}
                aria-describedby={describeIds('contact')}
                className="w-full px-3 min-h-[44px] bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors"
                placeholder="Email address or phone number"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
              />
              {fieldErrors.contact && (
                <p id="a11y-report-contact-error" role="alert" className="text-xs text-error mt-1">
                  {fieldErrors.contact.message} {fieldErrors.contact.fix}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="a11y-report-page"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                Which page were you on (optional)
              </label>
              <input
                id="a11y-report-page"
                type="text"
                aria-invalid={fieldErrors.pageUrl ? true : undefined}
                aria-describedby={describeIds('pageUrl')}
                className="w-full px-3 min-h-[44px] bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors"
                placeholder="Page address"
                value={pageUrl}
                onChange={(event) => setPageUrl(event.target.value)}
              />
              {fieldErrors.pageUrl && (
                <p id="a11y-report-pageUrl-error" role="alert" className="text-xs text-error mt-1">
                  {fieldErrors.pageUrl.message} {fieldErrors.pageUrl.fix}
                </p>
              )}
            </div>

            {submitError && (
              <p role="alert" className="text-sm text-error">
                {submitError}{' '}
                {mailtoHref && (
                  <>
                    You can also{' '}
                    <a
                      href={mailtoHref}
                      className="underline underline-offset-2 hover:text-on-surface"
                    >
                      email the website team instead
                    </a>
                    .
                  </>
                )}
              </p>
            )}
          </div>

          <footer className="p-4 sm:p-6 border-t border-border-standard bg-surface flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer flex items-center justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pendingKey !== null}
              aria-busy={isSubmitting}
              className="px-6 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <span>Send report</span>
              )}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}

/***
 * MARK: AccessibilityReportDialog default export
 * @description Default export mirroring the named component export.
 * @example import AccessibilityReportDialog from './AccessibilityReportDialog';
 ***/
export default AccessibilityReportDialog;
