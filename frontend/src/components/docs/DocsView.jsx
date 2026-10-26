import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { MarkdownViewer } from '../common/MarkdownViewer';

/***
 * MARK: DOC_SECTION_LABELS
 * @description Display labels for the two docs avenues, mirroring the API's
 *   SECTION_LABELS so the sidebar reads the same with or without backend copy.
 * @example DOC_SECTION_LABELS['how-it-works'] => 'How KainBain works'
 ***/
export const DOC_SECTION_LABELS = {
  'how-it-works': 'How KainBain works',
  'working-with': 'How to work with KainBain',
};

/***
 * MARK: DOC_SECTION_ORDER
 * @description Sidebar avenue ordering (onboarding: concepts before operations).
 * @example DOC_SECTION_ORDER => ['how-it-works', 'working-with']
 ***/
export const DOC_SECTION_ORDER = ['how-it-works', 'working-with'];

/***
 * MARK: slugFromHash
 * @description Extracts the article slug from a `#/docs/:slug` hash (or its
 *   canonical `/docs/:slug` path form), or null for bare docs / other views.
 * @param {string} hash
 * @returns {string|null}
 * @example slugFromHash('#/docs/architecture') => 'architecture'
 ***/
export function slugFromHash(hash) {
  if (!hash || typeof hash !== 'string') return null;
  const match = hash.match(/^#?\/docs\/([^/?#]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/***
 * MARK: DocsView
 * @description Markdown-driven docs browser and agent knowledge-base reader.
 *   Sidebar groups articles by the two avenues with a title filter; the body
 *   renders via the shared XSS-safe MarkdownViewer. The selected slug IS the
 *   route (`/docs/:slug`): selecting navigates, and back/forward/deep-links
 *   arrive via params — the router is the single writer, so leaving docs can
 *   never strand a docs location behind.
 * @example <DocsView />
 ***/
export function DocsView() {
  const [index, setIndex] = useState(null);
  const [indexError, setIndexError] = useState(null);
  const [isIndexLoading, setIsIndexLoading] = useState(true);
  const [filter, setFilter] = useState('');
  // Slug from the matched route, falling back to the raw pathname so the
  // view also works under a bare router (isolated tests) without `<Routes>`.
  const { slug: paramSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeSlug = paramSlug ?? slugFromHash(location.pathname);
  const [article, setArticle] = useState(null);
  const [articleError, setArticleError] = useState(null);
  const [isArticleLoading, setIsArticleLoading] = useState(false);
  // Explicit user selection. Read live (not via closure) by the bare-route
  // normalisation effect so a normalise queued before a click but executed
  // after it can never clobber the user's choice back to the first article.
  const userSelectedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const loadIndex = async () => {
      setIsIndexLoading(true);
      setIndexError(null);
      try {
        const data = await api.docsIndex();
        if (!alive) return;
        setIndex(data);
      } catch (e) {
        if (!alive) return;
        logger.error('Failed to load docs index', e);
        setIndexError('Could not load the docs index. The API may be unreachable.');
      } finally {
        if (alive) setIsIndexLoading(false);
      }
    };
    void loadIndex();
    return () => {
      alive = false;
    };
  }, []);

  const docs = useMemo(() => index?.docs || [], [index]);

  // Default to the first article once the index arrives (unless deep-linked).
  // Rendered immediately; the normalisation effect below then replaces the
  // bare `/docs` location with the canonical `/docs/:slug` (history REPLACE,
  // so bare entry never leaves a slug-less docs location behind).
  const effectiveSlug = routeSlug ?? (docs.length > 0 ? docs[0].slug : null);

  useEffect(() => {
    // userSelectedRef is read at effect-run time (refs are live, not
    // captured): when the index resolves just as the user clicks an article,
    // a stale-scheduled normalise must yield to the explicit selection.
    if (!routeSlug && docs.length > 0 && !userSelectedRef.current) {
      navigate(`/docs/${encodeURIComponent(docs[0].slug)}`, { replace: true });
    }
  }, [routeSlug, docs, navigate]);

  // Selecting an article IS a navigation; back/forward lands via params.
  const selectArticle = useCallback(
    (slug) => {
      userSelectedRef.current = true;
      const target = `/docs/${encodeURIComponent(slug)}`;
      if (location.pathname !== target) navigate(target);
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    if (!effectiveSlug) return undefined;
    let alive = true;
    const loadArticle = async () => {
      setIsArticleLoading(true);
      setArticleError(null);
      try {
        const markdown = await api.docsArticle(effectiveSlug);
        if (!alive) return;
        setArticle(markdown);
      } catch (e) {
        if (!alive) return;
        logger.error('Failed to load docs article', e);
        setArticleError(`Could not load "${effectiveSlug}". It may have been removed.`);
        setArticle(null);
      } finally {
        if (alive) setIsArticleLoading(false);
      }
    };
    void loadArticle();
    return () => {
      alive = false;
    };
  }, [effectiveSlug]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q),
    );
  }, [docs, filter]);

  const grouped = useMemo(
    () =>
      DOC_SECTION_ORDER.map((section) => ({
        section,
        label: DOC_SECTION_LABELS[section] || section,
        docs: filtered.filter((d) => d.section === section),
      })).filter((g) => g.docs.length > 0),
    [filtered],
  );

  const activeDoc = useMemo(
    () => docs.find((d) => d.slug === effectiveSlug) || null,
    [docs, effectiveSlug],
  );

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden" data-testid="docs-view">
      {/* Sidebar */}
      <aside
        className="w-64 shrink-0 border-r border-border-standard bg-surface-container-low flex flex-col min-h-0"
        aria-label="Docs navigation"
      >
        <div className="p-3 border-b border-border-standard">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter articles…"
            aria-label="Filter docs articles"
            className="w-full px-2.5 py-1.5 min-h-[44px] text-xs bg-surface-deep border border-border-standard rounded-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {isIndexLoading && (
            <p className="px-2 py-3 text-xs text-text-muted italic">Loading docs…</p>
          )}
          {indexError && (
            <p role="alert" className="px-2 py-3 text-xs text-red-500">
              {indexError}
            </p>
          )}
          {!isIndexLoading && !indexError && filtered.length === 0 && (
            <p className="px-2 py-3 text-xs text-text-muted italic">
              {filter.trim() ? `No articles match "${filter.trim()}".` : 'No docs articles yet.'}
            </p>
          )}
          {grouped.map((group) => (
            <section key={group.section} aria-label={group.label} className="mb-3">
              <h2 className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted font-mono">
                {group.label}
              </h2>
              <ul className="space-y-0.5">
                {group.docs.map((doc) => {
                  const isActive = doc.slug === effectiveSlug;
                  return (
                    <li key={doc.slug}>
                      <button
                        type="button"
                        onClick={() => selectArticle(doc.slug)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full text-left px-2 py-1.5 min-h-[44px] rounded-sm text-xs transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-primary text-on-primary font-bold'
                            : 'text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        {doc.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </aside>

      {/* Article */}
      <article
        className="flex-1 overflow-y-auto custom-scrollbar min-w-0"
        aria-label="Docs article"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
          <p
            data-testid="docs-platform-eyebrow"
            className="mb-3 px-3 py-2 text-[11px] leading-relaxed rounded-sm border border-primary/30 bg-primary/10 text-on-surface"
          >
            <span className="font-bold uppercase tracking-widest text-primary">
              Platform documentation
            </span>{' '}
            <span className="text-text-muted">
              — applies to all projects, not just the selected one.
            </span>
          </p>
          {isArticleLoading && <p className="text-xs text-text-muted italic">Loading article…</p>}
          {articleError && (
            <p role="alert" className="text-xs text-red-500">
              {articleError}
            </p>
          )}
          {!isArticleLoading && !articleError && article !== null && (
            <>
              {activeDoc && (
                <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">
                  {DOC_SECTION_LABELS[activeDoc.section] || activeDoc.section} ·{' '}
                  <a
                    href={`/docs/${activeDoc.slug}`}
                    className="underline underline-offset-2 hover:text-on-surface"
                    title="Raw markdown for agents (curl-friendly)"
                  >
                    raw markdown
                  </a>
                </p>
              )}
              <MarkdownViewer content={article} className="text-sm" />
            </>
          )}
          {!isArticleLoading && !articleError && article === null && !effectiveSlug && (
            <p className="text-xs text-text-muted italic">Select an article to read.</p>
          )}
        </div>
      </article>
    </div>
  );
}

export default DocsView;
