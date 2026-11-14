import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import {
  MarkdownViewer,
  MermaidDiagram,
  parseMarkdownBlocks,
} from './MarkdownViewer';

const { mermaidRender } = vi.hoisted(() => ({ mermaidRender: vi.fn() }));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: (...args) => mermaidRender(...args),
  },
}));

/***
 * MARK: MarkdownViewer mermaid tests
 * @description Pins pretty-task mermaid support: ```mermaid fences parse to
 *   `mermaid` blocks, render to inline SVG when the library resolves, and
 *   degrade to a readable MERMAID source block (never a blank hole) when
 *   rendering fails. A full pretty-task document renders every element.
 ***/

const PRETTY_GOAL = `# Fix the retry loop

## Context
Retries pile up when the worker stalls.

## Steps
1. Bound the attempts
2. Add backoff

\`\`\`js
const attempts = withRetry(fetchTask, { max: 3 });
\`\`\`

\`\`\`mermaid
graph TD
  A[fetch] --> B{ok?}
  B -->|yes| C[done]
  B -->|no| A
\`\`\`

![flow](assets/flow.png)
`;

describe('parseMarkdownBlocks mermaid fences', () => {
  it('parses a mermaid fence into a mermaid block carrying the diagram source', () => {
    const blocks = parseMarkdownBlocks('before\n```mermaid\ngraph TD\nA-->B\n```\nafter');
    const mermaid = blocks.filter((b) => b.type === 'mermaid');
    expect(mermaid).toHaveLength(1);
    expect(mermaid[0].code).toBe('graph TD\nA-->B');
  });

  it('keeps non-mermaid fences as code blocks with their language', () => {
    const blocks = parseMarkdownBlocks('```js\nconst x = 1;\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'code', language: 'js' });
  });

  it('treats an unclosed mermaid fence as a mermaid block so source is never lost', () => {
    const blocks = parseMarkdownBlocks('```mermaid\ngraph TD\nA-->B');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'mermaid', code: 'graph TD\nA-->B' });
  });
});

describe('MermaidDiagram', () => {
  beforeEach(() => {
    mermaidRender.mockReset();
  });

  it('renders the diagram as inline SVG when the library resolves', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg>pretty</svg>' });
    render(<MermaidDiagram code={'graph TD\nA-->B'} />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.innerHTML).toContain('<svg>pretty</svg>');
    expect(mermaidRender).toHaveBeenCalledWith(expect.any(String), 'graph TD\nA-->B');
  });

  it('degrades to a readable MERMAID source block when rendering fails', async () => {
    mermaidRender.mockRejectedValue(new Error('bad diagram'));
    render(<MermaidDiagram code={'graph TD\nA-->B'} />);
    expect(await screen.findByText('MERMAID')).toBeInTheDocument();
    expect(screen.getByText(/A-->B/)).toBeInTheDocument();
  });

  it('degrades to source when the library exposes no render function', async () => {
    mermaidRender.mockImplementation(() => {
      throw new Error('mermaid unavailable');
    });
    render(<MermaidDiagram code="sequenceDiagram\nA->>B: hi" />);
    expect(await screen.findByText('MERMAID')).toBeInTheDocument();
    expect(screen.getByText(/A->>B: hi/)).toBeInTheDocument();
  });
});

describe('MarkdownViewer pretty-task document', () => {
  beforeEach(() => {
    mermaidRender.mockReset();
  });

  it('renders headings, lists, code, mermaid SVG, and task images together', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg>flow</svg>' });
    render(<MarkdownViewer content={PRETTY_GOAL} projectId="proj-1" taskId="task-1" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fix the retry loop');
    expect(screen.getByRole('heading', { level: 2, name: 'Context' })).toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
    expect(await screen.findByTestId('mermaid-diagram')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'flow' }).getAttribute('src')).toBe(
      'http://localhost:3100/projects/proj-1/tasks/task-1/images/flow.png',
    );
  });

  it('keeps the diagram source readable when rendering fails mid-document', async () => {
    mermaidRender.mockRejectedValue(new Error('bad diagram'));
    render(<MarkdownViewer content={PRETTY_GOAL} projectId="proj-1" taskId="task-1" />);
    expect(await screen.findByText('MERMAID')).toBeInTheDocument();
    expect(screen.getAllByText(/B -->/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fix the retry loop');
  });
});
