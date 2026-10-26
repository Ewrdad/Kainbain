import { config } from "../../../config/index.js";

/**
 * MARK: OpencodeServerManager
 * @description Owns ONE Opencode server per project directory: connects to an
 *   already-running server (OPENCODE_URL) or spawns a local `opencode serve`
 *   child process, waits for readiness, and disposes the child on shutdown —
 *   a spawned server never outlives the engine process that started it.
 *
 *   Server scope: one per project cwd (isolation of sessions/state between
 *   projects; see the harness design notes). Managers are shared through
 *   `opencodeServerForProject()` so concurrent sessions for the same project
 *   reuse one server, and `disposeAllOpencodeServers()` tears every spawned
 *   server down (wired into the engine's graceful shutdown).
 *
 *   Readiness: the OpenCode server ships no /health route in 1.18.x, so
 *   readiness is proven with a cheap GET (default `/project/current`, 200
 *   expected — see FACTS.md).
 */

const READINESS_PROBE_TTL_MS = 5000;
const PROBE_TIMEOUT_MS = 2000;

/** project cwd → manager (one live server per project directory) */
const managersByCwd = new Map();

/***
 * MARK: probeUrl
 * @description Performs the manager's readiness probe against a base URL:
 *   a GET to the health path must answer 200 (401 means the password guard
 *   rejected us — surfaced as a distinct failure, never a ready server).
 * @example await probeUrl("http://127.0.0.1:4096", "/project/current") => true
 * @param {string} baseUrl
 * @param {Object} [opts]
 * @param {string} [opts.healthPath]
 * @param {string} [opts.password]
 * @param {Function} [opts.fetch] - Fetch implementation (test seam; defaults to globalThis.fetch).
 * @returns {Promise<boolean>} Whether the server answered 200.
 ***/
async function probeUrl(baseUrl, { healthPath, password, fetch: fetchImpl } = {}) {
	const doFetch = fetchImpl || globalThis.fetch;
	try {
		const headers = {};
		if (password) headers.authorization = `Bearer ${password}`;
		const response = await doFetch(`${baseUrl}${healthPath}`, {
			headers,
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		return response.status === 200;
	} catch {
		return false;
	}
}

export class OpencodeServerManager {
	/***
	 * MARK: constructor
	 * @description Builds the manager for one project directory. When a base
	 *   URL is provided (option or OPENCODE_URL) the manager only CONNECTS —
	 *   it never spawns a child process.
	 * @example new OpencodeServerManager({ cwd: "/repo" })
	 * @example new OpencodeServerManager({ cwd: "/repo", baseUrl: "http://127.0.0.1:4096" })
	 * @param {Object} [opts]
	 * @param {string} [opts.cwd] - Project directory (isolation + spawn workdir).
	 * @param {string} [opts.baseUrl] - Connect to an already-running server instead of spawning.
	 * @param {number} [opts.port] - Port for a spawned server (0 = OS-assigned).
	 * @param {string} [opts.password] - OPENCODE_SERVER_PASSWORD bearer guard.
	 * @param {string} [opts.healthPath] - Readiness probe path (default /project/current).
	 * @param {number} [opts.spawnTimeoutMs] - Max wait for a spawned server to start.
	 * @param {Function} [opts.spawnServer] - Test seam: () => Promise<{url, close}>; defaults to the SDK's createOpencodeServer.
	 * @param {Function} [opts.fetch] - Test seam: (url, init) => Promise<Response-like>; defaults to globalThis.fetch.
	 ***/
	constructor({
		cwd,
		baseUrl,
		port = 0,
		password,
		healthPath = "/project/current",
		spawnTimeoutMs = 30000,
		spawnServer,
		fetch: fetchImpl,
	} = {}) {
		this.cwd = cwd || process.cwd();
		this.configuredBaseUrl = baseUrl || config.opencodeUrl || null;
		this.port = port;
		this.password = password || config.opencodeServerPassword || null;
		this.healthPath = healthPath;
		this.spawnTimeoutMs = spawnTimeoutMs;
		this.spawnServerImpl = spawnServer || null;
		this.fetchImpl = fetchImpl || null;
		this.spawnedServer = null;
		this.ready = false;
		this.lastProbeOkAt = 0;
		this.lastProbeUrl = null;
	}

	/***
	 * MARK: baseUrl
	 * @description The server's base URL once known (spawned URL, configured
	 *   URL, or the last URL that passed a probe).
	 * @returns {string|null}
	 ***/
	get baseUrl() {
		return this.spawnedServer?.url || this.configuredBaseUrl || this.lastProbeUrl || null;
	}

	/***
	 * MARK: isReady
	 * @description Cheap readiness flag — no network. Reflects the last known
	 *   state (spawn success or successful probe).
	 * @example manager.isReady() => true
	 * @returns {boolean}
	 ***/
	isReady() {
		return this.ready;
	}

	/***
	 * MARK: ensureRunning
	 * @description Returns the server's base URL, starting it when needed:
	 *   connect mode probes the configured URL (throwing when unreachable —
	 *   the operator chose the server, the engine must not guess), spawn mode
	 *   launches `opencode serve` via the SDK and waits for readiness. An
	 *   already-probed-healthy server is returned immediately (probe TTL) so
	 *   session creation never stacks redundant probes.
	 * @example await manager.ensureRunning() => "http://127.0.0.1:4096"
	 * @returns {Promise<string>} The server base URL.
	 ***/
	async ensureRunning() {
		const freshProbe =
			Date.now() - this.lastProbeOkAt < READINESS_PROBE_TTL_MS && this.baseUrl;
		if (freshProbe && this.ready) {
			return this.baseUrl;
		}

		if (this.configuredBaseUrl) {
			const reachable = await probeUrl(this.configuredBaseUrl, {
				healthPath: this.healthPath,
				password: this.password,
				fetch: this.fetchImpl,
			});
			if (!reachable) {
				this.ready = false;
				throw new Error(
					`OpenCode server at ${this.configuredBaseUrl} is not reachable (OPENCODE_URL); start it or unset the variable`,
				);
			}
			this.ready = true;
			this.lastProbeOkAt = Date.now();
			this.lastProbeUrl = this.configuredBaseUrl;
			return this.configuredBaseUrl;
		}

		// Spawn mode: if a previous server went unhealthy, drop it and respawn.
		if (this.spawnedServer) {
			const alive = await probeUrl(this.spawnedServer.url, {
				healthPath: this.healthPath,
				password: this.password,
				fetch: this.fetchImpl,
			});
			if (alive) {
				this.ready = true;
				this.lastProbeOkAt = Date.now();
				this.lastProbeUrl = this.spawnedServer.url;
				return this.spawnedServer.url;
			}
			// Child died (crash/exit): clean it up and respawn below.
			this.cleanup();
		}

		const spawn = this.spawnServerImpl || (await this.loadSdkSpawner());
		const server = await spawn({
			hostname: "127.0.0.1",
			port: this.port,
			timeout: this.spawnTimeoutMs,
		});

		const ready = await probeUrl(server.url, {
			healthPath: this.healthPath,
			password: this.password,
			fetch: this.fetchImpl,
		});
		if (!ready) {
			try {
				server.close();
			} catch {
				// ignore close errors on a server that never became ready
			}
			this.ready = false;
			throw new Error(
				`Spawned OpenCode server at ${server.url} never became ready (probed ${this.healthPath})`,
			);
		}

		this.spawnedServer = server;
		this.ready = true;
		this.lastProbeOkAt = Date.now();
		this.lastProbeUrl = server.url;
		return server.url;
	}

	/***
	 * MARK: loadSdkSpawner
	 * @description Lazily loads the SDK's server spawner so engine startup (and
	 *   the registry) never pays for the OpenCode SDK unless a session or
	 *   model list actually needs a server.
	 * @returns {Promise<Function>} The SDK's createOpencodeServer.
	 ***/
	async loadSdkSpawner() {
		const { createOpencodeServer } = await import("@opencode-ai/sdk");
		return (options) =>
			createOpencodeServer({
				hostname: "127.0.0.1",
				port: this.port,
				timeout: this.spawnTimeoutMs,
				...options,
			});
	}

	/***
	 * MARK: cleanup
	 * @description Stops the spawned server (if any) and resets readiness.
	 *   Idempotent; safe to call repeatedly (graceful shutdown + TTL sweeps).
	 * @example manager.cleanup()
	 ***/
	cleanup() {
		if (this.spawnedServer) {
			try {
				this.spawnedServer.close();
			} catch {
				// The child may already be gone; nothing left to clean.
			}
		}
		this.spawnedServer = null;
		this.ready = false;
		this.lastProbeOkAt = 0;
	}
}

/***
 * MARK: opencodeServerForProject
 * @description Returns the live manager for a project directory, creating it
	*   on first use — the single-server-per-project guarantee.
 * @example const manager = opencodeServerForProject({ cwd: "/repo" })
 * @param {Object} project - The project entity (cwd).
 * @param {Object} [opts] - Forwarded to the manager on first creation.
 * @returns {OpencodeServerManager}
 ***/
export function opencodeServerForProject(project, opts = {}) {
	const cwd = project?.cwd || process.cwd();
	let manager = managersByCwd.get(cwd);
	if (!manager) {
		manager = new OpencodeServerManager({ cwd, ...opts });
		managersByCwd.set(cwd, manager);
	}
	return manager;
}

/***
 * MARK: disposeAllOpencodeServers
 * @description Stops every spawned OpenCode server (graceful shutdown).
 * @example disposeAllOpencodeServers()
 ***/
export function disposeAllOpencodeServers() {
	for (const manager of managersByCwd.values()) {
		try {
			manager.cleanup();
		} catch {
			// Shutdown must never be blocked by one bad child.
		}
	}
	managersByCwd.clear();
}

/***
 * MARK: activeOpencodeServerUrl
 * @description The base URL of an ALREADY-RUNNING OpenCode server for a
	*   project, without probing, spawning, or starting anything — used by the
	*   merged /compute/models route so listing models never costs a spawn.
 * @example activeOpencodeServerUrl({ cwd: "/repo" }) => "http://127.0.0.1:4096" | null
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function activeOpencodeServerUrl(project) {
	const cwd = project?.cwd || process.cwd();
	const manager = managersByCwd.get(cwd);
	if (manager?.isReady()) return manager.baseUrl;
	return config.opencodeUrl || null;
}