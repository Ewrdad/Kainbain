#!/usr/bin/env node
/**
 * MARK: probe-muse-msp.mjs
 * @description Operator/dev probe that captures the REAL `muse serve` MSP wire
 *   shape into the committed fixtures (`msp-handshake.echo.jsonl`,
 *   `msp-turn.echo.jsonl`, `msp-model-list.json`, `msp-schema.json`). Run it
 *   after a muse upgrade and diff-review the result — upstream drift then
 *   fails the fixture-driven mapper test loudly, the same discipline as the
 *   captured exec fixtures.
 *
 *   Usage: node api/agent/harnesses/muse/fixtures/probe-muse-msp.mjs [muse-bin]
 *   It uses `--provider echo` (no credentials, no network) and exits non-zero
 *   when the binary cannot be found or never completes a turn.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = process.argv[2] || process.env.KAINBAIN_MUSE_BIN || "muse";
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "muse-msp-probe-"));
const child = spawn(BIN, ["serve", "--provider", "echo"], { cwd: workspace, env: process.env });

const frames = [];
const responses = new Map();
let nextId = 1;
let buffer = "";

function uuidv7() {
	const bytes = Buffer.alloc(16);
	bytes.writeUIntBE(Date.now() % 0x1000000000000, 0, 6);
	bytes[6] = 0x70 | (bytes[6] & 0x0f);
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function request(method, params, { command = false } = {}) {
	const id = nextId++;
	const finalParams = { ...(params || {}) };
	if (command) finalParams.commandId = uuidv7();
	child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params: finalParams })}\n`);
	return new Promise((resolve, reject) => responses.set(id, { resolve, reject, method }));
}

child.stdout.on("data", (chunk) => {
	buffer += chunk.toString("utf8");
	let index;
	while ((index = buffer.indexOf("\n")) !== -1) {
		const line = buffer.slice(0, index).trim();
		buffer = buffer.slice(index + 1);
		if (!line) continue;
		let frame;
		try {
			frame = JSON.parse(line);
		} catch {
			continue;
		}
		frames.push(frame);
		if (frame.id !== undefined && (frame.result !== undefined || frame.error !== undefined)) {
			const pending = responses.get(frame.id);
			if (pending) {
				responses.delete(frame.id);
				if (frame.error) pending.reject(new Error(frame.error.message));
				else pending.resolve(frame.result);
			}
		}
	}
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
	const init = await request("initialize", {
		clientInfo: { name: "kainbain", version: "probe" },
		capabilities: {},
	});
	child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n`);
	const models = await request("model/list", {});
	const start = await request("session/start", { workspaceRoot: workspace }, { command: true });
	const turn = await request(
		"turn/start",
		{ sessionId: start.session.sessionId, input: [{ type: "text", text: "Say hello in 3 words" }] },
		{ command: true },
	);
	await sleep(4000);

	fs.writeFileSync(
		path.join(HERE, "msp-handshake.echo.jsonl"),
		`${JSON.stringify(init)}\n${JSON.stringify(start)}\n`,
	);
	fs.writeFileSync(path.join(HERE, "msp-model-list.json"), `${JSON.stringify(models, null, 1)}\n`);
	fs.writeFileSync(
		path.join(HERE, "msp-turn.echo.jsonl"),
		`${frames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
	);
	fs.writeFileSync(
		path.join(HERE, "msp-schema.json"),
		`${JSON.stringify({ schema: init.schema, serverInfo: init.serverInfo }, null, 1)}\n`,
	);
	process.stderr.write(`probe complete: turn ${turn.turnId} (${frames.length} frames)\n`);
	child.kill("SIGTERM");
	process.exit(0);
} catch (error) {
	process.stderr.write(`probe failed: ${error?.message || error}\n`);
	child.kill("SIGTERM");
	process.exit(1);
}
