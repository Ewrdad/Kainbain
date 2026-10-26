import os from "node:os";
import { config } from "./config.js";
import { isWindows } from "./utils/platform.js";

/***
 * MARK: HealthChecker
 * @description Runs minimal health checks for LiteLLM host, host device resource health, and Ollama Cloud access,
 *   plus any registered per-harness probes (see registerProbe).
 ***/
export class HealthChecker {
	constructor(options = {}) {
		this.cacheTtlMs = options.cacheTtlMs ?? config.healthCacheTtlMs;
		this.cachedHealth = null;
		this.lastFetchTime = 0;
		this.fetchFn = options.fetchFn || globalThis.fetch;
		this.inFlightPromise = null;
		/** Registered harness probes: [{ name, probe }] — empty by default, so
		 *  checkAll output is byte-identical to the pre-probe behaviour. */
		this.probes = [];
	}

	/***
	 * MARK: registerProbe
	 * @description Registers a named harness health probe that checkAll runs
	 *   alongside the built-in subsystem checks. The probe function receives the
	 *   checkAll options ({ refresh }) and must resolve to a
	 *   HarnessProbeResult-shaped object ({ name, status, … }); rejections and
	 *   timeouts are normalized to an error check. Passing a probe whose name
	 *   is already registered replaces it. Probe names must match
	 *   ^[a-z][a-z0-9-]*$ so they are safe as response keys.
	 * @example healthChecker.registerProbe({ name: 'pi', probe: (opts) => sessionStore.getHarness().probeHealth?.(opts) })
	 * @param {Object} entry
	 * @param {string} entry.name - Probe identity used as the response key under checks.harnesses.
	 * @param {Function} entry.probe - Async probe returning a HarnessProbeResult.
	 * @returns {void}
	 ***/
	registerProbe({ name, probe }) {
		if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) {
			throw new Error(
				`Invalid harness probe name '${name}': must match ^[a-z][a-z0-9-]*$`,
			);
		}
		if (typeof probe !== "function") {
			throw new Error(`Harness probe '${name}' must be a function`);
		}
		const existing = this.probes.some((p) => p.name === name);
		if (existing) {
			// Replace in place without dynamic index assignment.
			this.probes = this.probes.map((p) =>
				p.name === name ? { name, probe } : p,
			);
		} else {
			this.probes.push({ name, probe });
		}
		// A newly registered probe must be visible on the next checkAll even when
		// a cached aggregate exists.
		this.clearCache();
	}

	/***
	 * MARK: runProbeWithTimeout
	 * @description Races one probe against the configured harness timeout,
	 *   normalizing rejections, timeouts, and non-object results into the
	 *   HarnessProbeResult error shape so a broken harness can never fail the
	 *   health aggregate.
	 * @param {string} name
	 * @param {Function} probe
	 * @param {Object} [options]
	 * @param {boolean} [options.refresh]
	 * @returns {Promise<Object>} A HarnessProbeResult-shaped object.
	 ***/
	async runProbeWithTimeout(name, probe, options = {}) {
		const startedAt = Date.now();
		const timeoutMs = options.timeoutMs ?? config.healthHarnessTimeoutMs;
		let timerId;
		try {
			const result = await Promise.race([
				Promise.resolve(probe(options)),
				new Promise((_, reject) => {
					timerId = setTimeout(
						() => reject(new Error(`probe timed out after ${timeoutMs}ms`)),
						timeoutMs,
					);
				}),
			]);
			if (
				result &&
				typeof result === "object" &&
				typeof result.status === "string"
			) {
				return { name, ...result };
			}
			return {
				name,
				status: "error",
				latencyMs: Date.now() - startedAt,
				timestamp: new Date().toISOString(),
				message: `Probe '${name}' returned a malformed result`,
			};
		} catch (err) {
			const detail = err?.message || String(err);
			return {
				name,
				status: "error",
				latencyMs: Date.now() - startedAt,
				timestamp: new Date().toISOString(),
				message: `Probe '${name}' failed: ${detail}`,
			};
		} finally {
			clearTimeout(timerId);
		}
	}

	clearCache() {
		this.cachedHealth = null;
		this.lastFetchTime = 0;
		this.inFlightPromise = null;
	}

	getCachedHealth() {
		return this.cachedHealth;
	}

	/***
	 * MARK: checkLiteLLM
	 * @description Verifies connection to LiteLLM host (via configured URL, litellm.home, or localhost:4000).
	 * Uses fast parallel candidate probing with abort signals. LiteLLM is an
	 * OPTIONAL probe: a reachable gateway reports `ok` (unchanged); nothing
	 * reachable reports `disabled` (no URL explicitly configured — the box
	 * simply has no gateway) or `unconfigured` (an explicit URL is set but
	 * unreachable — the operator should check it). Never `error`: an
	 * unconfigured optional service must not redden the health aggregate.
	 * @param {Object} [options]
	 * @param {number} [options.timeoutMs=3000]
	 * @returns {Promise<Object>}
	 ***/
	async checkLiteLLM(options = {}) {
		const timeoutMs = options.timeoutMs ?? config.healthLiteLLMTimeoutMs;
		const explicit = [process.env.LITELLM_URL, process.env.LITELLM_HOST].filter(
			Boolean,
		);
		// Both the live env read (`explicit`, stubbed in tests) and the
		// boot-validated schema values (usually identical; deduped below).
		const candidates = [
			...explicit,
			config.litellmUrl,
			config.litellmHost,
			"https://litellm.home",
			"http://localhost:4000",
		].filter(Boolean);

		const uniqueCandidates = [...new Set(candidates)];
		if (uniqueCandidates.length === 0) {
			return {
				status: "disabled",
				latencyMs: null,
				endpoint: null,
				message: "LiteLLM not configured (optional — set LITELLM_URL to enable)",
			};
		}

		const abortController = new AbortController();
		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const combinedSignal = AbortSignal.any([
			abortController.signal,
			timeoutSignal,
		]);
		let lastError = null;

		const probe = async (baseUrl) => {
			const targetUrl = baseUrl.endsWith("/health/liveliness")
				? baseUrl
				: `${baseUrl.replace(/\/+$/, "")}/health/liveliness`;

			const startTime = Date.now();
			const res = await this.fetchFn(targetUrl, {
				method: "GET",
				signal: combinedSignal,
			});
			const latencyMs = Date.now() - startTime;
			if (
				res.ok ||
				res.status === 200 ||
				res.status === 401 ||
				res.status === 403
			) {
				return {
					status: "ok",
					latencyMs,
					endpoint: baseUrl,
					message: `LiteLLM reachable (${latencyMs}ms)`,
				};
			}
			throw new Error(`HTTP ${res.status}`);
		};

		try {
			const winner = await Promise.any(
				uniqueCandidates.map(async (url) => {
					try {
						return await probe(url);
					} catch (err) {
						lastError = err;
						throw err;
					}
				}),
			);
			abortController.abort();
			return winner;
		} catch {
			if (explicit.length > 0) {
				return {
					status: "unconfigured",
					latencyMs: null,
					endpoint: uniqueCandidates[0] || null,
					message: `LiteLLM unreachable at ${uniqueCandidates[0]}${lastError ? ` (${lastError.message})` : ""} (optional — check the service or unset LITELLM_URL)`,
				};
			}
			return {
				status: "disabled",
				latencyMs: null,
				endpoint: uniqueCandidates[0] || null,
				message: `LiteLLM not detected${lastError ? ` (${lastError.message})` : ""} (optional — set LITELLM_URL to enable)`,
			};
		}
	}

	/***
	 * MARK: checkDevice
	 * @description Checks host device health (memory pressure, CPU load average, uptime).
	 *   On Windows `os.loadavg()` always returns zeros, so the load signal is
	 *   reported as unsupported (`loadAvg: null`, `loadStatus: "unsupported"`)
	 *   and excluded from the status computation — memory and uptime checks
	 *   stay intact and no false alarm (or NaN) can reach `/status`.
	 * @param {Object} [options]
	 * @param {string} [options.platform] - Platform override for tests (default process.platform).
	 * @returns {Object}
	 ***/
	checkDevice({ platform = process.platform } = {}) {
		try {
			// Windows-only: os.loadavg() is documented to return [0,0,0] there.
			// macOS implements loadavg — no change on darwin.
			const loadUnsupported = isWindows(platform);
			const totalMem = os.totalmem();
			const freeMem = os.freemem();
			const usedMem = totalMem - freeMem;
			const memoryUsagePct = Math.round((usedMem / totalMem) * 100);
			const totalMemMb = Math.round(totalMem / (1024 * 1024));
			const freeMemMb = Math.round(freeMem / (1024 * 1024));
			const rawLoad = loadUnsupported ? null : os.loadavg();
			const loadAvg = loadUnsupported
				? null
				: Array.isArray(rawLoad)
					? rawLoad.map((v) => Math.round(v * 100) / 100)
					: [0, 0, 0];
			const cpus = os.cpus();
			const cpuCount = Array.isArray(cpus) && cpus.length > 0 ? cpus.length : 1;
			const uptimeSec = Math.round(os.uptime());

			// Guarded against null loadAvg: no NaN or zero-division on Windows.
			const loadPerCore = loadAvg ? (loadAvg[0] || 0) / cpuCount : 0;
			const loadLabel = loadAvg ? loadAvg[0] : "n/a";
			let status = "ok";
			let message = loadUnsupported
				? `Device healthy (Mem: ${memoryUsagePct}%, Load: unsupported on Windows)`
				: `Device healthy (Mem: ${memoryUsagePct}%, Load: ${loadLabel})`;

			if (
				memoryUsagePct >= config.healthMemCriticalPct ||
				loadPerCore >= config.healthLoadCriticalPerCore
			) {
				status = "error";
				message = loadUnsupported
					? `Critical resource pressure (Mem: ${memoryUsagePct}%)`
					: `Critical resource pressure (Mem: ${memoryUsagePct}%, Load: ${loadLabel})`;
			} else if (
				memoryUsagePct >= config.healthMemWarnPct ||
				loadPerCore >= config.healthLoadWarnPerCore
			) {
				status = "warning";
				message = loadUnsupported
					? `High resource utilization (Mem: ${memoryUsagePct}%)`
					: `High resource utilization (Mem: ${memoryUsagePct}%, Load: ${loadLabel})`;
			}

			return {
				status,
				memoryUsagePct,
				freeMemMb,
				totalMemMb,
				loadAvg,
				cpuCount,
				uptimeSec,
				message,
				// Only present when unsupported: the Linux response stays
				// byte-compatible (no new keys for strict consumers).
				...(loadUnsupported ? { loadStatus: "unsupported" } : {}),
			};
		} catch (err) {
			return {
				status: "error",
				message: `Failed to inspect host device: ${err.message}`,
			};
		}
	}

	/***
	 * MARK: checkOllamaCloud
	 * @description Checks connectivity and accessibility of Ollama Cloud.
	 * Uses fast parallel candidate probing with abort signals. Ollama Cloud
	 * is an OPTIONAL probe: reachable reports `ok` (unchanged); nothing
	 * reachable reports `disabled` (no URL explicitly configured) or
	 * `unconfigured` (an explicit URL is set but unreachable). Never
	 * `error`: an unconfigured optional service must not redden the health
	 * aggregate.
	 * @param {Object} [options]
	 * @param {number} [options.timeoutMs=4000]
	 * @returns {Promise<Object>}
	 ***/
	async checkOllamaCloud(options = {}) {
		const timeoutMs = options.timeoutMs ?? config.healthOllamaTimeoutMs;
		const explicit = [process.env.OLLAMA_CLOUD_URL].filter(Boolean);
		// Both the live env read (`explicit`, stubbed in tests) and the
		// boot-validated schema value (usually identical; deduped below).
		const candidates = [
			...explicit,
			config.ollamaCloudUrl,
			"https://ollama.com",
			"https://ollama.ai",
		].filter(Boolean);

		const uniqueCandidates = [...new Set(candidates)];
		if (uniqueCandidates.length === 0) {
			return {
				status: "disabled",
				latencyMs: null,
				endpoint: null,
				message:
					"Ollama Cloud not configured (optional — set OLLAMA_CLOUD_URL to enable)",
			};
		}

		const abortController = new AbortController();
		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const combinedSignal = AbortSignal.any([
			abortController.signal,
			timeoutSignal,
		]);
		let lastError = null;

		const probe = async (targetUrl) => {
			const startTime = Date.now();
			const res = await this.fetchFn(targetUrl, {
				method: "GET",
				signal: combinedSignal,
			});
			const latencyMs = Date.now() - startTime;
			if (res.status >= 200 && res.status < 500) {
				return {
					status: "ok",
					latencyMs,
					endpoint: targetUrl,
					message: `Ollama Cloud reachable (${latencyMs}ms)`,
				};
			}
			throw new Error(`HTTP ${res.status}`);
		};

		try {
			const winner = await Promise.any(
				uniqueCandidates.map(async (url) => {
					try {
						return await probe(url);
					} catch (err) {
						lastError = err;
						throw err;
					}
				}),
			);
			abortController.abort();
			return winner;
		} catch {
			if (explicit.length > 0) {
				return {
					status: "unconfigured",
					latencyMs: null,
					endpoint: uniqueCandidates[0] || null,
					message: `Ollama Cloud unreachable at ${uniqueCandidates[0]}${lastError ? ` (${lastError.message})` : ""} (optional — check the service or unset OLLAMA_CLOUD_URL)`,
				};
			}
			return {
				status: "disabled",
				latencyMs: null,
				endpoint: uniqueCandidates[0] || null,
				message: `Ollama Cloud not detected${lastError ? ` (${lastError.message})` : ""} (optional — set OLLAMA_CLOUD_URL to enable)`,
			};
		}
	}

	/***
	 * MARK: checkAll
	 * @description Runs all health checks with caching, in-flight promise sharing, and aggregated status.
	 * LiteLLM and Ollama Cloud are OPTIONAL probes: their statuses ride
	 * along as informational checks but are EXCLUDED from the aggregate —
	 * an unconfigured optional service can never flip the overall status
	 * away from `ok`. Only the device check and registered harness probes
	 * drive the aggregate.
	 * @param {Object} [options]
	 * @param {boolean} [options.refresh=false]
	 * @returns {Promise<Object>}
	 ***/
	async checkAll({ refresh = false } = {}) {
		const now = Date.now();
		if (
			!refresh &&
			this.cachedHealth &&
			now - this.lastFetchTime < this.cacheTtlMs
		) {
			return this.cachedHealth;
		}

		if (this.inFlightPromise) {
			return this.inFlightPromise;
		}

		this.inFlightPromise = (async () => {
			try {
				const [litellm, device, ollamaCloud, ...probeResults] = await Promise.all([
					this.checkLiteLLM(),
					Promise.resolve(this.checkDevice()),
					this.checkOllamaCloud(),
					// Registered harness probes run alongside the built-in checks so a
					// slow/broken harness cannot lengthen the aggregate beyond its own
					// timeout (runProbeWithTimeout normalizes every failure).
					...this.probes.map((entry) =>
						this.runProbeWithTimeout(entry.name, entry.probe, { refresh }),
					),
				]);

				const checks = { litellm, device, ollamaCloud };
				if (probeResults.length > 0) {
					// Probe names are validated against ^[a-z][a-z0-9-]*$ in registerProbe,
					// so they are safe as response keys.
					const harnesses = {};
					for (const probeResult of probeResults) {
						harnesses[probeResult.name] = probeResult;
					}
					checks.harnesses = harnesses;
				}

				// Optional probes (litellm, ollamaCloud) are informational only —
				// they never drive the aggregate (see the MARK above).
				const statuses = [device.status];
				if (probeResults.length > 0) {
					for (const probeResult of probeResults) {
						// Probe vocabulary ('ok'|'warning'|'error') folds into the same
						// aggregation as the built-in subsystem checks.
						statuses.push(probeResult.status);
					}
				}
				let overallStatus = "ok";
				if (statuses.includes("error")) {
					overallStatus =
						statuses.filter((s) => s === "error").length > 1 ? "error" : "degraded";
				} else if (statuses.includes("warning")) {
					overallStatus = "warning";
				}

				const result = {
					status: overallStatus,
					timestamp: new Date().toISOString(),
					checks,
				};

				this.cachedHealth = result;
				this.lastFetchTime = Date.now();
				return result;
			} finally {
				this.inFlightPromise = null;
			}
		})();

		return this.inFlightPromise;
	}
}

export const healthChecker = new HealthChecker();
