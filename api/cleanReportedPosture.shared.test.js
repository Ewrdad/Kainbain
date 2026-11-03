import { describe, it, expect } from "vitest";
import { cleanReportedPosture } from "../shared/cleanReportedPosture.js";

// The backend is the last place a reported posture is stored, so it must
// clean wire values from Runners older than the served-model fix: their
// `tiers:harness:default` strings must never reach the task history
// during a mixed-version rollout.

describe("cleanReportedPosture — fake model segments never survive storage", () => {
	it("drops a trailing default segment in any letter case, repeatedly", () => {
		expect(cleanReportedPosture("T0:pi:default")).toBe("T0:pi");
		expect(cleanReportedPosture("T0/T1:pi:Default")).toBe("T0/T1:pi");
		expect(cleanReportedPosture("T0:pi:default:DEFAULT")).toBe("T0:pi");
		expect(cleanReportedPosture("  T0:pi:default  ")).toBe("T0:pi");
	});
	it("keeps real model segments verbatim, including single colons in model ids", () => {
		expect(cleanReportedPosture("T0:pi:kimi-k3:cloud")).toBe("T0:pi:kimi-k3:cloud");
		expect(cleanReportedPosture("T0:pi:default-x")).toBe("T0:pi:default-x");
		expect(cleanReportedPosture("T0:pi:my-default")).toBe("T0:pi:my-default");
	});
	it("treats absent and sentinel-only postures as absent", () => {
		expect(cleanReportedPosture("default")).toBeNull();
		expect(cleanReportedPosture("  DEFAULT ")).toBeNull();
		expect(cleanReportedPosture("")).toBeNull();
		expect(cleanReportedPosture("   ")).toBeNull();
		expect(cleanReportedPosture(null)).toBeNull();
		expect(cleanReportedPosture(undefined)).toBeNull();
		expect(cleanReportedPosture(42)).toBeNull();
		expect(cleanReportedPosture({})).toBeNull();
	});
});
