import React, { useState, useMemo, useCallback } from 'react';
import { API_BASE } from '../../services/apiBase';
import { resolveTaskImageUrl } from '../../services/taskImages';
import { useImageRetry } from '../../services/imageRetry';

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
  const lines = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
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
      blocks.push({
        type: 'code',
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
 * @example <MarkdownViewer content="# Overview\n\nTask details here." />
 ***/
export function MarkdownViewer({
  content = '',
  className = '',
  enableCopy = true,
  projectId = null,
  taskId = null,
  renderBlockWrapper = null,
}) {
  // Relative task-asset images resolve against the task's image endpoint;
  // without task context, sources render as-is (legacy behavior).
  const imageContext = useMemo(
    () => ({ apiBase: API_BASE, projectId, taskId }),
    [projectId, taskId],
  );
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  if (!content || blocks.length === 0) {
    return (
      <div className={`text-text-muted text-xs italic ${className}`}>No content provided.</div>
    );
  }

  return (
    <div
      data-testid="markdown-viewer"
      className={`markdown-viewer space-y-2.5 text-xs text-on-surface leading-relaxed min-w-0 max-w-full break-words overflow-x-clip ${className}`}
    >
      {blocks.map((block, idx) => {
        let rendered;
        switch (block.type) {
          case 'h1':
            rendered = (
              <h1
                key={idx}
                className="font-display-lg text-xl font-bold text-on-surface mt-4 mb-2 tracking-tight break-words min-w-0 max-w-full"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </h1>
            );
            break;
          case 'h2':
            rendered = (
              <h2
                key={idx}
                className="font-headline-md text-base font-bold text-on-surface mt-3.5 mb-1.5 border-b border-border-standard/60 pb-1 break-words min-w-0 max-w-full"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </h2>
            );
            break;
          case 'h3':
            rendered = (
              <h3
                key={idx}
                className="font-headline-sm text-sm font-semibold text-primary mt-3 mb-1 break-words min-w-0 max-w-full"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </h3>
            );
            break;
          case 'h4':
            rendered = (
              <h4
                key={idx}
                className="text-xs font-semibold text-secondary mt-2 mb-0.5 uppercase tracking-wide font-mono"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </h4>
            );
            break;
          case 'h5':
            rendered = (
              <h5
                key={idx}
                className="text-[11px] font-semibold text-ochre mt-1.5 mb-0.5 uppercase tracking-wider font-mono"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </h5>
            );
            break;
          case 'h6':
            rendered = (
              <h6
                key={idx}
                className="text-[10px] font-bold text-text-muted mt-1 mb-0.5 uppercase tracking-widest font-mono"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </h6>
            );
            break;
          case 'p':
            rendered = (
              <p
                key={idx}
                className="text-xs font-body-md text-on-surface leading-relaxed break-words min-w-0 max-w-full"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </p>
            );
            break;
          case 'code':
            rendered = (
              <CodeBlock
                key={idx}
                code={block.code}
                language={block.language}
                enableCopy={enableCopy}
              />
            );
            break;
          case 'ul':
            rendered = (
              <ul key={idx} className="space-y-1 my-2 pl-2">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 text-xs">
                    <span className="text-primary select-none mt-0.5">•</span>
                    <span className="flex-1">{parseInlineMarkdown(item, imageContext)}</span>
                  </li>
                ))}
              </ul>
            );
            break;
          case 'ol':
            rendered = (
              <ol key={idx} className="space-y-1 my-2 pl-2">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-[10px] font-bold text-secondary select-none mt-0.5">
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
                key={idx}
                className="border-l-2 border-primary/70 pl-3 py-1.5 my-2 italic text-text-muted bg-surface-container/30 rounded-r text-xs leading-relaxed"
              >
                {parseInlineMarkdown(block.text, imageContext)}
              </blockquote>
            );
            break;
          case 'hr':
            rendered = <hr key={idx} className="border-border-standard my-3" />;
            break;
          case 'table':
            rendered = (
              <div
                key={idx}
                className="overflow-x-auto my-3 border border-border-standard rounded-sm"
              >
                <table className="zebra-table w-full border-collapse text-xs font-mono text-left">
                  {block.headers && block.headers.length > 0 && (
                    <thead className="bg-surface-container border-b border-border-standard">
                      <tr>
                        {block.headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            className="p-2 font-bold uppercase text-[10px] tracking-wider text-text-muted border-r border-border-standard last:border-r-0"
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
        if (renderBlockWrapper) return renderBlockWrapper(block, rendered, idx);
        return rendered;
      })}
    </div>
  );
}

export default MarkdownViewer;
