import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ProjectBasicsSection } from './ProjectBasicsSection';
import '@testing-library/jest-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      updateProject: vi.fn(),
      getModels: vi.fn().mockResolvedValue({ models: [], harnesses: [] }),
    },
  };
});

vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn() },
}));

/***
 * MARK: ProjectBasicsSection tests
 * @description Verifies the extracted Project Details section renders the
 *   name input, harness/model controls, accent picker, and hide toggle, and
 *   calls its handlers on change.
 ***/
describe('ProjectBasicsSection', () => {
  const baseProps = {
    projectName: 'Project A',
    setProjectName: vi.fn(),
    models: [],
    labeledHarnesses: [{ id: 'pi', label: 'pi (default)' }],
    defaultModel: '',
    onDefaultModelChange: vi.fn(),
    effectiveHarnessId: 'pi',
    handleHarnessChange: vi.fn(),
    refreshing: false,
    refresh: vi.fn(),
    isHarnessDisabled: false,
    isCustomHarness: false,
    harnessCommand: '',
    onHarnessCommandChange: vi.fn(),
    showDefaultModelMismatch: false,
    onClearDefaultModel: vi.fn(),
    onDismissMismatch: vi.fn(),
    defaultModelForMismatch: '',
    effectiveHarnessLabel: 'pi',
    showHarnessGuidance: false,
    guidanceHints: [],
    accentColor: '#7bdb85',
    handleAccentChange: vi.fn(),
    validationError: '',
    hiddenProjectIds: [],
    projectId: 'p1',
    toggleHideProject: vi.fn(),
  };

  it('renders the name input prefilled and calls the setter on change', () => {
    const setProjectName = vi.fn();
    renderWithKainBain(
      <ProjectBasicsSection {...baseProps} setProjectName={setProjectName} />,
    );
    expect(screen.getByText('Project Details')).toBeInTheDocument();
    expect(screen.getByLabelText('Project Name')).toHaveValue('Project A');
    fireEvent.change(screen.getByLabelText('Project Name'), {
      target: { value: 'Project B' },
    });
    expect(setProjectName).toHaveBeenCalledWith('Project B');
  });

  it('renders the harness/model controls, accent picker, and hide toggle', () => {
    renderWithKainBain(<ProjectBasicsSection {...baseProps} />);
    expect(screen.getByText('AI Harness')).toBeInTheDocument();
    expect(screen.getByText('Default AI Model')).toBeInTheDocument();
    expect(screen.getByLabelText('Accent Theme Color Hex')).toHaveValue('#7bdb85');
    expect(screen.getByRole('button', { name: 'Sky Blue' })).toBeInTheDocument();
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('accent swatches and the hide toggle call their handlers', () => {
    const handleAccentChange = vi.fn();
    const toggleHideProject = vi.fn();
    renderWithKainBain(
      <ProjectBasicsSection
        {...baseProps}
        handleAccentChange={handleAccentChange}
        toggleHideProject={toggleHideProject}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sky Blue' }));
    expect(handleAccentChange).toHaveBeenCalledWith('#38bdf8');
    fireEvent.click(screen.getByText('Visible'));
    expect(toggleHideProject).toHaveBeenCalledWith('p1');
  });

  it('shows the archived state when the project is hidden', () => {
    renderWithKainBain(
      <ProjectBasicsSection {...baseProps} hiddenProjectIds={['p1']} />,
    );
    expect(screen.getByText('Hidden (Archived)')).toBeInTheDocument();
  });

  it('hides the custom harness command for catalogue harnesses', () => {
    renderWithKainBain(
      <ProjectBasicsSection {...baseProps} isCustomHarness={false} />,
    );
    expect(screen.queryByLabelText('Custom Harness Command')).not.toBeInTheDocument();
  });

  it('shows the custom harness command prefilled for the custom harness', () => {
    const onHarnessCommandChange = vi.fn();
    renderWithKainBain(
      <ProjectBasicsSection
        {...baseProps}
        isCustomHarness
        harnessCommand="claude -p"
        onHarnessCommandChange={onHarnessCommandChange}
      />,
    );
    expect(screen.getByLabelText('Custom Harness Command')).toHaveValue('claude -p');
    fireEvent.change(screen.getByLabelText('Custom Harness Command'), {
      target: { value: 'muse exec' },
    });
    expect(onHarnessCommandChange).toHaveBeenCalledWith('muse exec');
  });

  it('shows the mismatch banner with working actions', () => {
    const onClearDefaultModel = vi.fn();
    const onDismissMismatch = vi.fn();
    renderWithKainBain(
      <ProjectBasicsSection
        {...baseProps}
        showDefaultModelMismatch
        defaultModelForMismatch="pi::old-model"
        effectiveHarnessLabel="pi"
        onClearDefaultModel={onClearDefaultModel}
        onDismissMismatch={onDismissMismatch}
      />,
    );
    expect(screen.getByTestId('default-model-mismatch-warning')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('default-model-mismatch-clear'));
    expect(onClearDefaultModel).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('default-model-mismatch-keep'));
    expect(onDismissMismatch).toHaveBeenCalled();
  });
});
