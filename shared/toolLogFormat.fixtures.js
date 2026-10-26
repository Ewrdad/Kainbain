/***
 * MARK: toolLogFormat fixtures (golden corpus)
 * @description THE shared golden corpus for tool-log summarization, imported
 *   verbatim by the frontend golden tests
 *   (`frontend/src/context/toolLogFormat.test.js`) and the api golden tests
 *   (`api/toolLogFormat.shared.test.js`) so both sides of the harness
 *   boundary assert identical summaries. Plain ESM, zero dependencies.
 *
 *   Every fixture is one messy real-world sample (harvested per harness: pi,
 *   opencode, antigravity, muse, custom) plus its hand-checked readable
 *   summary. Short inputs keep byte-identical output (backwards
 *   compatibility); only long or envelope-shaped inputs change shape.
 *
 *   Fixture shape:
 *     { name, tool, input, options, expected }
 *   `options` is passed through to the summarizer (`{ failed, maxLength }`
 *   for results, `{ maxLength }` for starts).
 ***/

const LONG_WORD_RUN = 'word '.repeat(40);
const LONG_SINGLE_TOKEN = 'y'.repeat(200);
const LONG_W_RUN = 'w'.repeat(500);
const LONG_V_PAYLOAD = 'v'.repeat(500);
const LONG_D_RUN = 'd'.repeat(200);
const LONG_Z_RUN = 'z'.repeat(200);
const LONG_K_80 = 'k'.repeat(80);
const LONG_K_81 = 'k'.repeat(81);
const LONG_K_700 = 'w'.repeat(700);

/***
 * MARK: TOOL_RESULT_FIXTURES
 * @description Golden input -> summary pairs for `summarizeToolResult`.
 *   Short inputs stay byte-identical by design, so envelope fixtures carry a
 *   long ignored `description` to push them over budget (only then does the
 *   envelope summary apply).
 * @example TOOL_RESULT_FIXTURES[0] => { name: 'bash envelope …', expected: '$ npm …' }
 ***/
export const TOOL_RESULT_FIXTURES = [
	{
		name: 'bash envelope: command + exit + output tail (the screenshot shape)',
		tool: 'bash',
		input:
			'{"chunk_id": "exec-17-1", "command": "npm run test:frontend", ' +
			'"output": "Test Files  12 passed (12)\\n      Tests  148 passed (148)", ' +
			'"exit_code": 0, "description": "Run frontend tests"}',
		options: { maxLength: 80 },
		expected: '$ npm run test:frontend (exit 0): Tests  148 passed (148)',
	},
	{
		name: 'bash envelope: long output truncates the tail at a word boundary',
		tool: 'bash',
		input:
			'{"command": "ls", "exit_code": 0, "output": "alpha beta gamma delta ' +
			'epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau"}',
		options: { maxLength: 80 },
		expected:
			'$ ls (exit 0): alpha beta gamma delta epsilon zeta eta theta iota kappa lambda…',
	},
	{
		name: 'bash envelope: failed run prefers the stderr tail',
		tool: 'bash',
		input:
			'{"command": "npm run bad", "exit_code": 1, ' +
			'"stdout": "building", "stderr": "Error: boom"}',
		options: { failed: true, maxLength: 80 },
		expected: '$ npm run bad (exit 1): Error: boom',
	},
	{
		name: 'bash envelope: duration_ms renders inside the exit segment',
		tool: 'bash',
		input: `{"command": "make", "exit_code": 0, "duration_ms": 1500, "output": "done", "description": "${LONG_D_RUN}"}`,
		options: { maxLength: 80 },
		expected: '$ make (exit 0, 1.5s): done',
	},
	{
		name: 'bash envelope: duration_seconds renders as whole seconds',
		tool: 'bash',
		input: `{"command": "t", "exit_code": 0, "duration_seconds": 2, "output": "ok", "description": "${LONG_D_RUN}"}`,
		options: { maxLength: 80 },
		expected: '$ t (exit 0, 2s): ok',
	},
	{
		name: 'bash envelope: string duration passes through verbatim',
		tool: 'bash',
		input: `{"command": "t", "exit_code": 0, "duration": "3m", "output": "ok", "description": "${LONG_D_RUN}"}`,
		options: { maxLength: 80 },
		expected: '$ t (exit 0, 3m): ok',
	},
	{
		name: 'bash envelope: no output renders command + exit only',
		tool: 'bash',
		input: `{"command": "sleep 1", "exit_code": 0, "description": "${LONG_D_RUN}"}`,
		options: { maxLength: 80 },
		expected: '$ sleep 1 (exit 0)',
	},
	{
		name: 'bash envelope: missing exit code omits the exit segment gracefully',
		tool: 'bash',
		input: `{"command": "sleep 2", "output": "${LONG_Z_RUN}"}`,
		options: { maxLength: 80 },
		expected: `$ sleep 2: ${'z'.repeat(68)}…`,
	},
	{
		name: 'bash envelope: tail is the last non-empty line, not the head',
		tool: 'bash',
		input: `{"command": "npm test", "exit_code": 0, "output": "${'x'.repeat(200)}\\nPASS"}`,
		options: { maxLength: 80 },
		expected: '$ npm test (exit 0): PASS',
	},
	{
		name: 'bash envelope: blank trailing lines are skipped for the tail',
		tool: 'bash',
		input: `{"command": "c", "exit_code": 0, "output": "${'p'.repeat(200)}\\nbody\\n  "}`,
		options: { maxLength: 80 },
		expected: '$ c (exit 0): body',
	},
	{
		name: 'bash envelope: nested JSON output stays plain text',
		tool: 'bash',
		input: `{"command": "cat", "exit_code": 0, "output": "{\\"a\\": 1}", "description": "${LONG_D_RUN}"}`,
		options: { maxLength: 80 },
		expected: '$ cat (exit 0): {"a": 1}',
	},
	{
		name: 'bash envelope: long stderr truncates at a word boundary',
		tool: 'bash',
		input:
			'{"command": "bad", "exit_code": 2, "stderr": "traceback line one here ' +
			'and more context that is quite long indeed yes"}',
		options: { failed: true, maxLength: 80 },
		expected:
			'$ bad (exit 2): traceback line one here and more context that is quite long…',
	},
	{
		name: 'file envelope: path + changed lines + message head',
		tool: 'edit_file',
		input:
			'{"path": "src/app.js", "linesChanged": 16, "message": "changed lines ' +
			'10-25 in src/app.js plus a long explanation that keeps going and going"}',
		options: { maxLength: 80 },
		expected:
			'src/app.js · 16 lines: changed lines 10-25 in src/app.js plus a long…',
	},
	{
		name: 'unknown envelope: key/value pairs instead of a severed JSON head',
		tool: 'bash',
		input: `{"exit_code": 0, "chunk_id": "exec-9-9", "description": "${LONG_D_RUN}"}`,
		options: { maxLength: 80 },
		expected: `exit_code: 0, chunk_id: exec-9-9, description: ${'d'.repeat(32)}…`,
	},
	{
		name: 'long unknown JSON: single pair truncates hard without spaces',
		tool: 'write_file',
		input: `{"data": "${LONG_V_PAYLOAD}"}`,
		options: { maxLength: 80 },
		expected: `data: ${'v'.repeat(73)}…`,
	},
	{
		name: 'glob-style array: scalar items join with commas, trailing comma trimmed',
		tool: 'bash',
		input: JSON.stringify(
			Array.from({ length: 30 }, (_, i) => `f${String(i).padStart(2, '0')}.js`),
		),
		options: { maxLength: 80 },
		expected:
			'f00.js, f01.js, f02.js, f03.js, f04.js, f05.js, f06.js, f07.js, f08.js, f09.js…',
	},
	{
		name: 'short plain output stays byte-identical',
		tool: 'bash',
		input: 'file.txt',
		options: { maxLength: 80 },
		expected: 'file.txt',
	},
	{
		name: 'short envelope output stays byte-identical',
		tool: 'write_file',
		input: '{ "ok": true }',
		options: { maxLength: 80 },
		expected: '{ "ok": true }',
	},
	{
		name: 'short bash envelope stays byte-identical (no summary under budget)',
		tool: 'bash',
		input: '{"command": "t", "exit_code": 0, "output": "ok"}',
		options: { maxLength: 80 },
		expected: '{"command": "t", "exit_code": 0, "output": "ok"}',
	},
	{
		name: 'ANSI colors strip to plain text',
		tool: 'bash',
		input: '\u001b[32mok\u001b[0m',
		options: { maxLength: 80 },
		expected: 'ok',
	},
	{
		name: 'exactly maxLength stays verbatim (no ellipsis at the boundary)',
		tool: 'bash',
		input: LONG_K_80,
		options: { maxLength: 80 },
		expected: LONG_K_80,
	},
	{
		name: 'one over maxLength truncates hard without spaces',
		tool: 'bash',
		input: LONG_K_81,
		options: { maxLength: 80 },
		expected: `${'k'.repeat(79)}…`,
	},
	{
		name: '10KB word run truncates at a word boundary',
		tool: 'bash',
		input: 'line one has words '.repeat(500),
		options: { maxLength: 80 },
		expected: `${'line one has words '.repeat(3)}line one has words…`,
	},
	{
		name: 'multi-line plain output collapses to one line, then truncates',
		tool: 'bash',
		input: `first line\nsecond line\n${'padding '.repeat(50)}`,
		options: { maxLength: 80 },
		expected: `first line second line ${'padding '.repeat(6)}padding…`,
	},
	{
		name: 'failed flag keeps the plain text (the caller renders "failed")',
		tool: 'bash',
		input: 'exit code 1',
		options: { failed: true, maxLength: 80 },
		expected: 'exit code 1',
	},
	{
		name: 'streamer budget: 700-char token run truncates at 600',
		tool: 'bash',
		input: LONG_K_700,
		options: { maxLength: 600 },
		expected: `${'w'.repeat(599)}…`,
	},
	{
		name: 'streamer budget: multi-line short output keeps its newlines',
		tool: 'bash',
		input: 'build ok\ntests ok',
		options: { maxLength: 600 },
		expected: 'build ok\ntests ok',
	},
	{
		name: 'non-string inputs coerce instead of throwing',
		tool: 'bash',
		input: 0,
		options: { maxLength: 80 },
		expected: '0',
	},
	{
		name: 'boolean input coerces to text',
		tool: 'bash',
		input: false,
		options: { maxLength: 80 },
		expected: 'false',
	},
	{
		name: 'null input renders empty (the caller omits the excerpt)',
		tool: 'bash',
		input: null,
		options: { maxLength: 80 },
		expected: '',
	},
];

/***
 * MARK: TOOL_START_FIXTURES
 * @description Golden input -> summary pairs for `summarizeToolStart`.
 * @example TOOL_START_FIXTURES[0] => { name: 'short bash args …', expected: '{"command":…}' }
 ***/
export const TOOL_START_FIXTURES = [
	{
		name: 'short bash args stay byte-identical JSON',
		tool: 'bash',
		input: { command: 'ls -la' },
		options: { maxLength: 120 },
		expected: '{"command":"ls -la"}',
	},
	{
		name: 'short file args stay byte-identical JSON',
		tool: 'read_file',
		input: { path: '/a/b.js' },
		options: { maxLength: 120 },
		expected: '{"path":"/a/b.js"}',
	},
	{
		name: 'short args with offset/limit stay byte-identical JSON',
		tool: 'read_file',
		input: { path: '/a/b.js', offset: 10, limit: 50 },
		options: { maxLength: 120 },
		expected: '{"path":"/a/b.js","offset":10,"limit":50}',
	},
	{
		name: 'long bash command picks the command, truncates at a word boundary',
		tool: 'bash',
		input: { command: LONG_WORD_RUN },
		options: { maxLength: 120 },
		expected: `${'word '.repeat(23)}word…`,
	},
	{
		name: 'long single-token command truncates hard',
		tool: 'bash',
		input: { command: LONG_SINGLE_TOKEN },
		options: { maxLength: 120 },
		expected: `${'y'.repeat(119)}…`,
	},
	{
		name: 'long file args pick the path and mark the remainder',
		tool: 'edit_file',
		input: { path: '/p', content: LONG_W_RUN },
		options: { maxLength: 120 },
		expected: '/p …',
	},
	{
		name: 'long unknown-tool args truncate the JSON at a word boundary',
		tool: 'frobnicate',
		input: { big: LONG_W_RUN },
		options: { maxLength: 120 },
		expected: `{"big":"${'w'.repeat(111)}…`,
	},
	{
		name: 'missing args render empty (the caller keeps the name() shape)',
		tool: 'bash',
		input: null,
		options: { maxLength: 120 },
		expected: '',
	},
	{
		name: 'undefined args render empty',
		tool: 'bash',
		input: undefined,
		options: { maxLength: 120 },
		expected: '',
	},
	{
		name: 'raw string args pass through when short',
		tool: 'bash',
		input: 'raw',
		options: { maxLength: 120 },
		expected: 'raw',
	},
	{
		name: 'long raw string args truncate at a word boundary',
		tool: 'bash',
		input: LONG_WORD_RUN,
		options: { maxLength: 120 },
		expected: `${'word '.repeat(23)}word…`,
	},
	{
		name: 'array command joins to one line when short',
		tool: 'bash',
		input: { command: ['ls', '-la'] },
		options: { maxLength: 120 },
		expected: '{"command":["ls","-la"]}',
	},
];

/***
 * MARK: ENVELOPE_FIXTURES
 * @description Golden input -> parsed-envelope pairs for `parseResultEnvelope`.
 *   `expectedSummary` is the budgeted one-line summary, `expectedDetail` the
 *   full human-readable detail for expand panels.
 ***/
export const ENVELOPE_FIXTURES = [
	{
		name: 'bash envelope parses with summary + full detail',
		input:
			'{"chunk_id": "exec-17-1", "command": "npm run test:frontend", ' +
			'"output": "Test Files  12 passed (12)\\n      Tests  148 passed (148)", ' +
			'"exit_code": 0}',
		options: { maxLength: 80 },
		expectedKind: 'bash',
		expectedSummary: '$ npm run test:frontend (exit 0): Tests  148 passed (148)',
		expectedDetail: 'Test Files  12 passed (12)\n      Tests  148 passed (148)',
	},
	{
		name: 'generic envelope parses to key/value pairs',
		input: '{"a": 1}',
		options: { maxLength: 80 },
		expectedKind: 'generic',
		expectedSummary: 'a: 1',
		expectedDetail: '{"a": 1}',
	},
	{
		name: 'scalar array parses to a joined list',
		input: '["a.js", "b.js"]',
		options: { maxLength: 80 },
		expectedKind: 'list',
		expectedSummary: 'a.js, b.js',
		expectedDetail: '["a.js", "b.js"]',
	},
	{
		name: 'plain text is not an envelope',
		input: 'hello',
		options: { maxLength: 80 },
		expectedKind: null,
		expectedSummary: null,
		expectedDetail: null,
	},
	{
		name: 'broken JSON is not an envelope',
		input: '  {bad',
		options: { maxLength: 80 },
		expectedKind: null,
		expectedSummary: null,
		expectedDetail: null,
	},
	{
		name: 'JSON primitives are not envelopes',
		input: '123',
		options: { maxLength: 80 },
		expectedKind: null,
		expectedSummary: null,
		expectedDetail: null,
	},
	{
		name: 'null is not an envelope',
		input: null,
		options: { maxLength: 80 },
		expectedKind: null,
		expectedSummary: null,
		expectedDetail: null,
	},
];

/***
 * MARK: USAGE_SUMMARY_FIXTURES
 * @description Golden input -> summary pairs for `summarizeUsage` (unified
 *   log platform telemetry lane). Both camelCase normalized payloads and
 *   snake_case vendor payloads are pinned.
 * @example USAGE_SUMMARY_FIXTURES[0] => { name: 'full usage', expected: 'tokens=…' }
 ***/
export const USAGE_SUMMARY_FIXTURES = [
	{
		name: 'full normalized usage with cost and context',
		input: {
			inputTokens: 1200,
			outputTokens: 300,
			totalTokens: 1500,
			costUsd: 0.012,
			contextUsed: 1500,
			contextWindow: 200000,
		},
		expected: 'tokens=1200/300/1500 cost=$0.012 context=1500/200000',
	},
	{
		name: 'snake_case vendor usage derives the total',
		input: { input_tokens: 10, output_tokens: 5 },
		expected: 'tokens=10/5/15',
	},
	{
		name: 'agy-shaped usage derives the total from input/output',
		input: { input_tokens: 100, output_tokens: 50, thinking_tokens: 25 },
		expected: 'tokens=100/50/150',
	},
	{
		name: 'empty usage degrades to usage unknown',
		input: {},
		expected: 'usage unknown',
	},
	{
		name: 'null usage degrades to usage unknown',
		input: null,
		expected: 'usage unknown',
	},
];

/***
 * MARK: PERMISSION_SUMMARY_FIXTURES
 * @description Golden input -> summary pairs for `summarizePermission`.
 ***/
export const PERMISSION_SUMMARY_FIXTURES = [
	{
		name: 'permission request names method and target',
		input: { method: 'bash', target: 'rm -rf /tmp/x' },
		expected: '[PERM] request bash rm -rf /tmp/x',
	},
	{
		name: 'permission resolution names the decision',
		input: { method: 'bash', target: 'rm -rf /tmp/x', decision: 'deny' },
		expected: '[PERM] deny: bash rm -rf /tmp/x',
	},
	{
		name: 'bare request never renders blank',
		input: {},
		expected: '[PERM] request unknown',
	},
];

/***
 * MARK: PLAN_SUMMARY_FIXTURES
 * @description Golden input -> summary pairs for `summarizePlan`.
 ***/
export const PLAN_SUMMARY_FIXTURES = [
	{
		name: 'plan steps list titles in order',
		input: { steps: [{ title: 'read the repo' }, { title: 'write the fix' }] },
		expected: '[PLAN] 2 steps: read the repo — write the fix',
	},
	{
		name: 'empty plan degrades to updated',
		input: { steps: [] },
		expected: '[PLAN] updated',
	},
];

/***
 * MARK: RAW_SUMMARY_FIXTURES
 * @description Golden input -> summary pairs for `summarizeRaw`.
 ***/
export const RAW_SUMMARY_FIXTURES = [
	{
		name: 'raw evidence names wire type and reason',
		input: { evidence: { wireType: 'message.part.updated', reason: 'unmapped' } },
		expected: '[RAW] message.part.updated: unmapped',
	},
	{
		name: 'bare raw record never renders blank',
		input: {},
		expected: '[RAW] event',
	},
];
