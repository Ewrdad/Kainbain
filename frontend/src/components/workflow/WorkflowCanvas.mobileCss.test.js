// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// MARK: WorkflowCanvas.mobileCss tests
// @description The index.css half of the mobile single-stage full-width
//   contract (see the MARK block in `WorkflowCanvas.mobile.test.jsx`): a pure
//   filesystem scan, so it lives in the node environment with static `node:`
//   imports. Dynamic `import('node:…')` from a happy-dom suite flakes under
//   the overlapped gate (`Cannot find package 'node:'` under vmThreads
//   worker sharing) — keep this file node-only.
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('mobile full-width override exists in index.css below the md breakpoint', () => {
  // Vitest runs with cwd set to the frontend package root.
  const css = readFileSync(resolve('src/index.css'), 'utf8');

  // Scoped strictly below Tailwind's `md:` (768px) breakpoint.
  expect(css).toMatch(/@media\s*\(\s*max-width:\s*767px\s*\)/);
  // Hooks the stage column (every column carries `data-stage-id`).
  expect(css).toMatch(/section\[data-stage-id\]/);
  // Overrides the desktop inline width caps (inline style outranks `w-full`,
  // so `!important` is required for width, min/max-width, and flex).
  const block = css.slice(css.indexOf('@media (max-width: 767px)'));
  expect(block).toMatch(/width:\s*100%\s*!important/);
  expect(block).toMatch(/min-width:\s*0\s*!important/);
  expect(block).toMatch(/max-width:\s*100%\s*!important/);
  expect(block).toMatch(/flex:\s*1\s+1\s+auto\s*!important/);
});
