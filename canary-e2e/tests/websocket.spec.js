import { test, expect } from "@playwright/test";
import { waitForAppReady } from "./helpers";

/**
 * MARK: WebSocket Event Bridge E2E
 * @description Verifies the frontend opens a WebSocket to the backend /ws
 *   endpoint when the app loads and receives the CONNECTED handshake. Vite's
 *   dev-server HMR websocket is ignored by filtering for the API port/path.
 */

// Attaches a page-level WebSocket listener before navigation. Resolves once
// the KainBain /ws socket has opened and received the CONNECTED handshake.
function waitForKainBainWebSocket(page) {
	let resolveWs;
	const promise = new Promise((resolve) => {
		resolveWs = resolve;
	});

	const handler = (ws) => {
		if (ws.url().includes("/ws") && ws.url().includes("projectId=")) {
			ws.on("framereceived", (frame) => {
				try {
					const data = JSON.parse(frame.payload);
					if (data.type === "CONNECTED") {
						resolveWs({ ws, connected: data });
					}
				} catch {
					// ignore non-JSON frames
				}
			});
		}
	};

	page.on("websocket", handler);

	return {
		promise,
		cleanup: () => page.off("websocket", handler),
	};
}

test("frontend connects to the backend WebSocket and receives the handshake", async ({
	page,
}) => {
	const { promise, cleanup } = waitForKainBainWebSocket(page);

	await waitForAppReady(page);

	const result = await Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for /ws handshake")), 10000)),
	]);
	cleanup();

	expect(result.ws.url()).toContain("/ws");
	expect(result.ws.url()).toContain("projectId=");
	expect(result.connected.type).toBe("CONNECTED");
	expect(result.connected.projectId).toBeTruthy();
});
