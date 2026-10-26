import { describe, expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FailureMessage } from './FailureMessage';
import { FAILURE_MESSAGE_PREVIEW_MAX, truncateFailureMessage } from './failureReason';
import '@testing-library/jest-dom';

describe('FailureMessage', () => {
  const longMessage = `Boom: the stage blew up spectacularly\n${'trace line '.repeat(40)}end of trace`;

  test('caps a long message and offers Show more', () => {
    expect(longMessage.length).toBeGreaterThan(FAILURE_MESSAGE_PREVIEW_MAX);
    const { container } = render(<FailureMessage message={longMessage} />);

    const { preview } = truncateFailureMessage(longMessage);
    expect(container.firstChild.textContent).toContain(preview);
    expect(container.firstChild.textContent).not.toContain('end of trace');
    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('Show more reveals the full message and Show less collapses it again', () => {
    const { container } = render(<FailureMessage message={longMessage} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(container.firstChild.textContent).toContain('end of trace');
    const toggle = screen.getByRole('button', { name: 'Show less' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(container.firstChild.textContent).not.toContain('end of trace');
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  test('renders a short message exactly, with no toggle', () => {
    const { container } = render(
      <FailureMessage message="Rate limit exceeded on provider" className="error-box" />,
    );
    expect(screen.getByText('Rate limit exceeded on provider')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass('error-box');
  });

  test('renders a message exactly at the cap with no toggle', () => {
    const exact = 'x'.repeat(FAILURE_MESSAGE_PREVIEW_MAX);
    render(<FailureMessage message={exact} />);
    expect(screen.getByText(exact)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('collapses again when a different message arrives', () => {
    const otherLongMessage = `Another failure\n${'stack frame '.repeat(40)}end of other trace`;
    const { container, rerender } = render(<FailureMessage message={longMessage} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(container.firstChild.textContent).toContain('end of trace');

    rerender(<FailureMessage message={otherLongMessage} />);
    expect(container.firstChild.textContent).not.toContain('end of trace');
    expect(container.firstChild.textContent).not.toContain('end of other trace');
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  test('renders nothing clickable for a missing message', () => {
    render(<FailureMessage message={null} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('FailureMessage image references', () => {
  const messageWithShot = 'The dialog overlaps.\n\n![shot.png](assets/shot.png)\n';

  test('renders asset refs as thumbnails when task context is provided', () => {
    render(<FailureMessage message={messageWithShot} projectId="p1" taskId="t1" />);
    const strip = screen.getByTestId('failure-message-images');
    expect(strip).toBeInTheDocument();
    const img = screen.getByAltText('shot.png');
    expect(img.getAttribute('src')).toContain('/projects/p1/tasks/t1/images/shot.png');
    // The readable reference text still shows alongside the thumbnail.
    expect(strip.parentElement.textContent).toContain('![shot.png](assets/shot.png)');
  });

  test('omits thumbnails without task context (readable reference degrades gracefully)', () => {
    render(<FailureMessage message={messageWithShot} />);
    expect(screen.queryByTestId('failure-message-images')).not.toBeInTheDocument();
    expect(screen.getByText(/!\[shot\.png\]\(assets\/shot\.png\)/)).toBeInTheDocument();
  });

  test('ignores external image URLs', () => {
    render(
      <FailureMessage
        message={'See ![x](https://example.com/x.png)'}
        projectId="p1"
        taskId="t1"
      />,
    );
    expect(screen.queryByTestId('failure-message-images')).not.toBeInTheDocument();
  });

  test('renders no strip for messages without image refs', () => {
    render(<FailureMessage message="Rate limit exceeded" projectId="p1" taskId="t1" />);
    expect(screen.queryByTestId('failure-message-images')).not.toBeInTheDocument();
  });

  test('renders a twice-pasted screenshot only once', () => {
    render(
      <FailureMessage
        message={'See ![a](assets/a.png)\n\n![a](assets/a.png)\n'}
        projectId="p1"
        taskId="t1"
      />,
    );
    expect(screen.getAllByAltText('a')).toHaveLength(1);
  });
});
