/***
 * MARK: wsRoutes
 * @description WebSocket event bridge. Forwards AgentSession events to the
 * subscribed frontend clients for a project.
 * @example app.register(wsRoutes, { deps })
 ***/

// Base used only to parse a relative request URL into a URL object.
const WS_PARSE_BASE = "http://localhost";

export default async function wsRoutes(app, { deps }) {
	const { resolveProjectId, eventBridge, sessionStore } = deps;

	app.get("/ws", { websocket: true }, (connection, request) => {
		// In @fastify/websocket the request object may not expose `query` directly,
		// so parse the projectId from the raw URL to be robust.
		let projectId;
		if (request.query && request.query.projectId) {
			projectId = request.query.projectId;
		} else if (request.url) {
			try {
				const parsed = new URL(request.url, WS_PARSE_BASE);
				projectId = parsed.searchParams.get("projectId") || undefined;
			} catch (e) {
				projectId = undefined;
			}
		}
		const id = resolveProjectId(projectId);

		// The first handler argument is the WebSocket itself. Some versions of
		// @fastify/websocket wrap it in a `connection` object with a `.socket`
		// property, so normalize to the actual WebSocket.
		const socket =
			connection && typeof connection.send === "function"
				? connection
				: connection && connection.socket;

		socket.on("close", () => {
			eventBridge.unsubscribe(id, socket);
			sessionStore.unsubscribe(id, socket);
		});

		eventBridge.subscribe(id, socket);
		sessionStore.subscribe(id, socket);

		socket.send(
			JSON.stringify({
				type: "CONNECTED",
				projectId: id,
				timestamp: new Date().toISOString(),
			}),
		);
	});
}
