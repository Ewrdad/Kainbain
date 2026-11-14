import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { MarkdownViewer, MermaidDiagram } from './MarkdownViewer';

// NOTE: this file deliberately does NOT mock 'mermaid'. The mocked suite
// (MarkdownViewer.mermaid.test.jsx) pins the render/fallback mechanics; this
// one pins the fail-safe against the REAL library: in a DOM without layout
// APIs (happy-dom/jsdom) mermaid cannot produce SVG, and the diagram must
// degrade to a readable source block — never a blank hole, never a crash.
// In a real browser the same code path renders inline SVG.

/***
 * MARK: MarkdownViewer mermaid real-library tests
 * @description Integration proof that a ```mermaid fence with the unmocked
 *   mermaid package either renders inline SVG or degrades to readable source,
 *   and that the rest of the document still renders around it.
 ***/

describe('MermaidDiagram with the real mermaid package', () => {
  it('renders SVG or falls back to source — never a blank hole', async () => {
    render(<MermaidDiagram code={'graph TD\nA-->B'} />);
    await waitFor(
      () => {
        expect(
          screen.queryByTestId('mermaid-diagram') || screen.queryByText('MERMAID'),
        ).toBeTruthy();
      },
      { timeout: 30000 },
    );
    const diagram = screen.queryByTestId('mermaid-diagram');
    if (diagram) {
      expect(diagram.innerHTML).toContain('<svg');
    } else {
      expect(screen.getByText('MERMAID')).toBeInTheDocument();
      expect(screen.getByText(/A-->B/)).toBeInTheDocument();
    }
  }, 40000);

  it('keeps the surrounding document intact around a mermaid fence', async () => {
    render(
      <MarkdownViewer
        content={'# Title line\n\n```mermaid\ngraph TD\nA-->B\n```\n\n\n\nafter the diagram'}
      />,
    );
    await waitFor(
      () => {
        expect(
          screen.queryByTestId('mermaid-diagram') || screen.queryByText('MERMAID'),
        ).toBeTruthy();
      },
      { timeout: 30000 },
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title line');
    expect(screen.getByText('after the diagram')).toBeInTheDocument();
  }, 40000);
});
