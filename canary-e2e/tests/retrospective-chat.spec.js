import { test, expect } from "@playwright/test";
import { APP_URL } from "./urls";
import {
	activeProjectId,
	collectPageErrors,
	waitForAppReadyOnProject,
} from "./helpers";

/***
 * MARK: Retrospective long-turn chat canary
 * @description Proves the long-running chat flows in a real browser WITHOUT
 *   invoking a model: `page.route` intercepts `POST /retrospective/chat` and
 *   fulfills it with a canned reply after a short delay, so the suite never
 *   spends model calls, never mutates the backend, and stays deterministic.
 *   Covers send → "Agent working" card → reply replacement, and navigate
 *   away mid-turn → completion toast → "View chat" back-navigation. Live
 *   progress streaming, timeouts, and error states stay in unit/component
 *   tests, where harness behavior is scriptable.
 ***/

const CANNED_REPLY = "Canary reply: trends look stable across the selection.";

async function gotoRetrospectiveChat(page) {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(`${APP_URL}/#/retrospective`);
	await expect(page.getByTestId("retrospective-page")).toBeVisible({ timeout: 15000 });
	await expect(page.getByTestId("retrospective-chat")).toBeVisible();
}

function interceptChatTurn(page, { delayMs = 1500 } = {}) {
	return page.route("**/retrospective/chat", async (route) => {
		const req = route.request();
		if (req.method() !== "POST") {
			await route.continue();
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				reply: CANNED_REPLY,
				suggestions: [],
				unknownTaskIds: [],
				contextTaskIds: [],
				contextTruncated: false,
				contextChars: 0,
			}),
		});
	});
}

async function sendChat(page, text) {
	await page.getByTestId("retrospective-chat-input").fill(text);
	await page.getByTestId("retrospective-chat-send").click();
}

test.describe("retrospective long-turn chat", () => {
	test("send shows the working card, then the reply replaces it", async ({ page }) => {
		const pageErrors = collectPageErrors(page);
		await interceptChatTurn(page, { delayMs: 1500 });
		await waitForAppReadyOnProject(page);
		await activeProjectId(page.request);
		await gotoRetrospectiveChat(page);

		await sendChat(page, "Any trends in the selection?");

		// The in-flight turn renders in the message space (not a popup).
		const card = page.getByTestId("retrospective-chat-pending");
		await expect(card).toBeVisible();
		await expect(card.getByText(/Agent working/)).toBeVisible();
		await expect(page.getByTestId("retrospective-chat-elapsed")).toContainText(/elapsed/);

		// The settled reply replaces the card exactly once.
		await expect(page.getByTestId("retrospective-chat-message-1")).toContainText(
			CANNED_REPLY,
			{ timeout: 15000 },
		);
		await expect(card).toBeHidden();
		// Settling on the visible chat is silent — the reply itself is the signal.
		await expect(page.getByText(/Chat reply ready/)).toBeHidden();

		expect(pageErrors).toEqual([]);
	});

	test("navigate away mid-turn keeps the turn and toasts with a way back", async ({
		page,
	}) => {
		const pageErrors = collectPageErrors(page);
		await interceptChatTurn(page, { delayMs: 3000 });
		await waitForAppReadyOnProject(page);
		await activeProjectId(page.request);
		await gotoRetrospectiveChat(page);

		await sendChat(page, "Long question while I look elsewhere");
		await expect(page.getByTestId("retrospective-chat-pending")).toBeVisible();

		// Leave the route mid-turn via in-app navigation (no reload — a reload
		// honestly interrupts the unary turn by design).
		await page
			.getByRole("navigation", { name: "Primary navigation" })
			.getByRole("button", { name: /Orchestrator/ })
			.click();
		await expect(page.getByTestId("retrospective-chat")).toBeHidden();

		// The turn settles off-route: a toast names the reply and offers a way back.
		const toast = page.getByText(/Chat reply ready/);
		await expect(toast).toBeVisible({ timeout: 15000 });
		await expect(toast).toContainText("trends look stable");
		await page.getByRole("button", { name: "View chat" }).click();

		// Back on the chat: the reply replaced the working card.
		await expect(page.getByTestId("retrospective-chat")).toBeVisible();
		await expect(page.getByTestId("retrospective-chat-message-1")).toContainText(
			CANNED_REPLY,
		);
		await expect(page.getByTestId("retrospective-chat-pending")).toBeHidden();

		expect(pageErrors).toEqual([]);
	});
});
