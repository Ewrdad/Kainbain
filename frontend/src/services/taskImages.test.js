// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  resolveTaskImageUrl,
  resolveTaskAttachmentUrl,
  taskImageRequests,
  taskAttachmentRequests,
  taskContextFromFilePath,
  isImageFile,
  isAttachmentFile,
  attachmentKindFor,
  appendImageMarkdown,
  appendImagesMarkdown,
  appendAttachmentMarkdown,
  appendAttachmentsMarkdown,
  removeImageMarkdown,
  removeAttachmentMarkdown,
  extractImageRefs,
  extractFileRefs,
} from './taskImages';

describe('resolveTaskImageUrl', () => {
  it('rewrites relative asset paths to the raw task image endpoint', () => {
    expect(
      resolveTaskImageUrl({
        apiBase: 'http://localhost:3100',
        projectId: 'p1',
        taskId: 't1',
        src: 'assets/shot.png',
      }),
    ).toBe('http://localhost:3100/projects/p1/tasks/t1/images/shot.png');
  });

  it('tolerates ./ and / prefixed asset paths and fuller task-folder prefixes', () => {
    const cases = ['./assets/a.png', '/assets/a.png', 'docs/tasks/t1/assets/a.png'];
    for (const src of cases) {
      expect(
        resolveTaskImageUrl({ projectId: 'p', taskId: 't', src }),
      ).toBe('/projects/p/tasks/t/images/a.png');
    }
  });

  it('passes absolute http(s) URLs through untouched', () => {
    expect(
      resolveTaskImageUrl({
        projectId: 'p',
        taskId: 't',
        src: 'https://example.com/x.png',
      }),
    ).toBe('https://example.com/x.png');
    expect(
      resolveTaskImageUrl({
        projectId: 'p',
        taskId: 't',
        src: '//cdn.example.com/x.png',
      }),
    ).toBe('//cdn.example.com/x.png');
  });

  it('leaves protocol URLs (data:, javascript:) untouched for the sanitizer to block', () => {
    expect(
      resolveTaskImageUrl({ projectId: 'p', taskId: 't', src: 'data:image/png;base64,AA' }),
    ).toBe('data:image/png;base64,AA');
    expect(
      resolveTaskImageUrl({ projectId: 'p', taskId: 't', src: 'javascript:alert(1)' }),
    ).toBe('javascript:alert(1)');
  });

  it('returns non-asset relative paths unchanged', () => {
    expect(
      resolveTaskImageUrl({ projectId: 'p', taskId: 't', src: 'src/logo.svg' }),
    ).toBe('src/logo.svg');
  });

  it('returns the source as-is when task context is missing', () => {
    expect(resolveTaskImageUrl({ src: 'assets/a.png' })).toBe('assets/a.png');
    expect(resolveTaskImageUrl({ projectId: 'p', src: 'assets/a.png' })).toBe(
      'assets/a.png',
    );
  });

  it('handles empty and non-string sources', () => {
    expect(resolveTaskImageUrl({ projectId: 'p', taskId: 't', src: '' })).toBe('');
    expect(resolveTaskImageUrl({ projectId: 'p', taskId: 't', src: null })).toBe('');
    expect(resolveTaskImageUrl({})).toBe('');
  });

  it('encodes unsafe characters in names and ids', () => {
    expect(
      resolveTaskImageUrl({
        projectId: 'p',
        taskId: 't',
        src: 'assets/my image (1).png',
      }),
    ).toBe('/projects/p/tasks/t/images/my%20image%20(1).png');
  });

  it('resolves the reported numeric-attachment shapes to the image endpoint', () => {
    // Field refs from the "images randomly not loading" report: purely
    // numeric names must resolve exactly like descriptive ones.
    for (const name of ['18744.png', '18741.png', '18850.png', 'image-2.png']) {
      expect(
        resolveTaskImageUrl({ projectId: 'p', taskId: 't', src: `assets/${name}` }),
      ).toBe(`/projects/p/tasks/t/images/${name}`);
    }
  });

  it('strips a trailing quoted title before resolving', () => {
    expect(
      resolveTaskImageUrl({ projectId: 'p', taskId: 't', src: 'assets/a.png "the shot"' }),
    ).toBe('/projects/p/tasks/t/images/a.png');
  });
});

describe('taskImageRequests', () => {
  it('uploads files as multipart form data without a JSON content type', async () => {
    const request = vi.fn().mockResolvedValue({ name: 'a.png' });
    const requests = taskImageRequests(request);
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    await requests.uploadTaskImage('p1', 't1', file);

    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/projects/p1/tasks/t1/images');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    // jsdom wraps File entries in its own realm: compare by identity marker (name).
    expect(options.body.get('image').name).toBe('a.png');
  });

  it('lists and removes images with the expected paths', async () => {
    const request = vi.fn().mockResolvedValue({});
    const requests = taskImageRequests(request);
    await requests.listTaskImages('p1', 't1');
    await requests.deleteTaskImage('p1', 't1', 'a.png');

    expect(request.mock.calls[0][0]).toBe('/projects/p1/tasks/t1/images');
    expect(request.mock.calls[1][0]).toBe('/projects/p1/tasks/t1/images/a.png');
    expect(request.mock.calls[1][1].method).toBe('DELETE');
  });

  it('encodes image names in remove paths', async () => {
    const request = vi.fn().mockResolvedValue({});
    const requests = taskImageRequests(request);
    await requests.deleteTaskImage('p1', 't1', 'my image.png');
    expect(request.mock.calls[0][0]).toBe(
      '/projects/p1/tasks/t1/images/my%20image.png',
    );
  });
});

describe('appendImageMarkdown', () => {
  it('appends the reference on its own line at the end', () => {
    expect(appendImageMarkdown('Fix it', { name: 'a.png', path: 'assets/a.png' })).toBe(
      'Fix it\n\n![a.png](assets/a.png)\n',
    );
  });

  it('handles drafts ending with one or two newlines without extra blank lines', () => {
    expect(appendImageMarkdown('Goal text\n', { name: 'e.png', path: 'assets/e.png' })).toBe(
      'Goal text\n\n![e.png](assets/e.png)\n',
    );
    expect(appendImageMarkdown('Goal text\n\n', { name: 'e.png', path: 'assets/e.png' })).toBe(
      'Goal text\n\n![e.png](assets/e.png)\n',
    );
  });

  it('starts a bare reference for an empty draft', () => {
    expect(appendImageMarkdown('', { name: 'f.png', path: 'assets/f.png' })).toBe(
      '![f.png](assets/f.png)\n',
    );
  });

  it('falls back to a generic alt and ignores imageless uploads', () => {
    expect(appendImageMarkdown('Fix it', { path: 'assets/x.png' })).toBe(
      'Fix it\n\n![image](assets/x.png)\n',
    );
    expect(appendImageMarkdown('Fix it', {})).toBe('Fix it');
    expect(appendImageMarkdown('Fix it', null)).toBe('Fix it');
    expect(appendImageMarkdown(null, {})).toBe('');
  });

  it('keeps hostile filenames on one line inside the image syntax', () => {
    expect(appendImageMarkdown('Fix it', { name: 'a](x)\n![evil', path: 'assets/a.png' })).toBe(
      'Fix it\n\n![a (x) ! evil](assets/a.png)\n',
    );
    expect(appendImageMarkdown('Fix it', { name: 'a.png', path: '  ' })).toBe('Fix it');
  });

  it('strips parens, quotes, and newlines from the destination so a hostile path cannot break out', () => {
    // Defense in depth: backend sanitizeImageName already flattens names, but
    // a crafted/legacy stored path must not be able to close the `(...)`
    // destination early and inject arbitrary markdown.
    expect(
      appendImageMarkdown('Fix it', { name: 'a.png', path: 'assets/a.png) ![evil](x' }),
    ).toBe('Fix it\n\n![a.png](assets/a.png  ![evil] x)\n');
    expect(
      appendImageMarkdown('Fix it', { name: 'a.png', path: 'assets/a".png\n![injected](y)' }),
    ).toBe('Fix it\n\n![a.png](assets/a .png ![injected] y)\n');
    // A path reduced to nothing usable is skipped entirely.
    expect(appendImageMarkdown('Fix it', { name: 'a.png', path: '()' })).toBe('Fix it');
  });
});

describe('appendImagesMarkdown', () => {
  const batch = [
    { name: 'a.png', path: 'assets/a.png' },
    { name: 'b.png', path: 'assets/b.png' },
    { name: 'c.png', path: 'assets/c.png' },
  ];

  it('appends each image on its own line, in order', () => {
    expect(appendImagesMarkdown('Fix it', batch)).toBe(
      'Fix it\n\n![a.png](assets/a.png)\n\n![b.png](assets/b.png)\n\n![c.png](assets/c.png)\n',
    );
  });

  it('starts from a bare reference for an empty draft', () => {
    expect(appendImagesMarkdown('', batch.slice(0, 2))).toBe(
      '![a.png](assets/a.png)\n\n![b.png](assets/b.png)\n',
    );
  });

  it('handles drafts ending with newlines without extra blank lines', () => {
    expect(appendImagesMarkdown('Goal text\n', batch.slice(0, 1))).toBe(
      'Goal text\n\n![a.png](assets/a.png)\n',
    );
  });

  it('skips entries without a usable path', () => {
    expect(
      appendImagesMarkdown('Fix it', [{ name: 'a.png', path: 'assets/a.png' }, {}, null]),
    ).toBe('Fix it\n\n![a.png](assets/a.png)\n');
  });

  it('returns the draft unchanged for an empty or invalid batch', () => {
    expect(appendImagesMarkdown('Fix it', [])).toBe('Fix it');
    expect(appendImagesMarkdown('Fix it', null)).toBe('Fix it');
    expect(appendImagesMarkdown('Fix it', undefined)).toBe('Fix it');
    expect(appendImagesMarkdown(null, [])).toBe('');
  });
});

describe('removeImageMarkdown', () => {
  it('strips the removed image line and restores the draft', () => {
    expect(removeImageMarkdown('Fix it\n\n![a.png](assets/a.png)\n', 'a.png')).toBe('Fix it');
  });

  it('keeps other images and surrounding text', () => {
    const draft = 'See this\n\n![a.png](assets/a.png)\n\n![b.png](assets/b.png)\n';
    expect(removeImageMarkdown(draft, 'a.png', 'assets/a.png')).toBe(
      'See this\n\n![b.png](assets/b.png)',
    );
  });

  it('strips hand-edited alt text by basename', () => {
    expect(
      removeImageMarkdown('Fix it\n\n![screenshot of the bug](assets/a.png)\n', 'a.png'),
    ).toBe('Fix it');
  });

  it('strips refs carrying a trailing title', () => {
    expect(
      removeImageMarkdown('Fix it\n\n![a](assets/a.png "shot")\n', 'a.png'),
    ).toBe('Fix it');
  });

  it('leaves unrelated image refs and plain text alone', () => {
    expect(removeImageMarkdown('Fix it ![a.png](assets/a.png) inline', 'a.png')).toBe(
      'Fix it ![a.png](assets/a.png) inline',
    );
    expect(removeImageMarkdown('Fix it', 'a.png')).toBe('Fix it');
    expect(removeImageMarkdown('', 'a.png')).toBe('');
    expect(removeImageMarkdown(null, 'a.png')).toBe('');
  });
});

describe('extractImageRefs', () => {
  it('collects image references in order', () => {
    expect(extractImageRefs('See ![a](assets/a.png) and ![b](assets/b.png)')).toEqual([
      { alt: 'a', src: 'assets/a.png' },
      { alt: 'b', src: 'assets/b.png' },
    ]);
  });

  it('returns an empty list for text without images', () => {
    expect(extractImageRefs('Just feedback')).toEqual([]);
    expect(extractImageRefs('')).toEqual([]);
    expect(extractImageRefs(null)).toEqual([]);
  });

  it('tolerates spaced paths and trailing titles', () => {
    expect(extractImageRefs('See ![shot](assets/my shot.png)')).toEqual([
      { alt: 'shot', src: 'assets/my shot.png' },
    ]);
    expect(extractImageRefs('See ![a](assets/a.png "title")')).toEqual([
      { alt: 'a', src: 'assets/a.png' },
    ]);
    expect(extractImageRefs('See ![a](<assets/my shot.png>)')).toEqual([
      { alt: 'a', src: 'assets/my shot.png' },
    ]);
  });
});

describe('isImageFile', () => {
  it('accepts uploadable image extensions case-insensitively', () => {
    expect(isImageFile({ name: 'a.png' })).toBe(true);
    expect(isImageFile({ name: 'a.PNG' })).toBe(true);
    expect(isImageFile({ name: 'a.jpeg' })).toBe(true);
    expect(isImageFile({ name: 'a.jpg' })).toBe(true);
    expect(isImageFile({ name: 'a.gif' })).toBe(true);
    expect(isImageFile({ name: 'a.webp' })).toBe(true);
  });

  it('rejects other file types and malformed inputs', () => {
    expect(isImageFile({ name: 'a.svg' })).toBe(false);
    expect(isImageFile({ name: 'a.txt' })).toBe(false);
    expect(isImageFile({ name: '' })).toBe(false);
    expect(isImageFile(null)).toBe(false);
    expect(isImageFile({})).toBe(false);
  });
});

describe('isAttachmentFile', () => {
  it('accepts every generalized attachment class case-insensitively', () => {
    for (const name of [
      'a.png',
      'out.LOG',
      'notes.Txt',
      'doc.md',
      'data.json',
      'rows.csv',
      'run.diff',
      'paper.PDF',
      'slides.pptx',
      'backup.zip',
      'clip.mp4',
      'voice.mp3',
      'page.HTML',
      'diagram.SVG',
    ]) {
      expect(isAttachmentFile({ name })).toBe(true);
    }
  });

  it('rejects executables, scripts, and malformed inputs', () => {
    expect(isAttachmentFile({ name: 'run.sh' })).toBe(false);
    expect(isAttachmentFile({ name: 'app.js' })).toBe(false);
    expect(isAttachmentFile({ name: 'setup.exe' })).toBe(false);
    expect(isAttachmentFile({ name: 'nope.heic' })).toBe(false);
    expect(isAttachmentFile({ name: 'extensionless' })).toBe(false);
    expect(isAttachmentFile({ name: '' })).toBe(false);
    expect(isAttachmentFile(null)).toBe(false);
    expect(isAttachmentFile({})).toBe(false);
  });
});

describe('attachmentKindFor', () => {
  it('classifies images, files, and disallowed names', () => {
    expect(attachmentKindFor('shot.png')).toBe('image');
    expect(attachmentKindFor('assets/shot.png')).toBe('image');
    expect(attachmentKindFor('server.log')).toBe('file');
    expect(attachmentKindFor('assets/out.LOG')).toBe('file');
    expect(attachmentKindFor('run.sh')).toBeNull();
    expect(attachmentKindFor('')).toBeNull();
    expect(attachmentKindFor(null)).toBeNull();
  });
});

describe('resolveTaskAttachmentUrl', () => {
  it('rewrites relative asset paths to the task attachment endpoint', () => {
    expect(
      resolveTaskAttachmentUrl({
        apiBase: 'http://localhost:3100',
        projectId: 'p1',
        taskId: 't1',
        src: 'assets/out.log',
      }),
    ).toBe('http://localhost:3100/projects/p1/tasks/t1/attachments/out.log');
  });

  it('tolerates ./ and / prefixed asset paths and fuller task-folder prefixes', () => {
    const cases = ['./assets/o.log', '/assets/o.log', 'docs/tasks/t1/assets/o.log'];
    for (const src of cases) {
      expect(
        resolveTaskAttachmentUrl({ projectId: 'p', taskId: 't', src }),
      ).toBe('/projects/p/tasks/t/attachments/o.log');
    }
  });

  it('passes absolute http(s) URLs through untouched', () => {
    expect(
      resolveTaskAttachmentUrl({
        projectId: 'p',
        taskId: 't',
        src: 'https://example.com/o.log',
      }),
    ).toBe('https://example.com/o.log');
  });

  it('leaves protocol URLs (data:, javascript:) untouched for the sanitizer to block', () => {
    expect(
      resolveTaskAttachmentUrl({ projectId: 'p', taskId: 't', src: 'javascript:alert(1)' }),
    ).toBe('javascript:alert(1)');
  });

  it('returns non-asset relative paths unchanged', () => {
    expect(
      resolveTaskAttachmentUrl({ projectId: 'p', taskId: 't', src: 'src/logo.svg' }),
    ).toBe('src/logo.svg');
  });

  it('returns the source as-is when task context is missing', () => {
    expect(resolveTaskAttachmentUrl({ src: 'assets/o.log' })).toBe('assets/o.log');
    expect(resolveTaskAttachmentUrl({ projectId: 'p', src: 'assets/o.log' })).toBe(
      'assets/o.log',
    );
  });

  it('handles empty and non-string sources', () => {
    expect(resolveTaskAttachmentUrl({ projectId: 'p', taskId: 't', src: '' })).toBe('');
    expect(resolveTaskAttachmentUrl({ projectId: 'p', taskId: 't', src: null })).toBe('');
    expect(resolveTaskAttachmentUrl({})).toBe('');
  });

  it('encodes unsafe characters in names and ids', () => {
    expect(
      resolveTaskAttachmentUrl({
        projectId: 'p',
        taskId: 't',
        src: 'assets/my run (1).log',
      }),
    ).toBe('/projects/p/tasks/t/attachments/my%20run%20(1).log');
  });
});

describe('taskAttachmentRequests', () => {
  it('uploads files as multipart form data under the file field', async () => {
    const request = vi.fn().mockResolvedValue({ name: 'o.log' });
    const requests = taskAttachmentRequests(request);
    const file = new File([new Uint8Array([1, 2, 3])], 'o.log', { type: 'text/plain' });
    await requests.uploadTaskAttachment('p1', 't1', file);

    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/projects/p1/tasks/t1/attachments');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file').name).toBe('o.log');
  });

  it('lists and removes attachments with the expected paths', async () => {
    const request = vi.fn().mockResolvedValue({});
    const requests = taskAttachmentRequests(request);
    await requests.listTaskAttachments('p1', 't1');
    await requests.deleteTaskAttachment('p1', 't1', 'o.log');

    expect(request.mock.calls[0][0]).toBe('/projects/p1/tasks/t1/attachments');
    expect(request.mock.calls[1][0]).toBe('/projects/p1/tasks/t1/attachments/o.log');
    expect(request.mock.calls[1][1].method).toBe('DELETE');
  });

  it('encodes attachment names in remove paths', async () => {
    const request = vi.fn().mockResolvedValue({});
    const requests = taskAttachmentRequests(request);
    await requests.deleteTaskAttachment('p1', 't1', 'my run.log');
    expect(request.mock.calls[0][0]).toBe(
      '/projects/p1/tasks/t1/attachments/my%20run.log',
    );
  });
});

describe('appendAttachmentMarkdown', () => {
  it('appends a plain link for a non-image attachment', () => {
    expect(appendAttachmentMarkdown('Fix it', { name: 'o.log', path: 'assets/o.log' })).toBe(
      'Fix it\n\n[o.log](assets/o.log)\n',
    );
  });

  it('keeps the exact image form for image assets', () => {
    expect(appendAttachmentMarkdown('Fix it', { name: 'a.png', path: 'assets/a.png' })).toBe(
      'Fix it\n\n![a.png](assets/a.png)\n',
    );
  });

  it('starts a bare link for an empty draft and falls back to a generic label', () => {
    expect(appendAttachmentMarkdown('', { name: 'o.log', path: 'assets/o.log' })).toBe(
      '[o.log](assets/o.log)\n',
    );
    expect(appendAttachmentMarkdown('Fix it', { path: 'assets/o.log' })).toBe(
      'Fix it\n\n[file](assets/o.log)\n',
    );
  });

  it('ignores assets without a usable path', () => {
    expect(appendAttachmentMarkdown('Fix it', { name: 'o.log' })).toBe('Fix it');
    expect(appendAttachmentMarkdown('Fix it', null)).toBe('Fix it');
    expect(appendAttachmentMarkdown(null, {})).toBe('');
  });

  it('keeps hostile filenames on one line inside the link syntax', () => {
    expect(appendAttachmentMarkdown('Fix it', { name: 'o](x)\n[evil', path: 'assets/o.log' })).toBe(
      'Fix it\n\n[o (x) evil](assets/o.log)\n',
    );
    expect(
      appendAttachmentMarkdown('Fix it', { name: 'o.log', path: 'assets/o.log) [evil](x' }),
    ).toBe('Fix it\n\n[o.log](assets/o.log  [evil] x)\n');
    expect(appendAttachmentMarkdown('Fix it', { name: 'o.log', path: '()' })).toBe('Fix it');
  });
});

describe('appendAttachmentsMarkdown', () => {
  const batch = [
    { name: 'a.png', path: 'assets/a.png' },
    { name: 'o.log', path: 'assets/o.log' },
  ];

  it('appends images and files in order, each in its own form', () => {
    expect(appendAttachmentsMarkdown('Fix it', batch)).toBe(
      'Fix it\n\n![a.png](assets/a.png)\n\n[o.log](assets/o.log)\n',
    );
  });

  it('matches the image-only fold for image batches', () => {
    const images = [
      { name: 'a.png', path: 'assets/a.png' },
      { name: 'b.png', path: 'assets/b.png' },
    ];
    expect(appendAttachmentsMarkdown('Fix it', images)).toBe(
      appendImagesMarkdown('Fix it', images),
    );
  });

  it('skips entries without a usable path and handles empty batches', () => {
    expect(
      appendAttachmentsMarkdown('Fix it', [{ name: 'o.log', path: 'assets/o.log' }, {}, null]),
    ).toBe('Fix it\n\n[o.log](assets/o.log)\n');
    expect(appendAttachmentsMarkdown('Fix it', [])).toBe('Fix it');
    expect(appendAttachmentsMarkdown('Fix it', null)).toBe('Fix it');
    expect(appendAttachmentsMarkdown(null, [])).toBe('');
  });
});

describe('removeAttachmentMarkdown', () => {
  it('strips a removed file link and restores the draft', () => {
    expect(removeAttachmentMarkdown('Fix it\n\n[o.log](assets/o.log)\n', 'o.log')).toBe('Fix it');
  });

  it('strips image lines exactly like the image-only remover', () => {
    const draft = 'See this\n\n![a.png](assets/a.png)\n\n![b.png](assets/b.png)\n';
    expect(removeAttachmentMarkdown(draft, 'a.png', 'assets/a.png')).toBe(
      removeImageMarkdown(draft, 'a.png', 'assets/a.png'),
    );
  });

  it('keeps other attachments and surrounding text', () => {
    const draft = 'See this\n\n[o.log](assets/o.log)\n\n![a.png](assets/a.png)\n';
    expect(removeAttachmentMarkdown(draft, 'o.log', 'assets/o.log')).toBe(
      'See this\n\n![a.png](assets/a.png)',
    );
  });

  it('strips hand-edited labels by basename and tolerates titles', () => {
    expect(
      removeAttachmentMarkdown('Fix it\n\n[the run log](assets/o.log)\n', 'o.log'),
    ).toBe('Fix it');
    expect(
      removeAttachmentMarkdown('Fix it\n\n[o](assets/o.log "run")\n', 'o.log'),
    ).toBe('Fix it');
  });

  it('leaves unrelated refs, inline links, and plain text alone', () => {
    expect(removeAttachmentMarkdown('Fix it [o.log](assets/o.log) inline', 'o.log')).toBe(
      'Fix it [o.log](assets/o.log) inline',
    );
    expect(removeAttachmentMarkdown('Fix it', 'o.log')).toBe('Fix it');
    expect(removeAttachmentMarkdown('', 'o.log')).toBe('');
    expect(removeAttachmentMarkdown(null, 'o.log')).toBe('');
  });
});

describe('extractFileRefs', () => {
  it('collects link references in order', () => {
    expect(extractFileRefs('See [run log](assets/o.log) and [notes](assets/n.txt)')).toEqual([
      { label: 'run log', src: 'assets/o.log' },
      { label: 'notes', src: 'assets/n.txt' },
    ]);
  });

  it('excludes image references', () => {
    expect(extractFileRefs('See ![a](assets/a.png) and [o](assets/o.log)')).toEqual([
      { label: 'o', src: 'assets/o.log' },
    ]);
  });

  it('returns an empty list for text without links', () => {
    expect(extractFileRefs('Just feedback')).toEqual([]);
    expect(extractFileRefs('')).toEqual([]);
    expect(extractFileRefs(null)).toEqual([]);
  });

  it('tolerates spaced paths and trailing titles', () => {
    expect(extractFileRefs('See [run](assets/my run.log)')).toEqual([
      { label: 'run', src: 'assets/my run.log' },
    ]);
    expect(extractFileRefs('See [o](assets/o.log "title")')).toEqual([
      { label: 'o', src: 'assets/o.log' },
    ]);
  });
});
describe('taskContextFromFilePath', () => {
  it('derives the task context from a task.md path with the default docs folder', () => {
    expect(taskContextFromFilePath('docs/tasks/t-1/task.md', { id: 'p1' })).toEqual({
      projectId: 'p1',
      taskId: 't-1',
    });
  });

  it('derives the context for any file inside the task folder (reports, assets)', () => {
    expect(taskContextFromFilePath('docs/tasks/t-1/stage-1-report.md', { id: 'p1' })).toEqual({
      projectId: 'p1',
      taskId: 't-1',
    });
    expect(taskContextFromFilePath('docs/tasks/t-1/assets/a.png', { id: 'p1' })).toEqual({
      projectId: 'p1',
      taskId: 't-1',
    });
  });

  it('honours a custom docsDirName and tolerates leading ./ or /', () => {
    expect(
      taskContextFromFilePath('./k-docs/tasks/t-9/task.md', { id: 'p1', docsDirName: 'k-docs' }),
    ).toEqual({ projectId: 'p1', taskId: 't-9' });
    // The default name no longer matches when a custom one is configured.
    expect(taskContextFromFilePath('docs/tasks/t-9/task.md', { id: 'p1', docsDirName: 'k-docs' })).toBeNull();
  });

  it('returns null outside task folders, for task-listing paths, and without a project', () => {
    expect(taskContextFromFilePath('README.md', { id: 'p1' })).toBeNull();
    expect(taskContextFromFilePath('docs/tasks', { id: 'p1' })).toBeNull();
    expect(taskContextFromFilePath('docs/tasks/t-1/task.md', null)).toBeNull();
    expect(taskContextFromFilePath('', { id: 'p1' })).toBeNull();
    expect(taskContextFromFilePath('docs/tasks/../task.md', { id: 'p1' })).toBeNull();
  });

  it('escapes regex metacharacters in a custom docs folder name', () => {
    expect(
      taskContextFromFilePath('k.docs/tasks/t-2/task.md', { id: 'p1', docsDirName: 'k.docs' }),
    ).toEqual({ projectId: 'p1', taskId: 't-2' });
    // A name that would be a regex wildcard must not match other folders.
    expect(taskContextFromFilePath('kXdocs/tasks/t-2/task.md', { id: 'p1', docsDirName: 'k.docs' })).toBeNull();
  });
});
