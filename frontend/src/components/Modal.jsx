import React, { useEffect, useRef } from 'react';

/**
 * MARK: Modal
 * @description Accessible modal dialog wrapper. Provides role="dialog",
 * aria-modal, Escape-to-close, a focus trap, initial focus, and focus
 * restore on close. Clicking the backdrop closes the dialog.
 *
 * @param {Function} onClose - Called when the dialog should close (Escape or backdrop click).
 * @param {string} [labelledBy] - id of the element that titles the dialog.
 * @param {string} [describedBy] - id of the element that describes the dialog.
 * @param {string} [containerClassName] - Classes for the full-screen backdrop wrapper.
 * @param {string} [dialogClassName] - Classes for the dialog panel itself.
 */
export function Modal({
  onClose,
  labelledBy,
  describedBy,
  containerClassName = 'flex items-center justify-center p-3 sm:p-6',
  dialogClassName = '',
  children,
}) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    const node = dialogRef.current;

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      );

    // Move focus into the dialog on open.
    const els = focusables();
    if (els.length > 0) {
      els[0].focus();
    } else if (node) {
      node.setAttribute('tabindex', '-1');
      node.focus();
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  // Backdrop click closes; keyboard users close via the document-level Escape
  // handler in the focus-trap effect below (the backdrop is intentionally not
  // focusable). The panel stops propagation so panel clicks never close.
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- keyboard close via Escape (tested in Modal.test.jsx)
    <div className={`fixed inset-0 z-50 ${containerClassName}`} onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- propagation guard only, not an interaction; keyboard close is via the document Escape handler */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={dialogClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
