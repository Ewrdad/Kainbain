// Domain: The Crew — which jobs the active crew member can perform.
/***
 * MARK: hasSessionCapability
 * @description Whether a harness session exposes an optional contract capability
 *   (see the OPTIONAL surface in api/agent/harnessContract.js). Accepts dotted
 *   paths for nested members, e.g. "sessionManager.branch". Every intermediate
 *   hop must be a non-null object and the final member must be a function.
 * @param {Object} session
 * @param {string} capabilityPath
 * @returns {boolean}
 * @example hasSessionCapability(session, "compact") => true
 * @example hasSessionCapability(session, "sessionManager.branch") => false
 ***/
const PROTOTYPE_CHAIN_HOPS = new Set(["__proto__", "constructor", "prototype"]);

export function hasSessionCapability(session, capabilityPath) {
 if (!session || typeof session !== "object") return false;
 let cursor = session;
 for (const hop of capabilityPath.split(".")) {
  if (!cursor || typeof cursor !== "object") return false;
  // Prototype-chain hops can never name an engine capability: they only
  // reach Object.prototype members (e.g. "constructor" is a function on
  // every object). Reject them so crafted paths can never resolve.
  if (PROTOTYPE_CHAIN_HOPS.has(hop)) return false;
  // eslint-disable-next-line security/detect-object-injection -- capabilityPath is an engine-side contract name (route literals), never user input
  cursor = cursor[hop]; // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop -- traversal is read-only and prototype hops are rejected above; capabilityPath is an engine-side contract name, never user input
 }
 return typeof cursor === "function";
}

/***
 * MARK: guardSessionCapability
 * @description Capability guard for the optional harness surface: when the
 *   session lacks the capability it sends
 *   `501 { error, code: "unsupported_by_harness", capability }` and returns
 *   false so the handler can return early; returns true when present.
 * @param {Object} reply
 * @param {Object} session
 * @param {string} capabilityPath
 * @param {string} label - Human-readable capability name used in the error text.
 * @returns {boolean}
 * @example if (!guardSessionCapability(reply, session, "compact", "Manual context compaction")) return;
 ***/
export function guardSessionCapability(reply, session, capabilityPath, label) {
 if (hasSessionCapability(session, capabilityPath)) return true;
 reply.status(501).send({
  error: `${label} is not supported by the active harness`,
  code: "unsupported_by_harness",
  capability: capabilityPath,
 });
 return false;
}
