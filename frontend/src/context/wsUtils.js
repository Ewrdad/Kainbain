// Domain: context/websocket — pure helpers (no React state).
// Backoff timing, tool-arg compaction, and backend system-log parsing shared
// by the socket lifecycle hook and the message-dispatch table.
import { summarizeToolStart } from '../../../shared/toolLogFormat.js';

/***
 * MARK: calculateBackoffWithJitter
 * @description Computes exponential backoff with jitter capped at maxDelay.
 * @example calculateBackoffWithJitter(2, 500, 10000) => ~1125ms
 * @param {number} attempt - Current retry count.
 * @param {number} [baseDelay=500] - Base delay in milliseconds.
 * @param {number} [maxDelay=10000] - Maximum delay cap in milliseconds.
 * @returns {number} Delay in milliseconds.
 ***/
export function calculateBackoffWithJitter(attempt, baseDelay = 500, maxDelay = 10000) {
  const expDelay = Math.min(baseDelay * Math.pow(1.5, attempt), maxDelay);
  const jitter = expDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.max(baseDelay / 2, Math.round(expDelay + jitter));
}

/***
 * MARK: compactArgsForLog
 * @description Renders tool call arguments as a compact one-line string for the
 * [TOOL] log stream, truncating long payloads so the terminal stays readable.
 * Thin wrapper over the shared toolLogFormat grammar so the live console and
 * the Task Logs tab summarize identically; the tool name lets long payloads
 * collapse to their primary argument (command/path) instead of a severed head.
 ***/
export function compactArgsForLog(args, maxLen = 120, toolName = '') {
  return summarizeToolStart(toolName, args, { maxLength: maxLen });
}

/***
 * MARK: parseSystemToolInvocation
 * @description Parses the backend's global "[SYSTEM] Tool invocation: <name> with
 * arguments: <args>" system-log mirror (api/eventBridge.js, format pinned by
 * api/eventBridge.test.js) so it can be re-tagged as a compact [TOOL] line.
 * Uses plain string slicing (no regex) so arbitrarily long argument payloads
 * cannot trigger catastrophic backtracking.
 * @returns {null|{name: string, args: any}} Parsed tool name and raw/parsed args.
 ***/
export function parseSystemToolInvocation(chunk) {
  const str = String(chunk);
  const prefix = '[SYSTEM] Tool invocation:';
  if (!str.startsWith(prefix)) return null;
  const rest = str.slice(prefix.length).trim();
  const marker = ' with arguments: ';
  const idx = rest.indexOf(marker);
  if (idx === -1) return { name: rest, args: null };
  let args = rest.slice(idx + marker.length);
  try {
    args = JSON.parse(args);
  } catch {
    // Keep the raw string — compactArgsForLog passes strings through.
  }
  return { name: rest.slice(0, idx), args };
}
