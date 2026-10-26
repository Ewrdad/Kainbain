#!/usr/bin/env node
/**
 * MARK: probe-vibe-acp.mjs
 * @description A DOCUMENTED DIAGNOSTIC (never run by the automated tests):
 *   it probes the real `vibe-acp` binary's ACP surface live — the
 *   `initialize` handshake and a `session/new` on a throwaway temp cwd —
 *   prints the raw results, and exits. NO LLM call, NO session/prompt, NO
 *   cost. Run it by hand to re-verify the wire shapes the harness codes
 *   against (model list, modes, configOptions) whenever `vibe-acp` is
 *   upgraded:
 *
 *     node api/agent/harnesses/vibe/fixtures/probe-vibe-acp.mjs [path/to/vibe-acp]
 *
 *   The captured ground truth for the harness's verified version (3.0.2,
 *   2026-10-24) lives next to this file in `acp-session-new.json`; when the
 *   probe output drifts from that fixture, update the fixture AND review
 *   `vibeAcpSupport.js` / `vibeModelCatalog.js` for shape changes.
 */

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const binary = process.argv[2] || "vibe-acp";
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-acp-probe-"));
const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"], cwd: workspace });
child.on("error", (error) => {
	console.error(`probe-vibe-acp: cannot spawn '${binary}': ${error?.message || error}`);
	console.error("Pass the binary path explicitly (e.g. ~/.local/bin/vibe-acp) or put it on PATH.");
	process.exit(2);
});

let buffer = "";
const pending = new Map();
let nextRequestId = 1;

child.stdout.on("data", (chunk) => {
	buffer += chunk;
	let newlineIndex;
	while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
		const line = buffer.slice(0, newlineIndex).trim();
		buffer = buffer.slice(newlineIndex + 1);
		if (!line) continue;
		let frame;
		try {
			frame = JSON.parse(line);
		} catch (error) {
			console.error(`probe-vibe-acp: ignoring non-JSON line: ${line} (${error?.message || error})`);
			return;
		}
		if (frame?.id && pending.has(frame.id)) {
			pending.get(frame.id)(frame);
			pending.delete(frame.id);
		}
	}
});
child.stderr.on("data", (chunk) => process.stderr.write(`[agent stderr] ${chunk}`));

function request(method, params) {
	return new Promise((resolve, reject) => {
		const id = nextRequestId;
		nextRequestId += 1;
		pending.set(id, (frame) => {
			if (frame.error) reject(new Error(JSON.stringify(frame.error)));
			else resolve(frame.result);
		});
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
	});
}

const initializeResult = await request("initialize", {
	protocolVersion: 1,
	clientCapabilities: { sessions: { new: true }, permissionInterception: true },
});
console.log(JSON.stringify({ step: "initialize", result: initializeResult }, null, 2));

const sessionResult = await request("session/new", { cwd: workspace, mcpServers: [] });
console.log(JSON.stringify({ step: "session/new", result: sessionResult }, null, 2));

child.kill("SIGTERM");
setTimeout(() => process.exit(0), 200);
