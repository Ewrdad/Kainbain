import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../testUtils';
import { SystemGuideModal } from './SystemGuideModal';

describe('SystemGuideModal', () => {
  it('does not render when isSystemGuideOpen is false', () => {
    renderWithKainBain(<SystemGuideModal />, {
      isSystemGuideOpen: false,
    });
    expect(screen.queryByText(/System Transparency & User Guide/i)).not.toBeInTheDocument();
  });

  it('renders correctly when open and allows navigating between guide tabs', () => {
    const setIsSystemGuideOpen = vi.fn();
    renderWithKainBain(<SystemGuideModal />, {
      isSystemGuideOpen: true,
      setIsSystemGuideOpen,
    });

    expect(screen.getByText(/System Transparency & User Guide/i)).toBeInTheDocument();
    expect(screen.getByText(/System Architecture & Component Overview/i)).toBeInTheDocument();

    // Click on "Stages & Pipeline" tab
    const stagesTab = screen.getByRole('button', { name: /Stages & Pipeline/i });
    fireEvent.click(stagesTab);
    expect(screen.getByText(/Workflow Pipeline & Stage Types/i)).toBeInTheDocument();

    // Click on "Agent & Sandboxing" tab
    const agentTab = screen.getByRole('button', { name: /Agent & Sandboxing/i });
    fireEvent.click(agentTab);
    expect(
      screen.getByText(/Agent Execution, Tool Calls & Artifact Persistence/i),
    ).toBeInTheDocument();

    // Click on "Context Tokens" tab
    const tokensTab = screen.getByRole('button', { name: /Context Tokens/i });
    fireEvent.click(tokensTab);
    expect(screen.getByText(/Dynamic Context Tokens & Prompt Curation/i)).toBeInTheDocument();

    // Click on "Self-Deployment" tab
    const deployTab = screen.getByRole('button', { name: /Self-Deployment/i });
    fireEvent.click(deployTab);
    expect(screen.getByText(/Self-Deployment & Auto-Rollback Architecture/i)).toBeInTheDocument();

    // Close modal via close button
    const closeBtn = screen.getByRole('button', { name: /Close system guide/i });
    fireEvent.click(closeBtn);
    expect(setIsSystemGuideOpen).toHaveBeenCalledWith(false);
  });

  it('cross-links to the Docs knowledge base from the footer', () => {
    const setIsSystemGuideOpen = vi.fn();
    const setView = vi.fn();
    renderWithKainBain(<SystemGuideModal />, {
      isSystemGuideOpen: true,
      setIsSystemGuideOpen,
      setView,
    });

    fireEvent.click(screen.getByRole('button', { name: /Read more in Docs/i }));
    expect(setIsSystemGuideOpen).toHaveBeenCalledWith(false);
    expect(setView).toHaveBeenCalledWith('docs');
  });
});
