import { execFile } from "node:child_process";
import { startSupervisedSpawn } from "../shared/harnessScaffold.js";
import { binaryAvailable, resolveSpawnBinary } from "../../harnessDiscovery.js";
import { config } from "../../../config/index.js";
import {
	classifiesForeignHarness,
	normalizeModelRef,
	parseModelKey,
} from "../../../../shared/modelKeys.js";
import {
	assertSafeVibeArgs,
	buildVibeChildEnv,
	buildVibeSpawnPlan,
	readVibeExport,
	resolveVibeSettings,
} from "./vibePermissions.js";
import { createVibeStreamParser } from "./vibeStreamParser.js";
import { createVibeEventMapper } from "./vibeEventMapper.js";
import { createVibeModelCatalog } from "./vibeModelCatalog.js";
import { AcpSessionRuntime } from "../acp/AcpSessionRuntime.js";
import { AcpSessionWrapper } from "../acp/AcpSessionWrapper.js";
import {
	applyVibeSessionMode,
	applyVibeSessionModel,
	buildVibeAcpHandshake,
	buildVibeAcpSessionParams,
	classifyVibeAcpStartupFailure,
	describeVibeWorkspaceTrust,
	detectSwallowedVibeFailure,
	resolveVibeAcpEndpoint,
	resolveVibePermissionDecision,
	resolveVibeSessionMode,
	sanitizeVibeAcpEnv,
	vibeTransportError,
} from "./vibeAcpSupport.js";

/**
 * MARK: vibeHarness
 * @description The Mistral Vibe AgentHarness (Tier 2): stage turns run on a
 *   long-lived bidirectional ACP session over the standalone `vibe-acp`
 *   agent (two-way steering, permission interception, live usage telemetry,
 *   per-session model pinning via `session/set_config_option`), with the
 *   Tier-3 exec path (`vibe --prompt` per turn, `--output streaming` rows
 *   parsed, `vibeStreamParser.js`/`vibeEventMapper.js`) kept intact as the
 *   tested rollback (`KAINBAIN_VIBE_ACP=off`). The generic ACP core owns
 *   the protocol (`api/agent/harnesses/acp/`); every vibe decision lives in
 *   `vibeAcpSupport.js`.
 *
 *   Lifecycle: on the ACP path one `prompt(text)` is one turn on the LIVE
 *   session (wrapper-owned: lazy start, steer/followUp, abort, dispose);
 *   on the exec path one `prompt(text)` = ONE `vibe --prompt` process
 *   (stage executions begin fresh sessions, so per-stage spawn matches the
 *   engine's fresh-per-stage semantics).
 *
 *   Model contract: the ACP transport serves a live model catalogue read
 *   from the agent's `session/new` configOptions (`vibeModelCatalog.js`,
 *   `modelSelection: "list"`), and a dispatch-resolved model ref is pinned
 *   per session via `session/set_config_option` (vibe ignores model kwargs
 *   on session/new and session/prompt — probe-verified). The exec
 *   transport keeps the v1 contract honestly: no catalogue (`[]` + the
 *   existing VIBE_BIN_MISSING / VIBE_CLI_INCOMPATIBLE discovery errors)
 *   and a model ref is ignored with a run-log note.
 *
 *   Terminal signal (exec path): vibe emits NO terminal record on stdout —
 *   process exit is the terminal signal (0 finished, 1 usage/config error,
 *   2 infrastructure failure, 3 stopped by a limit) enriched by
 *   `--output-dir/export.json` (`outcome`, `stop_reason`, `usage`,
 *   `cost_usd`, `steps`). Exit 3 (limit stops such as `time_limit`)
 *   maps to `run_error` naming the limit, and every settle logs the
 *   cost/usage line so the run's spend stays visible.
 *
 *   Safety: argv/env come from `vibePermissions.js` — `--workdir` is
 *   always pinned, `--auto-approve` is ON by default (operator-chosen: no
 *   approval UI exists yet; KAINBAIN_VIBE_AUTO_APPROVE=0 restores
 *   per-agent approvals), and the flag is constructed ONLY from the
 *   resolved setting — never from prompt text. The ACP path maps the same
 *   setting onto the native session mode (`auto-approve` vs `ask`) and
 *   answers permission gates per the same policy. The child env is
 *   redacted (`MISTRAL_API_KEY` passes only as an explicit optional
 *   override), and an engine-side watchdog (SIGTERM → SIGKILL) backs every
 *   run. Every spawn and settle emits one [VIBE]/[VIBE ACP] system-log
 *   line via the event bridge carrying the argv SHAPE (flags only — prompt
 *   text is elided to its length, never logged), pid, exit code, duration,
 *   the export outcome/cost, and stderr-tail size on failure.
 */

/** Child-process supervision (spawn, watchdog SIGTERM→SIGKILL, stderr ring,
 *  UTF-8 decoders) is owned by the shared scaffold
 *  (`../shared/harnessScaffold.js`); this file keeps argv shape, run-outcome
 *  semantics, and event translation. */

/** `${projectId}:${ref}` keys already warned about, so hot loops cannot spam logs. */
const warnedInitialModels = new Set();

/** Harness-owned flags the effective CLI must advertise in `--help`. Stock
 *  Vibe >= 3.0 is the unified Rust TUI and advertises all three; a preflight
 *  that finds them missing means the harness's argv cannot run on THAT binary
 *  (a legacy pre-3.0 install, or an incompatible wrapper — see
 *  docs/EngineDetails/VibeHarness.md). */
export const VIBE_REQUIRED_CLI_FLAGS = Object.freeze([
	"--output-dir",
	"--time-limit",
	"--prompt-file",
]);

/** Process-lifetime capability cache keyed by `bin::cli` — `--help` only, no
 *  inference, never on the per-run hot path (discovery/health only). Only
 *  conclusive results are cached (see the probe). Operational note: an
 *  in-place binary upgrade under the SAME path (e.g. 2.x -> 3.0) keeps the
 *  old verdict until the process restarts — the failure direction is
 *  fail-closed (a stale INCOMPATIBLE refuses to spawn rather than
 *  mis-spawning), and any `KAINBAIN_VIBE_BIN`/`KAINBAIN_VIBE_CLI` change
 *  re-keys and re-probes. Restart the service after upgrading vibe. */
const vibeCapabilityCache = new Map();

/***
 * MARK: clearVibeCapabilityCache
 * @description Evicts the capability cache so the next discovery probe re-runs
 *   `vibe --help`. Tests call it between fixture-binary cases.
 ***/
export function clearVibeCapabilityCache() {
	vibeCapabilityCache.clear();
}

/***
 * MARK: probeVibeCliCapabilities
 * @description Runs the effective binary with `--help` under the SAME
 *   `VIBE_CLI` pin the harness spawns with, and reports which harness-owned
 *   flags its help text advertises. A probe that cannot run (spawn error,
 *   timeout, empty output) is INCONCLUSIVE, not a failure — a wrapper binary
 *   that does not implement `--help` must not be reported as incompatible.
 * @returns {Promise<{inconclusive: boolean, missingFlags: Array<string>, reason?: string}>}
 ***/
async function probeVibeCliCapabilities(bin, cli) {
	const key = `${bin}::${cli || ""}`;
	const cached = vibeCapabilityCache.get(key);
	if (cached) return cached;
	const result = await new Promise((resolve) => {
		const env = buildVibeChildEnv(process.env, { cli });
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		const timer = setTimeout(
			() => finish({ inconclusive: true, missingFlags: [], reason: "probe timeout" }),
			4000,
		);
		if (timer.unref) timer.unref();
		execFile(bin, ["--help"], { timeout: 4000, env }, (error, stdout) => {
			if (error) {
				return finish({
					inconclusive: true,
					missingFlags: [],
					reason: error.message,
				});
			}
			const help = String(stdout || "");
			if (!help.trim()) {
				return finish({
					inconclusive: true,
					missingFlags: [],
					reason: "empty --help output",
				});
			}
			finish({
				inconclusive: false,
				missingFlags: VIBE_REQUIRED_CLI_FLAGS.filter((flag) => !help.includes(flag)),
			});
		});
	});
	// Only conclusive results are cached; an inconclusive probe may be a
	// transient spawn failure and should be retried next time.
	if (!result.inconclusive) vibeCapabilityCache.set(key, result);
	return result;
}

/***
 * MARK: vibeCliIncompatibleHint
 * @description Turns a non-zero-exit stderr tail into the named, actionable
 *   `VIBE_CLI_INCOMPATIBLE` diagnostic when the CLI rejected a harness-owned
 *   flag (`clap`: `unexpected argument '…' found`; `argparse`: `unrecognized
 *   arguments`). Returns null for any other failure so unrelated errors keep
 *   their existing shape. Self-diagnosing fallback for the preflight.
 * @example vibeCliIncompatibleHint("error: unexpected argument '--output-dir' found") => "VIBE_CLI_INCOMPATIBLE: …"
 * @param {string} stderrText - The captured stderr tail.
 * @returns {string|null} The diagnostic prefix, or null.
 ***/
export function vibeCliIncompatibleHint(stderrText) {
	const text = String(stderrText || "");
	if (!/unexpected argument|unrecognized arguments/i.test(text)) return null;
	const named = (text.match(/unexpected argument '([^']+)' found/) || [])[1];
	const subject = named ? `the flag ${named}` : "a harness-owned flag";
	return (
		`VIBE_CLI_INCOMPATIBLE: the vibe CLI rejects ${subject}; ` +
		"set KAINBAIN_VIBE_CLI=python (recommended) or point KAINBAIN_VIBE_BIN at a CLI " +
		"that supports --output-dir/--time-limit/--prompt-file."
	);
}

/***
 * MARK: vibeArgvShape
 * @description Renders an argv array as its flag SHAPE for logs: flags and
 *   their option values are kept, but the prompt payload (`--prompt` value,
 *   or the `--prompt-file` path) is elided to a length/staged marker so
 *   prompt text never leaks into logs.
 ***/
export function vibeArgvShape(args) {
	const shape = [];
	for (let i = 0; i < args.length; i += 1) {
		const token = args[i];
		if (token === "--prompt") {
			const value = args[i + 1] ?? "";
			shape.push("--prompt", `<prompt:${Buffer.byteLength(String(value), "utf8")}B>`);
			i += 1;
			continue;
		}
		if (token === "--prompt-file") {
			shape.push("--prompt-file", "<staged>");
			i += 1;
			continue;
		}
		if (
			token === "--workdir" ||
			token === "--output" ||
			token === "--output-dir" ||
			token === "--agent" ||
			token === "--time-limit" ||
			token === "--enabled-tools" ||
			token === "--disabled-tools"
		) {
			shape.push(token, args[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (token.startsWith("--")) {
			shape.push(token);
			continue;
		}
		shape.push(`<arg:${Buffer.byteLength(String(token), "utf8")}B>`);
	}
	return shape.join(" ");
}

/***
 * MARK: vibeExportSummary
 * @description Renders the `export.json` record as one log fragment:
 *   `outcome=… stop=… cost_usd=… tokens=in/out/total steps=N`, with `…`
 *   fallbacks when the export is missing ("usage unknown" — the export
 *   enriches the run log, it never gates the run).
 ***/
export function vibeExportSummary(exportRecord) {
	if (!exportRecord) return "export=unknown";
	const usage = exportRecord.usage;
	const tokens = usage
		? `${usage.inputTokens ?? "?"}/${usage.outputTokens ?? "?"}/${usage.totalTokens ?? "?"}`
		: "?/?/?";
	return [
		`outcome=${exportRecord.outcome ?? "?"}`,
		`stop=${exportRecord.stopReason ?? exportRecord.error ?? "-"}`,
		`cost_usd=${exportRecord.costUsd ?? "?"}`,
		`tokens=${tokens}`,
		`steps=${exportRecord.steps ?? "?"}`,
	].join(" ");
}

/***
 * MARK: vibeExportToUsage
 * @description Normalizes a vibe `export.json` record into the unified
 *   usage payload: token counters and cost ride through, `steps` rides as
 *   the step count. Returns null when the export carries no counters, so
 *   callers emit nothing instead of an empty telemetry record.
 * @example vibeExportToUsage({ usage: { inputTokens: 1 }, costUsd: 0.1, steps: 3 })
 ***/
export function vibeExportToUsage(exportRecord) {
	const usage = exportRecord?.usage;
	const costUsd =
		typeof exportRecord?.costUsd === "number" ? exportRecord.costUsd : null;
	const pick = (value) =>
		typeof value === "number" && Number.isFinite(value) ? value : null;
	const input = pick(usage?.inputTokens);
	const output = pick(usage?.outputTokens);
	const total = pick(usage?.totalTokens);
	if (input === null && output === null && total === null && costUsd === null) {
		return null;
	}
	return {
		inputTokens: input,
		outputTokens: output,
		totalTokens:
			total ?? (input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null),
		costUsd: costUsd,
		steps:
			typeof exportRecord?.steps === "number" ? exportRecord.steps : null,
	};
}

/***
 * MARK: createVibeSession
 * @description Builds one HarnessSession backed by per-turn `vibe --prompt`
 *   processes. The session owns the spawn lifecycle (watchdog, abort
 *   escalation, stderr capture, run-tmpdir cleanup), delivers NORMALIZED
 *   events via `subscribe`, and implements the model-control surface as
 *   honest no-ops (listModels [] / resolveModelRef null — v1).
 * @param {Object} project - The project entity (cwd is REQUIRED: every vibe run is pinned to the project workspace).
 * @param {Object} [meta] - { taskId, stageId } run metadata (fresh sessions per stage).
 * @param {Object} harness - The owning vibe harness (settings + log).
 * @returns {Object} The contract-conforming HarnessSession.
 ***/
function createVibeSession(project, meta, harness) {
	if (!project || !project.cwd) {
		throw new Error(
			"Vibe sessions require a project with a cwd (vibe runs are pinned to the project workspace)",
		);
	}

	const handlers = new Set();
	const messages = [];
	const runLabel = `${meta?.stageId || "adhoc"}:${meta?.taskId || "chat"}`;

	let disposed = false;
	let streaming = false;
	let lastAssistantText = "";
	let liveSup = null;
	let selfAborted = false;

	const deliver = (event) => {
		for (const handler of [...handlers]) handler(event);
	};

	function spawnVibeRun(promptText, { onAssistantDelta } = {}) {
		return new Promise((resolveRun) => {
			const runState = {
				response: "",
				status: null,
				error: null,
				sawTerminal: false,
				terminalKind: null,
				deltaText: "",
			};
			const startedAt = Date.now();
			const parser = createVibeStreamParser();
			const runFacts = {
				harness: "vibe",
				autoApprove: Boolean(harness.settings.autoApprove),
				agent: harness.settings.agent || null,
			};
			const mapper = createVibeEventMapper({ runFacts });

			let planPromise;
			try {
				planPromise = buildVibeSpawnPlan({
					prompt: promptText,
					workspaceDir: project.cwd,
					settings: harness.settings,
				});
			} catch (planError) {
				const message = `Failed to build vibe spawn plan: ${planError?.message || planError}`;
				deliver({ type: "run_error", error: message });
				resolveRun({ ...runState, status: "ERROR", error: message });
				return;
			}

			planPromise.then(
				(plan) => {
					const childEnv = plan.env || buildVibeChildEnv(process.env, {
						cli: harness.settings.cli,
					});
					let sup;
					try {
						// Spawn mechanics (options, decoders, stderr ring, watchdog
						// SIGTERM→SIGKILL) are owned by the shared scaffold; the
						// run-outcome handlers below stay here (protocol mapping).
						sup = startSupervisedSpawn(plan.command, plan.args, {
							cwd: project.cwd,
							env: childEnv,
							timeoutMs: harness.settings.timeoutMs,
							onTimeout: () => {
								runState.timedOut = true;
								runState.status = "ERROR";
								runState.error = `vibe run timed out after ${harness.settings.timeoutMs}ms`;
							},
						});
					} catch (spawnError) {
						const message = `Failed to start vibe CLI '${plan.command}': ${spawnError?.message || spawnError}`;
						deliver({ type: "run_error", error: message });
						plan.cleanup?.().finally(() => {
							resolveRun({ ...runState, status: "ERROR", error: message });
						});
						return;
					}
					const child = sup.child;
					const { stdoutDecoder, stderrDecoder, stderr } = sup;
					liveSup = sup;
					harness.log(
						`[VIBE] spawn ${runLabel}: ${vibeArgvShape(plan.args)} pid=${child.pid ?? "?"}`,
					);
					// Vibe emits no run-start row: the spawned process IS the
					// run start (carries the spawn facts for the transcript).
					for (const event of mapper.startRun()) deliver(event);

					const settle = (outcome) => {
						if (runState.settled) return;
						runState.settled = true;
						sup.dispose();
						liveSup = null;
						const durationMs = Date.now() - startedAt;
						const tailChars = stderr.text().length;
						const exportRecord = readVibeExport(plan.outputDir);
						harness.log(
							`[VIBE] settle ${runLabel}: exit=${outcome.exitCode ?? "?"} terminal=${runState.terminalKind || "none"} durationMs=${durationMs} ${vibeExportSummary(exportRecord)} stderrChars=${tailChars}`,
						);
						plan.cleanup?.().finally(() => resolveRun(outcome));
					};

					function ingestRows(rows) {
						for (const row of rows) {
							for (const event of mapper.map(row)) {
								if (
									event.type === "assistant_delta" &&
									typeof event.delta === "string"
								) {
									runState.deltaText += event.delta;
									onAssistantDelta?.(event.delta);
								}
								if (event.type === "run_finished") {
									runState.sawTerminal = true;
									runState.terminalKind = "completed";
									runState.status = "COMPLETED";
									if (typeof event.response === "string") {
										runState.response = event.response;
									}
								}
								if (event.type === "run_error") {
									runState.sawTerminal = true;
									runState.terminalKind = "failed";
									runState.status = "ERROR";
									runState.error =
										typeof event.error === "string"
											? event.error
											: "vibe run failed";
								}
								deliver(event);
							}
						}
					}

					child.stdout.on("data", (chunk) => {
						ingestRows(parser.push(stdoutDecoder.write(chunk)));
					});

					child.stderr.on("data", (chunk) => {
						stderr.push(stderrDecoder.write(chunk));
					});

					child.on("error", (error) => {
						if (runState.settled) return;
						runState.status = "ERROR";
						runState.error = `Failed to start vibe CLI '${plan.command}': ${error.message}`;
						deliver({ type: "run_error", error: runState.error });
						settle({ ...runState, exitCode: null, aborted: selfAborted });
					});

					child.on("close", (code) => {
						if (runState.settled) return;
						ingestRows(parser.push(stdoutDecoder.end()));
						stderr.push(stderrDecoder.end());
						ingestRows(parser.flush());

						if (runState.sawTerminal) {
							settle({ ...runState, exitCode: code, aborted: selfAborted });
							return;
						}
						if (selfAborted) {
							deliver({
								type: "run_finished",
								status: "aborted",
								interrupted: true,
							});
							settle({
								...runState,
								status: "ABORTED",
								exitCode: code,
								aborted: true,
							});
							return;
						}
						if (runState.timedOut) {
							deliver({ type: "run_error", error: runState.error });
							settle({ ...runState, exitCode: code, aborted: false });
							return;
						}
						const exportRecord = readVibeExport(plan.outputDir);
						const tail = stderr.text();
						const cliDiagnostic = vibeCliIncompatibleHint(tail);
						// The export's cost/usage/stop counters become structured
						// telemetry (usage_updated) BEFORE the terminal event, so
						// the transcript keeps them as a [USAGE] record instead of
						// a log-text line alone.
						const emitExportTelemetry = () => {
							const usage = vibeExportToUsage(exportRecord);
							if (usage) deliver({ type: "usage_updated", usage });
						};
						// Exit 0 is the finished signal (vibe emits no
						// terminal row): the accumulated assistant deltas ARE
						// the response.
						if (code === 0) {
							runState.sawTerminal = true;
							runState.terminalKind = "completed";
							runState.status = "COMPLETED";
							runState.response = runState.deltaText;
							emitExportTelemetry();
							deliver({
								type: "run_finished",
								status: "completed",
								response: runState.deltaText,
							});
							settle({ ...runState, exitCode: code, aborted: false });
							return;
						}
						// Exit 3 is a limit stop (time limit, or a budget flag
						// passed via KAINBAIN_VIBE_ARGS): name the limit from
						// the export so the operator sees WHICH guardrail
						// fired, with partial text preserved.
						if (code === 3) {
							const limit =
								exportRecord?.outcome ||
								exportRecord?.stopReason ||
								"limit";
							runState.status = "ERROR";
							runState.error =
								`vibe stopped by a limit (${limit}); partial output preserved` +
								(tail ? `: ${tail}` : "");
							emitExportTelemetry();
							deliver({ type: "run_error", error: runState.error });
							settle({ ...runState, exitCode: code, aborted: false });
							return;
						}
						runState.status = "ERROR";
						runState.error = cliDiagnostic
							? `${cliDiagnostic} (exit ${code ?? "unknown"})${tail ? `: ${tail}` : ""}`
							: `vibe exited with code ${code ?? "unknown"} without producing a response` +
								(tail ? `: ${tail}` : "");
						emitExportTelemetry();
						deliver({ type: "run_error", error: runState.error });
						settle({ ...runState, exitCode: code, aborted: false });
					});
				},
				(planError) => {
					const message = `Failed to build vibe spawn plan: ${planError?.message || planError}`;
					deliver({ type: "run_error", error: message });
					resolveRun({ ...runState, status: "ERROR", error: message });
				},
			);
		});
	}

	const session = {
		harnessId: "vibe",
		harnessName: "vibe",
		runLabel,

		get isStreaming() {
			return streaming;
		},

		getMessages: () => messages,

		getLastAssistantText: () => lastAssistantText,

		async prompt(text, { onChunk } = {}) {
			if (disposed) throw new Error("Vibe session is disposed");
			if (streaming) {
				throw new Error("Vibe session is already running a prompt");
			}
			messages.push({ role: "user", content: text });
			streaming = true;
			selfAborted = false;
			let turnText = "";
			lastAssistantText = "";

			try {
				const outcome = await spawnVibeRun(text, {
					onAssistantDelta: (delta) => {
						lastAssistantText += delta;
						onChunk?.(delta);
					},
				});
				turnText =
					typeof outcome.response === "string" && outcome.response.trim()
						? outcome.response
						: lastAssistantText;
				if (turnText) {
					messages.push({ role: "assistant", content: turnText });
				}
				return turnText;
			} finally {
				streaming = false;
				liveSup = null;
			}
		},

		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},

		async abort() {
			if (!liveSup) return { status: "idle" };
			selfAborted = true;
			// SIGTERM with scaffold-owned SIGKILL escalation — vibe
			// documents SIGTERM as stopping the run the same way
			// --time-limit does (writes the export, exits 3).
			liveSup.kill("SIGTERM");
			return { status: "aborted" };
		},

		async dispose() {
			if (disposed) return;
			disposed = true;
			if (liveSup) {
				selfAborted = true;
				liveSup.kill("SIGKILL");
				liveSup = null;
			}
			handlers.clear();
		},

		async getActiveModel() {
			return null;
		},

		async listModels() {
			return harness.listModels();
		},

		async resolveModelRef() {
			return null;
		},

		async switchModel(ref) {
			harness.log(
				`[WARN] Requested model '${typeof ref === "string" ? ref : ref?.id}' is not resolvable on the vibe harness in v1 (no model discovery); the stage keeps vibe's default model.`,
			);
			return null;
		},
	};

	return session;
}

/***
 * MARK: resolveVibeAcpSettings
 * @description Resolves the ACP-transport settings from injected overrides
 *   or the validated engine configuration (`KAINBAIN_VIBE_ACP*`, parsed by
 *   the config schema). These own ONLY the ACP path — every exec setting
 *   stays in `vibePermissions.js`'s `resolveVibeSettings`.
 * @example resolveVibeAcpSettings({ acpMode: "off" }) => { acpMode: "off", … }
 * @param {Object} [deps] - Injected overrides (acpMode, acpBin, acpStartTimeoutMs).
 * @returns {Object} { acpMode, acpBin, acpStartTimeoutMs }.
 ***/
export function resolveVibeAcpSettings(deps = {}) {
	const acpModeRaw = deps.acpMode !== undefined ? deps.acpMode : config.vibeAcpMode;
	const acpBinRaw = deps.acpBin !== undefined ? deps.acpBin : config.vibeAcpBin;
	return {
		acpMode: typeof acpModeRaw === "string" && acpModeRaw.trim() ? acpModeRaw.trim() : "auto",
		acpBin: typeof acpBinRaw === "string" ? acpBinRaw.trim() : "",
		// Handshake ceiling for the ACP session start (tests shorten it; the
		// per-turn watchdog stays engine-side, as with the exec transport).
		acpStartTimeoutMs: deps.acpStartTimeoutMs || config.vibeAcpStartTimeoutMs || 30000,
		// Test/diagnostic env merges ON TOP of the sanitized child env (the
		// generic mock agent's ACP_MOCK_* knobs do not match the VIBE_ prefix
		// allowlist, so tests inject them explicitly). Never sourced from
		// configuration — the sanitizer's guarantees hold in production.
		acpEnv: deps.acpEnv && typeof deps.acpEnv === "object" ? { ...deps.acpEnv } : null,
	};
}

/***
 * MARK: selectVibeTransport
 * @description Chooses the session transport: `"acp"` for the long-lived
 *   two-way ACP session over `vibe-acp`, `"exec"` for the legacy per-turn
 *   CLI spawn. `"on"` forces ACP, `"off"` forces exec (the rollback), and
 *   `"auto"` (default) engages ACP when the ACP entrypoint RESOLVES:
 *   an explicit `KAINBAIN_VIBE_ACP_BIN` override, or the `vibe-acp`
 *   sibling of the resolved vibe binary (they ship in the same install
 *   dir, so Tier 2 engages by default on healthy installs). The bare
 *   PATH spelling alone does NOT auto-engage — a test/mock vibeBin must
 *   never silently pick up the host's real `vibe-acp`; operators can force
 *   it with `KAINBAIN_VIBE_ACP=on`.
 * @example selectVibeTransport({ acpMode: "off" }) => "exec"
 * @example selectVibeTransport({ acpMode: "auto", acpBin: "/bin/mock" }) => "acp"
 * @example selectVibeTransport({ acpMode: "auto", vibeBin: "/home/u/.local/bin/vibe" }) => "acp" // sibling exists
 * @param {Object} settings - The resolved harness settings (acpMode, acpBin, bin).
 * @param {Object} [opts]
 * @param {Function} [opts.existsFn] - Existence check for the sibling probe (tests inject).
 * @returns {"acp"|"exec"} The transport for new sessions.
 ***/
export function selectVibeTransport(settings, { existsFn } = {}) {
	if (settings?.acpMode === "off") return "exec";
	if (settings?.acpMode === "on") return "acp";
	if (typeof settings?.acpBin === "string" && settings.acpBin.trim()) return "acp";
	const endpoint = resolveVibeAcpEndpoint({
		vibeBin: settings?.bin,
		acpBin: "",
		existsFn,
	});
	return endpoint.mode === "sibling" ? "acp" : "exec";
}

/***
 * MARK: createAcpVibeSession
 * @description Builds one HarnessSession backed by a long-lived
 *   bidirectional ACP connection (the Tier-2 path): the generic core owns
 *   framing, JSON-RPC, process-group supervision, and event mapping, while
 *   the vibe flavor contributes the entrypoint, env sanitization, the
 *   session mode, the model-application hook, the swallowed-transport
 *   filter, and the permission policy. Startup failures are classified
 *   (bin-missing / auth / timeout / discovery-failed) and logged with
 *   their fix hint; the session itself reports them as run_error.
 * @param {Object} project - The project entity (cwd is REQUIRED).
 * @param {Object} [meta] - { taskId, stageId } run metadata.
 * @param {Object} harness - The owning vibe harness (settings + catalog + log).
 * @param {Object} [opts]
 * @param {Object|null} [opts.initialModel] - Pinned model for the session's turns.
 * @returns {Object} The contract-conforming HarnessSession.
 ***/
function createAcpVibeSession(project, meta, harness, { initialModel } = {}) {
	if (!project || !project.cwd) {
		throw new Error(
			"Vibe sessions require a project with a cwd (vibe runs are pinned to the project workspace)",
		);
	}
	const runLabel = `${meta?.stageId || "adhoc"}:${meta?.taskId || "chat"}`;
	const endpoint = resolveVibeAcpEndpoint({
		vibeBin: harness.settings.bin,
		acpBin: harness.settings.acpBin,
	});
	const catalogAdapter = {
		listModels: (opts) => harness.listModels(opts),
		resolveModelRef: (ref) => harness.resolveModelRef(ref),
		getModelDiscoveryStatus: () => harness.getModelDiscoveryStatus(),
	};
	return new AcpSessionWrapper({
		harnessId: "vibe",
		runLabel,
		catalog: catalogAdapter,
		initialModel: initialModel || null,
		applySessionModel: applyVibeSessionModel,
		log: (message) => harness.log(`[VIBE ACP] ${message}`, project?.id),
		permissionPolicy: async (method, params) => {
			if (method !== "requestPermission") return { outcome: { outcome: "cancelled" } };
			return resolveVibePermissionDecision(params, {
				autoApprove: harness.settings.autoApprove,
			});
		},
		inspectAssistantText: (text) =>
			detectSwallowedVibeFailure(text) ? vibeTransportError(text) : null,
		createRuntime: async (hooks) => {
			const command = resolveSpawnBinary(endpoint.command);
			const runtime = new AcpSessionRuntime({
				command,
				args: endpoint.args,
				cwd: project.cwd,
				env: { ...sanitizeVibeAcpEnv(), ...(harness.settings.acpEnv || {}) },
				initializeParams: buildVibeAcpHandshake(),
				newSessionParams: buildVibeAcpSessionParams({ cwd: project.cwd }),
				startTimeoutMs: harness.settings.acpStartTimeoutMs || 30000,
				log: (message) => harness.log(`[VIBE ACP] ${message}`, project?.id),
				onNotification: hooks.onNotification,
				onRequest: hooks.onRequest,
			});
			try {
				await runtime.start();
			} catch (error) {
				const classified = classifyVibeAcpStartupFailure(error, { bin: command });
				harness.log(
					`[VIBE ACP] session start failed [${classified.code}]: ${classified.message} ${classified.hint}`,
					project?.id,
				);
				throw error;
			}
			// The exec path passes --auto-approve; the ACP path maps the
			// same setting onto the native session mode instead.
			const trustWarning = describeVibeWorkspaceTrust(runtime.sessionResult);
			if (trustWarning) {
				harness.log(`[VIBE ACP] ${trustWarning}`, project?.id);
			}
			await applyVibeSessionMode(
				runtime,
				runtime.sessionId,
				resolveVibeSessionMode(harness.settings),
				{
					log: (message) => harness.log(`[VIBE ACP] ${message}`, project?.id),
				},
			);
			return runtime;
		},
	});
}

/***
 * MARK: createVibeHarness
 * @description Builds the Mistral Vibe AgentHarness: the engine's entry point
 *   for creating vibe-backed sessions. Same factory signature as the pi,
 *   antigravity, and muse harnesses (it registers into the same harness
 *   seam), with every vibe setting overridable for tests.
 * @example const harness = createVibeHarness({ eventBridge });
 * @example const session = await harness.createSession(project, { taskId, stageId });
 * @param {Object} [deps]
 * @param {Object} [deps.eventBridge] - The EventBridge singleton (injected for testability).
 * @param {string} [deps.vibeBin] - Override the vibe binary path (tests use the fixture mock).
 * @param {boolean} [deps.autoApprove] - Override --auto-approve (default true).
 * @param {string} [deps.agent] - Override --agent profile.
 * @param {number} [deps.timeLimitS] - Override --time-limit seconds.
 * @param {boolean} [deps.trust] - Override --trust (default true).
 * @param {Array<string>} [deps.enabledTools] - Override --enabled-tools repeats.
 * @param {Array<string>} [deps.disabledTools] - Override --disabled-tools repeats.
 * @param {number} [deps.timeoutMs] - Override the engine-side watchdog duration.
 * @param {string|Array} [deps.extraArgs] - Override KAINBAIN_VIBE_ARGS.
 * @param {string} [deps.acpMode] - Transport selection: "on" (ACP session), "off" (exec), "auto" (default; ACP when the vibe-acp endpoint resolves).
 * @param {string} [deps.acpBin] - Standalone vibe ACP agent binary (engages the ACP path; tests use the mock fixture).
 * @param {number} [deps.acpStartTimeoutMs] - Handshake ceiling for the ACP session start.
 * @param {Object} [deps.catalog] - Override the model catalog (tests inject fixture loaders).
 * @returns {Object} The AgentHarness for vibe.
 ***/
export function createVibeHarness(deps = {}) {
	const { eventBridge } = deps;
	// Single resolution source: resolveVibeSettings already merges injected
	// overrides over the validated engine configuration (types, enums, and
	// the vibe→agent timeout chain) and normalizes every knob (booleans,
	// CSV tool filters), so the factory only resolves the binary on top.
	// Re-resolving field-by-field here would bypass that normalization and
	// let unnormalized shapes (e.g. a CSV string for enabledTools) leak
	// into harness.settings.
	const resolved = resolveVibeSettings(deps);
	const settings = {
		...resolved,
		...resolveVibeAcpSettings(deps),
		// Bare names resolve through PATH + standard install dirs
		// (~/.local/bin, ~/bin) so an off-PATH install still runs; explicit
		// paths and PATH hits pass through verbatim (see resolveSpawnBinary).
		bin: resolveSpawnBinary(resolved.bin),
	};
	// The ACP-transport session path (Tier 2); the exec fallback stays the
	// default until the ACP entrypoint resolves (see selectVibeTransport).
	const transport = selectVibeTransport(settings);

	const log = (message, projectId) => {
		if (!message) return;
		const target = projectId || deps.projectId || "vibe";
		eventBridge?.emitSystemLog?.(target, message, {
			projectId: projectId || deps.projectId || null,
			tag: "[VIBE]",
			level: "info",
		});
	};

	// Guard the factory's own defaults at construction: a config that would
	// construct --auto-approve is allowed (explicit opt-in), but the guard
	// still proves the workspace pin exists on every spawn plan.
	void assertSafeVibeArgs;

	// The ACP model catalog (live discovery over `vibe-acp`; lazy — the
	// handshake-only probe runs on first listModels/resolveModelRef). Its
	// log callback is wired to the harness log so discovery failures reach
	// the event bridge, not just the server console. The exec transport
	// never consults it (an honest [] instead).
	const catalog =
		deps.catalog ||
		createVibeModelCatalog({
			endpoint: resolveVibeAcpEndpoint({ vibeBin: settings.bin, acpBin: settings.acpBin }),
			log,
		});

	/***
	 * MARK: discoveryFailureSuffix (internal)
	 * @description Names the ACP catalog's retained discovery failure (""
	 *   when healthy or nothing has probed yet) so unresolvable-model
	 *   warnings can point at the cause instead of shrugging.
	 ***/
	function discoveryFailureSuffix() {
		const status =
			typeof catalog.getModelDiscoveryStatus === "function"
				? catalog.getModelDiscoveryStatus()
				: null;
		if (!status || status.ok !== false || !status.error) return "";
		return ` Vibe model discovery failed [${status.error.code}]: ${status.error.message} ${status.error.hint}`;
	}

	const harness = {
		id: "vibe",

		/** Programmatic model catalogue on the ACP transport (the agent's
		 *  `session/new` model select, discovered live): the UI renders a
		 *  model dropdown for this harness. The exec transport serves the
		 *  same surface honestly ([] + its discovery error). */
		modelSelection: "list",
		reasoningLevels: null,

		settings,
		log,

		/***
		 * MARK: modelRuntime
		 * @description The model runtime adapter backed by the ACP model
		 *   catalog (exec transport: empty — no catalogue exists there).
		 * @returns {Promise<Object>} The model runtime adapter.
		 ***/
		async modelRuntime() {
			const models = transport === "acp" ? await catalog.listModels() : [];
			return {
				getAvailableSnapshot: async () => models,
				getModels: async () => models,
				getModel: () => null,
			};
		},

		/***
		 * MARK: listModels
		 * @description Lists the deployment's vibe models over the ACP
		 *   catalog (handshake-only discovery, TTL-cached). With
		 *   `{ refresh: true }` the TTL cache is dropped first so the UI's
		 *   Refresh genuinely re-probes. The exec transport keeps the
		 *   honest v1 empty list.
		 * @example await harness.listModels() => [{ provider: "mistral", … }]
		 * @param {Object} [opts]
		 * @param {boolean} [opts.refresh=false] - Drop the TTL cache and re-run discovery first.
		 * @returns {Promise<Array<Object>>} The provider-tagged model list.
		 ***/
		async listModels({ refresh = false } = {}) {
			if (transport !== "acp") return [];
			if (refresh) catalog.clearCache?.();
			return catalog.listModels();
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a stored model reference (canonical
		 *   `vibe::mistral::<id>`, legacy `mistral::<id>`, or bare id/name)
		 *   against the ACP catalog; null when unresolvable (callers warn —
		 *   resolution never silently swaps). The exec transport always
		 *   returns null (no catalogue).
		 * @returns {Promise<Object|null>} The resolved model, or null.
		 ***/
		async resolveModelRef(ref) {
			if (transport !== "acp") return null;
			return catalog.resolveModelRef(ref);
		},

		/***
		 * MARK: resolveInitialModel
		 * @description Resolves the project's stored default model against
		 *   the ACP catalog for a NEW session (parity with the agy/opencode
		 *   harnesses). Blank means "vibe default" (null, silent). An
		 *   unresolvable non-blank reference warns visibly (deduped per
		 *   project + ref) instead of silently running elsewhere. The exec
		 *   transport has no catalogue: the default is ignored (null,
		 *   silent — the legacy contract).
		 * @param {Object} project - The project entity (defaultModel).
		 * @returns {Promise<Object|null>} The resolved model, or null.
		 ***/
		async resolveInitialModel(project) {
			const ref = project?.defaultModel;
			if (typeof ref !== "string" || !ref.trim()) return null;
			if (transport !== "acp") return null;
			const resolved = await catalog.resolveModelRef(normalizeModelRef(ref, "vibe"));
			if (!resolved) {
				const foreign = classifiesForeignHarness(ref, "vibe") ? parseModelKey(ref.trim())?.harness : null;
				const dedupeKey = `${project?.id || "system"}:${ref}`;
				if (!warnedInitialModels.has(dedupeKey)) {
					warnedInitialModels.add(dedupeKey);
					log(
						foreign
							? `[INFO] Configured model '${ref}' is scoped to harness '${foreign}', not vibe; the vibe session's default model will be used for project '${project?.name || project?.id || "default"}'. Scope it with a Model Alias to silence this.`
							: `[WARN] Configured model '${ref}' could not be resolved against the vibe model catalog for project '${project?.name || project?.id || "default"}'; the session's default model will be used. Update the project default model in Settings.${discoveryFailureSuffix()}`,
						project?.id,
					);
				}
			}
			return resolved;
		},

		async readHistoryFromDisk() {
			return { messages: [], tree: [] };
		},

		/***
		 * MARK: getModelDiscoveryStatus
		 * @description Reports the harness's model-discovery health (`{ ok:
		 *   true }` or `{ ok: false, error: { code, message, hint } }`).
		 *   ACP transport: the vibe-acp endpoint must resolve (bin-missing
		 *   is the classic one), then the catalog's retained discovery
		 *   failure (if any) names the rest. Exec transport (the rollback):
		 *   the existing checks — binary resolution plus the flag-capability
		 *   preflight (a CLI implementation that rejects the harness-owned
		 *   flags means exec stages cannot run at all). Optional contract
		 *   method: routes consult it when present and serve the error
		 *   alongside an empty catalogue.
		 * @example await harness.getModelDiscoveryStatus() => { ok: true }
		 * @returns {Promise<Object>} The discovery status.
		 ***/
		async getModelDiscoveryStatus() {
			if (transport === "acp") {
				const endpoint = resolveVibeAcpEndpoint({
					vibeBin: settings.bin,
					acpBin: settings.acpBin,
				});
				const resolvedAcpBin = resolveSpawnBinary(endpoint.command);
				if (!binaryAvailable(resolvedAcpBin)) {
					return {
						ok: false,
						error: {
							code: "VIBE_ACP_BIN_MISSING",
							message: `The Mistral Vibe ACP agent was not found ('${resolvedAcpBin}' is not runnable).`,
							hint: "vibe-acp ships in the same install dir as vibe — reinstall Mistral Vibe, or set KAINBAIN_VIBE_ACP_BIN to the vibe-acp absolute path, or set KAINBAIN_VIBE_ACP=off to use the legacy exec path.",
						},
					};
				}
				const catalogStatus =
					typeof catalog.getModelDiscoveryStatus === "function"
						? catalog.getModelDiscoveryStatus()
						: { ok: true };
				return catalogStatus.ok === false ? catalogStatus : { ok: true };
			}
			if (!binaryAvailable(settings.bin)) {
				return {
					ok: false,
					error: {
						code: "VIBE_BIN_MISSING",
						message: `The vibe CLI was not found ('${settings.bin}' is not on PATH).`,
						hint: "Install Mistral Vibe and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_VIBE_BIN to its absolute path.",
					},
				};
			}
			const probe = await probeVibeCliCapabilities(settings.bin, settings.cli);
			if (probe.inconclusive || probe.missingFlags.length === 0) return { ok: true };
			return {
				ok: false,
				error: {
					code: "VIBE_CLI_INCOMPATIBLE",
					message: `vibe CLI '${settings.bin}' does not accept the harness-owned flags (${probe.missingFlags.join("/")}).`,
					hint: "Set KAINBAIN_VIBE_CLI=python (recommended) or point KAINBAIN_VIBE_BIN at a CLI that supports them.",
				},
			};
		},

		/***
		 * MARK: probeHealth
		 * @description Offline health probe: resolves the binary and reports
		 *   its `vibe --version` string so version drift is visible, then
		 *   runs the `--help` capability preflight under the harness's
		 *   VIBE_CLI pin so a flag-incompatible CLI is reported here too
		 *   (status `error`, `VIBE_CLI_INCOMPATIBLE`). On the ACP transport
		 *   it ALSO verifies the vibe-acp endpoint resolves (status
		 *   `error`, `VIBE_ACP_BIN_MISSING` when it does not) and names the
		 *   endpoint in the ok message. Never runs inference, never runs a
		 *   prompt, and never touches project state.
		 ***/
		async probeHealth() {
			const started = Date.now();
			const endpoint = resolveVibeAcpEndpoint({
				vibeBin: settings.bin,
				acpBin: settings.acpBin,
			});
			const acpBinary = transport === "acp" ? resolveSpawnBinary(endpoint.command) : null;
			const acpAvailable = acpBinary ? binaryAvailable(acpBinary) : null;
			const version = await new Promise((resolve) => {
				const timer = setTimeout(() => resolve(null), 4000);
				if (timer.unref) timer.unref();
				execFile(
					settings.bin,
					["--version"],
					{ timeout: 4000 },
					(error, stdout) => {
						clearTimeout(timer);
						if (error) return resolve(null);
						resolve(String(stdout || "").trim().slice(0, 200) || null);
					},
				);
			});
			if (!version) {
				return {
					name: "vibe",
					status: "error",
					latencyMs: Date.now() - started,
					timestamp: new Date().toISOString(),
					message: `vibe binary '${settings.bin}' not resolvable`,
					binary: settings.bin,
					...(transport === "acp" ? { transport, acpBinary: acpBinary || endpoint.command } : {}),
				};
			}
			if (transport === "exec") {
				const probe = await probeVibeCliCapabilities(settings.bin, settings.cli);
				if (!probe.inconclusive && probe.missingFlags.length > 0) {
					return {
						name: "vibe",
						status: "error",
						latencyMs: Date.now() - started,
						timestamp: new Date().toISOString(),
						message: `vibe reachable (${version}) but its CLI rejects the harness-owned flags (${probe.missingFlags.join("/")})`,
						binary: settings.bin,
						version,
						code: "VIBE_CLI_INCOMPATIBLE",
					};
				}
			}
			if (transport === "acp" && !acpAvailable) {
				return {
					name: "vibe",
					status: "error",
					latencyMs: Date.now() - started,
					timestamp: new Date().toISOString(),
					message: `vibe reachable (${version}) but the ACP agent '${acpBinary || endpoint.command}' was not found — the ACP session path cannot start`,
					binary: settings.bin,
					version,
					transport,
					acpBinary: acpBinary || endpoint.command,
					code: "VIBE_ACP_BIN_MISSING",
				};
			}
			return {
				name: "vibe",
				status: "ok",
				latencyMs: Date.now() - started,
				timestamp: new Date().toISOString(),
				message:
					transport === "acp"
						? `vibe reachable (${version}), ACP transport over '${acpBinary || endpoint.command}'`
						: `vibe reachable (${version}), exec transport (KAINBAIN_VIBE_ACP=on engages the ACP session path)`,
				binary: settings.bin,
				version,
				...(transport === "acp" ? { transport, acpBinary: acpBinary || endpoint.command } : { transport }),
			};
		},

		/***
		 * MARK: createSession
		 * @description Creates a fresh HarnessSession for a project. ACP
		 *   transport (Tier 2): a long-lived bidirectional session — the
		 *   dispatch-resolved `model` (target hand-off) or the project's
		 *   default model is resolved against the catalog and pinned via
		 *   `session/set_config_option` (an unresolvable ref warns and
		 *   falls back to the session default — never a silent swap). Exec
		 *   transport (the rollback): one `vibe --prompt` process per turn;
		 *   a model ref is accepted and ignored (this harness's exec path
		 *   manages its own model — dispatch already logged the ignore).
		 * @example await harness.createSession(project, { taskId, stageId }) => session
		 * @param {Object} project - The project entity (cwd required).
		 * @param {Object} [meta] - { taskId, stageId, sessionDir, model } run metadata.
		 * @returns {Promise<Object>} The contract-conforming session.
		 ***/
		async createSession(project, { taskId, stageId, sessionDir, model } = {}) {
			// Use the transport captured at construction so every surface of one
			// harness instance (listModels / resolveModelRef / discovery health /
			// sessions) agrees: config is boot-time (docs/ports-env.md) and a
			// half-engaged instance would resolve models against an empty
			// catalogue while creating ACP sessions, or vice versa.
			if (transport === "acp") {
				// TARGET HAND-OFF: a dispatch-resolved `model` is pinned for the
				// session and `resolveInitialModel` is skipped entirely (the
				// project default belongs to another harness's catalog for
				// cross-harness runs). Unresolvable hand-offs warn once and
				// fall back to the session default — never a silent swap.
				let initialModel = null;
				if (typeof model === "string" && model.trim()) {
					const pinned = await catalog.resolveModelRef(normalizeModelRef(model, "vibe"));
					if (!pinned) {
						log(
							`[WARN] Dispatch-resolved model '${model}' could not be resolved against the vibe model catalog for project '${project?.name || project?.id || "default"}'; the session's default model will be used.${discoveryFailureSuffix()}`,
							project?.id,
						);
					}
					initialModel = pinned;
				} else {
					initialModel = await harness.resolveInitialModel(project);
				}
				return createAcpVibeSession(
					project,
					{ taskId, stageId, sessionDir },
					harness,
					{ initialModel },
				);
			}
			// Exec fallback: vibe manages its own model here — the ref is
			// accepted and ignored (dispatch already logged the ignore line).
			void model;
			return createVibeSession(project, { taskId, stageId, sessionDir }, harness);
		},
	};

	return harness;
}
