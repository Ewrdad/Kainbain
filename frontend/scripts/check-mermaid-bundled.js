#!/usr/bin/env node
/**
 * MARK: check-mermaid-bundled
 * @description Build-time guard that fails if `vite.config.js` externalizes
 *   the `mermaid` package. An externalized mermaid is left out of the
 *   production bundle, so the dynamic `import('mermaid')` in `MermaidDiagram`
 *   (`src/components/common/MarkdownViewer.jsx`) cannot resolve in a browser
 *   and every mermaid fence degrades to a source block — diagrams never render
 *   as SVG. This script scans the vite config text and exits non-zero if it
 *   finds `mermaid` inside a Rollup `external` list, so the build step fails
 *   before a broken bundle is ever shipped.
 * @example node scripts/check-mermaid-bundled.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(root, 'vite.config.js');

const content = fs.readFileSync(configFile, 'utf8');
const externalized = /external\s*:\s*\[[^\]]*['"]mermaid['"]/s.test(content);

if (externalized) {
  console.error(
    "check-mermaid-bundled: FAIL — vite.config.js externalizes 'mermaid', " +
      'so MermaidDiagram can never render SVG in production. ' +
      "Remove 'mermaid' from build.rollupOptions.external.",
  );
  process.exit(1);
}

console.log('check-mermaid-bundled: OK — mermaid stays in the production bundle.');
