import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createUserStore,
	normalizeUserRecord,
	isBootstrapAdmin,
	usersFilePath,
} from "./userStore.js";

/***
 * MARK: userStore tests
 * @description Locks just-in-time provisioning (create on first sign-in,
 *   refresh groups on later ones), bootstrap-admin promotion, role
 *   assignment, disabling, and atomic JSON persistence across restarts.
 ***/

let stateDir = null;

beforeEach(() => {
	stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-auth-users-"));
});

afterEach(() => {
	if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
	stateDir = null;
});

const authConfig = {
	bootstrapAdmins: ["boss@example.com"],
	adminGroup: "kainbain-admins",
};

describe("normalizeUserRecord", () => {
	it("fills defaults and sanitises stored roles", () => {
		const user = normalizeUserRecord({
			id: "s1",
			directRoles: ["admin", "owner"],
			projectRoles: { alpha: ["member", "owner"], "": ["admin"] },
		});
		expect(user.directRoles).toEqual(["admin"]);
		expect(user.projectRoles).toEqual({ alpha: ["member"] });
		expect(user.groups).toEqual([]);
		expect(user.disabled).toBe(false);
	});
});

describe("isBootstrapAdmin", () => {
	it("matches bootstrap subjects, emails, and the admin group", () => {
		expect(
			isBootstrapAdmin({
				sub: "boss@example.com",
				email: "",
				groups: [],
				authConfig,
			}),
		).toBe(true);
		expect(
			isBootstrapAdmin({
				sub: "s2",
				email: "boss@example.com",
				groups: [],
				authConfig,
			}),
		).toBe(true);
		expect(
			isBootstrapAdmin({
				sub: "s3",
				email: "",
				groups: ["kainbain-admins"],
				authConfig,
			}),
		).toBe(true);
		expect(
			isBootstrapAdmin({
				sub: "s4",
				email: "",
				groups: ["team"],
				authConfig,
			}),
		).toBe(false);
		expect(isBootstrapAdmin({})).toBe(false);
	});
});

describe("createUserStore", () => {
	it("starts empty and rejects sign-ins without a subject", () => {
		const store = createUserStore({ stateDir });
		expect(store.listUsers()).toEqual([]);
		expect(() => store.provisionFromSignIn({ sub: "" })).toThrow(/subject/);
	});

	it("provisions a user on first sign-in and refreshes groups later", () => {
		const store = createUserStore({ stateDir });
		const first = store.provisionFromSignIn({
			sub: "s1",
			email: "ada@example.com",
			name: "Ada",
			provider: "idp",
			groups: ["team"],
			authConfig,
		});
		expect(first.directRoles).toEqual([]);
		expect(first.createdAt).not.toBe("");
		const second = store.provisionFromSignIn({
			sub: "s1",
			email: "ada@example.com",
			name: "Ada L",
			provider: "idp",
			groups: ["team", "leads"],
			authConfig,
		});
		expect(second.name).toBe("Ada L");
		expect(second.groups).toEqual(["team", "leads"]);
		expect(second.createdAt).toBe(first.createdAt);
		expect(store.findBySub("s1").id).toBe("s1");
	});

	it("promotes bootstrap admins and keeps admin across group drift", () => {
		const store = createUserStore({ stateDir });
		const boss = store.provisionFromSignIn({
			sub: "boss-1",
			email: "boss@example.com",
			groups: ["kainbain-admins"],
			authConfig,
		});
		expect(boss.directRoles).toEqual(["admin"]);
		// Later sign-in without the admin group must not strip admin.
		const drifted = store.provisionFromSignIn({
			sub: "boss-1",
			email: "boss@example.com",
			groups: ["team"],
			authConfig,
		});
		expect(drifted.directRoles).toEqual(["admin"]);
	});

	it("assigns direct and project roles and disables users", () => {
		const store = createUserStore({ stateDir });
		store.provisionFromSignIn({ sub: "s9", groups: [], authConfig });
		expect(store.setDirectRoles("s9", ["member", "owner"]).directRoles).toEqual([
			"member",
		]);
		expect(
			store.setProjectRoles("s9", "alpha", ["viewer"]).projectRoles,
		).toEqual({ alpha: ["viewer"] });
		expect(
			store.setProjectRoles("s9", "alpha", []).projectRoles,
		).toEqual({});
		expect(store.setDisabled("s9", true).disabled).toBe(true);
		expect(store.setDirectRoles("ghost", ["admin"])).toBeNull();
		expect(store.setProjectRoles("ghost", "alpha", ["admin"])).toBeNull();
		expect(store.setProjectRoles("s9", "", ["admin"])).toBeNull();
		expect(store.setDisabled("ghost", true)).toBeNull();
	});

	it("survives a restart through the JSON file", () => {
		const first = createUserStore({ stateDir });
		first.provisionFromSignIn({ sub: "s5", email: "e@x.com", authConfig });
		expect(fs.existsSync(usersFilePath(stateDir))).toBe(true);
		const second = createUserStore({ stateDir });
		expect(second.findById("s5").email).toBe("e@x.com");
	});
});
