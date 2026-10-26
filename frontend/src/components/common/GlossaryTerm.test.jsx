import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GlossaryTerm } from './GlossaryTerm';

describe('GlossaryTerm (WCAG 3.1.3 / 3.1.4)', () => {
  it('exposes the expansion and definition through the accessible title', () => {
    render(
      <GlossaryTerm
        term="LLM"
        expansion="Large Language Model"
        definition="An AI model trained on text."
      />,
    );
    const term = screen.getByTestId('glossary-LLM');
    expect(term.tagName.toLowerCase()).toBe('abbr');
    expect(term).toHaveTextContent('LLM');
    expect(term).toHaveAttribute('title', 'Large Language Model — An AI model trained on text.');
  });

  it('renders children as the visible text when provided', () => {
    render(
      <GlossaryTerm term="RAG" expansion="Retrieval-Augmented Generation">
        RAG pipeline
      </GlossaryTerm>,
    );
    expect(screen.getByTestId('glossary-RAG')).toHaveTextContent('RAG pipeline');
  });

  it('never renders an empty title (no phantom tooltip)', () => {
    render(<GlossaryTerm term="API" />);
    expect(screen.getByTestId('glossary-API')).not.toHaveAttribute('title');
  });
});
