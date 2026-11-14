#!/usr/bin/env node
/**
 * MARK: check-imports-declared
 * @description Fast dependency-manifest guardrail: fails when a frontend
 *   source file imports a bare package specifier that is not listed in
 *   `frontend/package.json`. Covers static `import` / `export … from`,
 *   side-effect and type-only imports, dynamic `import("x")`, and
 *   `require("x")`.
 *
 *   Case study: an undeclared dynamic `import("mermaid")` sailed through
 *   every cheap stage and then failed the expensive ones (Frontend Build,
 *   depcheck, a 1500s canary timeout, publish). This check runs in
 *   milliseconds as the first step of the frontend build and as a gate
 *   preflight, so the omission fails fast with the file and package named.
 *
 *   Relative (`./x`), absolute (`/x`), `#`-internal, `node:`-prefixed, and
 *   Node-builtin specifiers are never flagged. Comments and string literals
 *   are masked before scanning, so prose like `from "x"` in JSDoc or an
 *   `import("x")` inside a string never counts as an import.
 *
 *   Known limitations (still covered by the slow depcheck/build): regex
 *   literals containing `//` or `/*` can mask nearby code, template-literal
 *   dynamic imports with interpolation are skipped, bare words inside JSX
 *   text are read as code (quote import examples in JSX strings instead),
 *   and `vi.mock("x")` / `jest.mock("x")` calls are not scanned (an
 *   undeclared mock target fails its own suite loudly instead).
 * @example node scripts/check-imports-declared.js
 * @example node scripts/check-imports-declared.js --package /path/to/frontend
 */
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageDirectory = path.resolve(scriptDirectory, '..');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const ROOT_CONFIG_PATTERN = /\.config\.(?:js|cjs|mjs|ts)$/;

/***
 * MARK: NON_PACKAGE_SPECIFIERS
 * @description Bare specifiers that resolve without a package.json entry:
 *   Vite aliases and virtual modules (none are configured today — see
 *   `vite.config.js`, which defines no `resolve.alias`). Add an entry here
 *   with a comment when an alias or virtual module is introduced, so the
 *   guardrail keeps passing without weakening the manifest rule.
 * @example NON_PACKAGE_SPECIFIERS.has("@/components") => false
 ***/
const NON_PACKAGE_SPECIFIERS = new Set([]);

const builtinModuleNames = new Set(builtinModules);

/***
 * MARK: computeCodeMask
 * @description Marks every character of the source that lives in real code
 *   (true) versus inside a comment or string literal (false), so import
 *   keyword matches found by regex can be verified as genuine code. String
 *   contents are masked but template `${…}` interpolations are followed back
 *   into code mode, with nesting tracked on a brace stack.
 * @example computeCodeMask('import x from "a"; // import y from "b";')[0] => true
 * @param {string} sourceText - the file content to mask.
 * @returns {boolean[]} Per-character code flags, same length as the input.
 ***/
function computeCodeMask(sourceText) {
  const mask = [];
  let mode = 'code';
  let stringQuote = '';
  const interpolationBraceDepths = [];
  let index = 0;
  while (index < sourceText.length) {
    const current = sourceText.charAt(index);
    const next = sourceText.charAt(index + 1);
    if (mode === 'lineComment') {
      mask.push(false);
      index += 1;
      if (current === '\n') mode = 'code';
      continue;
    }
    if (mode === 'blockComment') {
      mask.push(false);
      index += 1;
      if (current === '*' && next === '/') {
        mask.push(false);
        index += 1;
        mode = 'code';
      }
      continue;
    }
    if (mode === 'string') {
      mask.push(false);
      index += 1;
      if (current === '\\' && index < sourceText.length) {
        mask.push(false);
        index += 1;
      } else if (current === stringQuote) {
        mode = 'code';
      }
      continue;
    }
    if (mode === 'template') {
      if (current === '\\' && index + 1 < sourceText.length) {
        mask.push(false);
        mask.push(false);
        index += 2;
        continue;
      }
      mask.push(false);
      index += 1;
      if (current === '`') {
        mode = 'code';
      } else if (current === '$' && next === '{') {
        mask.push(false);
        index += 1;
        interpolationBraceDepths.push(0);
        mode = 'code';
      }
      continue;
    }
    if (current === '/' && next === '/') {
      mask.push(false);
      mask.push(false);
      index += 2;
      mode = 'lineComment';
      continue;
    }
    if (current === '/' && next === '*') {
      mask.push(false);
      mask.push(false);
      index += 2;
      mode = 'blockComment';
      continue;
    }
    if (current === "'" || current === '"') {
      mask.push(false);
      index += 1;
      stringQuote = current;
      mode = 'string';
      continue;
    }
    if (current === '`') {
      mask.push(false);
      index += 1;
      mode = 'template';
      continue;
    }
    if (current === '{' && interpolationBraceDepths.length > 0) {
      interpolationBraceDepths[interpolationBraceDepths.length - 1] += 1;
    }
    if (current === '}' && interpolationBraceDepths.length > 0) {
      const topDepth = interpolationBraceDepths[interpolationBraceDepths.length - 1];
      if (topDepth === 0) {
        interpolationBraceDepths.pop();
        mask.push(true);
        index += 1;
        mode = 'template';
        continue;
      }
      interpolationBraceDepths[interpolationBraceDepths.length - 1] -= 1;
    }
    mask.push(true);
    index += 1;
  }
  return mask;
}

/***
 * MARK: blankComments
 * @description Replaces every comment character with a space (strings kept
 *   intact), so import patterns still match when a comment sits between the
 *   keyword and the specifier — e.g. `import(// chunk name\n"pkg")`.
 * @example blankComments('import(// chunk\n"pkg")') => 'import(          "pkg")'
 * @param {string} sourceText - the file content.
 * @param {boolean[]} codeMask - the computeCodeMask output for the content.
 * @returns {string} The content with comments blanked to spaces.
 ***/
function blankComments(sourceText, codeMask) {
  // A comment char is non-code that is not inside a string literal: the
  // mask alone cannot tell comments from strings, so re-derive strings by
  // re-scanning quotes outside comments. Simpler equivalent: blank a
  // maximal run starting at a comment opener found in code.
  let blanked = '';
  let index = 0;
  while (index < sourceText.length) {
    const inCode = codeMask.at(index);
    const current = sourceText.charAt(index);
    const next = sourceText.charAt(index + 1);
    if (inCode && current === '/' && (next === '/' || next === '*')) {
      const isLineComment = next === '/';
      blanked += '  ';
      index += 2;
      while (index < sourceText.length) {
        const commentChar = sourceText.charAt(index);
        const commentNext = sourceText.charAt(index + 1);
        if (isLineComment && commentChar === '\n') break;
        if (!isLineComment && commentChar === '*' && commentNext === '/') {
          blanked += '  ';
          index += 2;
          break;
        }
        blanked += commentChar === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }
    blanked += current;
    index += 1;
  }
  return blanked;
}

const DYNAMIC_IMPORT_PATTERN = /(?<![\w$.])import\s*\(\s*["'`]([^"'`]+)["'`]/g;
const REQUIRE_PATTERN = /(?<![\w$.])require\s*\(\s*["']([^"']+)["']/g;
// eslint-disable-next-line security/detect-unsafe-regex -- scans committed repo source (never remote user input); the lazy span is bounded by an excluded quote/semicolon class, so a pathological file only slows a local check
const STATIC_IMPORT_PATTERN =
  /(?<![\w$.])import\b(?!\s*\()(?!\s*\.)\s*(?:type\s+)?(?:["']([^"']+)["']|[^"';]*?\bfrom\s*["']([^"']+)["'])/g;
// eslint-disable-next-line security/detect-unsafe-regex -- same bounded lazy span over committed repo source as above
const REEXPORT_PATTERN = /(?<![\w$.])export\s*(?:type\s+)?[^"';]*?\bfrom\s*["']([^"']+)["']/g;

/***
 * MARK: extractImportSpecifiers
 * @description Lists every module specifier a source file imports: static
 *   `import`, side-effect, type-only, and multiline imports, `export … from`
 *   re-exports, dynamic `import("x")`, and `require("x")`. A match only
 *   counts when its keyword sits in real code (see computeCodeMask), and
 *   template-literal dynamic imports with interpolation are skipped.
 * @example extractImportSpecifiers('import x from "react";') => ["react"]
 * @param {string} sourceText - the file content to scan.
 * @returns {string[]} The raw specifiers in first-seen order (duplicates kept).
 ***/
export function extractImportSpecifiers(sourceText) {
  const codeMask = computeCodeMask(sourceText);
  const searchableText = blankComments(sourceText, codeMask);
  const specifiers = [];
  const collectMatches = (pattern, pickCaptures) => {
    pattern.lastIndex = 0;
    let match = pattern.exec(searchableText);
    while (match !== null) {
      const keywordInCode = codeMask.at(match.index) === true;
      if (keywordInCode) {
        for (const captured of pickCaptures(match)) {
          if (typeof captured === 'string' && captured.length > 0 && !captured.includes('$')) {
            specifiers.push(captured);
          }
        }
      }
      match = pattern.exec(searchableText);
    }
  };
  collectMatches(DYNAMIC_IMPORT_PATTERN, (match) => [match[1]]);
  collectMatches(REQUIRE_PATTERN, (match) => [match[1]]);
  collectMatches(STATIC_IMPORT_PATTERN, (match) => [match[1], match[2]]);
  collectMatches(REEXPORT_PATTERN, (match) => [match[1]]);
  return specifiers;
}

/***
 * MARK: packageNameFromSpecifier
 * @description Maps an import specifier to the package.json name that must
 *   declare it (`react-dom/client` → `react-dom`, `@scope/pkg/sub` →
 *   `@scope/pkg`), or null when the specifier never needs a manifest entry:
 *   relative, absolute, `#`-internal, `node:`-prefixed, and bare Node
 *   builtins, plus URL-shaped imports. Vite `?raw`-style suffixes are
 *   stripped before mapping.
 * @example packageNameFromSpecifier("react-dom/client") => "react-dom"
 * @param {string} specifier - the raw import specifier.
 * @returns {string|null} The owning package name, or null when not a bare package import.
 ***/
export function packageNameFromSpecifier(specifier) {
  const withoutSuffix = specifier.split(/[?#]/)[0];
  if (withoutSuffix.length === 0) return null;
  if (
    withoutSuffix.startsWith('.') ||
    withoutSuffix.startsWith('/') ||
    withoutSuffix.startsWith('#') ||
    withoutSuffix.startsWith('~') ||
    withoutSuffix.startsWith('node:') ||
    withoutSuffix.includes('://') ||
    withoutSuffix.startsWith('data:') ||
    withoutSuffix.startsWith('blob:')
  ) {
    return null;
  }
  if (builtinModuleNames.has(withoutSuffix)) return null;
  if (withoutSuffix.startsWith('@')) {
    const segments = withoutSuffix.split('/');
    if (segments.length < 2 || segments[1].length === 0) return null;
    return `${segments[0]}/${segments[1]}`;
  }
  const packageName = withoutSuffix.split('/')[0];
  return packageName.length > 0 ? packageName : null;
}

/***
 * MARK: collectSourceFiles
 * @description Lists the bundled-or-executed sources the guardrail scans: every
 *   JS/TS file under `<package>/src` plus the root `*.config.{js,cjs,mjs,ts}`
 *   files (vite, vitest, eslint, postcss, tailwind). `scripts/` is excluded —
 *   dev-only Node tooling that never ships, still covered by the slow
 *   depcheck sweep.
 * @example collectSourceFiles("/repo/frontend").length > 100 => true
 * @param {string} packageDirectoryPath - the package root (owns package.json).
 * @returns {string[]} Absolute file paths in walk order.
 ***/
export function collectSourceFiles(packageDirectoryPath) {
  const collected = [];
  const sourceDirectory = path.join(packageDirectoryPath, 'src');
  const walkDirectory = (directoryPath) => {
    let entries;
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walkDirectory(fullPath);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        collected.push(fullPath);
      }
    }
  };
  walkDirectory(sourceDirectory);
  let rootEntries;
  try {
    rootEntries = fs.readdirSync(packageDirectoryPath, { withFileTypes: true });
  } catch {
    rootEntries = [];
  }
  for (const entry of rootEntries) {
    if (!entry.isDirectory() && ROOT_CONFIG_PATTERN.test(entry.name)) {
      collected.push(path.join(packageDirectoryPath, entry.name));
    }
  }
  return collected;
}

/***
 * MARK: readDeclaredDependencies
 * @description Reads every installable dependency name from the package
 *   manifest (dependencies, devDependencies, peerDependencies,
 *   optionalDependencies).
 * @example readDeclaredDependencies("/repo/frontend").has("react") => true
 * @param {string} packageDirectoryPath - the package root (owns package.json).
 * @returns {Set<string>} The declared package names (empty when unreadable).
 ***/
export function readDeclaredDependencies(packageDirectoryPath) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageDirectoryPath, 'package.json'), 'utf8'),
    );
    return new Set([
      ...Object.keys(manifest.dependencies || {}),
      ...Object.keys(manifest.devDependencies || {}),
      ...Object.keys(manifest.peerDependencies || {}),
      ...Object.keys(manifest.optionalDependencies || {}),
    ]);
  } catch {
    return new Set();
  }
}

/***
 * MARK: findUndeclaredImports
 * @description Scans the package sources and returns one violation per
 *   (file, package) pair whose bare import has no manifest entry, sorted by
 *   file then package for stable output.
 * @example findUndeclaredImports({ packageDirectoryPath: "/repo/frontend" }) => []
 * @param {Object} options
 * @param {string} options.packageDirectoryPath - the package root (owns package.json).
 * @returns {Array<{file: string, specifier: string, packageName: string}>} Violations with repo-relative-posix file paths.
 ***/
export function findUndeclaredImports({ packageDirectoryPath }) {
  const declared = readDeclaredDependencies(packageDirectoryPath);
  const seen = new Set();
  const violations = [];
  for (const absolutePath of collectSourceFiles(packageDirectoryPath)) {
    const sourceText = fs.readFileSync(absolutePath, 'utf8');
    const relativeFile = path
      .relative(packageDirectoryPath, absolutePath)
      .split(path.sep)
      .join('/');
    for (const specifier of extractImportSpecifiers(sourceText)) {
      const packageName = packageNameFromSpecifier(specifier);
      if (packageName === null) continue;
      if (declared.has(packageName)) continue;
      if (NON_PACKAGE_SPECIFIERS.has(packageName) || NON_PACKAGE_SPECIFIERS.has(specifier))
        continue;
      const dedupeKey = `${relativeFile}\0${packageName}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      violations.push({ file: relativeFile, specifier, packageName });
    }
  }
  violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.packageName.localeCompare(right.packageName),
  );
  return violations;
}

/***
 * MARK: checkPackageDirectory
 * @description Timed wrapper over findUndeclaredImports with the same result
 *   shape as the Settings-duplicate preflight, so the gate prints both
 *   checks the same way.
 * @example checkPackageDirectory({ packageDirectoryPath: "/repo/frontend" }).isClean => true
 * @param {Object} options
 * @param {string} options.packageDirectoryPath - the package root (owns package.json).
 * @returns {{isClean: boolean, violationsList: Array, totalFilesScanned: number, durationMilliseconds: number}}
 ***/
export function checkPackageDirectory({ packageDirectoryPath }) {
  const startMilliseconds = Date.now();
  const violationsList = findUndeclaredImports({ packageDirectoryPath });
  return {
    isClean: violationsList.length === 0,
    violationsList,
    totalFilesScanned: collectSourceFiles(packageDirectoryPath).length,
    durationMilliseconds: Date.now() - startMilliseconds,
  };
}

/***
 * MARK: formatUndeclaredReport
 * @description Renders one `package imported by file` line per violation plus
 *   the same-commit fix instruction.
 * @example formatUndeclaredReport({ violationsList: [{ file: "src/a.js", specifier: "ghost", packageName: "ghost" }] })
 * @param {Object} options
 * @param {Array} options.violationsList - the findUndeclaredImports violations.
 * @param {string} [options.packageManifestLabel] - manifest path shown in the fix hint.
 * @returns {string} The human-readable failure report.
 ***/
export function formatUndeclaredReport({
  violationsList,
  packageManifestLabel = 'frontend/package.json',
}) {
  const lines = violationsList.map(
    (violation) => `   - ${violation.packageName} imported by ${violation.file}`,
  );
  return (
    '❌ Undeclared dependencies: these imports have no matching package.json entry:\n' +
    `${lines.join('\n')}\n` +
    `Add each package to ${packageManifestLabel} in the same commit ` +
    '(npm install <pkg> --prefix frontend) so the lockfile stays in sync.'
  );
}

/***
 * MARK: resolvePackageDirectory
 * @description Resolves the `--package <dir>` CLI override, defaulting to the
 *   package that owns this script (frontend). A follow-up can point the same
 *   script at api or root behind this one flag.
 * @example resolvePackageDirectory([]) => "/repo/frontend"
 * @param {string[]} cliArgs - process.argv without the node/script prefix.
 * @returns {string} The absolute package directory to check.
 ***/
export function resolvePackageDirectory(cliArgs) {
  const flagIndex = cliArgs.indexOf('--package');
  if (flagIndex !== -1 && cliArgs[flagIndex + 1]) {
    return path.resolve(cliArgs[flagIndex + 1]);
  }
  return defaultPackageDirectory;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const packageDirectoryPath = resolvePackageDirectory(process.argv.slice(2));
  const directoryName = path.basename(packageDirectoryPath);
  const packageLabel = directoryName.charAt(0).toUpperCase() + directoryName.slice(1);
  const result = checkPackageDirectory({ packageDirectoryPath });
  if (!result.isClean) {
    console.error(
      formatUndeclaredReport({
        violationsList: result.violationsList,
        packageManifestLabel: `${directoryName}/package.json`,
      }),
    );
    process.exit(1);
  }
  console.log(
    `✅ ${packageLabel} imports check passed (${result.totalFilesScanned} files in ${result.durationMilliseconds}ms)`,
  );
}
