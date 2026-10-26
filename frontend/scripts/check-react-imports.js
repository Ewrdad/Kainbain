#!/usr/bin/env node
/**
 * MARK: check-react-imports
 * @description Build-time guard that fails if any source JSX file uses the
 *   `React.` namespace (e.g. React.Children, React.cloneElement) without
 *   importing React. This prevents the "React is not defined" runtime crash
 *   that takes down the whole UI in production.
 *
 * The frontend uses the automatic JSX runtime (see vite.config.js), so JSX
 * itself never needs React in scope. But a component that calls `React.something`
 * directly MUST import React. This script scans source files (not tests) and
 * exits non-zero if it finds a violation, so the deploy's build step fails
 * before a broken bundle is ever shipped.
 *
 * @example node scripts/check-react-imports.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.jsx') && !entry.name.endsWith('.test.jsx')) {
      checkFile(full);
    }
  }
}

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  // Only care about files that actually use the React. namespace.
  if (!/React\.[A-Za-z]/.test(content)) return;
  // A file is fine if it imports React (default or named).
  const importsReact = /import\s+React\b/.test(content);
  if (!importsReact) {
    violations.push(path.relative(root, file));
  }
}

walk(srcDir);

if (violations.length > 0) {
  console.error(
    '❌ React import check failed. These source files use `React.` but do not import React:\n' +
      violations.map((v) => `   - ${v}`).join('\n') +
      "\nAdd `import React from 'react';` to each file.",
  );
  process.exit(1);
}

console.log('✅ React import check passed — all source files that use `React.` import it.');
