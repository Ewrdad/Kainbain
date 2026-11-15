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
 * @param {string} props.section - Section id (e.g. 'concepts').
 * @param {string} props.label - Human-readable group label.
 * @param {Array} props.docs - Articles in this group ({ slug, title }).
 * @param {string|null} props.activeSlug - Currently selected article slug.
 * @param {boolean} props.collapsed - Whether this group is folded away.
 * @param {(slug: string) => void} props.onSelect - Article click handler.
 * @param {(section: string) => void} props.onToggle - Header toggle handler.
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
  const toggleLabel = collapsed ? `Expand ${label} (${docs.length})` : `Collapse ${label}`;
  return (
    <section aria-label={label} className="mt-4 first:mt-0">
      <h2 className="m-0">
        <button
          type="button"
          onClick={() => onToggle(section)}
          aria-expanded={collapsed ? 'false' : 'true'}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="w-full flex items-center gap-1.5 min-h-[44px] py-1.5 pr-1 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="inline-flex items-center rounded-full bg-docs-badge text-on-docs-badge px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono leading-5">
            {label}
          </span>
          <span
            className="inline-flex items-center rounded-full border border-border-standard px-1.5 py-0.5 text-[10px] font-mono text-text-muted"
            aria-hidden="true"
          >
            {docs.length}
          </span>
          <Icon
            name="chevron-down"
            className={`w-4 h-4 ml-auto shrink-0 text-text-muted transition-transform motion-safe:duration-200 ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>
      </h2>
      {!collapsed && (
        <ul className="space-y-0.5 mt-1 pl-4">
          {docs.map((doc) => {
            const isActive = doc.slug === activeSlug;
            return (
              <li key={doc.slug}>
                <button
                  type="button"
                  onClick={() => onSelect(doc.slug)}
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
      )}
    </section>
  );
}
