/***
 * MARK: siteDocsRoutes
 * @description Agent- and UI-facing endpoints for the markdown-driven site docs:
 *
 *   GET /docs        -> index JSON [{ slug, title, section, order }]
 *   GET /docs/:slug  -> raw article markdown (Content-Type text/markdown)
 *
 * The frontend fetches these at runtime so content edits need no rebuild, and
 * agents (curl, non-KainBain harnesses) fetch the same raw markdown over HTTP.
 * Thin route over `siteDocs.js`, matching the `agentGuide.js` convention.
 *
 * @example app.register(siteDocsRoutes)
 ***/
import { listDocs, getDoc, DOC_SECTIONS } from "../siteDocs.js";

/***
 * MARK: siteDocsRoutes
 * @description Registers the /docs read-only endpoints.
 * @param {Object} app - Fastify instance.
 ***/
export default async function siteDocsRoutes(app) {
	/***
	 * MARK: List Docs
	 * @description Returns the article index built from markdown frontmatter.
	 ***/
	app.get(
		"/docs",
		{
			schema: {
				response: {
					200: {
						type: "object",
						additionalProperties: true,
						properties: {
							sections: {
								type: "array",
								items: { type: "string" },
							},
							docs: {
								type: "array",
								items: {
									type: "object",
									additionalProperties: true,
									properties: {
										slug: { type: "string" },
										title: { type: "string" },
										section: { type: "string" },
										order: { type: "number" },
									},
								},
							},
						},
					},
				},
			},
		},
		async () => {
			return { sections: [...DOC_SECTIONS], docs: listDocs() };
		},
	);

	/***
	 * MARK: Get Doc
	 * @description Returns one article as raw markdown. Unknown slugs and
	 *   traversal attempts 404.
	 ***/
	app.get(
		"/docs/:slug",
		{
			schema: {
				params: {
					type: "object",
					properties: { slug: { type: "string" } },
				},
				response: {
					200: { type: "string" },
					404: {
						type: "object",
						additionalProperties: true,
						properties: { error: { type: "string" } },
					},
				},
			},
		},
		async (request, reply) => {
			const doc = getDoc(request.params.slug);
			if (!doc) {
				reply.code(404);
				return { error: "Doc not found" };
			}
			reply.type("text/markdown; charset=utf-8");
			return doc.markdown;
		},
	);
}
