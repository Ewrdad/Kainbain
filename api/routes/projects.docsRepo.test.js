import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: throwaway projects/notes roots AND registry (the docs-repo
// pointer file resolves next to the registry, so it must not touch the
// live ~/.kainbain) BEFORE the app import constructs its stores.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-docsrepo-"));
const tempProjectsRoot = path.join(tempRoot, "projects");
const tempNotesRoot = path.join(tempRoot, "notes");
const tempRegistry = path.join(tempRoot, "projects.json");
fs.mkdirSync(tempProjectsRoot, { recursive: true });
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;
process.env.KAINBAIN_PROJECTS_REGISTRY_FILE = tempRegistry;

const { default: app } = await import("../index.js");
const { ProjectStore } = await import("../projectStore.js");
const { readDocsRepoPointers, docsRepoPointerFor } = await import("../project/docsRepoPointer.js");

afterAll(() => {
	try {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

const POINTER_FILE = path.join(tempRoot, "docs-repo-pointers.json");
// file:// URL that fails instantly (no network): clone falls back to git init.
const FAILING_URL = "file:///nonexistent/kainbain-docs-fixture.git";
const REDACT_URL = "https://user:secret-token@git.example.com/me/proj-kb.git";
const REDACTED_URL = "https://git.example.com/me/proj-kb.git";

/***
 * MARK: POST /projects with a separate docs repo
 * @description Create-with-docsRepo: the main repo stays free of KainBain
 *   traces (no docs symlink, no state folder, no .gitignore), the docs
 *   checkout is provisioned as a git repo with skeleton + redacted-at-rest
 *   config, and the engine-global pointer records the mapping.
 ***/
describe("POST /projects with docsRepo", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("provisions the docs repo and keeps the main repo clean", async () => {
		const localPath = path.join(tempRoot, "docs-checkouts", "app-one-kb");
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Docs Repo App",
				gitUrl: "https://git.example.com/team/app-one.git",
				docsRepo: { url: REDACT_URL, localPath },
			},
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.docsRepo).toBeDefined();
		// Stored URL is credential-redacted.
		expect(project.docsRepo.url).toBe(REDACTED_URL);
		expect(project.docsRepo.localPath).toBe(localPath);
		expect(project.docsRepo.branchMode).toBe("synced");

		// MAIN REPO: zero KainBain traces (stealth gate).
		expect(fs.existsSync(path.join(project.cwd, ".kainbain"))).toBe(false);
		expect(fs.existsSync(path.join(project.cwd, "docs"))).toBe(false);
		expect(fs.existsSync(path.join(project.cwd, ".gitignore"))).toBe(false);

		// DOCS REPO: git repo + skeleton + config with the redacted URL.
		expect(fs.existsSync(path.join(localPath, ".git"))).toBe(true);
		expect(fs.existsSync(path.join(localPath, "docs", "tasks"))).toBe(true);
		const docsConfig = JSON.parse(
			fs.readFileSync(path.join(localPath, ".kainbain", "project.json"), "utf8"),
		);
		expect(docsConfig.docsRepo.url).toBe(REDACTED_URL);
		expect(docsConfig.docsRepo.localPath).toBe(localPath);
		expect(docsConfig.cwd).toBe(project.cwd);
		// .gitignore lives in the docs repo, not the main repo.
		expect(fs.existsSync(path.join(localPath, ".gitignore"))).toBe(true);

		// Pointer recorded engine-globally.
		expect(docsRepoPointerFor(project.cwd, { registryFile: tempRegistry })).toBe(localPath);

		// GET reflects the setting (redacted).
		const fetched = await app.inject({ method: "GET", url: `/projects/${project.id}` });
		expect(JSON.parse(fetched.payload).docsRepo.url).toBe(REDACTED_URL);
	});

	it("defaults localPath next to the cwd when only a URL is given", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Url Only App",
				gitUrl: "https://git.example.com/team/app-two.git",
				docsRepo: { url: FAILING_URL },
			},
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		const expected = path.join(
			path.dirname(project.cwd),
			`${path.basename(project.cwd)}-kainbain-docs`,
		);
		expect(project.docsRepo.localPath).toBe(expected);
		expect(fs.existsSync(path.join(expected, ".git"))).toBe(true);
	});

	it("rejects an invalid docs repo URL with a 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Bad Docs Repo App",
				gitUrl: "https://git.example.com/team/app-three.git",
				docsRepo: { url: "not a url" },
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/docsRepo\.url/i);
	});

	it("rejects a relative localPath with a 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Bad Docs Path App",
				gitUrl: "https://git.example.com/team/app-four.git",
				docsRepo: { localPath: "relative/dir" },
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/docsRepo\.localPath/i);
	});

	it("409s when another project already claims the same docs repo", async () => {
		const localPath = path.join(tempRoot, "docs-checkouts", "app-one-kb");
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Claiming App",
				gitUrl: "https://git.example.com/team/app-five.git",
				docsRepo: { url: REDACT_URL, localPath },
			},
		});
		expect(res.statusCode).toBe(409);
		expect(JSON.parse(res.payload).error).toMatch(/already claimed/i);
	});

	it("400s when docsRepo.localPath sits inside the main repo (stealth guard)", async () => {
		const adopted = path.join(tempRoot, "nested-docs-repo");
		fs.mkdirSync(adopted, { recursive: true });
		const res = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: {
				path: adopted,
				name: "Nested Docs App",
				docsRepo: { localPath: path.join(adopted, "kb-docs") },
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/OUTSIDE the main project repo/i);
		// Nothing was provisioned inside the main repo.
		expect(fs.existsSync(path.join(adopted, "kb-docs"))).toBe(false);
		expect(fs.existsSync(path.join(adopted, ".kainbain"))).toBe(false);
	});

	it("400s when docsRepo.url is the main repo URL (docs branches would hit the shared remote)", async () => {
		const mainUrl = "https://git.example.com/team/app-nested-url.git";
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Same Url App",
				gitUrl: mainUrl,
				docsRepo: { url: `${mainUrl.replace(/\.git$/, "")}/` }, // spelling variant, same remote
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/DIFFERENT repository/i);
	});
});

/***
 * MARK: POST /projects/register + PATCH with a docs repo
 * @description Adopt-with-docsRepo provisions the checkout and keeps the
 *   adopted repo clean; PATCH enables/disables the docs repo on an existing
 *   project; a restart rediscovers the project through the pointer.
 ***/
describe("register + PATCH docsRepo", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("adopts an existing repo with a docs repo and writes nothing KainBain into it", async () => {
		const adopted = path.join(tempRoot, "adopted-repo");
		fs.mkdirSync(adopted, { recursive: true });
		const localPath = path.join(tempRoot, "docs-checkouts", "adopted-kb");
		const res = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: { path: adopted, name: "Adopted App", docsRepo: { localPath } },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.docsRepo?.localPath).toBe(localPath);
		expect(fs.existsSync(path.join(adopted, ".kainbain"))).toBe(false);
		expect(fs.existsSync(path.join(adopted, "docs"))).toBe(false);
		expect(fs.existsSync(path.join(adopted, ".gitignore"))).toBe(false);
		expect(fs.existsSync(path.join(localPath, ".kainbain", "project.json"))).toBe(true);
	});

	it("PATCH enables a docs repo on an existing project", async () => {
		const create = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Patch Me App", gitUrl: "https://git.example.com/team/app-six.git" },
		});
		expect(create.statusCode).toBe(201);
		const project = JSON.parse(create.payload);
		expect(project.docsRepo).toBeUndefined();
		// Sanity: default project wrote its state folder in the main repo.
		expect(fs.existsSync(path.join(project.cwd, ".kainbain", "project.json"))).toBe(true);

		const localPath = path.join(tempRoot, "docs-checkouts", "patched-kb");
		const patchUrl = "https://user:secret-token@git.example.com/me/patched-kb.git";
		const patch = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { docsRepo: { url: patchUrl, localPath } },
		});
		expect(patch.statusCode).toBe(200);
		const updated = JSON.parse(patch.payload);
		expect(updated.docsRepo.url).toBe("https://git.example.com/me/patched-kb.git");
		expect(updated.docsRepo.localPath).toBe(localPath);
		// Config now lives in the docs repo.
		const docsConfig = JSON.parse(
			fs.readFileSync(path.join(localPath, ".kainbain", "project.json"), "utf8"),
		);
		expect(docsConfig.docsRepo.localPath).toBe(localPath);
		expect(docsRepoPointerFor(project.cwd, { registryFile: tempRegistry })).toBe(localPath);

		// PATCH with an invalid value is a 400 and changes nothing.
		const bad = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { docsRepo: { url: "nope" } },
		});
		expect(bad.statusCode).toBe(400);

		// PATCH null clears the docs repo and drops the pointer.
		const cleared = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { docsRepo: null },
		});
		expect(cleared.statusCode).toBe(200);
		expect(JSON.parse(cleared.payload).docsRepo).toBeUndefined();
		expect(docsRepoPointerFor(project.cwd, { registryFile: tempRegistry })).toBeNull();
	});

	it("DELETE drops the pointer so the deleted project never resurrects on rescan", async () => {
		const localPath = path.join(tempRoot, "docs-checkouts", "deleted-kb");
		const create = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Deleted App",
				gitUrl: "https://git.example.com/team/app-deleted.git",
				docsRepo: { localPath },
			},
		});
		expect(create.statusCode).toBe(201);
		const created = JSON.parse(create.payload);
		expect(docsRepoPointerFor(created.cwd, { registryFile: tempRegistry })).toBe(localPath);

		const removed = await app.inject({ method: "DELETE", url: `/projects/${created.id}` });
		expect(removed.statusCode).toBe(200);
		expect(docsRepoPointerFor(created.cwd, { registryFile: tempRegistry })).toBeNull();

		// A fresh store (simulated restart) must NOT re-adopt the deleted
		// project from its orphaned docs config.
		const fresh = new ProjectStore({
			projectsRoot: tempProjectsRoot,
			notesRoot: tempNotesRoot,
			registryFile: tempRegistry,
			autoScan: true,
		});
		expect(fresh.listProjects().find((p) => p.id === created.id)).toBeUndefined();
	});

	it("PATCH cwd re-keys the pointer so the moved project survives a restart", async () => {
		const localPath = path.join(tempRoot, "docs-checkouts", "moved-kb");
		const create = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Moved App",
				gitUrl: "https://git.example.com/team/app-moved.git",
				docsRepo: { localPath },
			},
		});
		expect(create.statusCode).toBe(201);
		const created = JSON.parse(create.payload);

		const newCwd = path.join(tempProjectsRoot, "moved-app-checkout");
		fs.mkdirSync(newCwd, { recursive: true });
		const patch = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { cwd: newCwd },
		});
		expect(patch.statusCode).toBe(200);
		expect(JSON.parse(patch.payload).cwd).toBe(newCwd);
		// Old checkout entry dropped, new checkout remembered.
		expect(docsRepoPointerFor(created.cwd, { registryFile: tempRegistry })).toBeNull();
		expect(docsRepoPointerFor(newCwd, { registryFile: tempRegistry })).toBe(localPath);

		const fresh = new ProjectStore({
			projectsRoot: tempProjectsRoot,
			notesRoot: tempNotesRoot,
			registryFile: tempRegistry,
			autoScan: true,
		});
		const found = fresh.listProjects().find((p) => p.id === created.id);
		expect(found).toBeDefined();
		expect(found.cwd).toBe(newCwd);
		expect(found.docsRepo?.localPath).toBe(localPath);
	});

	it("PATCH cwd into the docs checkout is refused (stealth guard survives moves)", async () => {
		const localPath = path.join(tempRoot, "docs-checkouts", "guarded-move-kb");
		const create = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Guarded Move App",
				gitUrl: "https://git.example.com/team/app-guarded-move.git",
				docsRepo: { localPath },
			},
		});
		expect(create.statusCode).toBe(201);
		const created = JSON.parse(create.payload);

		const nested = path.join(localPath, "nested-main");
		fs.mkdirSync(nested, { recursive: true });
		const patch = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { cwd: nested },
		});
		expect(patch.statusCode).toBe(400);
		expect(JSON.parse(patch.payload).error).toMatch(/OUTSIDE the main project repo/i);
		// Record untouched.
		const fetched = await app.inject({ method: "GET", url: `/projects/${created.id}` });
		expect(JSON.parse(fetched.payload).cwd).toBe(created.cwd);
	});

	it("PATCH gitUrl onto the docs URL is refused (main remote must stay separate)", async () => {
		const docsUrl = "https://git.example.com/me/guarded-remote-kb.git";
		const localPath = path.join(tempRoot, "docs-checkouts", "guarded-remote-kb");
		const create = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Guarded Remote App",
				gitUrl: "https://git.example.com/team/app-guarded-remote.git",
				docsRepo: { url: docsUrl, localPath },
			},
		});
		expect(create.statusCode).toBe(201);
		const created = JSON.parse(create.payload);

		const patch = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { gitUrl: docsUrl },
		});
		expect(patch.statusCode).toBe(400);
		expect(JSON.parse(patch.payload).error).toMatch(/DIFFERENT repository/i);
		// Record untouched.
		const fetched = await app.inject({ method: "GET", url: `/projects/${created.id}` });
		expect(JSON.parse(fetched.payload).gitUrl).toBe(created.gitUrl);
	});

	it("PATCH kainbainDirName on a docs-repo project retires the stale docs-home config", async () => {
		const localPath = path.join(tempRoot, "docs-checkouts", "renamed-state-kb");
		const create = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Renamed State App",
				gitUrl: "https://git.example.com/team/app-renamed-state.git",
				docsRepo: { localPath },
			},
		});
		expect(create.statusCode).toBe(201);
		const created = JSON.parse(create.payload);
		expect(fs.existsSync(path.join(localPath, ".kainbain", "project.json"))).toBe(true);

		const patch = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { kainbainDirName: ".kb" },
		});
		expect(patch.statusCode).toBe(200);
		expect(JSON.parse(patch.payload).kainbainDirName).toBe(".kb");
		// New config written in the docs home, stale default retired there —
		// a lingering stale default would win on restart and revert the rename.
		expect(fs.existsSync(path.join(localPath, ".kb", "project.json"))).toBe(true);
		expect(fs.existsSync(path.join(localPath, ".kainbain", "project.json"))).toBe(false);

		const fresh = new ProjectStore({
			projectsRoot: tempProjectsRoot,
			notesRoot: tempNotesRoot,
			registryFile: tempRegistry,
			autoScan: true,
		});
		const found = fresh.listProjects().find((p) => p.id === created.id);
		expect(found).toBeDefined();
		expect(found.kainbainDirName).toBe(".kb");
	});

	it("a fresh store rediscovers a docs-repo project through the pointer", async () => {
		const localPath = path.join(tempRoot, "docs-checkouts", "rediscover-kb");
		const create = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Rediscover App",
				gitUrl: "https://git.example.com/team/app-seven.git",
				docsRepo: { localPath },
			},
		});
		expect(create.statusCode).toBe(201);
		const created = JSON.parse(create.payload);

		// A fresh store (simulated restart) scanning the same roots must find
		// the project via the pointer + docs-repo config.
		const fresh = new ProjectStore({
			projectsRoot: tempProjectsRoot,
			notesRoot: tempNotesRoot,
			registryFile: tempRegistry,
			autoScan: true,
		});
		const found = fresh.listProjects().find((p) => p.id === created.id);
		expect(found).toBeDefined();
		expect(found.docsRepo?.localPath).toBe(localPath);
		expect(found.cwd).toBe(created.cwd);
		// The docs link check reports the external-docs state and touches nothing.
		const link = fresh.ensureDocsLink(found);
		expect(link.state).toBe("external-docs");
		expect(link.docsHome).toBe(localPath);
		expect(fs.existsSync(path.join(created.cwd, "docs"))).toBe(false);
	});
});
