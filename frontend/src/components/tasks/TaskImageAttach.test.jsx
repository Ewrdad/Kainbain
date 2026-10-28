import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { TaskImageAttach } from './TaskImageAttach';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  API_BASE: 'http://api.test',
  api: {
    listTaskImages: vi.fn(),
    uploadTaskImage: vi.fn(),
    deleteTaskImage: vi.fn(),
  },
}));

import { api } from '../../services/api';

/***
 * MARK: TaskImageAttach tests
 * @description Verifies the task image upload affordance: asset listing,
 *   picker upload → onUploaded report, paste-to-upload, error surfacing, and
 *   thumbnail removal.
 ***/
describe('TaskImageAttach Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTaskImages.mockResolvedValue({ images: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderAttach = (props = {}) =>
    renderWithKainBain(
      <TaskImageAttach projectId="proj-1" taskId="task-1" onUploaded={vi.fn()} {...props} />,
    );

  it('lists existing task images as removable thumbnails', async () => {
    api.listTaskImages.mockResolvedValue({
      images: [{ name: 'a.png', path: 'assets/a.png', size: 12 }],
    });
    renderAttach();
    await waitFor(() => expect(api.listTaskImages).toHaveBeenCalledWith('proj-1', 'task-1'));
    const thumb = await screen.findByTestId('task-image-thumbnails');
    expect(thumb).toBeInTheDocument();
    expect(screen.getByText('a.png')).toBeInTheDocument();
  });

  it('uploads picked files and reports each stored asset', async () => {
    const onUploaded = vi.fn();
    api.uploadTaskImage.mockResolvedValue({ name: 'shot.png', path: 'assets/shot.png' });
    const { container } = renderAttach({ onUploaded });

    const input = container.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledWith('proj-1', 'task-1', file));
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({ name: 'shot.png', path: 'assets/shot.png' }),
    );
  });

  it('ignores non-image files without calling the API', async () => {
    const onUploaded = vi.fn();
    const { container } = renderAttach({ onUploaded });
    const input = container.querySelector('[data-testid="task-image-input"]');
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(api.uploadTaskImage).not.toHaveBeenCalled());
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('reports a multi-file gesture as one ordered batch plus per-file reports', async () => {
    const onUploaded = vi.fn();
    const onUploadedBatch = vi.fn();
    api.uploadTaskImage.mockImplementation(async (projectId, taskId, file) => ({
      name: file.name,
      path: `assets/${file.name}`,
    }));
    const { container } = renderAttach({ onUploaded, onUploadedBatch });
    const input = container.querySelector('[data-testid="task-image-input"]');
    const files = ['a.png', 'b.png', 'c.png'].map(
      (name) => new File([new Uint8Array([1])], name, { type: 'image/png' }),
    );
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledTimes(3));
    expect(onUploaded).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(onUploadedBatch).toHaveBeenCalledTimes(1));
    expect(onUploadedBatch).toHaveBeenCalledWith([
      { name: 'a.png', path: 'assets/a.png' },
      { name: 'b.png', path: 'assets/b.png' },
      { name: 'c.png', path: 'assets/c.png' },
    ]);
  });

  it('keeps successes when one file in the batch fails, with a per-file error', async () => {
    const onUploadedBatch = vi.fn();
    api.uploadTaskImage.mockImplementation(async (projectId, taskId, file) => {
      if (file.name === 'bad.png') throw new Error('Image exceeds the limit');
      return { name: file.name, path: `assets/${file.name}` };
    });
    const { container } = renderAttach({ onUploadedBatch });
    const input = container.querySelector('[data-testid="task-image-input"]');
    const files = ['good.png', 'bad.png', 'alsogood.png'].map(
      (name) => new File([new Uint8Array([1])], name, { type: 'image/png' }),
    );
    fireEvent.change(input, { target: { files } });

    await waitFor(() =>
      expect(onUploadedBatch).toHaveBeenCalledWith([
        { name: 'good.png', path: 'assets/good.png' },
        { name: 'alsogood.png', path: 'assets/alsogood.png' },
      ]),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('bad.png');
    expect(alert.textContent).toContain('Image exceeds the limit');
  });

  it('uploads same-named files and links each distinct stored path', async () => {
    const onUploadedBatch = vi.fn();
    // Mirrors the backend dedupeImageName contract (foo.png -> foo-2.png).
    let n = 0;
    api.uploadTaskImage.mockImplementation(async () => {
      n += 1;
      const name = n === 1 ? 'shot.png' : `shot-${n}.png`;
      return { name, path: `assets/${name}` };
    });
    const { container } = renderAttach({ onUploadedBatch });
    const input = container.querySelector('[data-testid="task-image-input"]');
    const files = [1, 2, 3].map(
      () => new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' }),
    );
    fireEvent.change(input, { target: { files } });

    await waitFor(() =>
      expect(onUploadedBatch).toHaveBeenCalledWith([
        { name: 'shot.png', path: 'assets/shot.png' },
        { name: 'shot-2.png', path: 'assets/shot-2.png' },
        { name: 'shot-3.png', path: 'assets/shot-3.png' },
      ]),
    );
  });

  it('shows a skip notice instead of silent success when all files are non-images', async () => {
    const onUploadedBatch = vi.fn();
    const { container } = renderAttach({ onUploadedBatch });
    const input = container.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/skipped 1 non-image file/i);
    expect(api.uploadTaskImage).not.toHaveBeenCalled();
    expect(onUploadedBatch).not.toHaveBeenCalled();
  });

  it('names HEIC explicitly when an iPhone photo is skipped', async () => {
    const { container } = renderAttach({});
    const input = container.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'IMG_001.heic', { type: 'image/heic' })] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/HEIC/i);
    expect(alert.textContent).toContain('IMG_001.heic');
    expect(api.uploadTaskImage).not.toHaveBeenCalled();
  });

  it('uploads the images and notes the skipped files when a batch is mixed', async () => {
    const onUploadedBatch = vi.fn();
    api.uploadTaskImage.mockResolvedValue({ name: 'a.png', path: 'assets/a.png' });
    const { container } = renderAttach({ onUploadedBatch });
    const input = container.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }),
          new File(['x'], 'notes.txt', { type: 'text/plain' }),
        ],
      },
    });

    await waitFor(() =>
      expect(onUploadedBatch).toHaveBeenCalledWith([{ name: 'a.png', path: 'assets/a.png' }]),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/skipped 1 non-image file/i);
  });

  it('surfaces upload failures as an alert', async () => {
    api.uploadTaskImage.mockRejectedValue(new Error('Image exceeds the limit'));
    const { container } = renderAttach();
    const input = container.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1])], 'big.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Image exceeds the limit');
  });

  it('uploads images pasted into the textarea and reports them', async () => {
    const onUploaded = vi.fn();
    api.uploadTaskImage.mockResolvedValue({ name: 'pasted.png', path: 'assets/pasted.png' });
    const textareaRef = { current: document.createElement('textarea') };
    document.body.appendChild(textareaRef.current);
    renderAttach({ textareaRef, onUploaded });

    const file = new File([new Uint8Array([9])], 'pasted.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    event.clipboardData = { files: [file] };
    textareaRef.current.dispatchEvent(event);

    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledWith('proj-1', 'task-1', file));
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({ name: 'pasted.png', path: 'assets/pasted.png' }),
    );
    textareaRef.current.remove();
  });

  it('removes a thumbnail via the delete endpoint and refreshes', async () => {
    api.listTaskImages
      .mockResolvedValueOnce({
        images: [{ name: 'doomed.png', path: 'assets/doomed.png', size: 3 }],
      })
      .mockResolvedValueOnce({ images: [] });
    api.deleteTaskImage.mockResolvedValue({ status: 'deleted' });
    const onRemoved = vi.fn();
    renderAttach({ onRemoved });

    const removeButton = await screen.findByTestId('task-image-remove-doomed.png');
    fireEvent.click(removeButton);

    await waitFor(() =>
      expect(api.deleteTaskImage).toHaveBeenCalledWith('proj-1', 'task-1', 'doomed.png'),
    );
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith('doomed.png'));
    await waitFor(() => expect(screen.queryByTestId('task-image-thumbnails')).toBeNull());
  });

  it('renders nothing harmful without task context', () => {
    renderWithKainBain(<TaskImageAttach projectId="" taskId="" />);
    expect(screen.getByTestId('task-image-attach')).toBeInTheDocument();
    expect(screen.queryByTestId('task-image-thumbnails')).toBeNull();
  });

  it('explains when files are picked without task context instead of failing silently', async () => {
    renderWithKainBain(<TaskImageAttach projectId="" taskId="" />);
    const input = document.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/select a task/i);
    expect(api.uploadTaskImage).not.toHaveBeenCalled();
  });

  it('counts the upload as success when the legacy per-file listener throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.uploadTaskImage.mockResolvedValue({ name: 'a.png', path: 'assets/a.png' });
    const onUploaded = vi.fn(() => {
      throw new Error('listener boom');
    });
    const onUploadedBatch = vi.fn();
    const { container } = renderAttach({ onUploaded, onUploadedBatch });
    const input = container.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })] },
    });

    // The succeeded upload is still reported in the batch (not as a failure).
    await waitFor(() =>
      expect(onUploadedBatch).toHaveBeenCalledWith([{ name: 'a.png', path: 'assets/a.png' }]),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('recovers when the batch listener throws (picker resets, next upload proceeds)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.uploadTaskImage.mockResolvedValue({ name: 'a.png', path: 'assets/a.png' });
    const onUploadingChange = vi.fn();
    const onUploadedBatch = vi.fn(() => {
      throw new Error('parent boom');
    });
    const { container } = renderAttach({ onUploadedBatch, onUploadingChange });
    const input = container.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onUploadedBatch).toHaveBeenCalledTimes(1));
    // The guard is released even though the listener threw.
    await waitFor(() => expect(onUploadingChange).toHaveBeenCalledWith(false));
    expect(errorSpy).toHaveBeenCalled();

    // A follow-up upload proceeds instead of being rejected as "in progress".
    onUploadedBatch.mockImplementation(() => {});
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([2])], 'b.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledTimes(2));
    expect(onUploadedBatch).toHaveBeenCalledWith([{ name: 'a.png', path: 'assets/a.png' }]);
  });

  it('rejects a second gesture while an upload is still in flight (paste during picker upload)', async () => {
    // The paste path has no disabled-button guard: without a re-entrancy
    // check, two overlapping batches would interleave their onUploadedBatch
    // callbacks and clobber each other's thumbnail refreshes.
    let resolveFirst;
    api.uploadTaskImage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ name: 'first.png', path: 'assets/first.png' });
        }),
    );
    api.uploadTaskImage.mockResolvedValue({ name: 'second.png', path: 'assets/second.png' });
    const onUploadedBatch = vi.fn();
    const textareaRef = { current: document.createElement('textarea') };
    document.body.appendChild(textareaRef.current);
    const { container } = renderAttach({ onUploadedBatch, textareaRef });

    const input = container.querySelector('[data-testid="task-image-input"]');
    // Start batch 1 (picker) — never resolves until we say so.
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([1])], 'first.png', { type: 'image/png' })],
      },
    });
    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledTimes(1));

    // Paste batch 2 while batch 1 is still uploading — must be rejected.
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    pasteEvent.clipboardData = {
      files: [new File([new Uint8Array([2])], 'second.png', { type: 'image/png' })],
    };
    textareaRef.current.dispatchEvent(pasteEvent);

    // Only the first file was uploaded; the paste was refused with a notice.
    expect(api.uploadTaskImage).toHaveBeenCalledTimes(1);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/already in progress/i);
    expect(onUploadedBatch).not.toHaveBeenCalled();

    // Let batch 1 finish — the batch callback fires once, normally.
    await act(async () => {
      resolveFirst();
    });
    await waitFor(() =>
      expect(onUploadedBatch).toHaveBeenCalledWith([
        { name: 'first.png', path: 'assets/first.png' },
      ]),
    );
    textareaRef.current.remove();
  });

  it('reports onUploadingChange true then false around a batch (submit guard)', async () => {
    const onUploadingChange = vi.fn();
    api.uploadTaskImage.mockResolvedValue({ name: 'a.png', path: 'assets/a.png' });
    const { container } = renderAttach({ onUploadingChange });
    const input = container.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onUploadingChange).toHaveBeenCalledWith(true));
    await waitFor(() => expect(onUploadingChange).toHaveBeenCalledWith(false));
    // Exactly one true and one false — no duplicate notifications.
    expect(onUploadingChange.mock.calls.filter(([v]) => v === true)).toHaveLength(1);
    expect(onUploadingChange.mock.calls.filter(([v]) => v === false)).toHaveLength(1);
  });
});
