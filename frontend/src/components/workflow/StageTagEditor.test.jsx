import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StageTagEditor } from './StageTagEditor';
import {
  STAGE_TAG_MAX_COUNT,
  STAGE_TAG_MAX_LENGTH,
} from '../../../../shared/stageTags.js';
import '@testing-library/jest-dom';

/***
 * MARK: StageTagEditor tests
 * @description Colocated tests for the stage tag chip editor: add (Enter,
 *   comma, blur, suggestion), duplicate/length/count guards, removal (chip
 *   button + Backspace) and the normalised onChange payload.
 ***/

function renderEditor(overrides = {}) {
  const onChange = vi.fn();
  const utils = render(
    <StageTagEditor value={[]} onChange={onChange} stageName="Idea" {...overrides} />,
  );
  return { onChange, ...utils };
}

function typeAndEnter(input, text) {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

test('adds a tag on Enter and normalises whitespace', () => {
  const { onChange } = renderEditor();
  typeAndEnter(screen.getByLabelText('Add tag for Idea'), '  Front   End ');
  expect(onChange).toHaveBeenCalledWith(['Front End']);
});

test('adds a tag on comma keydown', () => {
  const { onChange } = renderEditor();
  const input = screen.getByLabelText('Add tag for Idea');
  fireEvent.change(input, { target: { value: 'PO' } });
  fireEvent.keyDown(input, { key: ',' });
  expect(onChange).toHaveBeenCalledWith(['PO']);
});

test('adds a pending tag on blur', () => {
  const { onChange } = renderEditor();
  const input = screen.getByLabelText('Add tag for Idea');
  fireEvent.change(input, { target: { value: 'Dev' } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledWith(['Dev']);
});

test('rejects duplicates case-insensitively with a hint and no onChange', () => {
  const { onChange } = renderEditor({ value: ['PO'] });
  typeAndEnter(screen.getByLabelText('Add tag for Idea'), 'po');
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/already added/i);
});

test('rejects over-long tags with a hint and no onChange', () => {
  const { onChange } = renderEditor();
  typeAndEnter(screen.getByLabelText('Add tag for Idea'), 'x'.repeat(STAGE_TAG_MAX_LENGTH + 1));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/characters or fewer/i);
});

test('rejects tags containing commas with a hint (comma is the share-link separator)', () => {
  const { onChange } = renderEditor();
  typeAndEnter(screen.getByLabelText('Add tag for Idea'), 'a,b');
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/cannot contain commas/i);
});

test('ignores empty input on Enter', () => {
  const { onChange } = renderEditor();
  typeAndEnter(screen.getByLabelText('Add tag for Idea'), '   ');
  expect(onChange).not.toHaveBeenCalled();
});

test('removes a tag via its chip button', () => {
  const { onChange } = renderEditor({ value: ['PO', 'Dev'] });
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag PO' }));
  expect(onChange).toHaveBeenCalledWith(['Dev']);
});

test('backspace on an empty input removes the last tag', () => {
  const { onChange } = renderEditor({ value: ['PO', 'Dev'] });
  fireEvent.keyDown(screen.getByLabelText('Add tag for Idea'), { key: 'Backspace' });
  expect(onChange).toHaveBeenCalledWith(['PO']);
});

test('caps at the max tag count and hides the input', () => {
  const value = Array.from({ length: STAGE_TAG_MAX_COUNT }, (_, i) => `tag-${i}`);
  const { onChange } = renderEditor({ value });
  expect(screen.queryByLabelText('Add tag for Idea')).not.toBeInTheDocument();
  expect(screen.getByText(`Tags (${STAGE_TAG_MAX_COUNT}/${STAGE_TAG_MAX_COUNT})`)).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test('suggestions add unselected pipeline tags and hide selected ones', () => {
  const { onChange } = renderEditor({ value: ['PO'], availableTags: ['PO', 'Dev', 'QA'] });
  expect(screen.queryByRole('button', { name: '+PO' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+Dev' }));
  expect(onChange).toHaveBeenCalledWith(['PO', 'Dev']);
  expect(screen.getByRole('button', { name: '+QA' })).toBeInTheDocument();
});

test('renders existing tags as a list with remove buttons', () => {
  renderEditor({ value: ['PO', 'Dev'] });
  expect(screen.getByRole('list', { name: 'Tags for Idea' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
});

test('disabled editor renders tags without remove buttons or input', () => {
  renderEditor({ value: ['PO'], disabled: true });
  expect(screen.queryByRole('button', { name: 'Remove tag PO' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Add tag for Idea')).not.toBeInTheDocument();
});
