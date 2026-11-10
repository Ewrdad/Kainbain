import {
	config,
} from '../../config.js';
import { emitAlert } from '../../observability/alerts.js';
import { formatAutoApproveDuration } from '../../../shared/autoApproveDuration.js';
import { checkAutoApproveTask, collectAutoApproveCandidates } from './collectAutoApproveCandidates.js';
import { freshSchedulerStats } from './freshSchedulerStats.js';
import { kickScheduler } from './kickScheduler.js';

/***
 * MARK: autoApproveSweep
 * @description One auto-approve sweeper pass: advances human-parked tasks
 *   whose stamped deadline has passed (oldest first, bounded by the batch
 *   cap — leftovers wait for the next pass; late is safe, early is a bug)
 *   and sends one pre-deadline reminder per wait through the alert seam.
 *   Every advance re-validates the task immediately before acting, so a
 *   human approve/reject/move between the scan and the fire always wins.
 *   Advances reuse `store.advanceStage` (the manual-approval path) with an
 *   `automated` marker; attribution-only differs. Never throws: one task's
 *   failure is counted, never aborts the sweep. O(1) timers — this is the
 *   only timer in the feature, armed by `ensureAutoApproveTimer`.
 * @example autoApproveSweep(store) => { advanced: 0, reminded: 0, … }
 * @param {Object} store - Task store.
 * @param {Object} [opts]
 * @param {number} [opts.now] - Clock injection (defaults to Date.now()).
 * @param {number} [opts.batch] - Max advances + reminders each per sweep (default: store/config, 25).
 * @param {number} [opts.configuredLeadMs] - Reminder lead override (0 disables reminders).
 * @returns {{ sweptAt: string, advanced: number, reminded: number, deferred: number, errors: number, outcome: string }} Sweep summary.
 ***/
export function autoApproveSweep(store, { now = Date.now(), batch, configuredLeadMs } = {}) {
	const summary = {
		sweptAt: new Date(now).toISOString(),
		advanced: 0,
		reminded: 0,
		deferred: 0,
		errors: 0,
		outcome: "idle",
	};
	try {
		if (!store || typeof store !== "object") return summary;
		if (!store.schedulerStats) store.schedulerStats = freshSchedulerStats();
		const stats = store.schedulerStats;
		stats.autoApproveSweeps = (stats.autoApproveSweeps || 0) + 1;
		stats.lastAutoApproveSweepAt = summary.sweptAt;
		const cap = Math.max(
			0,
			batch ?? store.defaultAutoApproveBatch ?? config.autoApproveBatch ?? 25,
		);
		const lead =
			configuredLeadMs ?? store.defaultAutoApproveReminderLeadMs ?? config.autoApproveReminderLeadMs;
		const { due, reminders } = collectAutoApproveCandidates(store, {
			now,
			configuredLeadMs: lead,
		});
		const todo = due.slice(0, cap);
		summary.deferred = due.length - todo.length;
		for (const candidate of todo) {
			try {
				const project = store.projectStore?.getProject?.(candidate.projectId);
				const fresh = store.getTask?.(candidate.projectId, candidate.taskId);
				// Re-validate on the live task immediately before acting: a
				// human approve/reject/move/pause since the scan wins the race.
				const recheck = checkAutoApproveTask(store, project, fresh, {
					now,
					configuredLeadMs: lead,
				});
				if (!recheck || recheck.kind !== "due") continue;
				if (typeof store.advanceStage !== "function") {
					summary.errors += 1;
					continue;
				}
				store.advanceStage(
					candidate.projectId,
					candidate.taskId,
					recheck.stages,
					undefined,
					project?.cwd,
					{
						automated: true,
						autoApproveAt: fresh.autoApproveAt,
						firedAt: new Date(now).toISOString(),
						durationMs: recheck.durationMs,
					},
				);
				summary.advanced += 1;
			} catch {
				summary.errors += 1;
			}
		}
		// Reminders share the same cap shape: one sweep emits at most `cap`
		// advances plus `cap` reminders, oldest deadlines first.
		const remindTodo = reminders.slice(0, cap);
		summary.deferred += reminders.length - remindTodo.length;
		for (const candidate of remindTodo) {
			try {
				const project = store.projectStore?.getProject?.(candidate.projectId);
				const fresh = store.getTask?.(candidate.projectId, candidate.taskId);
				const recheck = checkAutoApproveTask(store, project, fresh, {
					now,
					configuredLeadMs: lead,
				});
				if (!recheck || recheck.kind !== "remind") continue;
				// Marker first, alert second: a crash between the two must
				// not double-remind (the persisted marker owns once-per-visit).
				const remindedAt = new Date(now).toISOString();
				fresh.autoApproveRemindedAt = remindedAt;
				try {
					store._saveTaskMarkdown?.(candidate.projectCwd ?? project?.cwd, fresh);
				} catch {
					// A failed marker write still sends the reminder below —
					// the next sweep retries the marker (at-most-once per
					// persisted write, at-least-once delivery).
				}
				try {
					store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", fresh);
				} catch {
					// Broadcasts never break the sweep.
				}
				const holdText = formatAutoApproveDuration(recheck.durationMs) || "the configured hold";
				const stageName = recheck.stage?.name || recheck.stage?.id || "human stage";
				void emitAlert(store.eventBridge ?? null, {
					event: "task.auto_approve_soon",
					severity: "info",
					projectId: candidate.projectId,
					taskId: candidate.taskId,
					stage: {
						id: recheck.stage?.id,
						name: stageName,
						type: "human",
					},
					message:
						`Approve or reject '${stageName}' by ${fresh.autoApproveAt} — ` +
						`silence approves automatically after ${holdText}.`,
					ui: {
						event: "stage:checkpoint_wait",
						payload: {
							taskId: candidate.taskId,
							stageId: recheck.stage?.id,
							stageName,
							message: `Auto-approves at ${fresh.autoApproveAt} unless you act — silence means approval.`,
							autoApproveAt: fresh.autoApproveAt,
						},
					},
				});
				summary.reminded += 1;
			} catch {
				summary.errors += 1;
			}
		}
		if (summary.advanced > 0) {
			// Newly entered automated stages should dispatch promptly instead
			// of waiting for the next dispatch tick.
			try {
				kickScheduler(store);
			} catch {
				// A failed kick only delays pickup by one interval.
			}
		}
		stats.autoApproved = (stats.autoApproved || 0) + summary.advanced;
		stats.autoApproveReminded = (stats.autoApproveReminded || 0) + summary.reminded;
		stats.autoApproveDeferred = (stats.autoApproveDeferred || 0) + summary.deferred;
		stats.autoApproveErrors = (stats.autoApproveErrors || 0) + summary.errors;
		stats.lastAutoApproveOutcome =
			summary.advanced > 0
				? "advanced"
				: summary.reminded > 0
					? "reminded"
					: summary.deferred > 0
						? "deferred"
						: summary.errors > 0
							? "error"
							: "idle";
		summary.outcome = stats.lastAutoApproveOutcome;
		return summary;
	} catch {
		return summary;
	}
}
