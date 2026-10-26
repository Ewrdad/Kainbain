import http from "node:http";

/**
 * MARK: opencodeMockServer
 * @description An in-process stub of the OpenCode server's HTTP surface for
 *   contract tests: sessions, prompts, aborts, the providers payload, and the
 *   SSE event stream (`GET /event`). The harness under test talks to it over
 *   real HTTP with the REAL `@opencode-ai/sdk` client — only the server is
 *   faked, so the SDK's request/SSE paths are exercised end-to-end.
 *
 *   Test controls:
 *     - `mock.emit(event)`      push a raw SSE event to every connected client
 *     - `mock.requests`         every request seen (`{ method, url, body }`)
 *     - `mock.setProviders(p)`  override the /config/providers payload
 *     - `mock.setPromptBehavior(fn)` override the scripted prompt event run
 *     - `mock.sessions`         the created sessions and their messages
 *     - `mock.url` / `mock.close()`
 */

const SSE_HEADERS = {
	"content-type": "text/event-stream",
	"cache-control": "no-cache",
	connection: "keep-alive",
};

/***
 * MARK: defaultProvidersPayload
 * @description Builds a FRESH default /config/providers payload per call
 *   (callers mutate what they hold, so sharing one object would leak
 *   overrides across tests).
 * @example defaultProvidersPayload().providers[0].id => "mock-provider"
 * @returns {Object} The default stub providers payload.
 ***/
function defaultProvidersPayload() {
	return {
		providers: [
			{
				id: "mock-provider",
				name: "Mock Provider",
				source: "config",
				env: [],
				options: {},
				models: {
					"mock-model": {
						id: "mock-model",
						providerID: "mock-provider",
						name: "Mock Model",
						capabilities: {
							temperature: true,
							reasoning: true,
							attachment: false,
							toolcall: true,
							input: { text: true, image: true, audio: false, video: false, pdf: false },
							output: { text: true, image: false, audio: false, video: false, pdf: false },
						},
						cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
					},
					"mock-model-2": {
						id: "mock-model-2",
						providerID: "mock-provider",
						name: "Mock Model 2",
						capabilities: {
							temperature: true,
							reasoning: false,
							attachment: false,
							toolcall: true,
							input: { text: true, image: false, audio: false, video: false, pdf: false },
							output: { text: true, image: false, audio: false, video: false, pdf: false },
						},
						cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
					},
				},
			},
		],
		default: { "mock-provider": "mock-model" },
	};
}

/***
 * MARK: createOpencodeMockServer
 * @description Starts the stub server on an ephemeral port.
 * @example const mock = await createOpencodeMockServer(); mock.url => "http://127.0.0.1:41234"
 * @param {Object} [opts]
 * @param {Object} [opts.providers] - The /config/providers payload to serve.
 * @returns {Promise<Object>} The mock server handle.
 ***/
export async function createOpencodeMockServer({ providers } = {}) {
	const state = {
		providers: providers || defaultProvidersPayload(),
		requests: [],
		sessions: new Map(), // id -> { id, title, messages: [{ info, parts }] }
		sseClients: new Set(),
		promptBehavior: null,
		sessionCounter: 0,
		messageCounter: 0,
	};

	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url || "/", "http://localhost");
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const rawBody = Buffer.concat(chunks).toString("utf8");
		let body = {};
		try {
			body = rawBody ? JSON.parse(rawBody) : {};
		} catch {
			body = {};
		}
		state.requests.push({ method: req.method, url: req.url, body });

		const json = (payload, status = 200) => {
			res.writeHead(status, { "content-type": "application/json" });
			res.end(JSON.stringify(payload));
		};

		// ── Readiness probe ──
		if (req.method === "GET" && url.pathname === "/project/current") {
			return json({ path: { root: "/", cwd: "/" } });
		}

		// ── Model discovery ──
		if (req.method === "GET" && url.pathname === "/config/providers") {
			return json(state.providers);
		}

		// ── SSE event stream ──
		if (req.method === "GET" && url.pathname === "/event") {
			res.writeHead(200, SSE_HEADERS);
			res.write(": connected\n\n");
			state.sseClients.add(res);
			req.on("close", () => state.sseClients.delete(res));
			return;
		}

		// ── Sessions ──
		if (req.method === "POST" && url.pathname === "/session") {
			state.sessionCounter += 1;
			const session = {
				id: `ses-mock-${state.sessionCounter}`,
				title: body.title || "mock",
				messages: [],
			};
			state.sessions.set(session.id, session);
			emitEvent({
				type: "session.created",
				properties: { info: session },
			});
			return json(session);
		}

		const sessionMatch = url.pathname.match(/^\/session\/([^/]+)$/);
		if (req.method === "GET" && sessionMatch) {
			const session = state.sessions.get(sessionMatch[1]);
			if (!session) return json({ message: "session not found" }, 404);
			return json(session);
		}

		if (req.method === "DELETE" && sessionMatch) {
			state.sessions.delete(sessionMatch[1]);
			return json(true);
		}

		const messagesMatch = url.pathname.match(/^\/session\/([^/]+)\/message$/);
		if (req.method === "GET" && messagesMatch) {
			const session = state.sessions.get(messagesMatch[1]);
			if (!session) return json({ message: "session not found" }, 404);
			return json(session.messages);
		}

		if (req.method === "POST" && messagesMatch) {
			const session = state.sessions.get(messagesMatch[1]);
			if (!session) return json({ message: "session not found" }, 404);
			const reply = await runScriptedPrompt(session, body);
			return json(reply);
		}

		const promptAsyncMatch = url.pathname.match(/^\/session\/([^/]+)\/prompt_async$/);
		if (req.method === "POST" && promptAsyncMatch) {
			const session = state.sessions.get(promptAsyncMatch[1]);
			if (!session) return json({ message: "session not found" }, 404);
			// Record the user turn; run the scripted event run in the background
			// (prompt_async returns immediately by contract).
			const text = flattenPartsText(body.parts);
			session.messages.push({
				info: { id: nextMessageId(), role: "user", sessionID: session.id },
				parts: [{ id: `p-${state.messageCounter}`, type: "text", text }],
			});
			if (state.promptBehavior) {
				Promise.resolve(state.promptBehavior(session, body)).catch(() => {});
			}
			return json({});
		}

		const abortMatch = url.pathname.match(/^\/session\/([^/]+)\/abort$/);
		if (req.method === "POST" && abortMatch) {
			return json({});
		}

		return json({ message: `no mock route for ${req.method} ${url.pathname}` }, 404);
	});

	function nextMessageId() {
		state.messageCounter += 1;
		return `msg-mock-${state.messageCounter}`;
	}

	function flattenPartsText(parts) {
		return (parts || [])
			.filter((p) => p?.type === "text")
			.map((p) => p.text || "")
			.join("");
	}

	/***
	 * MARK: emitEvent
	 * @description Pushes one raw SSE event frame to every connected /event
	 *   client (the shared emit used by the request handlers and the handle).
	 ***/
	function emitEvent(event) {
		const frame = `data: ${JSON.stringify(event)}\n\n`;
		for (const client of state.sseClients) {
			try {
				client.write(frame);
			} catch {
				state.sseClients.delete(client);
			}
		}
	}

	/***
	 * MARK: runScriptedPrompt
	 * @description The default scripted prompt: emits the SSE event run a real
	 *   OpenCode server produces for one message turn (user message, busy,
	 *   assistant message created, text deltas, part completion, assistant
	 *   completion, session idle), appends both turns to the session's message
	 *   list, then answers the POST with the assistant message. Tests override
	 *   it with `mock.setPromptBehavior`.
	 ***/
	async function runScriptedPrompt(session, body) {
		if (state.promptBehavior) {
			return state.promptBehavior(session, body);
		}
		const text = flattenPartsText(body.parts);
		const model = body.model || null;

		const userMessage = {
			id: nextMessageId(),
			role: "user",
			sessionID: session.id,
			time: { created: Date.now() },
		};
		const assistantMessage = {
			id: nextMessageId(),
			role: "assistant",
			sessionID: session.id,
			parentID: userMessage.id,
			modelID: model?.modelID || "mock-model",
			providerID: model?.providerID || "mock-provider",
			mode: "build",
			time: { created: Date.now() },
			cost: 0,
			tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
			path: { cwd: "/", root: "/" },
		};
		const reply = `Mock reply: ${text}`;
		const partId = `prt-${state.messageCounter}`;

		const emit = emitEvent;

		emit({
			type: "message.updated",
			properties: { info: userMessage },
		});
		emit({
			type: "session.status",
			properties: { sessionID: session.id, status: { type: "busy" } },
		});
		emit({
			type: "message.updated",
			properties: { info: assistantMessage },
		});
		// Two text deltas (streaming), then the completed part snapshot.
		const chunks = ["Mock reply: ", text];
		let accumulated = "";
		for (const chunk of chunks) {
			accumulated += chunk;
			emit({
				type: "message.part.updated",
				properties: {
					part: {
						id: partId,
						type: "text",
						text: accumulated,
						sessionID: session.id,
						messageID: assistantMessage.id,
					},
					delta: chunk,
				},
			});
		}
		emit({
			type: "message.part.updated",
			properties: {
				part: {
					id: partId,
					type: "text",
					text: reply,
					sessionID: session.id,
					messageID: assistantMessage.id,
					time: { start: Date.now(), end: Date.now() },
				},
			},
		});
		emit({
			type: "message.updated",
			properties: {
				info: { ...assistantMessage, time: { created: 1, completed: 2 } },
			},
		});
		emit({
			type: "session.idle",
			properties: { sessionID: session.id },
		});

		session.messages.push({
			info: userMessage,
			parts: [{ id: `${partId}-user`, type: "text", text }],
		});
		session.messages.push({
			info: { ...assistantMessage, time: { ...assistantMessage.time, completed: Date.now() } },
			parts: [{ id: partId, type: "text", text: reply }],
		});

		return { info: assistantMessage, parts: [{ id: partId, type: "text", text: reply }] };
	}

	await new Promise((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();

	/*** 
	 * MARK: emit (handle)
	 * @description Pushes one raw SSE event to every connected /event client.
	 ***/
	const handle = {
		url: `http://127.0.0.1:${address.port}`,
		emit: emitEvent,
		setProviders(payload) {
			// A nullish payload restores the default stub payload (the
			// documented "restore" idiom) instead of serving null.
			state.providers = payload || defaultProvidersPayload();
		},
		setPromptBehavior(fn) {
			state.promptBehavior = fn;
		},
		sessions: state.sessions,
		requests: state.requests,
		close: () =>
			new Promise((resolve) => {
				for (const client of state.sseClients) client.destroy();
				state.sseClients.clear();
				server.close(() => resolve());
			}),
	};

	return handle;
}