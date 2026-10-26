/***
 * MARK: sessionsRoutes
 * @description Session history (event-sync protocol), tree navigation and
 * forking.
 *
 * Degradation policy: the WRITE paths into the optional harness surface
 * (navigateTree, sessionManager.branch) are guarded with
 * `guardSessionCapability` — a harness lacking the capability gets a
 * standardized `501 { code: "unsupported_by_harness" }`, and unknown entry
 * ids surface as `404 { code: "entry_not_found" }` instead of a 500. The READ
 * paths (/session/tree, /session/history, /session/restore) deliberately keep
 * their soft `sessionManager?.getEntries?.()` guards and degrade to empty
 * arrays: they are diagnostics endpoints, and an absent entry tree carries no
 * lost capability for them (see api/agent/harnessContract.js).
 * @example app.register(sessionsRoutes, { deps })
 ***/

/***
 * MARK: isEntryNotFoundError
 * @description Whether a harness error is the benign "entry not found" failure
 *   raised by navigateTree/sessionManager.branch for an unknown entry id. The
 *   dependency on the harness's message wording is deliberately isolated to
 *   this helper so the 404 mapping stays in one place.
 * @param {unknown} error
 * @returns {boolean}
 * @example isEntryNotFoundError(new Error("Entry e-123 not found")) => true
 ***/
export function isEntryNotFoundError(error) {
	return error instanceof Error && /entry .*not found/i.test(error.message);
}

/***
 * MARK: entryNotFoundResponseSchema
 * @description OpenAPI schema for the unknown-entry-id degradation payload.
 ***/
const entryNotFoundResponseSchema = {
	type: "object",
	properties: {
		error: { type: "string" },
		code: { type: "string" },
		entryId: { type: "string" },
	},
};

/***
 * MARK: unsupportedByHarnessResponseSchema
 * @description OpenAPI schema for the standardized capability-degradation error
 *   payload sent by `guardSessionCapability` (api/index.js).
 ***/
const unsupportedByHarnessResponseSchema = {
	type: "object",
	properties: {
		error: { type: "string" },
		code: { type: "string" },
		capability: { type: "string" },
	},
};

/***
 * MARK: sendEntryNotFound
 * @description Sends the standardized 404 entry_not_found payload for an
 *   unknown entry id.
 * @param {Object} reply
 * @param {string} entryId
 * @returns {Object} The reply (for `return reply…` handler style).
 * @example return sendEntryNotFound(reply, entryId);
 ***/
function sendEntryNotFound(reply, entryId) {
	return reply.status(404).send({
		error: `Entry ${entryId} not found`,
		code: "entry_not_found",
		entryId,
	});
}

/***
 * MARK: formatMessageContent
 * @description Converts a message's content (string, array of blocks, or absent) into a single plain string for the UI.
 * @example formatMessageContent([{ text: 'Hello' }]) => 'Hello'
 * @param {string|Array|undefined} content
 * @returns {string}
 ***/
function formatMessageContent(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c) => (typeof c === "string" ? c : c?.text || ""))
			.join("");
	}
	return "";
}

export default async function sessionsRoutes(app, { deps }) {
	const {
		resolveAndGuardProject,
		guardSessionCapability,
		getOrCreateSession,
		projectStore,
		sessionStore,
	} = deps;

	/***
	 * MARK: Session Status & Diagnostics
	 * Returns in-memory and disk persistence diagnostics for the session.
	 ***/
	app.get("/session/status", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.query?.projectId || request.body?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const status = await sessionStore.getSessionStatus(project);
		return status;
	});

	/***
	 * MARK: Session Restore
	 * Forces a disk re-read and restoration of the session history.
	 ***/
	app.post("/session/restore", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const session = await sessionStore.restoreSession(project);
		const entries = session.sessionManager?.getEntries?.() || [];
		const messages = (session.messages || []).map((m) => ({
			id: m.id || `${m.role}-${m.timestamp || Date.now()}`,
			role: m.role,
			content: formatMessageContent(m.content),
			timestamp: m.timestamp,
		}));

		return {
			status: "restored",
			projectId: id,
			messages,
			tree: entries,
			isStreaming: session.isStreaming === true,
		};
	});

	/***
	 * MARK: Session History (Event Sync Protocol)
	 * Returns the full message + tool history for a session so the UI can fill
	 * the gap after a WebSocket reconnect or a page refresh.
	 ***/
	app.get("/session/history", async (request, reply) => {
		const id = resolveAndGuardProject(request.query?.projectId, reply);
		if (!id) return;

		const active = sessionStore.get(id);
		let entries = [];
		let rawMessages = [];
		let isStreaming = false;

		if (active) {
			entries = active.sessionManager?.getEntries?.() || [];
			rawMessages = active.messages || [];
			isStreaming = active.isStreaming === true;
		} else {
			const project = projectStore.getProject(id);
			const diskHistory = await sessionStore.readSessionHistoryFromDisk(project);
			entries = diskHistory.tree || [];
			rawMessages = diskHistory.messages || [];
			isStreaming = false;
		}

		// Build a map of message id -> session entry id so the UI can offer
		// "Fork from here" on individual messages.
		const entryIdByMessageId = new Map();
		for (const entry of entries) {
			if (entry.type === "message" && entry.message?.id) {
				entryIdByMessageId.set(entry.message.id, entry.id);
			}
		}

		const messages = rawMessages.map((m) => ({
			id: m.id || `${m.role}-${m.timestamp || Date.now()}`,
			role: m.role,
			content: formatMessageContent(m.content),
			timestamp: m.timestamp,
			entryId: (m.id && entryIdByMessageId.get(m.id)) || null,
		}));

		return {
			projectId: id,
			messages,
			tree: entries,
			isStreaming,
		};
	});

	/***
	 * MARK: Tree Navigation
	 ***/
	app.get("/session/tree", async (request, reply) => {
		const id = resolveAndGuardProject(request.query?.projectId, reply);
		if (!id) return;

		const active = sessionStore.get(id);
		if (active?.sessionManager?.getEntries) {
			return active.sessionManager.getEntries();
		}
		const project = projectStore.getProject(id);
		const diskHistory = await sessionStore.readSessionHistoryFromDisk(project);
		return diskHistory.tree || [];
	});

	/***
	 * MARK: navigateTree
	 * @description Moves the session leaf to an existing entry. Input is
	 *   validated first (400), then the optional navigateTree capability is
	 *   guarded (501), and unknown entry ids surface as 404 entry_not_found.
	 ***/
	app.post(
		"/session/navigate",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							targetId: { type: "string" },
						},
					},
					400: {
						type: "object",
						properties: { error: { type: "string" } },
					},
					404: entryNotFoundResponseSchema,
					501: unsupportedByHarnessResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { targetId } = request.body || {};
			if (!targetId) {
				return reply.status(400).send({ error: "targetId is required" });
			}
			const id = resolveAndGuardProject(request.body?.projectId, reply);
			if (!id) return;

			const session = await getOrCreateSession(id);
			if (
				!guardSessionCapability(reply, session, "navigateTree", "Tree navigation")
			) {
				return;
			}
			try {
				await session.navigateTree(targetId);
			} catch (err) {
				if (!isEntryNotFoundError(err)) throw err;
				return sendEntryNotFound(reply, targetId);
			}
			return { status: "navigated", targetId };
		},
	);

	/***
	 * MARK: forkSession
	 * @description Branches the session at an existing entry so the next prompt
	 *   starts a new parallel branch. Input is validated first (400), then the
	 *   optional sessionManager.branch capability is guarded (501), and
	 *   unknown entry ids surface as 404 entry_not_found.
	 ***/
	app.post(
		"/session/fork",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							entryId: { type: "string" },
						},
					},
					400: {
						type: "object",
						properties: { error: { type: "string" } },
					},
					404: entryNotFoundResponseSchema,
					501: unsupportedByHarnessResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { entryId } = request.body || {};
			if (!entryId)
				return reply.status(400).send({ error: "entryId is required" });
			const id = resolveAndGuardProject(request.body?.projectId, reply);
			if (!id) return;

			const session = await getOrCreateSession(id);
			if (
				!guardSessionCapability(
					reply,
					session,
					"sessionManager.branch",
					"Session forking",
				)
			) {
				return;
			}
			try {
				// Move the session leaf to the target entry so the next prompt starts a
				// new parallel branch (existing entries are preserved).
				session.sessionManager.branch(entryId);
			} catch (err) {
				if (!isEntryNotFoundError(err)) throw err;
				return sendEntryNotFound(reply, entryId);
			}
			return { status: "forked", entryId };
		},
	);
}
