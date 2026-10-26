import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";

/***
 * MARK: WorkflowRegistry
 * @description Tracks in-flight workflow runs. Runs are keyed by a generated
 * id and expire after a TTL so the registry does not grow unboundedly on a
 * long-running server (there is no completion signal from the agent yet).
 ***/
const RUN_TTL_MS = config.workflowRunTtlMs; // 24 hours
const SWEEP_INTERVAL_MS = config.workflowSweepMs; // sweep every hour

export class WorkflowRegistry {
	constructor() {
		this.runs = new Map(); // runId -> runInfo
		this.sweepTimer = null;
	}

	/***
	 * MARK: list
	 * @description Lists all currently tracked workflow runs.
	 * @example workflowRegistry.list() => [{ id: 'run-1', workflowId: 'wf-1' }]
	 * @returns {Array<Object>}
	 ***/
	list() {
		return Array.from(this.runs.values());
	}

	/***
	 * MARK: start
	 * @description Registers and starts a new workflow run.
	 * @example workflowRegistry.start({ workflowId: 'wf-1', projectId: 'proj-1' })
	 * @param {Object} opts
	 * @param {string} opts.workflowId
	 * @param {string} opts.projectId
	 * @returns {Object} The created run info.
	 ***/
	start({ workflowId, projectId }) {
		const run = {
			id: uuidv4(),
			workflowId,
			projectId,
			status: "In Progress",
			startedAt: new Date().toISOString(),
		};
		this.runs.set(run.id, run);
		return run;
	}

	/***
	 * MARK: startCleanup
	 * @description Starts the periodic TTL sweep that removes stale runs older than 24 hours.
	 * @example workflowRegistry.startCleanup()
	 ***/
	startCleanup() {
		if (this.sweepTimer) return;
		this.sweepTimer = setInterval(() => {
			const cutoff = Date.now() - RUN_TTL_MS;
			for (const [runId, run] of this.runs) {
				if (new Date(run.startedAt).getTime() < cutoff) {
					this.runs.delete(runId);
				}
			}
		}, SWEEP_INTERVAL_MS);
		if (this.sweepTimer.unref) this.sweepTimer.unref();
	}
}

export const workflowRegistry = new WorkflowRegistry();
