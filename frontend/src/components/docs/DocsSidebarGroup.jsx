import React from 'react';
import { Icon } from '../Icon';

/***
 * MARK: DocsSidebarGroup
 * @description One collapsible docs sidebar group: a badge-style category
 *   header (survey-chosen soft-lavender pill with a collapse chevron) plus
 *   the indented article list underneath. The header keeps an `h2` wrapper
 *   with the toggle as the `button` inside it, so the article `h1` never
 *   follows a skipped heading level (WCAG 1.3.1/2.4.10; axe heading-order).
 *   Chevron rotation honours `prefers-reduced-motion` via
 *   `motion-safe:` so the state change is instant when motion is reduced.
 *   Fails safe: a missing handler is a no-op (never throws), a missing
 *   label falls back to the section id, and index entries without a usable
 *   slug are skipped so one bad record cannot empty the group.
 * @param {string} props.section - Section id (e.g. 'concepts').
 * @param {string} [props.label] - Human-readable group label.
 * @param {Array} [props.docs] - Articles in this group ({ slug, title }).
 * @param {string|null} props.activeSlug - Currently selected article slug.
 * @param {boolean} props.collapsed - Whether this group is folded away.
 * @param {(slug: string) => void} [props.onSelect] - Article click handler.
 * @param {(section: string) => void} [props.onToggle] - Header toggle handler.
 * @example <DocsSidebarGroup section="concepts" label="Concepts" docs={[...]} ... />
 ***/
export function DocsSidebarGroup({
  section,
  label,
  docs,
  activeSlug,
  collapsed,
  onSelect,
  onToggle,
}) {
  const groupLabel = label || section;
  const visibleDocs = (Array.isArray(docs) ? docs : []).filter(
    (doc) => doc && typeof doc.slug === 'string' && doc.slug.length > 0,
  );
  const pickArticle = typeof onSelect === 'function' ? onSelect : () => {};
  const toggleGroup = typeof onToggle === 'function' ? onToggle : () => {};
  const toggleLabel = collapsed ? `Expand ${groupLabel} (${visibleDocs.length})` : `Collapse ${groupLabel}`;
  return (
    <section aria-label={groupLabel} className="mt-4 first:mt-0">
      <h2 className="m-0">
        <button
          type="button"
          onClick={() => toggleGroup(section)}
          aria-expanded={collapsed ? 'false' : 'true'}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="w-full flex items-center gap-1.5 min-h-[44px] py-1.5 pr-1 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="inline-flex items-center rounded-full bg-docs-badge text-on-docs-badge px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono leading-5">
            {groupLabel}
          </span>
          <span
            className="inline-flex items-center rounded-full border border-border-standard px-1.5 py-0.5 text-[10px] font-mono text-text-muted"
            aria-hidden="true"
          >
            {visibleDocs.length}
          </span>
          <Icon
            name="chevron-down"
            className={`w-4 h-4 ml-auto shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-200 ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>
      </h2>
      {!collapsed && (
        <ul className="space-y-0.5 mt-1 pl-4">
          {visibleDocs.map((doc) => {
            const isActive = doc.slug === activeSlug;
            return (
              <li key={doc.slug}>
                <button
                  type="button"
                  onClick={() => pickArticle(doc.slug)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full text-left px-2 py-1.5 min-h-[44px] rounded-sm text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-primary text-on-primary font-bold'
                      : 'text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {doc.title || doc.slug}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
