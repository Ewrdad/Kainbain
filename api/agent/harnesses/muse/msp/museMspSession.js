import { createMuseMspEventMapper } from "./museMspEventMapper.js";
import {
	DEFAULT_MUSE_MSP_TURN_SETTLE_GRACE_MS,
	resolveMuseMspApprovalDecision,
} from "./museMspSupport.js";

/**
 * How long a turn may stay unsettled after the watchdog's `turn/interrupt`
 * before the session force-settles it. The interrupt is a request, not a
 * guarantee — a wedged host can still never send `turn/completed`, and an
 * orphaned turn must never pin a stage (or a chat) forever. The default is
 * shared with the settings resolver; the session honours the per-harness
 * override `settings.mspTurnSettleGraceMs`.
 */
export const MUSE_MSP_TURN_SETTLE_GRACE_MS = DEFAULT_MUSE_MSP_TURN_SETTLE_GRACE_MS;

/**
 * MARK: createMuseMspSession
 * @description Builds one contract-conforming HarnessSession backed by a
 *   long-lived MSP connection to a shared `muse serve` host (the Tier-2
 *   path). The host is borrowed from the per-project pool, so the SAME host
 *   can carry several KainBain sessions at once: this wrapper registers its
 *   notification/request listeners on the runtime (never assigns them —
 *   assignment would clobber a sibling session's handlers) and filters every
 *   frame by its own MSP sessionId. The wrapper owns the SESSION-specific
 *   state: its MSP sessionId, the turn lifecycle (`turn/start` →
 *   notifications → `turn/completed`), live steering, interrupt-based abort,
 *   per-request permission interception, live model switching, and
 *   `session/resume` reconnect after a host death.
 *
 *   Everything the engine consumes stays in the existing normalized event
 *   vocabulary — only the transport changed.
 *
 *   Failure modes (all loud, none silent):
 *   - disposed session: prompt/steer throw immediately.
 *   - host start/reconnect failure: `run_error` is delivered AND prompt()
 *     rejects (the engine classifies a rejection as an infrastructure
 *     failure and retries the stage; the event keeps task logs honest).
 *   - host death mid-turn: the pending turn rejects with
 *     "muse serve host exited mid-turn"; the next turn reconnects and
 *     resumes the session (up to 5 attempts).
 *   - turn/start refused or wedged: `run_error` is delivered; a wedged host
 *     is interrupted by the per-turn watchdog and, if it still does not
 *     settle within MUSE_MSP_TURN_SETTLE_GRACE_MS, the turn force-settles as
 *     a `run_error` and the host is evicted from the pool (the next turn
 *     gets a fresh host).
 *   - approval/userInput request with an unusable shape: answered with a
 *     JSON-RPC error (default-deny), never a guessed choice id.
 * @param {Object} project - The project entity (cwd is REQUIRED).
 * @param {Object} [meta] - { taskId, stageId } run metadata.
 * @param {Object} harness - The owning muse harness (settings, hostPool, catalog, log).
 * @param {Object} [opts]
 * @param {Object|null} [opts.initialModel] - Pinned model for the session.
 * @returns {Object} The contract-conforming HarnessSession.
 ***/
export function createMuseMspSession(project, meta, harness, { initialModel = null } = {}) {
	if (!project || !project.cwd) {
		throw new Error(
			"Muse MSP sessions require a project with a cwd (muse sessions are pinned to the project workspace)",
		);
	}
	const settings = harness.settings;
	const runLabel = `${meta?.stageId || "adhoc"}:${meta?.taskId || "chat"}`;
	const log = (message) => harness.log(`[MUSE MSP] ${message}`, project?.id);
	const handlers = new Set();
	const messages = [];
	const mapper = createMuseMspEventMapper({
		runFacts: {
			harness: "muse",
			transport: "msp",
			approvalMode: harness.effectiveApprovalMode,
			model: initialModel?.id ?? null,
		},
	});

	let disposed = false;
	let streaming = false;
	let lastAssistantText = "";
	let activeModel = initialModel ? { ...initialModel } : null;
	let lease = null;
	let runtime = null;
	let sessionId = null;
	let viewCursor = null;
	let hostDead = false;
	let activeTurnId = null;
	let pendingTurn = null; // { resolve, reject, turnId, settled }
	let turnWatchdog = null;
	let watchdogGraceTimer = null;
	let resumeAttempts = 0;
	/** Per-turn onChunk callback (the engine's primary streaming path). */
	let chunkCallback = null;

	const deliver = (event) => {
		for (const handler of [...handlers]) handler(event);
	};

	function currentSessionId() {
		return sessionId;
	}

	/** True when a notification/request belongs to THIS session. Frames that
	 *  carry no sessionId are accepted (the schema does not put one on every
	 *  notification); frames for a sibling session on the shared host are
	 *  dropped here so two sessions never consume each other's turns. */
	function matchesSession(params) {
		if (!params || typeof params !== "object") return true;
		if (typeof params.sessionId !== "string") return true;
		return !sessionId || params.sessionId === sessionId;
	}

	function handleNotification(method, params) {
		if (disposed) return;
		if (!matchesSession(params)) return;
		if (typeof params?.viewCursor === "string" && params.viewCursor) {
			viewCursor = params.viewCursor;
		}
		// Map ONCE: the mapped events both settle the pending turn and fan
		// out to subscribers (mapping twice would double-count stateful rows).
		const events = mapper.map(method, params);
		if (method === "turn/started" && pendingTurn && !pendingTurn.turnId) {
			pendingTurn.turnId = typeof params?.turnId === "string" ? params.turnId : null;
			activeTurnId = pendingTurn.turnId;
		}
		if (method === "turn/completed") {
			const completedTurnId = typeof params?.turnId === "string" ? params.turnId : null;
			if (
				pendingTurn &&
				!pendingTurn.settled &&
				(!pendingTurn.turnId || !completedTurnId || pendingTurn.turnId === completedTurnId)
			) {
				pendingTurn.settled = true;
				activeTurnId = null;
				pendingTurn.resolve(events);
			}
			// Events for any OTHER turn (e.g. an old queued turn) still fan out.
		}
		for (const event of events) {
			if (event.type === "assistant_delta" && typeof event.delta === "string") {
				if (event.assistantMessageEvent?.type === "text_delta") {
					lastAssistantText += event.delta;
				}
				// onChunk is the engine's PRIMARY streaming path (stage process
				// logs + chat); forward every assistant delta live, exactly like
				// the exec and ACP transports — never buffer the turn for one
				// end-of-turn call.
				chunkCallback?.(event.delta);
			}
			if (event.type === "run_finished" && typeof event.response === "string" && event.response) {
				// The completed agentMessage text is authoritative; it replaces
				// the accumulated deltas (thinking deltas never pollute it).
				lastAssistantText = event.response;
			}
			deliver(event);
		}
	}

	async function fireCommand(method, params) {
		if (!runtime) return null;
		try {
			return await runtime.request(method, params, { command: true, timeoutMs: 15000 });
		} catch (error) {
			log(`${method} failed: ${error?.message || error}`);
			return null;
		}
	}

	/***
	 * MARK: handleHostRequest
	 * @description Answers one server→client MSP request while notifications
	 *   stream. A request for a SIBLING session on the shared host is abstained
	 *   (`undefined`) so that session's own listener answers it. Within this
	 *   session: `approval/request` is a PRESENTATION request whose receipt
	 *   carries no state — the decision travels separately as
	 *   `approval/decide`, guarded by the requirement id; `userInput/request`
	 *   is declined by policy in v1. Both required id shapes are validated
	 *   FIRST: a request we cannot answer correctly is answered with a JSON-RPC
	 *   error (the host then denies/cancels) — never a guessed command.
	 ***/
	async function handleHostRequest(method, params) {
		// Abstain for a sibling session on the shared host (multiplexing), and
		// while our own session is not started — never decide for a session we
		// do not own. With nobody claiming, the runtime answers method-not-found
		// and the host denies/cancels: fail closed.
		if (typeof params?.sessionId === "string" && params.sessionId !== sessionId) {
			return undefined;
		}
		if (!sessionId) {
			return undefined;
		}
		if (method === "approval/request") {
			const approvalId = typeof params?.approvalId === "string" ? params.approvalId : null;
			const requirementId =
				params?.currentRequirementId && typeof params.currentRequirementId === "object"
					? params.currentRequirementId
					: null;
			// approval/decide requires BOTH ids (schema SS5.4); without them a
			// decide would be invalid params, so fail closed instead.
			if (!approvalId || !requirementId) {
				log(
					`approval ${params?.toolName || "tool"} lacks approvalId/currentRequirementId; failing closed`,
				);
				throw new Error("approval request lacks the ids approval/decide requires (default-deny)");
			}
			const decision = resolveMuseMspApprovalDecision(params, {
				approvalMode: harness.effectiveApprovalMode,
			});
			if (!decision) {
				log(
					`approval ${params?.toolName || "tool"} has no recognised choice; failing closed`,
				);
				throw new Error("no recognised approval choice (default-deny)");
			}
			log(
				`approval ${params?.toolName || "tool"}: ${decision.reason} (requirement ${requirementId.sourceIndex ?? "?"})`,
			);
			// The decision is fire-and-forget: the receipt only acknowledges
			// presentation, and the host re-issues if presentation failed.
			void fireCommand("approval/decide", {
				sessionId: currentSessionId() || params?.sessionId,
				approvalId,
				choiceId: decision.choiceId,
				requirementId,
			});
			return { result: {} };
		}
		if (method === "userInput/request") {
			const userInputId = typeof params?.userInputId === "string" ? params.userInputId : null;
			if (!userInputId) {
				log(`userInput/request lacks userInputId; failing closed`);
				throw new Error("userInput request lacks the userInputId userInput/cancel requires");
			}
			log(
				`userInput/request (${params?.toolName || "tool"}) answered 'cancel' by policy in v1 (no interactive answer UI)`,
			);
			void fireCommand("userInput/cancel", {
				sessionId: currentSessionId() || params?.sessionId,
				userInputId,
				reason: "KainBain has no interactive user-input UI yet",
			});
			return { result: {} };
		}
		throw Object.assign(new Error(`No handler for MSP method "${method}"`), {
			code: -32601,
		});
	}

	function detachRuntimeListeners() {
		if (!runtime) return;
		runtime.removeNotificationListener(handleNotification);
		runtime.removeRequestListener(handleHostRequest);
	}

	async function startHost({ resume = false } = {}) {
		lease = await harness.hostPool.acquire(project.cwd, {
			onHostDeath: handleHostDeath,
		});
		runtime = lease.runtime;
		hostDead = false;
		// Register BEFORE the session is created so no notification or
		// inbound request can arrive unhandled (assignment would clobber a
		// sibling session's listeners on this shared host).
		runtime.addNotificationListener(handleNotification);
		runtime.addRequestListener(handleHostRequest);
		if (resume && sessionId) {
			await runtime.resumeSession({ sessionId, cursor: viewCursor });
			log(`resumed session ${sessionId} after host restart`);
		} else {
			const result = await runtime.startSession({
				workspaceRoot: project.cwd,
				approvalMode: harness.effectiveApprovalMode,
				modelId: activeModel?.id ?? null,
			});
			sessionId = result?.session?.sessionId ?? runtime.sessionId;
			viewCursor = result?.viewCursor ?? null;
			log(`session started id=${sessionId} approval=${harness.effectiveApprovalMode}`);
		}
	}

	function handleHostDeath() {
		if (disposed) return;
		hostDead = true;
		detachRuntimeListeners();
		if (lease) {
			lease.release();
			lease = null;
		}
		runtime = null;
		if (pendingTurn && !pendingTurn.settled) {
			pendingTurn.settled = true;
			const event = {
				type: "run_error",
				error: "muse serve host exited mid-turn",
			};
			deliver(event);
			pendingTurn.reject(new Error(event.error));
		}
		clearTurnWatchdog();
		clearWatchdogGrace();
		log("host exited; the next turn will reconnect with session/resume");
	}

	async function ensureRuntime() {
		if (runtime && !hostDead) return runtime;
		// Supervised restart: re-acquire a fresh host and resume the session,
		// up to the documented retry cap before surfacing the failure.
		const maxAttempts = 5;
		let lastError = null;
		while (resumeAttempts < maxAttempts) {
			resumeAttempts += 1;
			try {
				if (sessionId) {
					await startHost({ resume: true });
				} else {
					await startHost();
				}
				resumeAttempts = 0;
				return runtime;
			} catch (error) {
				lastError = error;
				log(
					`reconnect attempt ${resumeAttempts}/${maxAttempts} failed: ${error?.message || error}`,
				);
				detachRuntimeListeners();
				if (lease) {
					lease.release();
					lease = null;
				}
				runtime = null;
				hostDead = true;
				harness.hostPool.invalidate(project.cwd);
			}
		}
		throw new Error(
			`muse serve reconnect failed after ${maxAttempts} attempts: ${lastError?.message || lastError}`,
		);
	}

	function clearTurnWatchdog() {
		if (turnWatchdog) {
			clearTimeout(turnWatchdog);
			turnWatchdog = null;
		}
	}

	function clearWatchdogGrace() {
		if (watchdogGraceTimer) {
			clearTimeout(watchdogGraceTimer);
			watchdogGraceTimer = null;
		}
	}

	/** Arms the per-turn watchdog: at settings.timeoutMs the running turn is
	 *  interrupted (`turn/interrupt`, priority lane); if the host still has
	 *  not settled the turn within the settle grace, the turn force-settles
	 *  as a run_error and the host is evicted from the pool so the next turn
	 *  reconnects a fresh host. */
	function armTurnWatchdog() {
		clearTurnWatchdog();
		clearWatchdogGrace();
		const timeoutMs = settings.timeoutMs || 1800000;
		const graceMs = settings.mspTurnSettleGraceMs || MUSE_MSP_TURN_SETTLE_GRACE_MS;
		turnWatchdog = setTimeout(() => {
			if (!pendingTurn || pendingTurn.settled) return;
			log(`turn watchdog fired after ${timeoutMs}ms; interrupting`);
			void fireCommand("turn/interrupt", {
				sessionId: currentSessionId(),
				...(pendingTurn.turnId ? { turnId: pendingTurn.turnId } : {}),
			});
			watchdogGraceTimer = setTimeout(() => {
				if (!pendingTurn || pendingTurn.settled) return;
				const error = `muse turn did not settle within ${graceMs}ms of the watchdog interrupt`;
				log(error);
				deliver({ type: "run_error", error });
				pendingTurn.settled = true;
				activeTurnId = null;
				pendingTurn.reject(new Error(error));
				// Evict the wedged host: the next turn must not inherit it.
				detachRuntimeListeners();
				if (lease) {
					lease.release();
					lease = null;
				}
				runtime = null;
				hostDead = true;
				harness.hostPool.invalidate(project.cwd);
			}, graceMs);
			if (watchdogGraceTimer?.unref) watchdogGraceTimer.unref();
		}, timeoutMs);
		if (turnWatchdog?.unref) turnWatchdog.unref();
	}

	async function prompt(text, { onChunk } = {}) {
		if (disposed) throw new Error("Muse session is disposed");
		if (streaming) throw new Error("Muse session is already running a prompt");
		messages.push({ role: "user", content: text });
		streaming = true;
		lastAssistantText = "";
		chunkCallback = typeof onChunk === "function" ? onChunk : null;
		mapper.beginTurn({ prompt: text });
		try {
			let rt;
			try {
				rt = await ensureRuntime();
			} catch (error) {
				// Startup/reconnect failure: signal run_error (the engine's
				// failure event) AND reject — a rejection is classified as an
				// infrastructure failure and retried, never silently passed.
				deliver({ type: "run_error", error: error?.message || String(error) });
				throw error;
			}
			const settle = new Promise((resolve, reject) => {
				pendingTurn = { resolve, reject, turnId: null, settled: false };
			});
			armTurnWatchdog();

			let ack;
			try {
				ack = await rt.request(
					"turn/start",
					{
						sessionId: currentSessionId(),
						input: [{ type: "text", text }],
						ifBusy: "queue",
					},
					{ command: true, timeoutMs: settings.mspStartTimeoutMs || 30000 },
				);
			} catch (error) {
				const message = `turn/start failed: ${error?.message || error}`;
				deliver({ type: "run_error", error: message });
				throw error;
			}
			if (typeof ack?.turnId === "string" && pendingTurn && !pendingTurn.turnId) {
				pendingTurn.turnId = ack.turnId;
				activeTurnId = ack.turnId;
			}
			const events = await settle;
			const finished = events.find((event) => event.type === "run_finished");
			if (finished?.interrupted) {
				return lastAssistantText;
			}
			if (lastAssistantText) {
				messages.push({ role: "assistant", content: lastAssistantText });
			}
			return lastAssistantText;
		} finally {
			clearTurnWatchdog();
			clearWatchdogGrace();
			streaming = false;
			pendingTurn = null;
			activeTurnId = null;
			chunkCallback = null;
		}
	}

	const session = {
		harnessId: "muse",
		harnessName: "muse",
		transport: "msp",
		runLabel,

		get isStreaming() {
			return streaming;
		},

		getMessages: () => messages,

		getLastAssistantText: () => lastAssistantText,

		prompt,

		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},

		/***
		 * MARK: steer
		 * @description Injects input into the RUNNING turn via `turn/steer`
		 *   with the acknowledged `expectedTurnId` (server-side race guard:
		 *   input meant for one turn can never leak into another). Returns
		 *   `{ status: "steered" }` on success, `{ status: "no_active_turn" }`
		 *   when nothing is running, or `{ status: "refused", error }` when the
		 *   host refuses (e.g. the turn went terminal).
		 ***/
		async steer(text) {
			if (disposed) throw new Error("Muse session is disposed");
			// Record the guidance in the conversation even when nothing is
			// running (the engine's contract: steer is a user turn).
			messages.push({ role: "user", content: text });
			const turnId = pendingTurn?.turnId || activeTurnId;
			if (!turnId || !runtime) return { status: "no_active_turn" };
			try {
				await runtime.request(
					"turn/steer",
					{
						sessionId: currentSessionId(),
						expectedTurnId: turnId,
						input: [{ type: "text", text }],
					},
					{ command: true, timeoutMs: 15000 },
				);
				return { status: "steered" };
			} catch (error) {
				return { status: "refused", error: error?.message || String(error) };
			}
		},

		async followUp(text) {
			if (streaming) {
				return session.steer(text);
			}
			await prompt(text);
			return { status: "steered" };
		},

		async abort() {
			if (!runtime) return { status: "idle" };
			const turnId = pendingTurn?.turnId || activeTurnId;
			await fireCommand("turn/interrupt", {
				sessionId: currentSessionId(),
				...(turnId ? { turnId } : {}),
				retract: false,
			});
			return { status: "aborted" };
		},

		async dispose() {
			if (disposed) return;
			disposed = true;
			clearTurnWatchdog();
			clearWatchdogGrace();
			detachRuntimeListeners();
			if (lease) {
				// The lease is released, but the shared host stays warm for the
				// project until its idle TTL elapses. MSP has NO session/close
				// method (the schema's 69 methods include none) — the host
				// reclaims the session through its own retention policy.
				lease.release();
				lease = null;
			}
			runtime = null;
			handlers.clear();
		},

		async getActiveModel() {
			return activeModel ? { ...activeModel } : null;
		},

		async listModels(opts) {
			return harness.listModels(opts);
		},

		async resolveModelRef(ref) {
			return harness.resolveModelRef(ref);
		},

		/***
		 * MARK: switchModel
		 * @description Pins the session's model via `session/setModel`
		 *   (durable on the host). An unresolvable ref warns and returns null —
		 *   never a silent swap.
		 ***/
		async switchModel(ref) {
			if (!runtime || !currentSessionId()) return null;
			const resolved = await harness.resolveModelRef(ref);
			if (!resolved) {
				log(`requested model '${typeof ref === "string" ? ref : ref?.id}' is not in the muse catalogue`);
				return null;
			}
			try {
				await runtime.request(
					"session/setModel",
					{
						sessionId: currentSessionId(),
						model: { modelId: resolved.id },
					},
					{ command: true, timeoutMs: 15000 },
				);
				activeModel = { ...resolved };
				log(`model switched to ${resolved.id}`);
				return activeModel;
			} catch (error) {
				log(`session/setModel failed: ${error?.message || error}`);
				return null;
			}
		},

		async getContextUsage() {
			const usage = mapper.getUsage().getContextUsage();
			// The engine's contract normalizes to a {current, limit} NUMBER
			// pair; the host omits windowTokens when the basis has no limit
			// (never invented), and 0/0 is the honest unknown.
			if (!usage || typeof usage.current !== "number") return { current: 0, limit: 0 };
			return {
				current: usage.current,
				limit: typeof usage.limit === "number" ? usage.limit : 0,
			};
		},
	};

	// Expose the host-start path so the harness can surface classified startup
	// failures; the first turn also lazily starts the host.
	session.ensureHost = () => ensureRuntime();
	session.getMspSessionId = () => currentSessionId();

	return session;
}
