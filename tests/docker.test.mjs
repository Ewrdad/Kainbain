import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/***
 * MARK: container tests
 * @description Verification for the WP-8 turnkey deployment (Dockerfile,
 *   docker-compose.yml, .dockerignore, docker-entrypoint.sh). Static file
 *   assertions always run; build/boot/compose tests are OPT-IN via
 *   `KAINBAIN_CONTAINER_TESTS=live` and SKIP otherwise. Live tests need a
 *   reachable Docker daemon (SKIP without one, same graceful pattern as the
 *   Security Script Tests branch without bash) and take minutes (image
 *   build + container boots), so they stay out of the default `npm test`
 *   gate, which must fit the CI stage's 60s budget. Live tests use
 *   isolated names, random host ports, and temp dirs — never the
 *   developer's :3100 or ./projects — and remove every container they create.
 * @example run `node --test tests/docker.test.mjs` (static) or `KAINBAIN_CONTAINER_TESTS=live node --test tests/docker.test.mjs` (full)
 ***/

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_TAG = "kainbain:test";
const RUN_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const BOOT_CONTAINER = `kb-test-${RUN_ID}-boot`;
const COMPOSE_PROJECT = `kbtest${process.pid}${Math.random().toString(36).slice(2, 8)}`;

function commandAvailable(command, args) {
	try {
		const result = spawnSync(command, args, { stdio: "ignore", windowsHide: true });
		return !result.error;
	} catch {
		return false;
	}
}

function daemonReachable() {
	try {
		const result = spawnSync("docker", ["info"], { stdio: "ignore", windowsHide: true });
		return !result.error && result.status === 0;
	} catch {
		return false;
	}
}

/***
 * MARK: shouldRunLive
 * @description Pure live-mode gate: the minutes-long build/boot/compose
 *   tests run only when the docker CLI exists, a daemon is reachable, AND
 *   the caller explicitly opts in with `KAINBAIN_CONTAINER_TESTS=live`.
 *   Every other value (including unset) is static-only, keeping the
 *   default `npm test` gate inside the CI stage's 60s budget.
 * @example shouldRunLive({ cliAvailable: true, daemonReachable: true, containerTestsEnv: "live" }) => true
 ***/
export function shouldRunLive({ cliAvailable = false, daemonReachable: daemonUp = false, containerTestsEnv = undefined } = {}) {
	return cliAvailable === true && daemonUp === true && containerTestsEnv === "live";
}

const CLI_AVAILABLE = commandAvailable("docker", ["--version"]);
// Probe the daemon only when live was requested: a cold daemon probe can
// stall, and the static path must stay instant for the 60s gate.
const LIVE_MODE = shouldRunLive({
	cliAvailable: CLI_AVAILABLE,
	daemonReachable: process.env.KAINBAIN_CONTAINER_TESTS === "live" ? daemonReachable() : false,
	containerTestsEnv: process.env.KAINBAIN_CONTAINER_TESTS,
});
// eslint-disable-next-line no-console -- skip reason goes to the test log, like the gate's SKIP lines.
if (!LIVE_MODE) console.log("Container Tests: static-only (set KAINBAIN_CONTAINER_TESTS=live with a Docker daemon for build/boot tests) — live tests SKIP.");
const itLive = LIVE_MODE ? it : it.skip;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function docker(args, { timeout = 120000, env } = {}) {
	return spawnSync("docker", args, {
		cwd: REPO_ROOT,
		timeout,
		encoding: "utf8",
		windowsHide: true,
		...(env ? { env: { ...process.env, ...env } } : {}),
	});
}

async function pickFreePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

function removeContainer(name) {
	try {
		docker(["rm", "-f", name], { timeout: 60000 });
	} catch {
		// Best-effort cleanup.
	}
}

function containerPort(name, containerPort) {
	const result = docker(["port", name, String(containerPort)], { timeout: 30000 });
	assert.equal(result.status, 0, `docker port failed: ${result.stderr}`);
	const line = String(result.stdout).trim().split("\n").pop();
	const port = Number(line.slice(line.lastIndexOf(":") + 1));
	assert.ok(Number.isInteger(port) && port > 0, `unparseable docker port line: ${line}`);
	return port;
}

async function waitForStatusOk(baseUrl, { timeoutMs = 60000 } = {}) {
	const deadline = Date.now() + timeoutMs;
	let lastError = new Error("no attempts");
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/status`);
			if (response.ok) {
				const body = await response.json();
				if (body && body.status === "ok") return body;
				lastError = new Error(`status field was ${JSON.stringify(body && body.status)}`);
			} else {
				lastError = new Error(`HTTP ${response.status}`);
			}
		} catch (err) {
			lastError = err;
		}
		await sleep(1000);
	}
	throw new Error(`timed out waiting for ${baseUrl}/status to report ok: ${lastError.message}`);
}

function readRootFile(name) {
	return fs.readFileSync(path.join(REPO_ROOT, name), "utf8");
}

/***
 * MARK: healthcheckCmd
 * @description Extracts the exact shell command from the Dockerfile's
 *   HEALTHCHECK line (everything after `CMD `), so the live test probes
 *   with byte-identical input to what the Docker daemon runs — a static
 *   regex alone cannot catch a probe that parses but fails at runtime
 *   (e.g. localhost vs 127.0.0.1 under BusyBox wget with an IPv4-only bind).
 * @example healthcheckCmd() => "wget -qO- http://127.0.0.1:${PORT:-3100}/status || exit 1"
 ***/
function healthcheckCmd() {
	const line = readRootFile("Dockerfile")
		.split("\n")
		.find((l) => l.startsWith("HEALTHCHECK "));
	assert.ok(line, "Dockerfile must contain a HEALTHCHECK line");
	const marker = " CMD ";
	const index = line.indexOf(marker);
	assert.ok(index !== -1, `HEALTHCHECK line must contain '${marker.trim()}': ${line}`);
	return line.slice(index + marker.length);
}

describe("Container files (static)", () => {
	it("Dockerfile is a multi-stage node:24-alpine build", () => {
		const dockerfile = readRootFile("Dockerfile");
		const fromLines = dockerfile.split("\n").filter((line) => line.startsWith("FROM "));
		assert.ok(fromLines.length >= 2, "expected build + production stages");
		for (const line of fromLines) {
			assert.match(line, /^FROM node:24-alpine/, `pinned base image: ${line}`);
		}
		assert.match(dockerfile, /^FROM node:24-alpine AS build/m);
	});

	it("Dockerfile builds the frontend for same-origin serving", () => {
		const dockerfile = readRootFile("Dockerfile");
		assert.match(dockerfile, /^ARG VITE_API_BASE=$/m);
		assert.match(dockerfile, /^ARG VITE_WS_URL=$/m);
		assert.match(dockerfile, /npm run build --prefix \.\/frontend/);
	});

	it("Dockerfile never bulk-copies the context and prunes test files", () => {
		const dockerfile = readRootFile("Dockerfile");
		assert.ok(!/^COPY \. \./m.test(dockerfile), "must not COPY . . (docs symlink, host state)");
		assert.match(dockerfile, /--omit=dev/);
		assert.match(dockerfile, /-name "\*\.test\.js" -delete/);
	});

	it("Dockerfile drops to the non-root user and healthchecks /status", () => {
		const dockerfile = readRootFile("Dockerfile");
		assert.match(dockerfile, /su-exec/);
		assert.match(dockerfile, /^EXPOSE 3100$/m);
		assert.match(dockerfile, /^HEALTHCHECK --interval=30s --timeout=5s .*\/status \|\| exit 1/m);
		// Regression guard: the probe host must be 127.0.0.1, never the
		// ticket-literal localhost (IPv4-only bind + BusyBox wget ::1 = always unhealthy).
		assert.match(dockerfile, /^HEALTHCHECK .*http:\/\/127\.0\.0\.1:/m);
		assert.ok(!/^HEALTHCHECK .*http:\/\/localhost:/m.test(dockerfile), "HEALTHCHECK must not use localhost");
		assert.match(dockerfile, /^ENTRYPOINT \["\/app\/docker-entrypoint\.sh"\]$/m);
		assert.match(dockerfile, /^CMD \["node", "api\/index\.js"\]$/m);
	});

	it(".dockerignore excludes host state but keeps build inputs", () => {
		const ignore = readRootFile(".dockerignore");
		for (const entry of ["node_modules", "docs", ".env", ".git", "frontend/dist", "projects"]) {
			assert.ok(
				ignore.split("\n").some((line) => line.trim() === entry || line.trim() === `${entry}/` || line.trim().endsWith(`/${entry}`) || line.trim().endsWith(`/${entry}/`)),
				`.dockerignore lists ${entry}`,
			);
		}
		const patterns = ignore
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "" && !line.startsWith("#"));
		for (const needed of ["opencode-ai-sdk", "npmrc", "entrypoint"]) {
			assert.ok(
				!patterns.some((pattern) => pattern.includes(needed)),
				`.dockerignore must not exclude ${needed} (the build needs it in context)`,
			);
		}
	});

	it("docker-compose.yml wires the turnkey service", () => {
		const compose = readRootFile("docker-compose.yml");
		assert.match(compose, /kainbain:/);
		assert.match(compose, /\.\/projects:\/workspace\/projects/);
		assert.match(compose, /kainbain-data:\/home\/node\/\.kainbain/);
		assert.match(compose, /required: false/);
		// Frontend nginx listens on 80 in-container; the host side is the
		// KAINBAIN_PORT convenience mapping (production sits behind a
		// domain-based reverse proxy on 80/443, e.g. kainbain.home).
		assert.match(compose, /\$\{KAINBAIN_PORT:-3100\}:80/);
		assert.match(compose, /PROJECTS_ROOT: \/workspace\/projects/);
	});

	it("docker-entrypoint.sh validates mounts and drops privileges", () => {
		const entrypoint = readRootFile("docker-entrypoint.sh");
		assert.ok(entrypoint.startsWith("#!/bin/sh"), "POSIX sh entrypoint");
		assert.match(entrypoint, /PROJECTS_ROOT/);
		assert.match(entrypoint, /Refusing to boot/);
		assert.match(entrypoint, /exec su-exec node "\$@"/);
		assert.match(entrypoint, /exit 1/);
	});

	(CLI_AVAILABLE ? it : it.skip)("docker compose config validates the compose file", () => {
		const result = docker(["compose", "-f", "docker-compose.yml", "config"], { timeout: 60000 });
		assert.equal(result.status, 0, `compose config failed: ${result.stderr}`);
		assert.match(String(result.stdout), /kainbain-data/);
	});
});

describe("Live-mode gating (hermetic)", () => {
	it("defaults to static-only when the knob is unset, even with a daemon", () => {
		assert.equal(shouldRunLive({ cliAvailable: true, daemonReachable: true }), false);
		assert.equal(shouldRunLive({ cliAvailable: true, daemonReachable: true, containerTestsEnv: undefined }), false);
	});

	it("treats any value other than 'live' as static-only", () => {
		for (const value of ["", "static", "true", "1", "LIVE", "Live"]) {
			assert.equal(
				shouldRunLive({ cliAvailable: true, daemonReachable: true, containerTestsEnv: value }),
				false,
				`containerTestsEnv=${JSON.stringify(value)} must not enable live tests`,
			);
		}
	});

	it("runs live only with CLI + reachable daemon + explicit opt-in", () => {
		assert.equal(shouldRunLive({ cliAvailable: true, daemonReachable: true, containerTestsEnv: "live" }), true);
	});

	it("stays static when the CLI or daemon is missing, even when opted in", () => {
		assert.equal(shouldRunLive({ cliAvailable: false, daemonReachable: true, containerTestsEnv: "live" }), false);
		assert.equal(shouldRunLive({ cliAvailable: true, daemonReachable: false, containerTestsEnv: "live" }), false);
		assert.equal(shouldRunLive(), false);
	});
});

describe("Container build + boot (live)", () => {
	const tempDirs = [];

	before(async () => {
		if (!LIVE_MODE) return;
		const result = docker(["build", "-t", IMAGE_TAG, "."], { timeout: 600000 });
		const output = `${result.stdout}\n${result.stderr}`;
		assert.equal(result.status, 0, `docker build failed:\n${output.slice(-4000)}`);
	}, { timeout: 610000 });

	after(async () => {
		if (!LIVE_MODE) return;
		removeContainer(BOOT_CONTAINER);
		try {
			docker(["compose", "-p", COMPOSE_PROJECT, "-f", "docker-compose.yml", "down", "-v"], { timeout: 120000 });
		} catch {
			// Best-effort cleanup.
		}
		for (const dir of tempDirs) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// Best-effort cleanup.
			}
		}
	});

	function makeTempDir(prefix) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		tempDirs.push(dir);
		return dir;
	}

	itLive("boots with no credentials and serves /status plus the UI", async () => {
		const projectsDir = makeTempDir("kb-docker-projects-");
		const dataDir = makeTempDir("kb-docker-data-");
		const run = docker([
			"run", "-d", "--rm",
			"--name", BOOT_CONTAINER,
			"-p", "127.0.0.1::3100",
			"-v", `${projectsDir}:/workspace/projects`,
			"-v", `${dataDir}:/home/node/.kainbain`,
			IMAGE_TAG,
		]);
		assert.equal(run.status, 0, `docker run failed: ${run.stderr}`);
		try {
			const baseUrl = `http://127.0.0.1:${containerPort(BOOT_CONTAINER, 3100)}`;
			const status = await waitForStatusOk(baseUrl);
			assert.equal(status.status, "ok");

			const ui = await fetch(`${baseUrl}/`);
			assert.equal(ui.status, 200);
			assert.match(ui.headers.get("content-type") || "", /text\/html/);
			assert.match(await ui.text(), /<!doctype html>/i);

			const owner = docker(["exec", BOOT_CONTAINER, "stat", "-c", "%U", "/proc/1"], { timeout: 30000 });
			assert.equal(String(owner.stdout).trim(), "node", "the server process runs as the non-root user");

			// The HEALTHCHECK CMD itself must exit 0 inside a healthy booted
			// container (run exactly as the daemon runs it, via sh -c).
			const probe = docker(["exec", BOOT_CONTAINER, "sh", "-c", healthcheckCmd()], { timeout: 30000 });
			assert.equal(probe.status, 0, `HEALTHCHECK CMD failed in a healthy container: ${probe.stderr}`);
		} finally {
			removeContainer(BOOT_CONTAINER);
		}
	}, { timeout: 180000 });

	itLive("repairs a dangling docs link at boot and still serves its tasks", async () => {
		const projectsDir = makeTempDir("kb-docker-link-projects-");
		const dataDir = makeTempDir("kb-docker-link-data-");
		// Seed the 2026-10-02 failure mode: a project whose docs symlink dangles.
		const projectDir = path.join(projectsDir, "seeded-proj");
		fs.mkdirSync(projectDir, { recursive: true });
		fs.symlinkSync("/nonexistent-kainbain-target", path.join(projectDir, "docs"), "dir");
		const notesTasksDir = path.join(dataDir, "notes", "seeded-proj", "tasks", "seeded-task-1");
		fs.mkdirSync(notesTasksDir, { recursive: true });
		fs.writeFileSync(
			path.join(notesTasksDir, "task.md"),
			[
				"---",
				"id: seeded-task-1",
				"projectId: seeded-proj",
				"title: Seeded container task",
				"status: completed",
				"---",
				"",
				"# Goal",
				"Seeded before boot to prove the repaired docs link serves tasks.",
				"",
				"# History",
				"- (no history recorded)",
				"",
			].join("\n"),
		);

		const run = docker([
			"run", "-d", "--rm",
			"--name", BOOT_CONTAINER,
			"-p", "127.0.0.1::3100",
			"-v", `${projectsDir}:/workspace/projects`,
			"-v", `${dataDir}:/home/node/.kainbain`,
			IMAGE_TAG,
		]);
		assert.equal(run.status, 0, `docker run failed: ${run.stderr}`);
		try {
			const baseUrl = `http://127.0.0.1:${containerPort(BOOT_CONTAINER, 3100)}`;
			await waitForStatusOk(baseUrl);

			const logs = docker(["logs", BOOT_CONTAINER], { timeout: 30000 });
			assert.match(
				`${logs.stdout}\n${logs.stderr}`,
				/repointed dangling docs symlink/,
				"ensureDocsLink repaired the seeded dangling link",
			);
			assert.equal(
				fs.readlinkSync(path.join(projectDir, "docs")),
				"/home/node/.kainbain/notes/seeded-proj",
			);

			const projectsResponse = await fetch(`${baseUrl}/projects`);
			assert.equal(projectsResponse.status, 200);
			const projects = await projectsResponse.json();
			const seeded = projects.find((project) => project.name === "seeded-proj");
			assert.ok(seeded, "seeded project is listed");
			const tasksResponse = await fetch(`${baseUrl}/tasks?projectId=${seeded.id}`);
			assert.equal(tasksResponse.status, 200);
			const tasks = await tasksResponse.json();
			assert.ok(
				tasks.some((task) => task.id === "seeded-task-1" && task.title === "Seeded container task"),
				"the task behind the repaired link is listed (no silent empty scan)",
			);
		} finally {
			removeContainer(BOOT_CONTAINER);
		}
	}, { timeout: 180000 });

	itLive("fails loudly when the projects mount is unreachable", () => {
		const result = docker(
			["run", "--rm", "-e", `PROJECTS_ROOT=/proc/kb-uncreatable-${RUN_ID}`, IMAGE_TAG],
			{ timeout: 120000 },
		);
		assert.notEqual(result.status, 0, "unreachable storage must exit non-zero");
		assert.match(
			`${result.stdout}\n${result.stderr}`,
			/Refusing to boot/,
			"the mount failure names itself instead of serving an empty list",
		);
	}, { timeout: 150000 });

	itLive("compose up serves /status from a fresh empty checkout shape", async () => {
		const projectsDir = makeTempDir("kb-compose-projects-");
		const dataDir = makeTempDir("kb-compose-data-");
		// Compose APPENDS `ports` across -f files, so the host port moves via
		// the documented KAINBAIN_PORT knob (picked free, never the live :3100);
		// only the storage mounts need the override file (merged by target).
		const hostPort = await pickFreePort();
		const composeEnv = { KAINBAIN_PORT: String(hostPort) };
		const overridePath = path.join(makeTempDir("kb-compose-override-"), "override.yml");
		fs.writeFileSync(
			overridePath,
			[
				"services:",
				"  kainbain:",
				"    volumes:",
				`      - "${projectsDir}:/workspace/projects"`,
				`      - "${dataDir}:/home/node/.kainbain"`,
				"",
			].join("\n"),
		);
		const base = ["compose", "-p", COMPOSE_PROJECT, "-f", "docker-compose.yml", "-f", overridePath];
		const config = docker([...base, "config"], { timeout: 60000, env: composeEnv });
		assert.equal(config.status, 0, `compose config failed: ${config.stderr}`);
		try {
			const up = docker([...base, "up", "-d"], { timeout: 600000, env: composeEnv });
			assert.equal(up.status, 0, `compose up failed: ${up.stdout}\n${up.stderr}`);
			const status = await waitForStatusOk(`http://127.0.0.1:${hostPort}`, { timeoutMs: 90000 });
			assert.equal(status.status, "ok");
		} finally {
			docker([...base, "down", "-v"], { timeout: 120000, env: composeEnv });
		}
	}, { timeout: 700000 });
});
