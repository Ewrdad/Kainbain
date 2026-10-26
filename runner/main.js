import { loadRunnerConfig } from "./config.js";
import { createRunnerClient } from "./client.js";
import { runSingleAssignment } from "./daemon.js";

/***
 * MARK: main
 * @description Loopback Runner entrypoint (`node runner/main.js`): loads
 *   env config, runs one explicit assignment over the wire, and exits
 *   non-zero with the reason on failure. All behavior lives in
 *   test-covered units; this only wires env → client → daemon.
 * @example node runner/main.js
 ***/
export async function main(env = process.env) {
	const config = loadRunnerConfig(env);
	const client = createRunnerClient({ backendUrl: config.backendUrl });
	const summary = await runSingleAssignment({ config, client });
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
