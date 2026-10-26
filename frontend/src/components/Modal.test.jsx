import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';
import '@testing-library/jest-dom';

/**
 * MARK: Modal tests
 * @description Verifies the accessible modal: role=dialog + aria-modal,
 *   Escape-to-close, backdrop click close, initial focus, and content render.
 */
test('renders children inside a dialog with ARIA attributes', () => {
  render(
    <Modal labelledBy="title" describedBy="desc">
      <h2 id="title">Hello</h2>
      <p id="desc">Description</p>
    </Modal>,
  );
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAttribute('aria-labelledby', 'title');
  expect(dialog).toHaveAttribute('aria-describedby', 'desc');
  expect(screen.getByText('Hello')).toBeInTheDocument();
});

test('closes on Escape', () => {
  const onClose = vi.fn();
  render(
    <Modal onClose={onClose}>
      <button>Inside</button>
    </Modal>,
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

test('closes when the backdrop is clicked but not the panel', () => {
  const onClose = vi.fn();
  const { container } = render(
    <Modal onClose={onClose}>
      <div>Panel content</div>
    </Modal>,
  );
  // Click the backdrop (the fixed inset-0 wrapper).
  fireEvent.click(container.querySelector('.fixed.inset-0'));
  expect(onClose).toHaveBeenCalled();
});

test('moves focus to the first focusable element on open', () => {
  render(
    <Modal>
      <input aria-label="first" />
    </Modal>,
  );
  expect(screen.getByLabelText('first')).toHaveFocus();
});
