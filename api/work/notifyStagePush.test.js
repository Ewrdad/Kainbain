import { describe, it, expect, vi } from "vitest";

vi.mock("../push/index.js", () => ({
	getPushService: () => {
		throw new Error("unavailable");
	},
}));

import { notifyStagePush } from "./notifyStagePush.js";

describe("The Work: notifyStagePush", () => {
	it("never throws when the push service is unavailable", async () => {
		await expect(notifyStagePush({ projectId: "p1", taskId: "t1", reason: "unrecoverable" })).resolves.toBeUndefined();
	});
});
