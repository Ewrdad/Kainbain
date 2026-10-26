// Domain: services/client — site-docs fetch (raw markdown, not JSON).
// Lives apart from request.js because the /docs endpoints serve text/markdown.
import { API_BASE } from '../apiBase.js';

/***
 * MARK: fetchDocsArticle
 * @description Fetches one site-docs article as raw markdown text (the /docs
 *   endpoints serve text/markdown, not JSON, so the JSON `request` helper
 *   cannot be used here).
 * @param {string} slug - Article slug.
 * @returns {Promise<string>} Raw markdown body.
 * @example fetchDocsArticle('architecture') => '# System Architecture\n...'
 ***/
export async function fetchDocsArticle(slug) {
  const res = await fetch(`${API_BASE}/docs/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} on /docs/${slug}: ${body}`);
  }
  return res.text();
}
