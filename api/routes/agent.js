/***
 * MARK: agentRoutes
 * @description Agent-facing entry points that let a non-KainBain AI agent learn
 *   how to drive the live service. The guide lives in agentGuide.js so the routes
 *   stay thin and the content is unit-testable.
 *
 * @example app.register(agentRoutes, { deps })
 ***/
import { AGENT_GUIDE, renderMarkdownGuide, API_BASE } from "../agentGuide.js";
import { config, configSources } from "../config/index.js";

/***
 * MARK: AGENT_VERSION
 * @description Version string exposed so agents can detect schema changes.
 * @example AGENT_VERSION => '1.0.0'
 ***/
const AGENT_VERSION = "1.0.0";

/***
 * MARK: resolveApiBase
 * @description Returns the origin the guide should advertise for building links.
 *   Prefers an explicit PUBLIC_KB_URL (set by deploy, read from the validated
 *   config), then the request's own host (so it is correct behind the reverse
 *   proxy at https://kainbain.home), and finally the module default (localhost
 *   dev). Source attribution (not the value) detects "explicit": the config
 *   default for PUBLIC_KB_URL is truthy, so testing the value would swallow
 *   the request-host fallback.
 * @param {Object} request - The Fastify request.
 * @returns {string}
 * @example resolveApiBase(request) => 'https://kainbain.home'
 ***/
function resolveApiBase(request) {
	const explicit =
		configSources.publicKbUrl?.source === "default" ? null : config.publicKbUrl;
	if (explicit) return explicit.replace(/\/+$/, "");
	const host = request?.host;
	const protocol = request?.protocol || "http";
	if (host) {
		return `${protocol}://${host}`.replace(/\/+$/, "");
	}
	return API_BASE;
}

export default async function agentRoutes(app) {
	/***
	 * MARK: GET /agent
	 * @description Returns the full structured agent guide as JSON. This is the
	 *   primary discovery entry point: an integrating agent calls it once, then
	 *   calls the documented endpoints to create/view/manage tasks.
	 * @example curl http://localhost:3100/agent
	 ***/
	app.get(
		"/agent",
		{
			schema: {
				response: {
					200: {
						type: "object",
						additionalProperties: true,
					},
				},
			},
		},
		async (request) => {
			const base = resolveApiBase(request);
			return {
				...AGENT_GUIDE,
				version: AGENT_VERSION,
				apiBase: base,
				_links: {
					guide: `${base}/agent/guide`,
					schema: `${base}/agent/schema`,
					openapi: `${base}/documentation`,
				},
			};
		},
	);

	/***
	 * MARK: GET /agent/guide
	 * @description Returns the guide rendered as a self-contained markdown
	 *	document, useful for pasting into an agent's context or for a human to
	 *	read. Content-Type is text/markdown.
	 * @example curl http://localhost:3100/agent/guide
	 ***/
	app.get(
		"/agent/guide",
		{
			schema: {
				response: {
					200: {
						type: "string",
					},
				},
			},
		},
		async (_request, reply) => {
			reply.type("text/markdown; charset=utf-8");
			return renderMarkdownGuide();
		},
	);

	/**
	 * MARK: GET /agent/schema
	 * @description Returns a compact, machine-parsed manifest: the same guide
	 *	trimmed to concepts, endpoint list, task statuses, and WS events, without
	 *	the verbose prose. Useful when an agent only needs the callable surface.
	 * @example curl http://localhost:3100/agent/schema
	 ***/
	app.get(
		"/agent/schema",
		{
			schema: {
				response: {
					200: {
						type: "object",
						additionalProperties: true,
					},
				},
			},
		},
		async (request) => {
			return {
				version: AGENT_VERSION,
				apiBase: resolveApiBase(request),
				endpoints: AGENT_GUIDE.endpoints,
				taskStatuses: AGENT_GUIDE.taskStatuses,
				stageTypes: AGENT_GUIDE.stageTypes,
				websocket: AGENT_GUIDE.websocket,
			};
		},
	);
}
