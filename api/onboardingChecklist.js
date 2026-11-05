/***
 * MARK: taskHasRun
 * @description Whether a task shows any sign of engine activity: a stage
 *   report landed, or its history moved past the single creation entry.
 *   A freshly created task (`reports: []`, one history row) has not run.
 *   Malformed input yields false, never a crash.
 * @example taskHasRun({ reports: [], history: [{ action: 'Created' }] }) => false
 * @param {Object} task - Task record.
 * @returns {boolean} True when the task ran at least once.
 ***/
export const taskHasRun = (task) => {
	if (!task || typeof task !== "object") return false;
	if (Array.isArray(task.reports) && task.reports.length > 0) return true;
	if (Array.isArray(task.history) && task.history.length > 1) return true;
	return false;
};

/***
 * MARK: resolveOnboardingChecklist
 * @description Turns first-run facts into the guided checklist UI state:
 *   Runner connected → first project → first task run. Each step carries
 *   its done flag plus honest copy naming the next move; `complete` is
 *   true only when all three hold. Pure (no stores), so the route and
 *   tests share it.
 * @example resolveOnboardingChecklist({ runner: { hasFreshRunner: false }, projectCount: 0, taskCount: 0, hasRun: false }).complete => false
 * @param {Object} [facts]
 * @param {Object} [facts.runner] - `resolveRunnerBootstrap` output.
 * @param {number} [facts.projectCount=0] - Adopted/created project count.
 * @param {number} [facts.taskCount=0] - Total task count.
 * @param {boolean} [facts.hasRun=false] - Any task ran (`taskHasRun`).
 * @returns {{steps: Array, complete: boolean}} Checklist steps + rollup.
 ***/
export const resolveOnboardingChecklist = ({
	runner = {},
	projectCount = 0,
	taskCount = 0,
	hasRun = false,
} = {}) => {
	const runnerDone = runner?.hasFreshRunner === true;
	const projectDone = Number(projectCount) > 0;
	const runDone = hasRun === true;
	const steps = [
		{
			id: "runner",
			title: "Connect a Runner",
			done: runnerDone,
			detail: runnerDone
				? "A Runner is connected and heartbeating."
				: typeof runner?.nextActionDetail === "string" && runner.nextActionDetail
					? runner.nextActionDetail
					: "Install a Runner so agent stages have somewhere to run.",
			nextAction:
				typeof runner?.nextAction === "string" ? runner.nextAction : "install-runner",
		},
		{
			id: "project",
			title: "Create or adopt a project",
			done: projectDone,
			detail: projectDone
				? "At least one project is on the board."
				: "Create a project (with its git remote) or adopt an existing checkout.",
		},
		{
			id: "run",
			title: "Run your first task",
			done: runDone,
			detail: runDone
				? "A task has run through the engine."
				: taskCount > 0
					? "Tasks exist but none has run yet — press run on one."
					: "Add a task on the board, then run it.",
		},
	];
	return { steps, complete: steps.every((step) => step.done) };
};
