import { resolveModel } from "../../../models.js";

/***
 * MARK: HARNESS_ID
 * @description Stable registry id of the mock harness (kept next to the
 *   factory so no other file hard-codes the literal).
 * @example HARNESS_ID // => "mock"
 ***/
export const HARNESS_ID = "mock";

/***
 * MARK: MOCK_MODELS
 * @description The mock harness's production catalog: one honestly-labeled
 *   synthetic model. Sessions echo the prompt back (`Mock reply: …`) — no
 *   AI runs here. The registered factory injects this list; test seams keep
 *   injecting their own (or nothing).
 * @example MOCK_MODELS // => [{ id: "echo-v1", provider: "mock", … }]
 ***/
export const MOCK_MODELS = [
	{
		id: "echo-v1",
		name: "Mock Echo v1 (no AI — evaluation/CI only)",
		provider: "mock",
		input: ["text"],
	},
];

/**
 * MARK: mockHarness
 * @description The engine's first-class mock harness: an AgentHarness whose
 *   sessions satisfy the FULL HarnessSession contract (conversation, streaming
 *   events, model control, context control, history-tree operations) without a
 *   real model runtime, on-disk pi sessions, or network access.
 *
 *   Two doors lead to it:
 *     - `createMockHarness()` — the harness-level factory for tests that want
 *       to own session creation (the AgentHarness surface: createSession,
 *       listModels, resolveModelRef, readHistoryFromDisk).
 *     - `createReferenceMockSession()` — one conforming session; the
 *       sessionStore's test seam (TEST ENV CONTRACT, api/sessionStore.js)
 *       delegates here, and `api/agent/sessionContract.test.js` holds this
 *       implementation to the same acceptance gate as the pi harness.
 *
 *   The mock OWNS no disk: `readHistoryFromDisk` reports an empty history, so
 *   route tests that need persisted history seed their own session files (see
 *   the cold-history fixture in api/routes/sessions.test.js).
 *
 *   The mock deliberately MIRRORS real-harness (pi) semantics for the
 *   history-tree surface rather than being more permissive:
 *   `sessionManager.appendMessage(message)` seeds real entry ids (child of
 *   the current leaf, advancing it), the leaf pointer is observable via
 *   `sessionManager.getLeafId()`, and `navigateTree`/`sessionManager.branch`
 *   throw `Entry <id> not found` for unknown ids and MOVE THE LEAF without
 *   appending entries — exactly like pi (session-manager.js branch()).
 *   navigateTree additionally mirrors pi's user-message "re-edit" flow
 *   (agent-session.js navigateTree): navigating to a user message positions
 *   the leaf at that entry's PARENT (null = root), any other entry becomes
 *   the leaf itself, and navigating to the current leaf is a no-op. Route
 *   tests can therefore exercise the same 404 `entry_not_found` mapping and
 *   seeded-id/leaf flows they show real sessions, in every run mode.
 */

/***
 * MARK: createReferenceMockSession
 * @description Builds an in-memory session satisfying the complete harness
 *   session contract: conversation (with normalized streaming events), model
 *   control, context control, and pi-parity history-tree operations — all
 *   without a real model runtime.
 * @example const session = createReferenceMockSession({ model: { provider: "mock", id: "m1" } })
 * @param {Object} [opts]
 * @param {Object} [opts.model] - Initial active model reference {provider, id}.
 * @param {Array<Object>} [opts.models] - Models the session can switch to.
 * @param {string} [opts.harnessId] - Harness identity stamped on the session (mock-harness sessions carry "mock"; omitted for the generic test seam so its shape is unchanged).
 * @returns {Object} A conforming session.
 ***/
export function createReferenceMockSession(
	{ model = null, models = [], harnessId } = {},
) {
	const messages = [];
	const entries = [];
	const handlers = new Set();
	const activeModel = { current: model };
	const availableModels = [...models];
	let activeReasoningLevel =
		(model && typeof model === "object" ? model.reasoning : null) || null;
	let disposed = false;
	// pi SessionManager parity: entries form a tree via parentId; the leaf
	// pointer tracks the current position and branching/navigating move it.
	let leafId = null;
	let entryCounter = 0;
	let compactCalls = 0;

	const deliver = (event) => {
		for (const handler of [...handlers]) handler(event);
	};

	/**
	 * Mirrors pi's entry validation: navigateTree/branch throw for entry ids
	 * that do not exist in the tree.
	 */
	const requireEntry = (entryId) => {
		if (!entries.some((entry) => entry.id === entryId)) {
			throw new Error(`Entry ${entryId} not found`);
		}
	};

	const session = {
		// Harness identity for reliability attribution + stale-key warnings.
		// Present only when the owning harness stamps it (the generic test
		// seam omits it, so its shape is byte-identical to before).
		...(typeof harnessId === "string" && harnessId ? { harnessId } : {}),

		isStreaming: false,

		// Classic context-usage field (read by classic-field readers); the
		// getContextUsage() capability surfaces the same pair.
		contextUsage: { current: 0, limit: 100 },

		// Classic messages field (contract allows `getMessages() | messages[]`;
		// exposing both keeps the engine's classic-field readers working).
		get messages() {
			return messages;
		},

		getMessages: () => messages,

		getLastAssistantText: () => {
			const assistant = messages.filter((m) => m.role === "assistant");
			// Mirrors the real harness: stages that end without an assistant
			// reply still report a completed stage.
			return assistant.at(-1)?.content || "Stage execution completed";
		},

		/** Emits normalized events: run_started → assistant_delta* → run_finished,
		 *  plus one of each unified-log event so the fidelity gate and golden
		 *  record fixtures cover every canonical lane. */
		async prompt(text, { onChunk } = {}) {
			if (disposed) throw new Error("Session is disposed");
			messages.push({ role: "user", content: text });
			session.isStreaming = true;
			deliver({ type: "run_started" });
			deliver({
				type: "session_meta",
				model: activeModel.current?.id ?? "mock/echo-v1",
				sandbox: false,
			});
			const reply = `Mock reply: ${text}`;
			deliver({ type: "assistant_delta", delta: reply });
			onChunk?.(reply);
			deliver({ type: "reasoning_delta", delta: "mock thought" });
			deliver({
				type: "usage_updated",
				usage: {
					inputTokens: text.length,
					outputTokens: reply.length,
					totalTokens: text.length + reply.length,
				},
				model: activeModel.current?.id ?? "mock/echo-v1",
			});
			deliver({ type: "permission_requested", method: "read", target: "/mock/path" });
			deliver({
				type: "permission_resolved",
				method: "read",
				target: "/mock/path",
				decision: "allow",
			});
			deliver({ type: "plan_updated", steps: [{ title: "mock step" }] });
			deliver({ type: "harness_log", text: "[mock] prompt settled", tag: "[mock]" });
			messages.push({ role: "assistant", content: reply });
			deliver({ type: "run_finished" });
			session.isStreaming = false;
			return reply;
		},

		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},

		// Legacy event-hook hookpoint: the reference mock delivers everything
		// through subscribe, so the engine's `session.on("event", …)` wiring
		// finds the member but receives no legacy events.
		on: () => {},

		async abort() {
			session.isStreaming = false;
			return { status: "aborted" };
		},

		async dispose() {
			disposed = true;
			handlers.clear();
		},

		async steer(text) {
			messages.push({ role: "user", content: text });
			return { status: "steered" };
		},

		async followUp(text) {
			messages.push({ role: "user", content: text });
			return { status: "followed_up" };
		},

		async compact() {
			compactCalls += 1;
			return { status: "compacted" };
		},

		// Observable for tests: how many times the context was compacted.
		get compactCalls() {
			return compactCalls;
		},

		async getContextUsage() {
			return session.contextUsage;
		},

		navigateTree: async (targetId) => {
			requireEntry(targetId);
			// pi parity (agent-session.js navigateTree): navigating to the
			// current leaf is a no-op; a user-message target re-branches from
			// that entry's PARENT (the "re-edit this message" flow — a null
			// parentId means root, pi's resetLeaf), and any other entry becomes
			// the leaf itself. No entry is appended in any case.
			if (targetId === leafId) {
				return { status: "navigated", targetId };
			}
			const target = entries.find((entry) => entry.id === targetId);
			if (target.type === "message" && target.message.role === "user") {
				leafId = target.parentId; // may be null → root
			} else {
				leafId = targetId;
			}
			return { status: "navigated", targetId };
		},

		sessionManager: {
			entries,
			getEntries: () => entries,
			getLeafId: () => leafId,
			// pi parity: appendMessage records a message entry as a child of the
			// current leaf, advances the leaf, and returns the entry id.
			appendMessage: (message) => {
				entryCounter += 1;
				const id = `msg-${entryCounter}`;
				entries.push({ id, parentId: leafId, type: "message", message });
				leafId = id;
				return id;
			},
			// pi parity: branch() only moves the leaf pointer (no entry appended).
			branch: (entryId) => {
				requireEntry(entryId);
				leafId = entryId;
				return { status: "branched" };
			},
		},

		get activeReasoningLevel() {
			return activeReasoningLevel;
		},
		set activeReasoningLevel(value) {
			activeReasoningLevel = value;
		},

		async getActiveModel() {
			return activeModel.current;
		},

		async listModels() {
			return [...availableModels];
		},

		async switchModel(ref) {
			const found = availableModels.find((m) => m.id === ref?.id);
			if (found) {
				activeModel.current = { ...found };
				const level = ref?.reasoning || found?.reasoning || activeReasoningLevel;
				if (level) activeModel.current.reasoning = level;
			} else {
				activeModel.current = ref;
			}
			activeReasoningLevel =
				ref?.reasoning ||
				activeModel.current?.reasoning ||
				activeReasoningLevel ||
				null;
			return activeModel.current;
		},
	};
	return session;
}

/***
 * MARK: createMockHarness
 * @description Builds the mock AgentHarness: a fresh contract-conforming
 *   session per createSession call (matching the engine's one-session-per-
 *   stage rule), an injected model registry for listModels/resolveModelRef,
 *   and an empty disk-history reader (the mock owns no disk). Carries the
 *   stable production identity (`id`/`name: "mock"`, `modelSelection:
 *   "list"`) so the registered built-in projects into `/harnesses` and the
 *   model catalogues like every other harness.
 * @example const harness = createMockHarness({ models: [{ provider: "mock", id: "m1" }] });
 * @example const session = await harness.createSession(project, { taskId, stageId });
 * @param {Object} [opts]
 * @param {Array<Object>} [opts.models] - Models the harness reports and sessions switch to.
 * @returns {Object} The AgentHarness mock (createSession/listModels/resolveModelRef/readHistoryFromDisk).
 ***/
export function createMockHarness({ models = [] } = {}) {
	const availableModels = [...models];

	return {
		/** Stable harness identity (registry id + model-key scope). */
		id: HARNESS_ID,

		/** Registry name (the /harnesses view carries the display label). */
		name: HARNESS_ID,

		/** Programmatic catalog (MOCK_MODELS in production): the UI renders a model dropdown. */
		modelSelection: "list",
		reasoningLevels: ["low", "medium", "high"],

		/***
		 * MARK: createSession
		 * @description Creates a fresh mock session per call — stage executions
		 *   get a clean context and interactive callers get their own session,
		 *   exactly like the real harness. Sessions are stamped with this
		 *   harness's id for reliability attribution. A dispatch-resolved
		 *   `model` (target hand-off) is resolved against the injected
		 *   registry and pinned as the session's active model (null when
		 *   unresolvable), so hand-off tests can assert the pin.
		 * @example await createMockHarness().createSession(project) => session
		 * @param {Object} _project - The project entity (unused; the mock owns no per-project state).
		 * @param {Object} [_meta] - { taskId, stageId, sessionDir, model } (model pins the active model).
		 * @returns {Promise<Object>} A fresh contract-conforming mock session.
		 ***/
		async createSession(_project, _meta = {}) {
			const requested =
				typeof _meta?.model === "string" && _meta.model.trim()
					? _meta.model
					: null;
			return createReferenceMockSession({
				models: availableModels,
				harnessId: HARNESS_ID,
				model: requested
					? resolveModel(availableModels, requested) || null
					: null,
			});
		},

		/***
		 * MARK: listModels
		 * @description Lists the injected model registry — data supplied by the
		 *   caller, never host state.
		 * @example await createMockHarness({ models }).listModels() => models
		 * @returns {Promise<Array<Object>>} The injected models.
		 ***/
		async listModels() {
			return [...availableModels];
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a stored model reference (composite key or bare
		 *   id) against the injected registry with the engine's shared resolver;
		 *   null when unresolvable.
		 * @example await createMockHarness({ models }).resolveModelRef("mock::m1") => model
		 * @param {string|Object} target - Composite key or bare id.
		 * @returns {Promise<Object|null>} The resolved model, or null.
		 ***/
		async resolveModelRef(target) {
			return resolveModel(availableModels, target) || null;
		},

		/***
		 * MARK: readHistoryFromDisk
		 * @description The mock owns no disk, so persisted history is always
		 *   empty; tests that need on-disk history seed it themselves.
		 * @example await createMockHarness().readHistoryFromDisk(project) => { messages: [], tree: [] }
		 * @param {Object} _project - The project entity (unused).
		 * @param {string} [_sessionDir] - Accepted for parity; unused.
		 * @returns {Promise<{messages: Array, tree: Array}>} Empty history.
		 ***/
		async readHistoryFromDisk(_project, _sessionDir) {
			return { messages: [], tree: [] };
		},

		/***
		 * MARK: probeHealth
		 * @description Health probe for the HealthChecker (optional
		 *   AgentHarness contract member): always `ok` — the mock has no
		 *   runtime, credentials, or network to fail. Keeps the aggregate
		 *   green on mock-default (evaluation/CI) deployments.
		 * @example await createMockHarness().probeHealth() => { name: 'mock', status: 'ok', … }
		 * @returns {Promise<Object>} The HarnessProbeResult.
		 ***/
		async probeHealth() {
			return {
				name: HARNESS_ID,
				status: "ok",
				latencyMs: 0,
				timestamp: new Date().toISOString(),
				message: "Mock harness healthy (synthetic replies, no AI)",
			};
		},
	};
}
