import { expect, test, vi } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { UnifiedSearchBar } from './UnifiedSearchBar';
import '@testing-library/jest-dom';

/***
 * MARK: UnifiedSearchBar tests
 * @description Colocated component tests for the merged search bar: `#tag`
 *   tokens render as removable chips, typing `#` opens a filtered suggestion
 *   dropdown (keyboard + mouse), clear wipes everything, and the Any/All
 *   toggle only appears while tags are active. `!` system-native filters
 *   (`!failed`, `!human`) behave the same way with their own registry-driven
 *   suggestions and amber chips; unknown `!tokens` stay plain text.
 ***/

const tagOptions = [
  { value: 'Dev', label: 'Dev' },
  { value: 'DevOps', label: 'DevOps' },
  { value: 'Design', label: 'Design' },
  { value: 'PO', label: 'PO' },
];

function Harness({ initialValue = '', mode = 'any', onModeChange } = {}) {
  const [value, setValue] = useState(initialValue);
  return (
    <UnifiedSearchBar
      value={value}
      onChange={setValue}
      tagOptions={tagOptions}
      tagFilterMode={mode}
      onTagFilterModeChange={onModeChange}
    />
  );
}

function renderBar(props) {
  return renderWithKainBain(<Harness {...props} />);
}

function searchInput() {
  return screen.getByLabelText('Search tasks');
}

/***
 * MARK: placeCursorAtEnd
 * @description Parks the caret at the end of the input and syncs the bar's
 *   internal cursor tracking (the bar reads selectionStart on click/select).
 ***/
function placeCursorAtEnd(input) {
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.click(input);
}

test('empty query renders no chips, no toggle, and the placeholder', () => {
  renderBar();
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Match (any|all)/ })).not.toBeInTheDocument();
  expect(searchInput()).toHaveAttribute('placeholder', 'Search tasks, #tags, or !filters…');
  expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
});

test('text-only query shows no chips and no toggle', () => {
  renderBar({ initialValue: 'auth login' });
  expect(searchInput()).toHaveValue('auth login');
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Match (any|all)/ })).not.toBeInTheDocument();
});

test('tags render as chips with remove buttons alongside text', () => {
  renderBar({ initialValue: 'auth #Dev #PO' });
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
  expect(screen.getByText('#Dev')).toBeInTheDocument();
  // Committed tags live ONLY in the chips — the field shows just free text.
  expect(searchInput()).toHaveValue('auth');
});

test('committed tags never duplicate between chips and the text field', () => {
  renderBar({ initialValue: 'auth #Dev' });
  expect(searchInput()).toHaveValue('auth');
  expect(searchInput().value).not.toContain('#Dev');
  // Exactly one visible #Dev: the chip itself.
  expect(screen.getAllByText('#Dev')).toHaveLength(1);
});

test('stale input echoing a committed tag is stripped from the field (no chip+text duplicate)', () => {
  // Simulates handleChange firing after commitDraftTag cleared the field
  // (e.g. browser quirk where preventDefault on keydown Space doesn't
  // suppress the input event): the stale value still contains the tag
  // token, but it must not reappear in the field.
  renderBar({ initialValue: '#Dev' });
  const input = searchInput();
  expect(input).toHaveValue('');
  // Echo: the field receives "#Dev " as if the browser inserted a space
  // after the committed token.
  fireEvent.change(input, { target: { value: '#Dev ' } });
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('#Dev')).toHaveLength(1);
});

test('pasting a tag that is already committed does not duplicate it in the field', () => {
  renderBar({ initialValue: '#Dev' });
  const input = searchInput();
  expect(input).toHaveValue('');
  // Paste "#Dev #PO" — #Dev is already committed, #PO is new.
  fireEvent.change(input, { target: { value: '#Dev #PO' } });
  // #Dev auto-commits (already a chip, no duplicate); #PO stays as draft.
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('#Dev')).toHaveLength(1);
});

test('typing # opens the dropdown with every unselected tag', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['#Dev', '#DevOps', '#Design', '#PO']);
});

test('typing a partial tag filters the dropdown', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#De' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent).sort()).toEqual(['#Design', '#Dev', '#DevOps'].sort());
});

test('already-selected tags are excluded from suggestions', () => {
  renderBar({ initialValue: '#Dev ' });
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#Dev #' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).not.toContain('#Dev');
  expect(options.length).toBe(3);
});

test('hydrated tags render chips without popping the dropdown open', () => {
  renderBar({ initialValue: 'auth #Dev' });
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('no dropdown while typing plain text', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: 'auth' } });
  placeCursorAtEnd(input);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('ArrowDown/ArrowUp move the highlight, Enter selects the tag', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#De' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options).toHaveLength(3);

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const highlighted = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
  expect(highlighted).toHaveLength(1);

  fireEvent.keyDown(input, { key: 'ArrowUp' });
  const moved = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
  expect(moved).toHaveLength(1);

  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('button', { name: /Remove tag/ })).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('clicking an option adds the tag and closes the dropdown', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: 'auth #P' } });
  placeCursorAtEnd(input);
  fireEvent.click(screen.getByRole('option', { name: '#PO' }));
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  // The partial token becomes a chip and is cleared from the field; the
  // free text is preserved and the tag appears exactly once.
  expect(searchInput()).toHaveValue('auth');
  expect(screen.getAllByText('#PO')).toHaveLength(1);
});

test('Space commits the typed #tag into a chip and clears the field', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: 'auth #De' } });
  placeCursorAtEnd(input);
  // Suggestions are offered while typing…
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.keyDown(input, { key: ' ' });
  // …but Space turns exactly what was typed into a chip and clears the field.
  expect(screen.getByRole('button', { name: 'Remove tag De' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('auth');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getAllByText('#De')).toHaveLength(1);
});

test('typing an exact known #tag commits it at once with canonical casing', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: 'auth #dev' } });
  placeCursorAtEnd(input);
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('auth');
  expect(screen.getAllByText('#Dev')).toHaveLength(1);
});

test('Enter commits the typed #tag when no suggestion is open', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#Custom' } });
  placeCursorAtEnd(input);
  // No known tag matches, so no dropdown steals Enter.
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Remove tag Custom' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('#Custom')).toHaveLength(1);
});

test('Backspace on an empty field removes chips last-first', () => {
  renderBar({ initialValue: '#Dev #PO' });
  const input = searchInput();
  expect(input).toHaveValue('');
  fireEvent.keyDown(input, { key: 'Backspace' });
  expect(screen.queryByRole('button', { name: 'Remove tag PO' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  fireEvent.keyDown(searchInput(), { key: 'Backspace' });
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
});

test('Backspace with text present does not remove chips', () => {
  renderBar({ initialValue: 'auth #Dev' });
  const input = searchInput();
  expect(input).toHaveValue('auth');
  fireEvent.keyDown(input, { key: 'Backspace' });
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
});

test('Escape closes the dropdown', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#' } });
  placeCursorAtEnd(input);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('clicking a chip remove button drops only that tag', () => {
  renderBar({ initialValue: 'auth #Dev #PO' });
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag Dev' }));
  expect(screen.queryByRole('button', { name: 'Remove tag Dev' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('auth');
});

test('chip remove is keyboard-accessible (Enter on the chip button)', () => {
  renderBar({ initialValue: '#Dev #PO' });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Remove tag Dev' }), { key: 'Enter' });
  expect(screen.queryByRole('button', { name: 'Remove tag Dev' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
});

test('chip remove works with Backspace or Delete on the chip button and returns focus to input', () => {
  renderBar({ initialValue: '#Dev #PO' });
  const input = searchInput();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Remove tag Dev' }), { key: 'Backspace' });
  expect(screen.queryByRole('button', { name: 'Remove tag Dev' })).not.toBeInTheDocument();
  expect(document.activeElement).toBe(input);
});

test('clear button wipes text and tags together', () => {
  renderBar({ initialValue: 'auth #Dev' });
  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(searchInput()).toHaveValue('');
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
});

test('clear button is visible and clears an in-progress draft even before committing', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#De' } });
  placeCursorAtEnd(input);
  expect(input).toHaveValue('#De');
  const clearBtn = screen.getByLabelText('Clear search');
  expect(clearBtn).toBeInTheDocument();
  fireEvent.click(clearBtn);
  expect(searchInput()).toHaveValue('');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('Any/All toggle appears only while tags are present and reports clicks', () => {
  const onModeChange = vi.fn();
  const { rerender } = renderWithKainBain(
    <UnifiedSearchBar
      value="auth"
      onChange={() => {}}
      tagOptions={tagOptions}
      tagFilterMode="any"
      onTagFilterModeChange={onModeChange}
    />,
  );
  expect(screen.queryByRole('button', { name: /Match (any|all)/ })).not.toBeInTheDocument();

  rerender(
    <UnifiedSearchBar
      value="auth #Dev"
      onChange={() => {}}
      tagOptions={tagOptions}
      tagFilterMode="any"
      onTagFilterModeChange={onModeChange}
    />,
  );
  const anyBtn = screen.getByRole('button', { name: 'Match any selected tag' });
  const allBtn = screen.getByRole('button', { name: 'Match all selected tags' });
  expect(anyBtn).toHaveAttribute('aria-pressed', 'true');
  expect(allBtn).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(allBtn);
  expect(onModeChange).toHaveBeenCalledWith('all');
});

test('combobox a11y wiring reflects the open dropdown and active descendant', () => {
  renderBar();
  const input = searchInput();
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(input).not.toHaveAttribute('aria-activedescendant');
  fireEvent.change(input, { target: { value: '#' } });
  placeCursorAtEnd(input);
  expect(searchInput()).toHaveAttribute('aria-expanded', 'true');
  // The listbox id is minted per instance (useId): the combobox wiring must
  // point at THIS instance's listbox and options, never a hardcoded shared id.
  const listbox = screen.getByRole('listbox');
  expect(input).toHaveAttribute('aria-controls', listbox.id);
  expect(input).toHaveAttribute('aria-activedescendant', `${listbox.id}-option-0`);
  expect(screen.getByRole('option', { name: '#Dev' }).id).toBe(`${listbox.id}-option-0`);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input).toHaveAttribute('aria-activedescendant', `${listbox.id}-option-1`);
});

/***
 * MARK: browser-typing regression tests
 * @description Faithful browser event ordering per keystroke (keydown first —
 *   the component may preventDefault Space/Enter to commit before insertion —
 *   then insertion + an input event with the field focused so the live DOM
 *   caret is authoritative, exactly as in a real browser). These pin the
 *   reviewer interaction: `#Tag` + Space/Enter becomes a chip, clears the
 *   field, and never duplicates; Backspace on empty removes chips last-first.
 ***/

function caretOf(input) {
  return typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
}

function insertAtCaret(input, chars) {
  const start = caretOf(input);
  const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
  const next = `${input.value.slice(0, start)}${chars}${input.value.slice(end)}`;
  fireEvent.change(input, { target: { value: next } });
  const pos = start + chars.length;
  try {
    input.setSelectionRange(pos, pos);
  } catch {
    // Mocks may not support selection ranges.
  }
}

function typeBrowserText(input, chars) {
  input.focus();
  for (const ch of chars) {
    // Real browsers fire keydown before inserting; a prevented key (Space or
    // Enter committing a draft) inserts nothing.
    const consumed = fireEvent.keyDown(input, { key: ch }) === false;
    if (!consumed) insertAtCaret(input, ch);
    fireEvent.keyUp(input, { key: ch });
  }
}

function pressBrowserKey(input, key) {
  input.focus();
  const consumed = fireEvent.keyDown(input, { key }) === false;
  if (!consumed && key === 'Backspace') {
    const start = caretOf(input);
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    if (start !== end) {
      const next = input.value.slice(0, start) + input.value.slice(end);
      fireEvent.change(input, { target: { value: next } });
      try {
        input.setSelectionRange(start, start);
      } catch {
        // Mocks may not support selection ranges.
      }
    } else if (start > 0) {
      const next = input.value.slice(0, start - 1) + input.value.slice(start);
      fireEvent.change(input, { target: { value: next } });
      try {
        input.setSelectionRange(start - 1, start - 1);
      } catch {
        // Mocks may not support selection ranges.
      }
    }
  }
  fireEvent.keyUp(input, { key });
}

test('browser typing: #Tag + Space commits a chip and clears the field with no duplicate', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, '#Tag');
  // Draft only: suggestions may open, but nothing commits yet.
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
  pressBrowserKey(input, ' ');
  expect(screen.getByRole('button', { name: 'Remove tag Tag' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('');
  // Exactly one visible #Tag: the chip itself, never chip + inline text.
  expect(screen.getAllByText('#Tag')).toHaveLength(1);
});

test('browser typing: text + #tag + Space keeps the text and commits once', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, 'auth #De');
  pressBrowserKey(input, ' ');
  expect(screen.getByRole('button', { name: 'Remove tag De' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('auth');
  expect(screen.getAllByText('#De')).toHaveLength(1);
});

test('browser typing: Enter commits the draft into a chip', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, '#Custom');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  pressBrowserKey(input, 'Enter');
  expect(screen.getByRole('button', { name: 'Remove tag Custom' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('#Custom')).toHaveLength(1);
});

test('browser typing: stale Space insertion echoing a commit leaves no duplicate', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, '#Tag');
  pressBrowserKey(input, ' ');
  expect(screen.getAllByText('#Tag')).toHaveLength(1);
  // Some browsers still deliver the prevented Space as an input event carrying
  // the stale token — the derived field must swallow it, not re-show it.
  input.focus();
  fireEvent.change(input, { target: { value: '#Tag ' } });
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('#Tag')).toHaveLength(1);
});

test('browser typing: Backspace on an empty field removes chips last-first', () => {
  renderBar({ initialValue: '#Dev #PO' });
  const input = searchInput();
  expect(input).toHaveValue('');
  pressBrowserKey(input, 'Backspace');
  expect(screen.queryByRole('button', { name: 'Remove tag PO' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  pressBrowserKey(searchInput(), 'Backspace');
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
});

test('browser typing: word separator between text words is preserved', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, 'auth');
  typeBrowserText(input, ' ');
  typeBrowserText(input, 'login');
  expect(searchInput()).toHaveValue('auth login');
});

test('draft keystrokes stay local and never emit to the parent', () => {
  const onChange = vi.fn();
  renderWithKainBain(
    <UnifiedSearchBar
      value=""
      onChange={onChange}
      tagOptions={tagOptions}
      tagFilterMode="any"
      onTagFilterModeChange={() => {}}
    />,
  );
  const input = searchInput();
  typeBrowserText(input, '#De');
  expect(input).toHaveValue('#De');
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

function ExternalHarness() {
  const [value, setValue] = useState('');
  return (
    <>
      <UnifiedSearchBar
        value={value}
        onChange={setValue}
        tagOptions={tagOptions}
        tagFilterMode="any"
        onTagFilterModeChange={() => {}}
      />
      <button type="button" onClick={() => setValue('plan #Design')}>hydrate</button>
      <button type="button" onClick={() => setValue('')}>wipe</button>
    </>
  );
}

test('external parent updates preserve the draft; an external wipe clears it', () => {
  renderWithKainBain(<ExternalHarness />);
  const input = searchInput();
  typeBrowserText(input, '#De');
  expect(input).toHaveValue('#De');
  fireEvent.click(screen.getByRole('button', { name: 'hydrate' }));
  // Hydration adds a chip; the in-progress draft stays visible after the text.
  expect(screen.getByRole('button', { name: 'Remove tag Design' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('plan #De');
  fireEvent.click(screen.getByRole('button', { name: 'wipe' }));
  expect(searchInput()).toHaveValue('');
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
});

test('focused stale echo with caret at end is swallowed (real-browser regression)', () => {
  renderBar({ initialValue: '#Tag' });
  const input = searchInput();
  expect(input).toHaveValue('');
  input.focus();
  fireEvent.change(input, {
    target: { value: '#Tag ', selectionStart: 5, selectionEnd: 5 },
  });
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('#Tag')).toHaveLength(1);
});

test('search bar root and chip strip expose responsive hooks', () => {
  renderBar({ initialValue: 'auth #Dev #PO #Design' });
  const root = screen.getByTestId('unified-search-bar');
  expect(root.className).toContain('min-w-0');
  const chips = screen.getByTestId('unified-search-chips');
  expect(chips.className).toContain('overflow-x-auto');
  expect(chips.querySelector('div')?.className).toContain('flex-nowrap');
});

test('chip strip shrinks and scrolls at every breakpoint so the input is never evicted', () => {
  renderBar({ initialValue: 'auth #Dev #PO #Design #QA #Ops' });
  const chips = screen.getByTestId('unified-search-chips');
  // Shrinkable (min-w-0 + shrink) but never forced to content size: at any
  // width the strip must absorb overflow by scrolling, never by pushing the
  // input or clear button out of the shell (regression: sm:flex-none clipped
  // the controls at 768px with 6 tags).
  expect(chips.className).toContain('min-w-0');
  expect(chips.className).toContain('shrink');
  expect(chips.className).not.toContain('flex-none');
  expect(chips.className).not.toContain('sm:flex-none');
  expect(chips.className).toContain('overflow-x-auto');
});

test('search shell is full-width on mobile and flexes beside the Any/All toggle on desktop', () => {
  const onModeChange = vi.fn();
  renderBar({ initialValue: 'auth #Dev', mode: 'any', onModeChange });
  const root = screen.getByTestId('unified-search-bar');
  const shell = root.querySelector(':scope > div');
  expect(shell?.className).toContain('w-full');
  expect(shell?.className).toContain('min-w-0');
  expect(shell?.className).toContain('overflow-hidden');
  // At lg+ the shell yields width so the toggle stays on the same row
  // (desktop contract from master: toggle beside the bar, not below it).
  expect(shell?.className).toContain('lg:flex-1');
  expect(shell?.className).toContain('lg:w-auto');
});

test('mobile input uses zoom-safe text and tappable clear/chip controls', () => {
  renderBar({ initialValue: 'auth #Dev' });
  const input = searchInput();
  expect(input.className).toContain('text-base');
  expect(input.className).toContain('sm:text-xs');
  expect(input.className).toContain('flex-none');
  expect(input.className).toContain('w-[100px]');
  expect(input.className).toContain('sm:min-w-[80px]');
  const clear = screen.getByRole('button', { name: 'Clear search' });
  expect(clear.className).toMatch(/min-w-\[28px\]/);
  expect(clear.className).toMatch(/min-h-\[28px\]/);
  const remove = screen.getByRole('button', { name: 'Remove tag Dev' });
  expect(remove.className).toMatch(/min-w-\[20px\]/);
  expect(remove.className).toMatch(/min-h-\[20px\]/);
});

test('mobile input takes remaining space when no tags are selected', () => {
  renderBar({ initialValue: 'just text' });
  const input = searchInput();
  expect(input.className).toContain('flex-1');
  expect(input.className).toContain('min-w-0');
});

test('Any/All toggle is hidden on mobile but present in the DOM', () => {
  const onModeChange = vi.fn();
  renderBar({ initialValue: 'auth #Dev', mode: 'any', onModeChange });
  const toggleButton = screen.getByRole('button', { name: 'Match any selected tag' });
  const wrapper = toggleButton.parentElement;
  expect(wrapper?.className).toContain('hidden');
  expect(wrapper?.className).toContain('md:flex');
});

/***
 * MARK: fail-safe and re-usability tests
 * @description The bar must degrade, never crash, on malformed props, and it
 *   must be safely re-usable: case-variant options dedupe, two instances
 *   never share DOM ids, and a missing callback never throws.
 ***/

/***
 * MARK: StatefulBar
 * @description Stateful wrapper for option-variant tests: a noop onChange
 *   would leave the controlled field empty, so these tests need the typed
 *   query to actually commit, exactly like the real parent does.
 ***/
function StatefulBar({ options, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);
  return (
    <UnifiedSearchBar
      value={value}
      onChange={setValue}
      tagOptions={options}
      tagFilterMode="any"
      onTagFilterModeChange={() => {}}
    />
  );
}

function renderBarWithOptions(options, props = {}) {
  return renderWithKainBain(<StatefulBar options={options} {...props} />);
}

test('fails safe with a null value and null tag options', () => {
  renderWithKainBain(
    <UnifiedSearchBar value={null} onChange={() => {}} tagOptions={null} />,
  );
  const input = searchInput();
  // A null query degrades to an empty field — no crash, no chips.
  expect(input).toHaveValue('');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
  expect(() => {
    fireEvent.change(input, { target: { value: '#' } });
  }).not.toThrow();
});

test('null tag options never open the dropdown, even with a # draft', () => {
  renderBarWithOptions(null);
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#' } });
  placeCursorAtEnd(input);
  // The draft committed to the query, but with no options there is nothing
  // to suggest — the dropdown must stay closed.
  expect(input).toHaveValue('#');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('fails safe with a non-string value (coerced like the parser does)', () => {
  renderWithKainBain(
    <UnifiedSearchBar value={123} onChange={() => {}} tagOptions={tagOptions} />,
  );
  expect(searchInput()).toHaveValue('123');
});

test('a non-function onChange is never called and never crashes', () => {
  renderWithKainBain(
    <UnifiedSearchBar value="" onChange="not-a-function" tagOptions={tagOptions} />,
  );
  const input = searchInput();
  expect(() => {
    fireEvent.change(input, { target: { value: 'auth' } });
  }).not.toThrow();
  // Controlled field: without a real callback the typed text is not committed.
  expect(searchInput()).toHaveValue('');
});

test('the Any/All toggle stays hidden without a function callback, even with tags', () => {
  renderWithKainBain(
    <UnifiedSearchBar
      value="auth #Dev"
      onChange={() => {}}
      tagOptions={tagOptions}
      tagFilterMode="any"
    />,
  );
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Match (any|all)/ })).not.toBeInTheDocument();
});

test('dedupes case-variant tag options so suggestions never repeat a tag', () => {
  renderBarWithOptions([
    { value: 'Dev', label: 'Dev' },
    { value: 'dev', label: 'dev' },
    { value: 'PO', label: 'PO' },
  ]);
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['#Dev', '#PO']);
  // No duplicate React keys: every option id is unique.
  const ids = options.map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('accepts plain-string tag options', () => {
  renderBarWithOptions(['Dev', 'PO']);
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#' } });
  placeCursorAtEnd(input);
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['#Dev', '#PO']);
});

test('ignores malformed tag option entries instead of crashing', () => {
  renderBarWithOptions([null, 42, {}, { value: 'Dev', label: 'Dev' }]);
  const input = searchInput();
  fireEvent.change(input, { target: { value: '#' } });
  placeCursorAtEnd(input);
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['#Dev']);
});

test('two mounted instances never share listbox or option ids', () => {
  renderWithKainBain(
    <>
      <StatefulBar options={tagOptions} />
      <StatefulBar options={tagOptions} />
    </>,
  );
  const inputs = screen.getAllByLabelText('Search tasks');
  expect(inputs).toHaveLength(2);
  for (const input of inputs) {
    fireEvent.change(input, { target: { value: '#' } });
    placeCursorAtEnd(input);
  }
  const listboxes = screen.getAllByRole('listbox');
  expect(listboxes).toHaveLength(2);
  expect(listboxes[0].id).not.toBe(listboxes[1].id);
  expect(inputs[0]).toHaveAttribute('aria-controls', listboxes[0].id);
  expect(inputs[1]).toHaveAttribute('aria-controls', listboxes[1].id);
  const optionIds = screen.getAllByRole('option').map((o) => o.id);
  expect(new Set(optionIds).size).toBe(optionIds.length);
});

test('a very long tag name truncates inside the chip instead of growing the shell', () => {
  const longTag = 'x'.repeat(80);
  renderBar({ initialValue: `#${longTag}` });
  const chipText = screen.getByText(`#${longTag}`);
  const chipRoot = chipText.parentElement;
  expect(chipRoot?.className).toContain('max-w-[90px]');
  expect(chipRoot?.className).toContain('sm:max-w-[140px]');
  expect(chipText.className).toContain('truncate');
});

test('Backspace on an empty field with no tags is a no-op (no crash)', () => {
  renderBar();
  const input = searchInput();
  expect(() => fireEvent.keyDown(input, { key: 'Backspace' })).not.toThrow();
  expect(screen.queryByRole('button', { name: /Remove tag/ })).not.toBeInTheDocument();
  expect(input).toHaveValue('');
});

/***
 * MARK: ! system-filter tests (task c213d3a9)
 * @description The `!` prefix drives the same chip/dropdown machinery as `#`
 *   tags, but suggestions come from the system-filter registry, chips render
 *   amber with a `!`-prefixed label and a "Remove filter …" aria-label, and
 *   unknown `!tokens` degrade to plain text instead of becoming chips.
 ***/

test('! filters render as chips with remove buttons alongside text', () => {
  renderBar({ initialValue: 'auth !failed' });
  expect(screen.getByRole('button', { name: 'Remove filter failed' })).toBeInTheDocument();
  expect(screen.getByText('!failed')).toBeInTheDocument();
  // Committed filters live ONLY in the chips — the field shows just free text.
  expect(searchInput()).toHaveValue('auth');
});

test('mixed text + #tag + !filter renders both chip kinds', () => {
  renderBar({ initialValue: 'auth #Dev !failed' });
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove filter failed' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('auth');
});

test('unknown !tokens stay plain text and never become chips', () => {
  renderBar({ initialValue: 'hello !bogus' });
  expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  expect(searchInput()).toHaveValue('hello !bogus');
});

test('typing ! opens the dropdown with every system filter', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '!' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['!failed', '!human']);
});

test('typing a partial !filter narrows the dropdown', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '!fa' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['!failed']);
});

test('already-committed system filters are excluded from ! suggestions', () => {
  renderBar({ initialValue: '!failed' });
  const input = searchInput();
  fireEvent.change(input, { target: { value: '!failed !' } });
  placeCursorAtEnd(input);
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['!human']);
});

test('clicking a ! option commits the filter and closes the dropdown', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '!' } });
  placeCursorAtEnd(input);
  fireEvent.click(screen.getByRole('option', { name: '!failed' }));
  expect(screen.getByRole('button', { name: 'Remove filter failed' })).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('!failed')).toHaveLength(1);
});

test('ArrowDown + Enter selects a ! suggestion', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '!' } });
  placeCursorAtEnd(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Remove filter human' })).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('typing an exact known !filter commits it at once', () => {
  renderBar();
  const input = searchInput();
  fireEvent.change(input, { target: { value: '!failed' } });
  placeCursorAtEnd(input);
  expect(screen.getByRole('button', { name: 'Remove filter failed' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('');
  expect(screen.getAllByText('!failed')).toHaveLength(1);
});

test('browser typing: !filter + Space commits a chip and clears the field with no duplicate', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, '!failed');
  // Draft only: the registry suggestion opens, but nothing commits yet.
  expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  pressBrowserKey(input, ' ');
  expect(screen.getByRole('button', { name: 'Remove filter failed' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('');
  // Exactly one visible !failed: the chip itself, never chip + inline text.
  expect(screen.getAllByText('!failed')).toHaveLength(1);
});

test('browser typing: text + !filter + Space keeps the text and commits once', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, 'auth !human');
  pressBrowserKey(input, ' ');
  expect(screen.getByRole('button', { name: 'Remove filter human' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('auth');
  expect(screen.getAllByText('!human')).toHaveLength(1);
});

test('browser typing: unknown !token stays text — Space does not commit a chip', () => {
  renderBar();
  const input = searchInput();
  typeBrowserText(input, '!bogus');
  // No registry match: no dropdown, no chip, the token stays editable text.
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  expect(input).toHaveValue('!bogus');
  pressBrowserKey(input, ' ');
  expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  expect(searchInput()).toHaveValue('!bogus');
});

test('Backspace on an empty field removes ! filter chips before tag chips', () => {
  renderBar({ initialValue: '#Dev !failed' });
  const input = searchInput();
  expect(input).toHaveValue('');
  fireEvent.keyDown(input, { key: 'Backspace' });
  expect(screen.queryByRole('button', { name: 'Remove filter failed' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  fireEvent.keyDown(searchInput(), { key: 'Backspace' });
  expect(screen.queryByRole('button', { name: /Remove (tag|filter)/ })).not.toBeInTheDocument();
});

test('clicking a ! chip remove button drops only that filter', () => {
  renderBar({ initialValue: 'auth !failed #Dev' });
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter failed' }));
  expect(screen.queryByRole('button', { name: 'Remove filter failed' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(searchInput()).toHaveValue('auth');
});

test('! chip remove is keyboard-accessible (Enter on the chip button)', () => {
  renderBar({ initialValue: '!failed !human' });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Remove filter failed' }), { key: 'Enter' });
  expect(screen.queryByRole('button', { name: 'Remove filter failed' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove filter human' })).toBeInTheDocument();
});

test('clear button wipes ! filters together with text and tags', () => {
  renderBar({ initialValue: 'auth #Dev !failed' });
  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(searchInput()).toHaveValue('');
  expect(screen.queryByRole('button', { name: /Remove (tag|filter)/ })).not.toBeInTheDocument();
});
