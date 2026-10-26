// Domain: Watching The Work — Subject unit tests for stage reports and auto-report recognition.
import { describe, it, expect } from 'vitest';
import {
	generateStageReportContent,
	isAutoReportContent,
	saveStageReport,
	stripStageVerdictBlock,
	AUTO_REPORT_MARKER,
} from './stageReports.js';

/***
 * MARK: memoryReportStore
 * @description Minimal in-memory store double for saveStageReport: no
 *   filesystem writes (the project cwd resolves to null).
 * @example memoryReportStore(task) => store
 ***/
function memoryReportStore(task) {
	return {
		getTask: () => task,
		_resolveProjectCwd: () => null,
		_recordHistory: () => {},
		_saveTaskMarkdown: () => {},
	};
}

describe('Watching The Work: stage reports', () => {
	it('generates structured report with AUTO_REPORT_MARKER and section headers', () => {
		const content = generateStageReportContent({
			task: { id: 't-1', goal: 'Implement feature X' },
			stage: { name: 'Unit Test', type: 'ci' },
			status: 'PASSED',
			output: 'All tests pass',
		});

		expect(content).toContain(AUTO_REPORT_MARKER);
		expect(content).toContain('# Stage Report: Unit Test');
		expect(content).toContain('**Stage Type:** `ci`');
		expect(content).toContain('**Status:** PASSED');
		expect(content).toContain('All tests pass');
	});

	it('identifies auto-generated report content correctly', () => {
		expect(isAutoReportContent(`${AUTO_REPORT_MARKER}\n# Report`)).toBe(true);
		expect(isAutoReportContent('# Manual Engineer Report')).toBe(false);
		expect(isAutoReportContent(null)).toBe(false);
	});

	it('strips verdict marker lines but keeps surrounding prose', () => {
		expect(stripStageVerdictBlock('done\nKAINBAIN_VERDICT: PASS')).toBe('done');
		expect(
			stripStageVerdictBlock(
				'KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nKAINBAIN_FIX: blue',
			),
		).toBe('');
		expect(stripStageVerdictBlock('  kainbain_verdict: pass  ')).toBe('');
		expect(stripStageVerdictBlock('plain prose, no markers')).toBe(
			'plain prose, no markers',
		);
		expect(stripStageVerdictBlock('')).toBe('');
		expect(stripStageVerdictBlock(null)).toBe('');
	});

	it('never uses a bare verdict as the report summary when artifacts exist', () => {
		const content = generateStageReportContent({
			task: { id: 't-1', goal: 'Blocked tasks say blocked' },
			stage: { name: 'Technical Elab', type: 'agent' },
			status: 'PASSED',
			output: 'KAINBAIN_VERDICT: PASS',
			summary: '',
			modifiedFiles: ['docs/tasks/t-1/technical-elab-20260922-203536.md'],
		});
		const summary = content
			.split('### Summary of Changes')[1]
			.split('### Execution Output')[0];
		expect(summary.trim()).not.toBe('KAINBAIN_VERDICT: PASS');
		expect(summary).toContain('technical-elab-20260922-203536.md');
		// Raw output is preserved verbatim for the audit trail.
		expect(content).toContain('```\nKAINBAIN_VERDICT: PASS\n```');
	});

	it('falls back to the generic line for a bare verdict with no artifacts', () => {
		const content = generateStageReportContent({
			task: { id: 't-1', goal: 'Blocked tasks say blocked' },
			stage: { name: 'Quick review', type: 'agent' },
			status: 'PASSED',
			output: 'KAINBAIN_VERDICT: PASS',
			summary: '',
			modifiedFiles: [],
		});
		const summary = content
			.split('### Summary of Changes')[1]
			.split('### Execution Output')[0];
		expect(summary.trim()).toBe('Stage completed successfully.');
	});

	it('still prefers real prose over the verdict block', () => {
		const content = generateStageReportContent({
			task: { id: 't-1', goal: 'Blocked tasks say blocked' },
			stage: { name: 'Technical Elab', type: 'agent' },
			status: 'PASSED',
			output: 'Elaboration written to technical-elab.md\nKAINBAIN_VERDICT: PASS',
			summary: '',
			modifiedFiles: [],
		});
		expect(content).toContain('Elaboration written to technical-elab.md');
		const summary = content
			.split('### Summary of Changes')[1]
			.split('### Execution Output')[0];
		expect(summary).not.toContain('KAINBAIN_VERDICT');
	});
});

describe('Watching The Work: report reliability attribution', () => {
	it('persists the running harness and outcome kind when supplied', () => {
		const task = { id: 't-1', currentStageId: 's-1', reports: [] };
		const report = saveStageReport(memoryReportStore(task), 'p1', 't-1', {
			stageName: 'Implementation',
			stageId: 's-1',
			status: 'PASSED',
			content: `${AUTO_REPORT_MARKER}\n# Report`,
			harnessId: 'pi',
			failureKind: 'none',
		});

		expect(report).toMatchObject({ harnessId: 'pi', failureKind: 'none' });
		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			harnessId: 'pi',
			failureKind: 'none',
		});
	});

	it('leaves old-shape reports untouched when attribution is absent', () => {
		const task = { id: 't-1', currentStageId: 's-1', reports: [] };
		const report = saveStageReport(memoryReportStore(task), 'p1', 't-1', {
			stageName: 'Implementation',
			stageId: 's-1',
			status: 'PASSED',
			content: `${AUTO_REPORT_MARKER}\n# Report`,
		});

		expect(report).not.toHaveProperty('harnessId');
		expect(report).not.toHaveProperty('failureKind');
	});

	it('drops blank harness ids and unknown outcome kinds', () => {
		const task = { id: 't-1', currentStageId: 's-1', reports: [] };
		const report = saveStageReport(memoryReportStore(task), 'p1', 't-1', {
			stageName: 'Implementation',
			stageId: 's-1',
			status: 'FAILED',
			content: `${AUTO_REPORT_MARKER}\n# Report`,
			harnessId: '  ',
			failureKind: 'exploded',
		});

		expect(report).not.toHaveProperty('harnessId');
		expect(report).not.toHaveProperty('failureKind');
	});
});
