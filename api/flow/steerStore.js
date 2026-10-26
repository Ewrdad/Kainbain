import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { loadStateFile } from "./loadStateFile.js";
import { resolveStatePath } from "./resolveStatePath.js";
import { saveStateFile } from "./saveStateFile.js";

const MAX_STEER_TEXT = 4000;
const STEER_STATE_VERSION = 1;
const MAX_RECEIPTS_KEPT = 1000;

/***
 * MARK: SteerStore
 * @description Backend-held pending-steer queue for Runner-owned executions
 *   (D5, ADR 0011). The operator queues `{ steerId, executionId, text }`
 *   against a LIVE lease; the owning Runner pulls pending steers on its
 *   heartbeat response and acks each exactly once. Nothing is queued
 *   without a live lease (the route 409s first), so a steer is never a
 *   phantom nobody can pull. Unacked steers stay visible as pending; acks
 *   land as receipts the operator can read back. In-memory for Phase 3
 *   (same durability story as ClaimStore — backend restart drops the
 *   queue; Phase 4 persists it).
 * @example const steers = new SteerStore(); steers.queue({ taskId: 't', executionId: 'e', text: 'wait' })
 ***/
/***
 * MARK: resolveSteerStatePath
 * @description Resolves the durable steer-queue file: explicit wins, then
 *   the schema path (env `KAINBAIN_STEER_STATE_FILE`), then the
 *   conventional `~/.kainbain/engine/steers.json`. Pending steers survive
 *   a restart so an operator nudge is never lost to a backend bounce;
 *   receipts are capped. Empty disables persistence.
 * @example resolveSteerStatePath('/tmp/s.json') => '/tmp/s.json'
 * @param {string} [explicit] - Explicit path (tests).
 * @returns {string|null} Resolved path, or null when disabled.
 ***/
export function resolveSteerStatePath(explicit) {
	if (typeof explicit === "string") return explicit || null;
	const configured = config?.steerStateFile;
	if (typeof configured === "string" && !configured.trim()) return null;
	return resolveStatePath(null, configured, "steers.json");
}

/***
 * MARK: SteerStore
 * @description Backend-held pending-steer queue per live execution (D5).
 *   See the module block above for the pull/ack lifecycle.
 * @example const steers = new SteerStore()
 * @example steers.queue({ taskId: 't', executionId: 'e', text: 'wait' })
 ***/
export class SteerStore {
	constructor({ stateFile = null } = {}) {
		this.pending = new Map();
		this.receipts = new Map();
		this.stateFile = resolveSteerStatePath(stateFile);
		this._loadState();
	}

	_loadState() {
		if (!this.stateFile) return;
		const raw = loadStateFile(this.stateFile, (v) => v);
		if (!raw || typeof raw !== "object") return;
		const pending = raw.pending;
		if (pending && typeof pending === "object") {
			for (const [executionId, rows] of Object.entries(pending)) {
				if (typeof executionId !== "string" || !Array.isArray(rows)) continue;
				const clean = rows.filter(
					(row) =>
						row &&
						typeof row.steerId === "string" &&
						typeof row.taskId === "string" &&
						typeof row.text === "string",
				);
				if (clean.length) this.pending.set(executionId, clean);
			}
		}
		const receipts = raw.receipts;
		if (receipts && typeof receipts === "object") {
			for (const [executionId, rows] of Object.entries(receipts)) {
				if (typeof executionId !== "string" || !Array.isArray(rows)) continue;
				const clean = rows
					.filter((row) => row && typeof row.steerId === "string")
					.slice(-MAX_RECEIPTS_KEPT);
				if (clean.length) this.receipts.set(executionId, clean);
			}
		}
	}

	_persist() {
		if (!this.stateFile) return;
		const receipts = {};
		for (const [executionId, rows] of this.receipts) {
			receipts[executionId] = rows.slice(-MAX_RECEIPTS_KEPT);
		}
		saveStateFile(this.stateFile, {
			version: STEER_STATE_VERSION,
			pending: Object.fromEntries(this.pending),
			receipts,
		});
	}

	static _argError(message) {
		const err = new Error(message);
		err.statusCode = 400;
		err.code = "INVALID_STEER_ARGS";
		return err;
	}

	/***
	 * MARK: queue
	 * @description Queues one steer against a live execution. Over-long
	 *   text is rejected (never truncated silently).
	 * @example steers.queue({ taskId: 't', executionId: 'e', text: 'hold on' }) => { steerId: '…' }
	 * @param {Object} opts - Options.
	 * @param {string} opts.taskId - Task id.
	 * @param {string} opts.executionId - Owning execution id.
	 * @param {string} opts.text - Steer text (1–4000 chars).
	 * @returns {Object} `{ steerId }`.
	 ***/
	queue({ taskId, executionId, text } = {}) {
		if (!taskId || typeof taskId !== "string") {
			throw SteerStore._argError("steer requires a taskId.");
		}
		if (!executionId || typeof executionId !== "string") {
			throw SteerStore._argError("steer requires an executionId.");
		}
		if (typeof text !== "string" || !text.trim()) {
			throw SteerStore._argError("steer requires non-blank text.");
		}
		if (text.length > MAX_STEER_TEXT) {
			throw SteerStore._argError(
				`steer text exceeds ${MAX_STEER_TEXT} chars (${text.length}); shorten, never truncated.`,
			);
		}
		const steerId = uuidv4();
		const list = this.pending.get(executionId) || [];
		list.push({ steerId, taskId, executionId, text, queuedAt: new Date().toISOString() });
		this.pending.set(executionId, list);
		this._persist();
		return { steerId };
	}

	/***
	 * MARK: pendingFor
	 * @description Lists unacked steers for one execution (what the Runner
	 *   pulls on heartbeat). Read-only: entries leave only via `ack`.
	 * @example steers.pendingFor('e') => [{ steerId: '…', text: '…' }]
	 * @param {string} executionId - Execution id.
	 * @returns {Array} Pending steer rows.
	 ***/
	pendingFor(executionId) {
		return [...(this.pending.get(executionId) || [])];
	}

	/***
	 * MARK: ack
	 * @description Records exactly-once delivery of one steer. Unknown
	 *   (executionId, steerId) pairs throw — acks never invent receipts.
	 * @example steers.ack('e', 's', { ok: true }) => { steerId: 's', ok: true, … }
	 * @param {string} executionId - Execution id.
	 * @param {string} steerId - Steer id from `queue`.
	 * @param {Object} [opts] - Options (`ok`, `detail`).
	 * @returns {Object} The stored receipt.
	 ***/
	ack(executionId, steerId, { ok = true, detail = "" } = {}) {
		const list = this.pending.get(executionId) || [];
		const index = list.findIndex((row) => row.steerId === steerId);
		if (index === -1) {
			const err = new Error(`Unknown steer ${steerId} for execution ${executionId}.`);
			err.statusCode = 404;
			err.code = "UNKNOWN_STEER";
			throw err;
		}
		const [row] = list.splice(index, 1);
		if (list.length === 0) this.pending.delete(executionId);
		const receipt = {
			steerId,
			taskId: row.taskId,
			executionId,
			ok: ok !== false,
			detail: typeof detail === "string" ? detail.slice(0, 500) : "",
			ackedAt: new Date().toISOString(),
		};
		const receipts = this.receipts.get(executionId) || [];
		receipts.push(receipt);
		this.receipts.set(executionId, receipts.slice(-MAX_RECEIPTS_KEPT));
		this._persist();
		return receipt;
	}

	/***
	 * MARK: receiptsFor
	 * @description Lists ack receipts for one execution (operator read-back).
	 * @example steers.receiptsFor('e') => [{ steerId: '…', ok: true, … }]
	 * @param {string} executionId - Execution id.
	 * @returns {Array} Receipt rows.
	 ***/
	receiptsFor(executionId) {
		return [...(this.receipts.get(executionId) || [])];
	}
}
