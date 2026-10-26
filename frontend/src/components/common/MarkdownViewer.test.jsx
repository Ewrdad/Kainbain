// jsdom pin: this suite needs assignable navigator.clipboard mock (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { MarkdownViewer, sanitizeUrl, highlightCode, parseInlineMarkdown } from './MarkdownViewer';

describe('MarkdownViewer Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders fallback placeholder when content is empty or null', () => {
    const { rerender } = render(<MarkdownViewer content="" />);
    expect(screen.getByText('No content provided.')).toBeInTheDocument();

    rerender(<MarkdownViewer content={null} />);
    expect(screen.getByText('No content provided.')).toBeInTheDocument();
  });

  it('renders all heading levels from H1 to H6', () => {
    const markdown = `
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
`;
    render(<MarkdownViewer content={markdown} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heading 1');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Heading 2');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Heading 3');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Heading 4');
    expect(screen.getByRole('heading', { level: 5 })).toHaveTextContent('Heading 5');
    expect(screen.getByRole('heading', { level: 6 })).toHaveTextContent('Heading 6');
  });

  it('renders inline styles: bold, italic, strikethrough, and inline code', () => {
    const markdown =
      'This has **bold text**, *italic text*, ~~deleted text~~, and `const x = 10;`.';
    render(<MarkdownViewer content={markdown} />);

    expect(screen.getByText('bold text')).toBeInTheDocument();
    expect(screen.getByText('bold text').tagName).toBe('STRONG');

    expect(screen.getByText('italic text')).toBeInTheDocument();
    expect(screen.getByText('italic text').tagName).toBe('EM');

    expect(screen.getByText('deleted text')).toBeInTheDocument();
    expect(screen.getByText('deleted text').tagName).toBe('DEL');

    expect(screen.getByText('const x = 10;')).toBeInTheDocument();
    expect(screen.getByText('const x = 10;').tagName).toBe('CODE');
  });

  it('renders bullet and numbered lists', () => {
    const markdown = `
- Bullet item 1
- Bullet item 2
* Bullet item 3

1. Numbered item 1
2. Numbered item 2
`;
    render(<MarkdownViewer content={markdown} />);

    expect(screen.getByText('Bullet item 1')).toBeInTheDocument();
    expect(screen.getByText('Bullet item 2')).toBeInTheDocument();
    expect(screen.getByText('Bullet item 3')).toBeInTheDocument();

    expect(screen.getByText('Numbered item 1')).toBeInTheDocument();
    expect(screen.getByText('Numbered item 2')).toBeInTheDocument();
  });

  it('renders blockquotes and horizontal rules', () => {
    const markdown = `
> This is a blockquote notification.

---

> Another quote.
`;
    const { container } = render(<MarkdownViewer content={markdown} />);

    expect(screen.getByText('This is a blockquote notification.')).toBeInTheDocument();
    expect(container.querySelector('blockquote')).toBeInTheDocument();
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('renders tables with headers and rows', () => {
    const markdown = `
| Stage | Status | Duration |
|---|---|---|
| Discovery | Complete | 120s |
| Implementation | Active | 45s |
`;
    render(<MarkdownViewer content={markdown} />);

    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Discovery')).toBeInTheDocument();
    expect(screen.getByText('Implementation')).toBeInTheDocument();
    expect(screen.getByText('120s')).toBeInTheDocument();
  });

  it('renders fenced code blocks with language badge and copy action', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const markdown = '```typescript\nconst message = "hello world";\n```';
    render(<MarkdownViewer content={markdown} />);

    expect(screen.getByText('TYPESCRIPT')).toBeInTheDocument();
    expect(screen.getByText('const')).toBeInTheDocument();
    expect(screen.getByText('"hello world"')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: /Copy code block/i });
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('const message = "hello world";');
    expect(screen.getByText('Copied ✓')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('renders secure links with target="_blank" and rel="noopener noreferrer"', () => {
    const markdown = '[Documentation](https://example.com/docs)';
    render(<MarkdownViewer content={markdown} />);

    const link = screen.getByRole('link', { name: 'Documentation' });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sanitizes unsafe javascript: URLs to prevent XSS', () => {
    expect(sanitizeUrl('javascript:alert("xss")')).toBe('#');
    expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe('#');
    expect(sanitizeUrl('vbscript:msgbox("xss")')).toBe('#');
    expect(sanitizeUrl('https://valid.com')).toBe('https://valid.com');

    const markdown = '[Malicious Link](javascript:alert("pwned"))';
    render(<MarkdownViewer content={markdown} />);

    const link = screen.getByRole('link', { name: 'Malicious Link' });
    expect(link).toHaveAttribute('href', '#');
  });

  it('escapes raw HTML tags so they are rendered as safe text without injection', () => {
    const markdown =
      'Normal text with <script>alert("xss")</script> and <img src=x onerror=alert(1) />.';
    const { container } = render(<MarkdownViewer content={markdown} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeInTheDocument();
  });
});

describe('MarkdownViewer task images', () => {
  it('renders task-asset image references as resolved <img> elements', () => {
    render(
      <MarkdownViewer content="![the shot](assets/shot.png)" projectId="proj-1" taskId="task-1" />,
    );
    const img = screen.getByRole('img', { name: 'the shot' });
    // API base resolves from frontend/.env (dev: http://localhost:3100;
    // production builds bake '' for same-origin serving).
    expect(img.getAttribute('src')).toBe(
      'http://localhost:3100/projects/proj-1/tasks/task-1/images/shot.png',
    );
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('leaves absolute http(s) image sources untouched', () => {
    render(
      <MarkdownViewer
        content="![remote](https://example.com/pic.png)"
        projectId="proj-1"
        taskId="task-1"
      />,
    );
    expect(screen.getByRole('img', { name: 'remote' }).getAttribute('src')).toBe(
      'https://example.com/pic.png',
    );
  });

  it('keeps relative sources as-is without task context (legacy behavior)', () => {
    render(<MarkdownViewer content="![local](assets/shot.png)" />);
    expect(screen.getByRole('img', { name: 'local' }).getAttribute('src')).toBe('assets/shot.png');
  });

  it('renders neutralized XSS image URLs as inert text, never an <img>', () => {
    const { container } = render(
      <MarkdownViewer
        content="![xss](javascript:alert(1)) and ![data](data:image/png;base64,AAAA)"
        projectId="proj-1"
        taskId="task-1"
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText(/blocked URL/)).toHaveLength(2);
  });

  it('falls back to an unavailable chip when the image fails to load', () => {
    const { container } = render(
      <MarkdownViewer content="![broken](assets/gone.png)" projectId="proj-1" taskId="task-1" />,
    );
    const img = container.querySelector('img[alt="broken"]');
    fireEvent.error(img);
    expect(container.querySelector('img[alt="broken"]')).toBeNull();
    expect(screen.getByText(/gone.png \(image unavailable\)/)).toBeInTheDocument();
  });

  it('resolves image references inside lists, tables, and headings', () => {
    render(
      <MarkdownViewer
        content={
          '- ![in list](assets/list.png)\n\n| before | after |\n| --- | --- |\n| ![in table](assets/table.png) | text |'
        }
        projectId="proj-1"
        taskId="task-2"
      />,
    );
    expect(screen.getByRole('img', { name: 'in list' }).getAttribute('src')).toContain(
      '/tasks/task-2/images/list.png',
    );
    expect(screen.getByRole('img', { name: 'in table' }).getAttribute('src')).toContain(
      '/tasks/task-2/images/table.png',
    );
  });
});

describe('parseInlineMarkdown image resolution seam', () => {
  it('exposes the resolution purely through parseInlineMarkdown for tests', () => {
    const { container } = render(
      React.createElement(
        'div',
        null,
        parseInlineMarkdown('![a](assets/a.png)', {
          apiBase: 'http://api.test',
          projectId: 'p',
          taskId: 't',
        }),
      ),
    );
    expect(container.querySelector('img').getAttribute('src')).toBe(
      'http://api.test/projects/p/tasks/t/images/a.png',
    );
  });
});

/***
 * MARK: MarkdownViewer scroll container (WCAG 2.1.1)
 * @description `overflow-x: hidden` makes the viewer a scroll container on
 *   the cross axis, which axe flags as a scrollable region with no keyboard
 *   access. `overflow-x: clip` keeps the same visual clipping without
 *   creating the region.
 ***/
describe('MarkdownViewer scroll container', () => {
  it('clips overflow without becoming a focus-less scroll region', () => {
    const { container } = render(<MarkdownViewer content={'# Title'} />);
    const root = container.querySelector('.markdown-viewer');
    expect(root.className).toContain('overflow-x-clip');
    expect(root.className).not.toContain('overflow-x-hidden');
  });
});
