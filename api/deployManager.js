import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { notifyDeployRollback } from "./observability/alerts.js";

/***
 * MARK: defaultBashCheck
 * @description Whether `bash` resolves on PATH (the deploy script needs it).
 *   A missing binary surfaces as an ENOENT spawn error; any other outcome
 *   means bash exists.
 * @example defaultBashCheck() => true
 * @returns {boolean}
 ***/
function defaultBashCheck() {
	try {
		const result = spawnSync("bash", ["--version"], { stdio: "ignore", windowsHide: true });
		return !result.error;
	} catch {
		return false;
	}
}

/***
 * MARK: DeployManager
 * @description Orchestrates self-deployment of the KainBain app.
 *
 * The app deploys itself by running `./deploy.sh --prod` (or `--fast`). Because
 * a production deploy restarts the very systemd service that may have triggered
 * it, the deploy script writes durable, disk-backed state (state.json,
 * last-result.json, history.jsonl) under ~/.kainbain/deploy. This manager:
 *
 *   - Spawns the deploy script DETACHED (new process group, stdio to a log
 *     file) so it keeps running even after the API process is restarted by the
 *     deploy itself.
 *   - Serializes deploys: only one deploy may run at a time (the script also
 *     holds a flock, but the manager refuses to start a second one up front).
 *   - Reads the disk-backed state/result/history so the UI can show live
 *     status, last result, and a rollback history even across restarts.
 *   - Triggers a rollback to the last known-good deployment (.prev).
 *
 * @example const manager = new DeployManager(); manager.triggerDeploy({ fast: true })
 ***/
export class DeployManager {
	/***
	 * MARK: constructor
	 * @description Initializes the manager with the repo root and deploy state dir.
	 * @example new DeployManager()
	 * @param {Object} [opts]
	 * @param {string} [opts.repoRoot] - Absolute path to the KainBain repo (defaults to this file's parent's parent).
	 * @param {string} [opts.deployDir] - Directory for deploy state files (defaults to ~/.kainbain/deploy).
	 * @param {string} [opts.platform] - Platform override for tests (defaults to process.platform).
	 * @param {Function} [opts.bashCheck] - bash probe override for tests (defaults to a live PATH probe).
	 ***/
	constructor({ repoRoot, deployDir, prodDir, platform, bashCheck } = {}) {
		this.repoRoot = repoRoot || path.resolve(import.meta.dirname, "..");
		this.deployDir = deployDir || path.join(os.homedir(), ".kainbain", "deploy");
		// Directory of the live production deployment, whose build.json carries
		// the exact build number currently running (the API serves it from here).
		this.prodDir = prodDir || path.join(os.homedir(), "apps", "kainbain");
		this.platform = platform || process.platform;
		this.bashCheck = bashCheck || defaultBashCheck;
		this.running = false;
		this.currentPid = null;
	}

	/***
	 * MARK: isDeploySupported
	 * @description Whether this host can run a production deploy: Linux with
	 *   an executable `deploy.sh` in the repo root and `bash` on PATH.
	 *   Read-only probes only — safe to call anywhere.
	 * @example manager.isDeploySupported() => { supported: true }
	 * @returns {{ supported: boolean, reason?: string }}
	 ***/
	isDeploySupported() {
		if (this.platform !== "linux") {
			return {
				supported: false,
				reason: `Production deploys need Linux (this host runs ${this.platform}); deploy.sh is a Linux/systemd production orchestrator.`,
			};
		}
		const script = path.join(this.repoRoot, "deploy.sh");
		try {
			fs.accessSync(script, fs.constants.X_OK);
		} catch {
			return {
				supported: false,
				reason: `Deploy script not found or not executable: ${script}`,
			};
		}
		let bashOk = false;
		try {
			bashOk = this.bashCheck();
		} catch {
			bashOk = false;
		}
		if (!bashOk) {
			return {
				supported: false,
				reason: "bash was not found on PATH; deploy.sh needs it to run.",
			};
		}
		return { supported: true };
	}

	/***
	 * MARK: stateFilePath
	 * @description Resolves a file path inside the deploy state directory.
	 * @example manager.stateFilePath('state.json') => '~/.kainbain/deploy/state.json'
	 * @param {string} name
	 * @returns {string}
	 ***/
	stateFilePath(name) {
		return path.join(this.deployDir, name);
	}

	/***
	 * MARK: isDeployLocked
	 * @description Non-blocking probe for whether any process currently holds
	 *   the production deploy lock (`deploy.lock`, held by `deploy.sh` across
	 *   its backup/swap/restart sequence). Used by the scheduler to defer a
	 *   deploy-like dispatch while another deploy runs, instead of
	 *   dispatching into a doomed lock wait that ends FAILED. Total (never
	 *   throws): a missing lock file reads as unlocked, and any probe
	 *   failure (no flock binary, non-Linux host) fails OPEN (false — go
	 *   ahead and let `deploy.sh`'s own blocking wait decide), so the probe
	 *   itself can never strand a deploy.
	 * @example manager.isDeployLocked() => false
	 * @returns {boolean} True only when the lock is provably held.
	 ***/
	isDeployLocked() {
		try {
			const lockFile = this.stateFilePath("deploy.lock");
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- lockFile is deployDir-joined, not user input */
			if (!fs.existsSync(lockFile)) return false;
			const probe = spawnSync("flock", ["-n", lockFile, "-c", "true"], {
				timeout: 5000,
				stdio: "ignore",
				windowsHide: true,
			});
			if (probe.error) return false;
			return probe.status !== 0;
		} catch {
			return false;
		}
	}

	/***
	 * MARK: isPidAlive
	 * @description Whether a deploy attempt's recorded process is still alive.
	 *   `deploy.sh` stores the owning process pid in its per-attempt checkpoint;
	 *   reconciliation uses this probe to tell "this attempt's deploy is still
	 *   in flight" from "the deploy process died without writing a result".
	 *   Total (never throws): a non-positive/unparseable pid reads as dead,
	 *   and EPERM (process exists but belongs to another user) reads as alive.
	 * @example manager.isPidAlive(12345) => true
	 * @param {unknown} pid - Candidate process id.
	 * @returns {boolean} True only when the process provably exists.
	 ***/
	isPidAlive(pid) {
		try {
			const value = Number(pid);
			if (!Number.isInteger(value) || value <= 0) return false;
			process.kill(value, 0);
			return true;
		} catch (err) {
			// EPERM means the process exists but is owned by another user.
			return err?.code === "EPERM";
		}
	}

	/***
	 * MARK: readJson
	 * @description Reads and parses a JSON file, returning null when missing or malformed.
	 * @example manager.readJson('state.json') => { status: 'success', ... }
	 * @param {string} name
	 * @returns {Object|null}
	 ***/
	readJson(name) {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
			const raw = fs.readFileSync(this.stateFilePath(name), "utf8");
			/* eslint-enable security/detect-non-literal-fs-filename */
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}

	/***
	 * MARK: listAttemptCheckpoints
	 * @description Lists every durable per-attempt deploy checkpoint
	 *   (`attempt-*.json`) newest first, skipping unreadable files. The
	 *   operation-key adoption path uses it to find a checkpoint for the
	 *   same merge/deploy operation when the per-dispatch attempt id was
	 *   lost. Total (never throws): a missing dir reads as empty.
	 * @example manager.listAttemptCheckpoints() => [{ attemptId, status, operationKey, ... }]
	 * @returns {Array<Object>} Parsed checkpoints, newest first.
	 ***/
	listAttemptCheckpoints() {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
			const entries = fs.readdirSync(this.deployDir, { withFileTypes: true });
			/* eslint-enable security/detect-non-literal-fs-filename */
			const files = entries
				.filter((entry) => entry.isFile())
				.map((entry) => entry.name)
				.filter((name) => name.startsWith("attempt-") && name.endsWith(".json"));
			const parsed = [];
			for (const name of files) {
				try {
					/* eslint-disable security/detect-non-literal-fs-filename -- name is deployDir-listed, not user input */
					const raw = fs.readFileSync(this.stateFilePath(name), "utf8");
					/* eslint-enable security/detect-non-literal-fs-filename */
					const record = JSON.parse(raw);
					if (record && typeof record === "object" && !Array.isArray(record)) {
						let mtimeMs = 0;
						try {
							/* eslint-disable-next-line security/detect-non-literal-fs-filename -- name is deployDir-listed, not user input */
							mtimeMs = fs.statSync(this.stateFilePath(name)).mtimeMs || 0;
						} catch {
							mtimeMs = 0;
						}
						parsed.push({ ...record, __file: name, __mtimeMs: mtimeMs });
					}
				} catch {
					// Unreadable checkpoint: skip, never fail the listing.
				}
			}
			parsed.sort((a, b) => (b.__mtimeMs || 0) - (a.__mtimeMs || 0));
			return parsed.map(({ __file, __mtimeMs, ...record }) => record);
		} catch {
			return [];
		}
	}

	/***
	 * MARK: readHistory
	 * @description Reads the append-only deploy history (JSONL) into an array.
	 * @example manager.readHistory() => [{ status: 'success', ... }, ...]
	 * @returns {Array<Object>}
	 ***/
	readHistory() {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
			const raw = fs.readFileSync(this.stateFilePath("history.jsonl"), "utf8");
			/* eslint-enable security/detect-non-literal-fs-filename */
			return raw
				.split("\n")
				.filter((line) => line.trim())
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return null;
					}
				})
				.filter(Boolean);
		} catch {
			return [];
		}
	}

	/***
	 * MARK: readBuild
	 * @description Reads the build number of the live production deployment from
	 *   build.json (stamped by deploy.sh). Returns null when not yet deployed.
	 * @example manager.readBuild() => { buildNumber: 7, deployedAt: '...', commit: 'abc1234' }
	 * @returns {Object|null}
	 **/
	readBuild() {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename -- prodDir is derived from os.homedir(), not user input */
			const raw = fs.readFileSync(path.join(this.prodDir, "build.json"), "utf8");
			/* eslint-enable security/detect-non-literal-fs-filename */
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}

	/***
	 * MARK: readChangelog
	 * @description Reads the baked Kainbain changelog (`changelog.json`, written
	 *   by `scripts/generate-changelog.mjs` during `deploy.sh --prod`) from the
	 *   live production directory. Returns null when no changelog was baked
	 *   (dev mode, pre-first-deploy) or the file is missing/malformed. A
	 *   generation failure is NOT null: deploy.sh bakes a marker object with an
	 *   `error` field so callers can report `generation-failed` distinctly.
	 * @example manager.readChangelog() => { branch: 'master', totalCount: 537, entries: [...] }
	 * @returns {Object|null}
	 **/
	readChangelog() {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename -- prodDir is derived from os.homedir(), not user input */
			const raw = fs.readFileSync(path.join(this.prodDir, "changelog.json"), "utf8");
			/* eslint-enable security/detect-non-literal-fs-filename */
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
			return parsed;
		} catch {
			return null;
		}
	}

	/***
	 * MARK: getStatus
	 * @description Returns the current deploy status: whether a deploy is running,
	 *   the last result, the live build number, and the rollback history.
	 * @example manager.getStatus() => { running: false, build: {...}, lastResult: {...}, history: [...] }
	 * @returns {Object}
	 ***/
	getStatus() {
		return {
			running: this.running,
			pid: this.currentPid,
			build: this.readBuild(),
			lastResult: this.readJson("last-result.json"),
			state: this.readJson("state.json"),
			history: this.readHistory(),
			deployDir: this.deployDir,
		};
	}

	/***
	 * MARK: triggerDeploy
	 * @description Spawns `./deploy.sh --prod` (or `--fast`) detached so it survives
	 *   the API restart that the deploy itself performs. Refuses to start a second
	 *   deploy while one is already running.
	 * @example await manager.triggerDeploy({ fast: true })
	 * @param {Object} [opts]
	 * @param {boolean} [opts.fast] - Skip tests/security scans for rapid iteration.
	 * @returns {Promise<Object>} The deploy status after triggering.
	 ***/
	async triggerDeploy({ fast = false } = {}) {
		if (this.running) {
			return {
				ok: false,
				error: "A deployment is already in progress",
				status: this.getStatus(),
			};
		}

		const support = this.isDeploySupported();
		if (!support.supported) {
			return {
				ok: false,
				error: support.reason,
				unsupported: true,
				status: this.getStatus(),
			};
		}

		/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
		fs.mkdirSync(this.deployDir, { recursive: true });
		/* eslint-enable security/detect-non-literal-fs-filename */

		const args = ["--prod"];
		if (fast) args.push("--fast");

		// Detach the child into its own process group and redirect its stdio to
		// a log file so it keeps running (and logging) even after the API
		// process is restarted by the deploy. `unref()` lets the parent exit
		// without waiting for the child.
		/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
		const logStream = fs.createWriteStream(this.stateFilePath("deploy.log"), {
			flags: "a",
		});
		/* eslint-enable security/detect-non-literal-fs-filename */
		const child = spawn("./deploy.sh", args, {
			cwd: this.repoRoot,
			detached: true,
			// Pipe stdio and forward it to the log stream. A WriteStream's fd is
			// null until it opens asynchronously, so it cannot be passed directly
			// in `stdio`; piping is robust and keeps the child logging even after
			// the API process is restarted by the deploy.
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env },
		});
		child.stdout?.pipe(logStream);
		child.stderr?.pipe(logStream);
		child.unref();

		this.running = true;
		this.currentPid = child.pid;

		// Clear the "running" flag when the child exits. The child's exit code
		// is recorded by the script itself in last-result.json.
		child.on("exit", () => {
			this.running = false;
			this.currentPid = null;
		});

		return {
			ok: true,
			pid: child.pid,
			fast,
			status: this.getStatus(),
		};
	}

	/***
	 * MARK: triggerRollback
	 * @description Spawns `./deploy.sh --rollback` detached to restore the last
	 *   known-good deployment (.prev) and restart the service.
	 * @example await manager.triggerRollback()
	 * @returns {Promise<Object>} The deploy status after triggering.
	 ***/
	async triggerRollback() {
		if (this.running) {
			return {
				ok: false,
				error: "A deployment is already in progress",
				status: this.getStatus(),
			};
		}

		const support = this.isDeploySupported();
		if (!support.supported) {
			return {
				ok: false,
				error: support.reason,
				unsupported: true,
				status: this.getStatus(),
			};
		}

		/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
		fs.mkdirSync(this.deployDir, { recursive: true });
		/* eslint-enable security/detect-non-literal-fs-filename */

		/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
		const logStream = fs.createWriteStream(this.stateFilePath("deploy.log"), {
			flags: "a",
		});
		/* eslint-enable security/detect-non-literal-fs-filename */
		// Snapshot the build being rewound for the outbound alert (best-effort).
		const rolledBackFrom = this.readBuild();
		const child = spawn("./deploy.sh", ["--rollback"], {
			cwd: this.repoRoot,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env },
		});
		child.stdout?.pipe(logStream);
		child.stderr?.pipe(logStream);
		child.unref();

		this.running = true;
		this.currentPid = child.pid;

		child.on("exit", () => {
			this.running = false;
			this.currentPid = null;
		});

		// Outbound alert: the live build was just rewound to the last
		// known-good deployment. No bridge here (deploy state, not task
		// state), so this fans out to the webhook sink only — and a dead
		// sink changes nothing about the rollback itself.
		try {
			const rollbackDetails = {
				pid: child.pid,
				reason: "Operator rolled back the live deployment to the last known-good build",
			};
			if (rolledBackFrom?.buildNumber !== undefined) {
				rollbackDetails.build = rolledBackFrom.buildNumber;
			}
			if (rolledBackFrom?.commit) rollbackDetails.sha = rolledBackFrom.commit;
			void notifyDeployRollback(null, rollbackDetails);
		} catch {
			// Rollback alerts must never break the rollback.
		}

		return {
			ok: true,
			pid: child.pid,
			status: this.getStatus(),
		};
	}

	/***
	 * MARK: readLog
	 * @description Returns the tail of the deploy log (most recent lines).
	 * @example manager.readLog(200) => '...last 200 lines...'
	 * @param {number} [maxLines=200]
	 * @returns {string}
	 ***/
	readLog(maxLines = 200) {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename -- deployDir is derived from os.homedir(), not user input */
			const raw = fs.readFileSync(this.stateFilePath("deploy.log"), "utf8");
			/* eslint-enable security/detect-non-literal-fs-filename */
			const lines = raw.split("\n").filter((l) => l.trim());
			return lines.slice(-maxLines).join("\n");
		} catch {
			return "";
		}
	}
}
