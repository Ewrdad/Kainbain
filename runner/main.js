import { loadRunnerConfig } from "./config.js";
import { createRunnerClient } from "./client.js";
import { installRootFor, runDispatchLoop, runSingleAssignment } from "./daemon.js";
import { bootstrapUpdateState } from "./updates/state.js";

/***
 * MARK: main
 * @description Loopback Runner entrypoint (`node runner/main.js`): loads
 *   env config and runs one explicit assignment over the wire — or the
 *   capability-aware dispatch loop with KAINBAIN_RUNNER_DISPATCH=1 — then
 *   exits non-zero with the reason on failure. Before anything else it
 *   runs the failed-boot rollback gate (Option A, ADR 0012): three crashed
 *   boots in a row on a staged update flip `current` back to `previous`.
 *   All behavior lives in test-covered units; this only wires
 *   env → client → daemon.
 * @example node runner/main.js
 ***/
export async function main(env = process.env) {
	const config = loadRunnerConfig(env);
	const installRoot = installRootFor(config);
	let boot = { action: "boot", state: null };
	try {
		boot = bootstrapUpdateState({ installRoot });
	} catch (err) {
		console.error(`Runner update-state check failed (booting anyway): ${err?.message || err}`);
	}
	if (boot.action === "rolled-back") {
		console.error(
			`Runner update to ${boot.state?.to || "unknown"} failed to boot ${boot.state?.bootAttempts || 3}x; rolled back to the previous version.`,
		);
	}
	const client = createRunnerClient({ backendUrl: config.backendUrl });
	const summary = config.dispatch
		? await runDispatchLoop({ config, client })
		: await runSingleAssignment({ config, client });
	console.log(`Runner assignment done: ${JSON.stringify(summary)}`);
	return summary;
}

const isEntry = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() || "");
if (isEntry) {
	// One-shot CLI: exit explicitly. Harness dispose can leave inert open
	// handles (pipes/watchers, no child processes) that would otherwise
	// keep the loop alive after the assignment is fully reported.
	main().then(
		() => process.exit(0),
		(err) => {
			console.error(`Runner failed: ${err?.message || err}`);
			process.exit(1);
		},
	);
}
