import { describe, it, expect, vi } from "vitest";

vi.mock("../push/index.js", () => ({
	getPushService: () => {
		throw new Error("unavailable");
	},
}));

import { notifySchedulerStall } from "./notifySchedulerStall.js";

describe("The Work: notifySchedulerStall", () => {
	it("never throws when the push service is unavailable", async () => {
		await expect(notifySchedulerStall({ taskId: "t1", reason: "engine-idle" })).resolves.toBeUndefined();
	});
});
