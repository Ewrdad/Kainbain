import { expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import { KainBainContext } from '../../context/KainBainContext';
import '@testing-library/jest-dom';

/***
 * MARK: TaskCard checkpoint-button alignment
 * @description Structural guard for the human-feedback fix: the Open PR
 *   Review / Copy Checkout buttons must take the same width as Approve /
 *   Reject and share their outer edges. Kept in its own file (rather than
 *   appended to TaskCard.test.jsx) so parallel branches extending that
 *   file do not produce end-of-file merge conflicts.
 *
 *   Merge constraint (verified 2026-09-21 with `git merge-file` on the
 *   base/master/branch blobs): the Copy Checkout block must stay
 *   byte-identical to master's variant. Any divergence (e.g. adding
 *   min-w-0/truncate there) makes the branch merge emit TWO Copy Checkout
 *   buttons — silently when the wrapper already matches, as a conflict
 *   otherwise. So the PR-row wrappers stay plain `flex-1` while the
 *   checkpoint row carries the truncation protection for its long labels.
 ***/
const task = { id: 'abc-1234-def', goal: 'Build the API', timeInStage: '2m' };

test('checkpoint rows share one equal-width layout so PR buttons align with Approve/Reject', () => {
  render(
    <KainBainContext.Provider
      value={{ projects: [{ id: 'proj-1', useBranches: true }], activeProjectId: 'proj-1' }}
    >
      <TaskCard task={task} stageName="Review" role="Human" />
    </KainBainContext.Provider>,
  );
  const buttons = [
    screen.getByRole('button', { name: /Approve task #KB-ABC1/i }),
    screen.getByRole('button', { name: /Reject task #KB-ABC1/i }),
    screen.getByRole('button', { name: /Open PR review for task #KB-ABC1/i }),
    screen.getByRole('button', { name: /Copy checkout command for task #KB-ABC1/i }),
  ];
  // Every button must fill an equal flex-1 share of its row: equal shares
  // in equal-gap rows means the same width and shared outer edges. (The
  // getByRole queries above also prove singularity: a duplicated Copy
  // Checkout button would throw here.)
  const wrappers = buttons.map((btn) => btn.parentElement);
  const widthClasses = wrappers.map((w) => w.className.split(/\s+/));
  for (const classes of widthClasses) {
    expect(classes).toContain('flex-1');
  }
  // The checkpoint row carries truncation protection: its Reject label is
  // far longer than any other, and without min-w-0 its automatic minimum
  // size would force that share wider and break edge alignment.
  for (const wrapper of wrappers.slice(0, 2)) {
    expect(wrapper.className.split(/\s+/)).toContain('min-w-0');
  }
  for (const btn of buttons.slice(0, 2)) {
    const btnClasses = btn.className.split(/\s+/);
    expect(btnClasses).toContain('w-full');
    expect(btnClasses).toContain('overflow-hidden');
  }
  // The PR-row wrappers must stay plain flex-1 (see the merge constraint
  // above): byte-identity with master's Copy Checkout block is what keeps
  // the branch merge to a single button.
  for (const wrapper of wrappers.slice(2)) {
    expect(wrapper.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1']));
    expect(wrapper.className.split(/\s+/)).not.toContain('min-w-0');
  }
  // Both rows must use the same gap so the outer edges line up.
  const gapOf = (row) => (row.className.match(/gap-\d+/) || [])[0];
  const approveRow = wrappers[0].parentElement;
  const prRow = wrappers[2].parentElement;
  expect(gapOf(approveRow)).toBeTruthy();
  expect(gapOf(prRow)).toBe(gapOf(approveRow));
  cleanup();
});
