import { describe, it, expect, vi } from "vitest";

vi.mock("../push/index.js", () => ({
	getPushService: () => {
		throw new Error("unavailable");
	},
}));

import { notifyQueueEmpty } from "./notifyQueueEmpty.js";

describe("The Work: notifyQueueEmpty", () => {
	it("never throws when the push service is unavailable", async () => {
		await expect(notifyQueueEmpty({ humanPendingCount: 1 })).resolves.toBeUndefined();
	});
});
