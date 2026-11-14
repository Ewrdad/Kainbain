import React, { useState, useMemo, useCallback, useId, useEffect } from 'react';
import { API_BASE } from '../../services/apiBase';
import { resolveTaskImageUrl } from '../../services/taskImages';
import { useImageRetry } from '../../services/imageRetry';
import { logger } from '../../services/logger';
import { groupBlocksIntoSections } from './markdownSections';

/***
 * MARK: sanitizeUrl
 * @description Validates and sanitizes link URLs to prevent XSS (blocks javascript:, data:, vbscript:).
 * @param {string} url - The URL to sanitize.
 * @returns {string} Safe URL or '#' fallback.
 * @example sanitizeUrl('https://example.com') => 'https://example.com'
 ***/
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  // Disallow javascript:, data:, vbscript: protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return '#';
  }
  return trimmed;
}

/***
 * MARK: highlightCode
 * @description Lightweight tokenizer that syntax-highlights code lines with JetBrains Mono role chromatics.
 * @param {string} code - The code block content.
 * @param {string} language - The programming language identifier.
 * @returns {React.ReactNode[]} Array of formatted lines / tokens.
 * @example highlightCode('const x = 42;', 'js') => [<span ...>...</span>]
 ***/
export function highlightCode(code, _language = '') {
  if (!code) return null;
  const lines = code.split('\n');

  return lines.map((line, lineIdx) => {
    // If comment line
    if (/^\s*(\/\/|#|\/\*|\*)/.test(line)) {
      return (
        <div key={lineIdx} className="text-text-muted italic">
          {line || '\u00A0'}
        </div>
      );
    }

    // Tokenize line by strings, keywords, numbers
    const parts = [];
    let lastIndex = 0;
    const tokenRegex =
      /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`|\/\/.*$|#.*$|\b(?:const|let|var|function|return|if|else|import|export|from|class|def|async|await|for|while|try|catch|throw|switch|case|break|continue|default|new|typeof|instanceof|in|of|yield|type|interface|extends|implements|public|private|protected|readonly|static|void|null|undefined|true|false|None|True|False)\b|\b\d+(\.\d+)?\b)/g;

    let match;
    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
        parts.push(
          <span key={`${lineIdx}-${match.index}`} className="text-ochre">
            {token}
          </span>,
        );
      } else if (token.startsWith('//') || token.startsWith('#')) {
        parts.push(
          <span key={`${lineIdx}-${match.index}`} className="text-text-muted italic">
            {token}
          </span>,
        );
      } else if (/^\d+(\.\d+)?$/.test(token)) {
        parts.push(
          <span key={`${lineIdx}-${match.index}`} className="text-[#ffb0b0]">
            {token}
          </span>,
        );
      } else {
        parts.push(
          <span key={`${lineIdx}-${match.index}`} className="text-primary font-semibold">
            {token}
          </span>,
        );
      }
      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <div key={lineIdx} className="leading-5">
        {parts.length > 0 ? parts : '\u00A0'}
      </div>
    );
  });
}

/***
 * MARK: CodeBlock
 * @description Syntax-highlighted code container with header bar, language badge, and copy button.
 * @param {Object} props
 * @param {string} props.code - The raw code string.
 * @param {string} [props.language] - The detected language.
 * @param {boolean} [props.enableCopy=true] - Whether to show the copy button.
 * @example <CodeBlock code="console.log('hi')" language="js" />
 ***/
export function CodeBlock({ code, language = '', enableCopy = true }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div className="my-3 rounded-sm border border-border-standard bg-surface-deep overflow-hidden font-mono text-xs">
      {/* Code Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-container border-b border-border-standard">
        <span className="font-label-caps text-[10px] uppercase font-bold text-text-muted tracking-wider">
          {(language || 'CODE').toUpperCase()}
        </span>
        {enableCopy && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy code block to clipboard"
            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted hover:text-on-surface hover:bg-surface-container-high border border-border-standard transition-all cursor-pointer"
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        )}
      </div>
      {/* Code Content */}
      <pre className="p-3 overflow-x-auto text-on-surface custom-scrollbar leading-relaxed">
        <code>{highlightCode(code, language)}</code>
      </pre>
    </div>
  );
}

// One shared import for the whole page: the dynamic import keeps mermaid's
// diagram code out of the main bundle (it only downloads when a ```mermaid
// fence actually renders), and memoizing the promise means N diagrams on one
// page fire exactly ONE module load instead of N racing dynamic imports.
// A failed load resets the cache so a later diagram can retry.
let mermaidImportPromise = null;

/***
 * MARK: loadMermaid
 * @description Loads the mermaid library exactly once per page and shares the
 *   promise across every MermaidDiagram, initializing it with
 *   `securityLevel: 'strict'` so diagram labels and SVG are sanitized before
 *   they touch the DOM. Resolves to the library object, or null when the
 *   library cannot load or exposes no render function — callers treat null as
 *   "fall back to showing the source".
 * @example const mermaid = await loadMermaid(); const { svg } = await mermaid.render('id-1', code);
 * @returns {Promise<Object|null>} The initialized mermaid module, or null on failure.
 ***/
async function loadMermaid() {
  if (!mermaidImportPromise) {
    mermaidImportPromise = import('mermaid')
      .then((loaded) => {
        const mermaid = loaded?.default || loaded;
        if (!mermaid || typeof mermaid.render !== 'function') return null;
        if (typeof mermaid.initialize === 'function') {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
        }
        return mermaid;
      })
      .catch(() => {
        mermaidImportPromise = null;
        return null;
      });
  }
  return mermaidImportPromise;
}

/***
 * MARK: MermaidDiagram
 * @description Renders a mermaid diagram fence (` ```mermaid `) as inline SVG,
 *   falling back to a syntax-highlighted source block when rendering fails
 *   (broken diagram, missing library, unsupported DOM, etc.) so the source is
 *   never lost — a bad diagram degrades to readable code, never a blank hole.
 * @example <MermaidDiagram code="graph TD\nA-->B" />
 ***/
export function MermaidDiagram({ code = '' }) {
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);
  // Mermaid's render needs a unique DOM id per call; useId keeps it
  // deterministic and collision-free when several diagrams share a page
  // (Math.random would break under deterministic replay and could collide).
  const reactId = useId();
  const mermaidRenderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        if (!mermaid) throw new Error('mermaid unavailable');
        const rendered = await mermaid.render(mermaidRenderId, code);
        const out = rendered?.svg || rendered;
        if (cancelled) return;
        if (typeof out === 'string' && out.trim()) {
          setSvg(out);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, mermaidRenderId]);

  if (failed) {
    return <CodeBlock code={code} language="mermaid" enableCopy={true} />;
  }
  if (!svg) {
    return (
      <div data-testid="mermaid-loading" className="my-3 text-xs text-text-muted italic">
        Rendering diagram…
      </div>
    );
  }
  return (
    <div
      data-testid="mermaid-diagram"
      className="mermaid my-3 rounded-sm border border-border-standard bg-surface-deep overflow-x-auto p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/***
 * MARK: MdImage
 * @description An inline markdown image with graceful degradation: task-asset and
 *   http(s) sources render as lazy-loaded images; a broken/unavailable image falls
 *   back to an inert filename chip instead of a broken-image icon; URLs the
 *   sanitizer neutralized (javascript:/data:/vbscript: → '#') render as inert text.
 *   Transient misses self-recover through the shared retry seam (bounded
 *   backoff + tab-visible/online revalidation) instead of latching.
 * @example <MdImage src="/projects/p/tasks/t/images/a.png" alt="screenshot" />
 * @param {Object} props
 * @param {string} props.src - The resolved, sanitized image URL.
 * @param {string} [props.alt] - The markdown alt text.
 * @param {boolean} [props.hasTaskContext] - Whether task context resolved (failure classification).
 ***/
export function MdImage({ src, alt = '', hasTaskContext = false }) {
  const { failed, retryKey, markFailed, retry } = useImageRetry({
    src,
    component: 'md-image',
    hasTaskContext,
  });

  if (!src || src === '#') {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[10px] text-text-muted bg-surface-container border border-border-standard rounded px-1.5 py-0.5 align-middle"
        role="img"
        aria-label={alt || 'blocked image'}
      >
        ⛔ {alt || 'image'} (blocked URL)
      </span>
    );
  }

  if (failed) {
    const name = (() => {
      try {
        return decodeURIComponent(src.split('/').pop() || '') || alt || 'image';
      } catch {
        return alt || 'image';
      }
    })();
    return (
      <span
        data-task-image-state="unavailable"
        className="inline-flex items-center gap-1 font-mono text-[10px] text-text-muted bg-surface-container border border-border-standard rounded px-1.5 py-0.5 align-middle"
      >
        <span role="img" aria-label={alt || name}>
          🖼️ {name} (image unavailable)
        </span>
        <button
          type="button"
          onClick={retry}
          aria-label={`Retry loading ${name}`}
          className="underline underline-offset-2 hover:text-on-surface transition-colors cursor-pointer"
        >
          Retry
        </button>
      </span>
    );
  }

  return (
    <img
      key={retryKey}
      src={src}
      alt={alt}
      loading="lazy"
      onError={markFailed}
      className="max-w-full h-auto rounded border border-border-standard my-2 inline-block"
    />
  );
}

/***
 * MARK: parseInlineMarkdown
 * @description Recursively parses inline markdown syntax (bold, italic, strike, code, links, images).
 * @param {string} text - Raw inline text.
 * @param {Object} [imageContext] - Task context for relative image resolution ({ apiBase, projectId, taskId }).
 * @returns {React.ReactNode[]} Array of React nodes.
 * @example parseInlineMarkdown('Hello **world** and `code`') => ['Hello ', <strong>world</strong>, ' and ', <code>code</code>]
 ***/
export function parseInlineMarkdown(text, imageContext = {}) {
  if (!text || typeof text !== 'string') return [];

  // Match bold-italic, bold, italic, strikethrough, inline-code, links, images
  const inlineRegex =
    /(!?\[([^\]]*)\]\(([^)]+)\)|`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_)/g;

  const nodes = [];
  let lastIdx = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }

    const fullMatch = match[0];
    const key = `inline-${match.index}`;

    if (fullMatch.startsWith('!') && match[2] !== undefined && match[3] !== undefined) {
      // Image: ![alt](url) — relative task-asset paths resolve to the raw
      // image endpoint; the sanitizer still blocks javascript:/data:/vbscript:.
      // The src joins the key so a new source remounts with fresh load
      // state instead of inheriting a latched failure from the old URL.
      const alt = match[2];
      const src = sanitizeUrl(resolveTaskImageUrl({ ...imageContext, src: match[3] }));
      const hasTaskContext = Boolean(imageContext?.projectId && imageContext?.taskId);
      nodes.push(
        <MdImage key={`${key}:${src}`} src={src} alt={alt} hasTaskContext={hasTaskContext} />,
      );
    } else if (match[2] !== undefined && match[3] !== undefined) {
      // Link: [label](url)
      const label = match[2];
      const href = sanitizeUrl(match[3]);
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-secondary hover:text-secondary/80 underline underline-offset-2 transition-colors cursor-pointer font-medium"
        >
          {parseInlineMarkdown(label, imageContext)}
        </a>,
      );
    } else if (match[4] !== undefined) {
      // Inline code: `code`
      nodes.push(
        <code
          key={key}
          className="font-mono bg-surface-container px-1.5 py-0.5 rounded text-primary text-xs border border-border-standard/40"
        >
          {match[4]}
        </code>,
      );
    } else if (match[5] !== undefined || match[6] !== undefined) {
      // Bold Italic: ***text*** or ___text___
      const inner = match[5] || match[6];
      nodes.push(
        <strong key={key} className="font-bold text-on-surface">
          <em className="italic">{parseInlineMarkdown(inner, imageContext)}</em>
        </strong>,
      );
    } else if (match[7] !== undefined || match[8] !== undefined) {
      // Bold: **text** or __text__
      const inner = match[7] || match[8];
      nodes.push(
        <strong key={key} className="font-bold text-on-surface">
          {parseInlineMarkdown(inner, imageContext)}
        </strong>,
      );
    } else if (match[9] !== undefined) {
      // Strikethrough: ~~text~~
      nodes.push(
        <del key={key} className="line-through text-text-muted">
          {parseInlineMarkdown(match[9], imageContext)}
        </del>,
      );
    } else if (match[10] !== undefined || match[11] !== undefined) {
      // Italic: *text* or _text_
      const inner = match[10] || match[11];
      nodes.push(
        <em key={key} className="italic text-on-surface">
          {parseInlineMarkdown(inner, imageContext)}
        </em>,
      );
    }

    lastIdx = inlineRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes.length > 0 ? nodes : [text];
}

/***
 * MARK: parseMarkdownBlocks
 * @description Parses multiline markdown content into structured AST blocks (headings, code blocks, lists, tables, quotes, hr, paragraphs). Every block carries 1-based `startLine`/`endLine` source spans (CRLF-normalized) so review UIs can anchor integer-line comments to rendered blocks; lists also expose per-item `itemLines`, tables expose `headerLine`/`rowLines`.
 * @param {string} markdown - The markdown raw string.
 * @returns {Array<Object>} List of parsed block objects.
 * @example parseMarkdownBlocks('# Title\n\nContent') => [{ type: 'h1', text: 'Title', startLine: 1, endLine: 1 }, { type: 'p', text: 'Content', startLine: 3, endLine: 3 }]
 ***/
export function parseMarkdownBlocks(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];

  // CRLF (and lone CR) normalize to LF first so 1-based source line numbers
  // stay aligned with viewers that split on /\r?\n/.
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Fenced Code Block: ```lang
    if (line.trim().startsWith('```')) {
      const startLine = i + 1;
      const language = line.trim().replace(/^```/, '').trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      // `mermaid` fences (any letter case) become diagram blocks; every
      // other fence stays a plain code block carrying its language.
      const isMermaid = language.toLowerCase() === 'mermaid';
      blocks.push({
        type: isMermaid ? 'mermaid' : 'code',
        language,
        code: codeLines.join('\n'),
        startLine,
        // Closing fence when present, else the last content line.
        endLine: Math.min(i + 1, lines.length),
      });
      i += 1;
      continue;
    }

    // 2. Horizontal Rule: --- or *** or ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      blocks.push({ type: 'hr', startLine: i + 1, endLine: i + 1 });
      i += 1;
      continue;
    }

    // 3. Headings: # H1 through ###### H6
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push({
        type: `h${level}`,
        text: headingMatch[2].trim(),
        startLine: i + 1,
        endLine: i + 1,
      });
      i += 1;
      continue;
    }

    // 4. Blockquotes: > quote
    if (line.trim().startsWith('>')) {
      const startLine = i + 1;
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n'),
        startLine,
        endLine: i,
      });
      continue;
    }

    // 5. Table: lines starting and ending with |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const startLine = i + 1;
      const tableLines = [];
      const tableLineNumbers = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        tableLineNumbers.push(i + 1);
        i += 1;
      }
      if (tableLines.length >= 2) {
        const headerRow = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        // line 1 is often separator |---|---|
        const dataRows = [];
        const rowLines = [];
        tableLines.slice(1).forEach((l, tableIdx) => {
          if (/^\|(\s*[-:]+\s*\|)+$/.test(l)) return;
          dataRows.push(
            l
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim()),
          );
          rowLines.push(tableLineNumbers[tableIdx + 1]);
        });
        blocks.push({
          type: 'table',
          headers: headerRow,
          rows: dataRows,
          startLine,
          endLine: i,
          headerLine: tableLineNumbers[0],
          rowLines,
        });
        continue;
      }
    }

    // 6. Unordered List: - item, * item, + item
    if (/^\s*[-*+]\s+/.test(line)) {
      const startLine = i + 1;
      const items = [];
      const itemLines = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        itemLines.push(i + 1);
        i += 1;
      }
      blocks.push({
        type: 'ul',
        items,
        startLine,
        endLine: i,
        itemLines,
      });
      continue;
    }

    // 7. Ordered List: 1. item
    if (/^\s*\d+\.\s+/.test(line)) {
      const startLine = i + 1;
      const items = [];
      const itemLines = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        itemLines.push(i + 1);
        i += 1;
      }
      blocks.push({
        type: 'ol',
        items,
        startLine,
        endLine: i,
        itemLines,
      });
      continue;
    }

    // 8. Empty line -> skip
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 9. Paragraph
    const paraStart = i + 1;
    const paragraphLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !lines[i].trim().startsWith('>') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'p',
        text: paragraphLines.join(' '),
        startLine: paraStart,
        endLine: i,
      });
    }
  }

  return blocks;
}

/***
 * MARK: HEADING_STYLES
 * @description The single home of the six markdown heading class strings, so
 *   prominence tweaks touch one place instead of six switch branches. Every
 *   level except `h2` keeps the exact classes the viewer has always rendered;
 *   `h2` carries the docs-prominence treatment (larger, bolder, stronger rule
 *   and spacing) shared by the flat and collapsible paths — do not "restore"
 *   it to the old tokens thinking it drifted.
 * @example HEADING_STYLES.h1 => 'font-display-lg text-xl font-bold ...'
 ***/
export const HEADING_STYLES = {
  h1: 'font-display-lg text-xl font-bold text-on-surface mt-3 mb-1.5 tracking-tight break-words min-w-0 max-w-full',
  h2: 'font-headline-md text-lg font-extrabold text-on-surface mt-4 mb-2 border-b-2 border-border-standard/70 pb-1 break-words min-w-0 max-w-full',
  h3: 'font-headline-sm text-sm font-semibold text-primary mt-2 mb-0.5 break-words min-w-0 max-w-full',
  h4: 'text-sm font-semibold text-secondary mt-1.5 mb-0.5 uppercase tracking-wide',
  h5: 'text-xs font-semibold text-ochre mt-1 mb-0.25 uppercase tracking-wider',
  h6: 'text-[11px] font-bold text-text-muted mt-0.5 mb-0 uppercase tracking-widest',
};

/***
 * MARK: renderMarkdownBlock
 * @description Renders one parsed markdown block (headings, lists, code,
 *   tables, quotes, rules, paragraphs) to its React element. Shared by the
 *   flat rendering path and the collapsible-section path so both paint
 *   identical blocks. Inputs arrive as one labelled object (never positions),
 *   so a new option later cannot silently shift the existing arguments.
 * @param {Object} labelledInputs - The named inputs for this block.
 * @param {Object} labelledInputs.block - One block from `parseMarkdownBlocks`.
 * @param {string|number} labelledInputs.blockKey - React key for the rendered element.
 * @param {Object} labelledInputs.imageContext - Task context for relative image resolution.
 * @param {boolean} labelledInputs.enableCopy - Whether code blocks show copy buttons.
 * @returns {React.ReactNode} The rendered block element.
 * @example renderMarkdownBlock({ block: { type: 'h1', text: 'Hi' }, blockKey: 0, imageContext: {}, enableCopy: true }) => <h1>Hi</h1>
 ***/
function renderMarkdownBlock({ block, blockKey, imageContext, enableCopy }) {
  // The parser never produces a malformed block, so this guard is pure
  // defense in depth: one bad block renders nothing rather than crashing
  // the whole article.
  if (!block || typeof block.type !== 'string') return null;
  let rendered;
  switch (block.type) {
    case 'h1':
      rendered = (
        <h1 key={blockKey} className={HEADING_STYLES.h1}>
          {parseInlineMarkdown(block.text, imageContext)}
        </h1>
      );
      break;
    case 'h2':
      rendered = (
        <h2 key={blockKey} className={HEADING_STYLES.h2}>
          {parseInlineMarkdown(block.text, imageContext)}
        </h2>
      );
      break;
    case 'h3':
      rendered = (
        <h3 key={blockKey} className={HEADING_STYLES.h3}>
          {parseInlineMarkdown(block.text, imageContext)}
        </h3>
      );
      break;
    case 'h4':
      rendered = (
        <h4 key={blockKey} className={HEADING_STYLES.h4}>
          {parseInlineMarkdown(block.text, imageContext)}
        </h4>
      );
      break;
    case 'h5':
      rendered = (
        <h5 key={blockKey} className={HEADING_STYLES.h5}>
          {parseInlineMarkdown(block.text, imageContext)}
        </h5>
      );
      break;
    case 'h6':
      rendered = (
        <h6 key={blockKey} className={HEADING_STYLES.h6}>
          {parseInlineMarkdown(block.text, imageContext)}
        </h6>
      );
      break;
    case 'p':
      rendered = (
        <p
          key={blockKey}
          className="text-sm text-on-surface leading-relaxed break-words min-w-0 max-w-full"
        >
          {parseInlineMarkdown(block.text, imageContext)}
        </p>
      );
      break;
    case 'mermaid':
      rendered = (
        <MermaidDiagram
          key={blockKey}
          code={block.code}
        />
      );
      break;
    case 'code':
      rendered = (
        <CodeBlock
          key={blockKey}
          code={block.code}
          language={block.language}
          enableCopy={enableCopy}
        />
      );
      break;
    case 'ul':
      rendered = (
        <ul key={blockKey} className="space-y-1 pl-4">
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx} className="flex items-start gap-2 text-sm">
              <span className="text-primary select-none mt-0.5">•</span>
              <span className="flex-1">{parseInlineMarkdown(item, imageContext)}</span>
            </li>
          ))}
        </ul>
      );
      break;
    case 'ol':
      rendered = (
        <ol key={blockKey} className="space-y-1 pl-4">
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx} className="flex items-start gap-2 text-sm">
              <span className="text-[10px] font-bold text-secondary select-none mt-0.5">
                {itemIdx + 1}.
              </span>
              <span className="flex-1">{parseInlineMarkdown(item, imageContext)}</span>
            </li>
          ))}
        </ol>
      );
      break;
    case 'blockquote':
      rendered = (
        <blockquote
          key={blockKey}
          className="border-l-2 border-primary/70 pl-3 py-1 my-1.5 italic text-text-muted bg-surface-container/30 rounded-r text-sm leading-relaxed"
        >
          {parseInlineMarkdown(block.text, imageContext)}
        </blockquote>
      );
      break;
    case 'hr':
      rendered = <hr key={blockKey} className="border-border-standard my-2" />;
      break;
    case 'table':
      rendered = (
        <div
          key={blockKey}
          className="overflow-x-auto my-2 border border-border-standard rounded-sm"
        >
          <table className="zebra-table w-full border-collapse text-sm text-left">
            {block.headers && block.headers.length > 0 && (
              <thead className="bg-surface-container border-b border-border-standard">
                <tr>
                  {block.headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className="p-2 font-bold uppercase text-xs tracking-wider text-text-muted border-r border-border-standard last:border-r-0"
                    >
                      {parseInlineMarkdown(h, imageContext)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="zebra-row border-b border-border-standard/50 last:border-b-0 hover:bg-surface-container-high/30 transition-colors"
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="p-2 border-r border-border-standard/50 last:border-r-0 text-on-surface"
                    >
                      {parseInlineMarkdown(cell, imageContext)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    default:
      rendered = null;
      break;
  }
  return rendered;
}

/***
 * MARK: MarkdownViewer
 * @description Lightweight, secure Markdown renderer supporting headings (h1-h6),
 * bullet/numbered lists, bold/italic, inline code, syntax-highlighted code blocks,
 * markdown links, blockquotes, and tables without dangerous HTML injection.
 * @param {Object} props
 * @param {string} [props.content=''] - The markdown content to render.
 * @param {string} [props.className=''] - Optional outer container CSS classes.
 * @param {boolean} [props.enableCopy=true] - Whether code blocks have copy buttons.
 * @param {string} [props.projectId] - Task context so relative `assets/...` image references resolve to the raw image endpoint.
 * @param {string} [props.taskId] - Task context for image resolution (see resolveTaskImageUrl).
 * @param {Function|null} [props.renderBlockWrapper] - Optional `(block, rendered, index) => ReactNode` seam for review UIs: wraps each parsed block (which carries `startLine`/`endLine`) with hover affordances. `null` renders byte-identical default output.
 * @param {boolean} [props.collapsibleSections=false] - Opt-in: each `h2` becomes a collapsible toggle with a chevron; the `h1` title and pre-`h2` content stay always visible. A blank `##` heading shows an "Untitled section" fallback so the toggle always keeps a name. `false` renders the flat path (identical blocks, no toggle chrome).
 * @param {boolean} [props.defaultCollapsed=false] - Initial state when `collapsibleSections` is on: `false` starts every section open. Applies on mount and whenever the article changes; later prop flips alone do nothing.
 * @param {{ action: 'expand-all'|'collapse-all', nonce: number }|null} [props.sectionVisibilitySignal=null] - One-shot request from the parent (e.g. Expand all / Collapse all buttons). Each `nonce` applies once, then is forgotten; an article change consumes any pending signal and resets to the default. Unknown actions are ignored and reported via the logger so a sender typo cannot hide.
 * @example <MarkdownViewer content="# Overview\n\nTask details here." />
 * @example <MarkdownViewer content={article} collapsibleSections sectionVisibilitySignal={{ action: 'expand-all', nonce: 1 }} />
 ***/
export function MarkdownViewer({
  content = '',
  className = '',
  enableCopy = true,
  projectId = null,
  taskId = null,
  renderBlockWrapper = null,
  collapsibleSections = false,
  defaultCollapsed = false,
  sectionVisibilitySignal = null,
}) {
  // Relative task-asset images resolve against the task's image endpoint;
  // without task context, sources render as-is (legacy behavior).
  const imageContext = useMemo(
    () => ({ apiBase: API_BASE, projectId, taskId }),
    [projectId, taskId],
  );
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);
  const { preamble, sections } = useMemo(() => groupBlocksIntoSections(blocks), [blocks]);
  // Unique prefix for the collapsible body ids (`aria-controls` targets), so
  // two viewers on one page can never share an id.
  const sectionGroupId = useId();
  // Collapsed section ids, carried with the content they belong to: section
  // ids are positional, so opening another article drops the old set and
  // starts from the default again. The parent's one-shot expand-all /
  // collapse-all signal folds into the same state: each nonce applies exactly
  // once, and a content change consumes any pending signal. Both adjust
  // during render (never in an effect), so a re-render can never replay them.
  const [collapsedState, setCollapsedState] = useState(() => ({
    content,
    appliedSignalNonce: null,
    collapsedIds: new Set(defaultCollapsed ? sections.map((section) => section.id) : []),
  }));
  if (collapsedState.content !== content) {
    setCollapsedState({
      content,
      appliedSignalNonce: sectionVisibilitySignal?.nonce ?? null,
      collapsedIds: new Set(defaultCollapsed ? sections.map((section) => section.id) : []),
    });
  } else if (
    sectionVisibilitySignal &&
    sectionVisibilitySignal.nonce !== collapsedState.appliedSignalNonce
  ) {
    if (sectionVisibilitySignal.action === 'expand-all') {
      setCollapsedState({
        ...collapsedState,
        appliedSignalNonce: sectionVisibilitySignal.nonce,
        collapsedIds: new Set(),
      });
    } else if (sectionVisibilitySignal.action === 'collapse-all') {
      setCollapsedState({
        ...collapsedState,
        appliedSignalNonce: sectionVisibilitySignal.nonce,
        collapsedIds: new Set(sections.map((section) => section.id)),
      });
    } else {
      // Fail safe and LOUD: an unknown action (a sender typo — the only
      // caller is DocsView's Expand all / Collapse all) must never touch
      // collapse state, but swallowing it silently would hide the bug, so
      // the nonce is still consumed and the action is reported once.
      logger.warn(
        `MarkdownViewer ignoring unknown sectionVisibilitySignal action: ${String(
          sectionVisibilitySignal.action,
        )}`,
      );
      setCollapsedState({ ...collapsedState, appliedSignalNonce: sectionVisibilitySignal.nonce });
    }
  }

  const toggleSectionCollapsed = useCallback((sectionId) => {
    setCollapsedState((state) => {
      const collapsedIds = new Set(state.collapsedIds);
      if (collapsedIds.has(sectionId)) {
        collapsedIds.delete(sectionId);
      } else {
        collapsedIds.add(sectionId);
      }
      return { ...state, collapsedIds };
    });
  }, []);

  const renderWrappedBlock = useCallback(
    (block, blockIndex) => {
      const rendered = renderMarkdownBlock({
        block,
        blockKey: blockIndex,
        imageContext,
        enableCopy,
      });
      if (renderBlockWrapper) return renderBlockWrapper(block, rendered, blockIndex);
      return rendered;
    },
    [imageContext, enableCopy, renderBlockWrapper],
  );

  if (!content || blocks.length === 0) {
    return (
      <div className={`text-text-muted text-xs italic ${className}`}>No content provided.</div>
    );
  }

  return (
    <div
      data-testid="markdown-viewer"
      className={`markdown-viewer space-y-1.5 text-xs text-on-surface leading-relaxed min-w-0 max-w-full break-words overflow-x-clip ${className}`}
    >
      {!collapsibleSections ? (
        blocks.map((block, idx) => renderWrappedBlock(block, idx))
      ) : (
        <>
          {/* The preamble is the untouched block-list prefix, so each of its
              original indices is its position here. */}
          {preamble.map((block, preambleIndex) => renderWrappedBlock(block, preambleIndex))}
          {sections.map((section) => {
            const isCollapsed = collapsedState.collapsedIds.has(section.id);
            const bodyId = `${sectionGroupId}-${section.id}-body`;
            // A blank `##` heading would leave the toggle with no name at
            // all, and a nameless button fails accessibility checks — so it
            // gets a visible fallback label. Visible and announced text stay
            // the same string on purpose.
            const rawHeadingText = section.headingBlock.text;
            const hasHeadingText =
              typeof rawHeadingText === 'string' && rawHeadingText.trim() !== '';
            const header = (
              <h2 className={HEADING_STYLES.h2}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  // The collapsed body unmounts, so the reference only exists
                  // while expanded — a dangling id helps nobody.
                  aria-controls={isCollapsed ? undefined : bodyId}
                  onClick={() => toggleSectionCollapsed(section.id)}
                  className="flex w-full items-center gap-2 text-left cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    aria-hidden="true"
                    className={`text-primary select-none transition-transform motion-reduce:transition-none ${isCollapsed ? '-rotate-90' : ''}`}
                  >
                    ▾
                  </span>
                  <span className="flex-1">
                    {hasHeadingText
                      ? parseInlineMarkdown(rawHeadingText, imageContext)
                      : 'Untitled section'}
                  </span>
                </button>
              </h2>
            );
            return (
              <div key={section.id}>
                {renderBlockWrapper
                  ? renderBlockWrapper(section.headingBlock, header, section.headingIndex)
                  : header}
                {!isCollapsed && (
                  <div id={bodyId} className="space-y-1.5">
                    {section.blocks.map((block, bodyIndex) =>
                      renderWrappedBlock(block, section.headingIndex + 1 + bodyIndex),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default MarkdownViewer;
