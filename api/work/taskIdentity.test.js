// Domain: The Work — Subject unit tests for task identity, summary projection, and error classifications.
import { describe, it, expect } from 'vitest';
import {
	_sanitizeTaskTitle,
	toTaskSummary,
} from './taskIdentity.js';
import {
	taskBranchName,
	TASK_BRANCH_PREFIX,
} from './taskBranches.js';
import {
	isUnrecoverableError,
	isTransientInfrastructureError,
} from './taskErrors.js';

describe('The Work: task identity and classification', () => {
	it('sanitizes task titles stripping markdown headers, backticks, and extra quotes', () => {
		expect(_sanitizeTaskTitle('# My Task Header')).toBe('My Task Header');
		expect(_sanitizeTaskTitle('`Code Task`')).toBe('Code Task');
		expect(_sanitizeTaskTitle('  "Quoted Task"  ')).toBe('Quoted Task');
	});

	it('formats branch names correctly with prefix', () => {
		expect(taskBranchName('task-123')).toBe(`${TASK_BRANCH_PREFIX}/task-123`);
	});

	it('projects task into board summary without heavy detail fields', () => {
		const fullTask = {
			id: 'task-1',
			title: 'Board Task',
			prompt: 'Very long prompt...',
			processLogs: 'Thousands of lines...',
			logEntries: [{ id: 1 }, { id: 2 }],
			history: [{ action: 'Created' }],
			timeline: [{ stage: 'Dev' }],
			stats: { tokens: 100 },
			reports: [
				{ path: 'doc.md', name: 'Doc', content: 'Detailed markdown...' },
			],
			status: 'in_stage',
			currentStageId: '1',
		};

		const summary = toTaskSummary(fullTask);
		expect(summary.id).toBe('task-1');
		expect(summary.title).toBe('Board Task');
		expect(summary.status).toBe('in_stage');
		expect(summary.prompt).toBeUndefined();
		expect(summary.processLogs).toBeUndefined();
		expect(summary.logEntries).toBeUndefined();
		expect(summary.history).toBeUndefined();
		expect(summary.timeline).toBeUndefined();
		expect(summary.stats).toBeUndefined();
		expect(summary.reports).toEqual([{ path: 'doc.md', name: 'Doc' }]);
	});

	it('caps board-summary reports at the recent few with a total count', () => {
		const fullTask = {
			id: 'task-1',
			title: 'Old Task',
			reports: Array.from({ length: 15 }, (_, i) => ({
				path: `r-${i}.md`,
				name: `R${i}`,
				content: 'x'.repeat(1000),
			})),
			status: 'completed',
			currentStageId: '5',
		};
		const summary = toTaskSummary(fullTask);
		expect(summary.reportCount).toBe(15);
		expect(summary.reports).toHaveLength(10);
		expect(summary.reports[0]).toEqual({ path: 'r-5.md', name: 'R5' });
		expect(summary.reports[9]).toEqual({ path: 'r-14.md', name: 'R14' });
	});

	it('classifies unrecoverable vs transient infrastructure errors', () => {
		expect(isUnrecoverableError('Invalid API Key provided')).toBe(true);
		expect(isUnrecoverableError('Syntax error in script')).toBe(false);

		expect(isTransientInfrastructureError('503 Service Unavailable')).toBe(true);
		expect(isTransientInfrastructureError('ECONNRESET connection reset')).toBe(true);
		expect(isTransientInfrastructureError('fatal: unknown error')).toBe(false);
	});
});
