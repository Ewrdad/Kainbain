/***
 * MARK: report review fixture
 * @description Shared report body used by parser, anchor, and view tests.
 *   Covers headings, multi-line paragraphs, bullets, ordered lists, a code
 *   fence, a table, a quote, a rule, blank runs, and a long line. Built from
 *   an explicit line array so source line numbers stay stable for assertions.
 *   Line numbers (1-based) are documented in FIXTURE_LINE_MAP below.
 ***/

const LONG_LINE = `This is a deliberately long single source line that keeps going past two hundred characters so the readable view can prove it wraps instead of stretching the layout: ${'word '.repeat(30).trim()}.`;

export const FIXTURE_LINES = [
  '# Review Fixture Report', // 1
  '', // 2
  'A short intro paragraph for the readable review. It spans two source lines', // 3
  'so a single block can cover more than one line number.', // 4
  '', // 5
  '- First bullet', // 6
  '- Second bullet', // 7
  '- Third bullet', // 8
  '', // 9
  '', // 10 (blank run)
  '1. First ordered step', // 11
  '2. Second ordered step', // 12
  '', // 13
  '> A quoted note worth keeping.', // 14
  '> It continues on a second line.', // 15
  '', // 16
  '```js', // 17
  'const retries = 3;', // 18
  'const total = retries + 1;', // 19
  '```', // 20
  '', // 21
  '| Stage | Status | Duration |', // 22
  '| --- | --- | --- |', // 23
  '| Discovery | Complete | 120s |', // 24
  '| Implementation | Active | 45s |', // 25
  '', // 26
  '---', // 27
  '', // 28
  'A paragraph after the rule, followed by a long line below.', // 29
  '', // 30
  LONG_LINE, // 31
  '', // 32
  '## Second heading', // 33
  '', // 34
  'Final paragraph before the end.', // 35
];

export const REPORT_FIXTURE_MD = FIXTURE_LINES.join('\n');

/** CRLF twin of the first four lines: proves carriage returns never leak. */
export const REPORT_FIXTURE_CRLF = '# Plan\r\nAdd retries\r\n\r\nShip it';

export const FIXTURE_REPORT = {
  path: './docs/tasks/t-9/REPORT.md',
  filename: 'REPORT.md',
  stageName: 'Review Fixture',
  auto: true,
  timestamp: '20261107-000000',
  content: REPORT_FIXTURE_MD,
};
