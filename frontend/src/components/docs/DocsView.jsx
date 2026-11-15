import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { MarkdownViewer, parseMarkdownBlocks } from '../common/MarkdownViewer';
import { groupBlocksIntoSections } from '../common/markdownSections';
import { DOC_SECTION_LABELS, DOC_SECTION_ORDER } from './docsSections';
import { useCollapsedSections } from './useCollapsedSections';
import { DocsSidebarGroup } from './DocsSidebarGroup';

// Re-exported so existing importers keep working; the canonical definitions
// live in `./docsSections` (mirroring the API's SECTION_LABELS).
export { DOC_SECTION_LABELS, DOC_SECTION_ORDER };

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
 *   Sidebar groups articles by category with a title filter; each group has a
 *   badge-style collapsible header (choice persists in localStorage). The
 *   body renders via the shared XSS-safe MarkdownViewer. The selected slug
 *   IS the route (`/docs/:slug`): selecting navigates, and
 *   back/forward/deep-links arrive via params — the router is the single
 *   writer, so leaving docs can never strand a docs location behind.
 *   Collapsing a group never touches the route.
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
  // One-shot expand-all / collapse-all requests for the article viewer. Each
  // click mints a fresh nonce, which the viewer applies exactly once.
  const [sectionSignal, setSectionSignal] = useState(null);
  const sectionSignalNonce = useRef(0);
  const sendSectionSignal = useCallback((action) => {
    sectionSignalNonce.current += 1;
    setSectionSignal({ action, nonce: sectionSignalNonce.current });
  }, []);

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

  // A malformed index payload (non-array `docs`) falls back to empty rather
  // than throwing in the filter/group memos below.
  const docs = useMemo(() => (Array.isArray(index?.docs) ? index.docs : []), [index]);

  // Default to the first article once the index arrives (unless deep-linked).
  // Rendered immediately; the normalisation effect below then replaces the
  // bare `/docs` location with the canonical `/docs/:slug` (history REPLACE,
  // so bare entry never leaves a slug-less docs location behind).
  const effectiveSlug = routeSlug ?? (docs.length > 0 ? docs[0].slug : null);

  // A one-shot expand/collapse-all request belongs to the article it was sent
  // for: switching articles remounts the viewer while the old signal is still
  // set, and the stale request (e.g. collapse-all) would otherwise apply to
  // the new article too. The current slug is tracked alongside the signal, and
  // a slug change drops the signal during render (never in an effect) so every
  // article opens in its default all-open state.
  const [signalSlug, setSignalSlug] = useState(effectiveSlug);
  if (signalSlug !== effectiveSlug) {
    setSignalSlug(effectiveSlug);
    setSectionSignal(null);
  }

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

  // Title/slug are coerced so one malformed index entry (missing title)
  // can never throw the whole sidebar filter.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => {
      if (!d || typeof d !== 'object') return false;
      const title = typeof d.title === 'string' ? d.title : '';
      const slug = typeof d.slug === 'string' ? d.slug : '';
      return title.toLowerCase().includes(q) || slug.toLowerCase().includes(q);
    });
  }, [docs, filter]);

  // Group order follows the backend index (`sections`) so a regroup needs
  // no frontend change; the static order is the offline/test fallback.
  // Groups the backend added since this bundle shipped append after the
  // known order under their id, so new groups can never vanish silently.
  const sectionOrder = useMemo(
    () =>
      Array.isArray(index?.sections) && index.sections.length > 0
        ? index.sections.filter((s) => typeof s === 'string' && s.length > 0)
        : DOC_SECTION_ORDER,
    [index],
  );

  const grouped = useMemo(() => {
    const bySection = new Map();
    for (const doc of filtered) {
      if (!doc || typeof doc !== 'object') continue;
      if (typeof doc.section !== 'string' || doc.section.length === 0) continue;
      if (!bySection.has(doc.section)) bySection.set(doc.section, []);
      bySection.get(doc.section).push(doc);
    }
    const ordered = [
      ...sectionOrder.filter((s) => bySection.has(s)),
      ...[...bySection.keys()].filter((s) => !sectionOrder.includes(s)),
    ];
    return ordered.map((section) => ({
      section,
      label: DOC_SECTION_LABELS[section] || section,
      docs: bySection.get(section),
    }));
  }, [sectionOrder, filtered]);

  // The `d &&` guard mirrors the filter/group memos: a malformed index
  // entry must never throw the active-article lookup either.
  const activeDoc = useMemo(
    () => docs.find((d) => d && d.slug === effectiveSlug) || null,
    [docs, effectiveSlug],
  );

  // Collapsible sidebar groups (persisted). While a title filter is typed,
  // matching groups force open so results are never hidden inside a folded
  // group; clearing the filter restores the stored state untouched. A
  // deep-linked / active article likewise forces its own group open, so the
  // selection is never stranded inside a stored-collapsed group.
  const { collapsed: storedCollapsed, toggle: toggleGroup } = useCollapsedSections();
  const isFiltering = filter.trim().length > 0;
  const isGroupCollapsed = useCallback(
    (section) =>
      storedCollapsed.has(section) && !isFiltering && section !== activeDoc?.section,
    [storedCollapsed, isFiltering, activeDoc],
  );

  // The expand/collapse-all controls only make sense when the loaded article
  // actually holds `h2` sections; short articles without any render no chrome.
  const hasCollapsibleSections = useMemo(() => {
    if (!article) return false;
    return groupBlocksIntoSections(parseMarkdownBlocks(article)).sections.length > 0;
  }, [article]);

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
            <DocsSidebarGroup
              key={group.section}
              section={group.section}
              label={group.label}
              docs={group.docs}
              activeSlug={effectiveSlug}
              collapsed={isGroupCollapsed(group.section)}
              onSelect={selectArticle}
              onToggle={toggleGroup}
            />
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
              {(activeDoc || hasCollapsibleSections) && (
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
                    {activeDoc && (
                      <>
                        {DOC_SECTION_LABELS[activeDoc.section] || activeDoc.section} ·{' '}
                        <a
                          href={`/docs/${activeDoc.slug}`}
                          className="underline underline-offset-2 hover:text-on-surface"
                          title="Raw markdown for agents (curl-friendly)"
                        >
                          raw markdown
                        </a>
                      </>
                    )}
                  </p>
                  {hasCollapsibleSections && (
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      role="group"
                      aria-label="Article sections"
                    >
                      <button
                        type="button"
                        onClick={() => sendSectionSignal('expand-all')}
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted hover:text-on-surface hover:bg-surface-container-high border border-border-standard transition-all cursor-pointer"
                      >
                        Expand all
                      </button>
                      <button
                        type="button"
                        onClick={() => sendSectionSignal('collapse-all')}
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted hover:text-on-surface hover:bg-surface-container-high border border-border-standard transition-all cursor-pointer"
                      >
                        Collapse all
                      </button>
                    </div>
                  )}
                </div>
              )}
              <MarkdownViewer
                content={article}
                className="text-sm"
                collapsibleSections
                sectionVisibilitySignal={sectionSignal}
              />
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
