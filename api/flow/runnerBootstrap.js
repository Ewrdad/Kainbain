/***
 * MARK: resolveRunnerBootstrap
 * @description Reads the fleet's first-run story from plain Runner records
 *   (no registry needed, so onboarding UI and tests can call it with any
 *   record list): how many Runners exist per status, whether any approved
 *   Runner was seen recently, and the single honest next action — approve
 *   the pending Runner, start the silent one, wait for the
 *   install-expected one, install one, or nothing when a Runner is live.
 *   Malformed entries are skipped, never fatal.
 * @example resolveRunnerBootstrap([{ runnerId: 'local-pi', status: 'pending', lastSeenAt: null }]) => { total: 1, pending: 1, nextAction: 'approve-runner', ... }
 * @param {Array} [records=[]] - Runner records (`{ runnerId, status, lastSeenAt }`).
 * @param {Object} [opts] - Options.
 * @param {number} [opts.now=Date.now()] - Clock (tests pin this).
 * @param {number} [opts.staleAfterMs=60000] - Freshness window for `lastSeenAt`.
 * @param {string|null} [opts.expectedRunnerId=null] - Runner id the installer
 *   created (`KAINBAIN_EXPECTED_RUNNER_ID`); reported back with whether it
 *   has checked in yet so the UI can wait for it by name.
 * @returns {Object} `{ total, pending, active, denied, revoked,
 *   hasApprovedRunner, hasPendingRunner, hasFreshRunner, freshRunnerIds,
 *   expectedRunnerId, expectedRunnerSeen, nextAction, nextActionDetail }`.
 ***/
export const resolveRunnerBootstrap = (
	records = [],
	{ now = Date.now(), staleAfterMs = 60000, expectedRunnerId = null } = {},
) => {
	const list = Array.isArray(records)
		? records.filter((r) => r && typeof r === "object")
		: [];
	const windowMs =
		typeof staleAfterMs === "number" && staleAfterMs > 0 ? staleAfterMs : 60000;
	const at = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
	const counts = { total: list.length, pending: 0, active: 0, denied: 0, revoked: 0 };
	const freshRunnerIds = [];
	for (const record of list) {
		const status = record.status;
		if (Object.hasOwn(counts, status)) counts[status] += 1;
		if (status !== "active") continue;
		const seen = Date.parse(record.lastSeenAt || "");
		if (Number.isFinite(seen) && at - seen <= windowMs) {
			freshRunnerIds.push(record.runnerId);
		}
	}
	const hasApprovedRunner = counts.active > 0;
	const hasPendingRunner = counts.pending > 0;
	const hasFreshRunner = freshRunnerIds.length > 0;
	const expected =
		typeof expectedRunnerId === "string" && expectedRunnerId.trim()
			? expectedRunnerId.trim()
			: null;
	const expectedRunnerSeen = expected
		? list.some((r) => r.runnerId === expected)
		: false;

	let nextAction = "install-runner";
	let nextActionDetail =
		"No Runner is registered yet. Install one (deploy/install.sh or install-runner.sh) so it can register and wait for approval.";
	if (hasFreshRunner) {
		nextAction = "none";
		nextActionDetail = `Runner ${freshRunnerIds[0]} is connected.`;
	} else if (hasPendingRunner) {
		nextAction = "approve-runner";
		nextActionDetail =
			"A Runner is waiting for approval. Approve it in System Settings › Runners — it collects its credential by itself, no paste needed.";
	} else if (hasApprovedRunner) {
		nextAction = "start-runner";
		nextActionDetail =
			"The approved Runner has gone silent. Start (or restart) its runner process so it heartbeats again.";
	} else if (expected && !expectedRunnerSeen) {
		nextAction = "wait-for-runner";
		nextActionDetail = `Waiting for the installed Runner ${expected} to check in. If it never appears, check that its runner process is running and can reach this backend.`;
	}
	return {
		...counts,
		hasApprovedRunner,
		hasPendingRunner,
		hasFreshRunner,
		freshRunnerIds,
		expectedRunnerId: expected,
		expectedRunnerSeen,
		nextAction,
		nextActionDetail,
	};
};
