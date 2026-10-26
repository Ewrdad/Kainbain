import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StageSettingsDrawer } from './StageSettingsDrawer';
import '@testing-library/jest-dom';

/***
 * MARK: StageSettingsDrawer tests
 * @description Colocated tests for the in-column stage settings drawer: the
 *   tag chip editor section (rendering, suggestions from other stages, and the
 *   normalised `onUpdateStage(stage.id, { tags })` write pattern).
 ***/

const stages = [
  { id: 's1', name: 'Idea', type: 'human', tags: ['PO'] },
  { id: 's2', name: 'Build', type: 'agent', tags: ['Dev'] },
];

function renderDrawer(overrides = {}) {
  const onUpdateStage = vi.fn();
  const props = {
    stage: stages[0],
    stages,
    isSettingsExpanded: true,
    onToggleSettings: vi.fn(),
    onCloseSettings: vi.fn(),
    onSaveAndClose: vi.fn(),
    onUpdateStage,
    onTypeChange: vi.fn(),
    activeProjectId: 'proj-1',
    saveStages: vi.fn(),
    pendingStageAction: null,
    removeStageAndSave: vi.fn(),
    typeConfigProps: {},
    ...overrides,
  };
  return { onUpdateStage, ...render(<StageSettingsDrawer {...props} />) };
}

test('tag section renders existing tags in the chip editor', () => {
  renderDrawer();
  expect(screen.getByText('Tags (1/12)')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Tags for Idea' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
});

test('adding a tag writes normalised tags through onUpdateStage', () => {
  const { onUpdateStage } = renderDrawer();
  const input = screen.getByLabelText('Add tag for Idea');
  fireEvent.change(input, { target: { value: '  frontend ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onUpdateStage).toHaveBeenCalledWith('s1', { tags: ['PO', 'frontend'] });
});

test('removing the last tag writes an empty array through onUpdateStage', () => {
  const { onUpdateStage } = renderDrawer();
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag PO' }));
  expect(onUpdateStage).toHaveBeenCalledWith('s1', { tags: [] });
});

test('suggestions list tags used by other stages in the pipeline', () => {
  renderDrawer();
  expect(screen.getByRole('button', { name: '+Dev' })).toBeInTheDocument();
  // The stage's own tag is not re-suggested.
  expect(screen.queryByRole('button', { name: '+PO' })).not.toBeInTheDocument();
});

test('a stage without tags renders an empty editor', () => {
  renderDrawer({ stage: { id: 's3', name: 'Spec', type: 'human' } });
  expect(screen.getByText('Tags (0/12)')).toBeInTheDocument();
  expect(screen.getByLabelText('Add tag for Spec')).toBeInTheDocument();
});
