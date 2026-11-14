#!/usr/bin/env node
/**
 * MARK: check-imports-declared
 * @description Fast dependency-manifest guardrail: fails when a frontend
 *   source file imports a bare package specifier that is not listed in
 *   `frontend/package.json`. Covers static `import` / `export … from`,
 *   side-effect and type-only imports, dynamic `import("x")`,
 *   `require("x")` / `require.resolve("x")`, and `import.meta.resolve("x")`.
 *
 *   Case study: an undeclared dynamic `import("mermaid")` sailed through
 *   every cheap stage and then failed the expensive ones (Frontend Build,
 *   depcheck, a 1500s canary timeout, publish). This check runs in
 *   milliseconds as the first step of the frontend build and as a gate
 *   preflight, so the omission fails fast with the file and package named.
 *
 *   Relative (`./x`), absolute (`/x`), `#`-internal, `~`-prefixed,
 *   `node:`-prefixed, and Node-builtin specifiers are never flagged, nor are
 *   URL-shaped (`https:`, `data:`, `blob:`) imports. Comments are blanked and
 *   string literals are masked before scanning, so prose like `from "x"` in
 *   JSDoc or an `import("x")` inside a string never counts as an import —
 *   while a comment sitting between the keyword and the specifier (for
 *   example `import(// chunk name\n"pkg")`) still matches.
 *
 *   How this check fails (every failure exits 1 and names the cause):
 *   undeclared imports (one `package imported by file` line each, with the
 *   same-commit fix); a missing or unparseable package.json; a source file or
 *   directory that cannot be read; a scan that finds zero files (refuses to
 *   pass vacuously); and CLI misuse (unknown flags, missing --package value).
 *
 *   Known limitations (still covered by the slow depcheck/build): regex
 *   literals containing comment markers or quote characters can mask nearby
 *   code, template-literal dynamic imports with interpolation are skipped,
 *   bare words inside JSX text are read as code (quote import examples in
 *   JSX strings instead), and `vi.mock("x")` / `jest.mock("x")` calls are not
 *   scanned (an undeclared mock target fails its own suite loudly instead).
 * @example node scripts/check-imports-declared.js
 * @example node scripts/check-imports-declared.js --package /path/to/frontend
 */
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageDirectory = path.resolve(scriptDirectory, '..');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const ROOT_CONFIG_PATTERN = /\.config\.(?:js|cjs|mjs|mts|cts|ts)$/;

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
 * MARK: CHECK_IMPORTS_DECLARED_USAGE
 * @description CLI help printed for `--help` and quoted by every CLI-misuse
 *   error, so a mistyped invocation shows the accepted form.
 * @example CHECK_IMPORTS_DECLARED_USAGE.startsWith("Usage:") => true
 ***/
export const CHECK_IMPORTS_DECLARED_USAGE =
  'Usage: node check-imports-declared.js [--package <dir>]\n' +
  '  Scans <dir>/src plus the root *.config.* files (default: the frontend\n' +
  '  package that owns this script) and exits 1 naming every bare import with\n' +
  '  no matching package.json entry.';

/***
 * MARK: maskCommentsAndStrings
 * @description Scans the file once and returns two aligned views of it: a
 *   per-character code flag (false inside comments and string/template
 *   literals, so an import keyword match can be verified as genuine code)
 *   and a searchable copy with every comment character replaced by a space
 *   (strings kept intact, so a comment between the keyword and the specifier
 *   still matches — e.g. `import(// chunk name\n"pkg")`). Both outputs keep
 *   the input length, so a match index is the same file offset in either.
 *   String contents are masked but template `${…}` interpolations are
 *   followed back into code mode, with nesting tracked on a brace stack.
 * @example maskCommentsAndStrings('import x from "a"; // hi').searchableText => 'import x from "a";      '
 * @param {string} sourceText - the file content to mask.
 * @returns {{codeMask: boolean[], searchableText: string}} The aligned views.
 ***/
function maskCommentsAndStrings(sourceText) {
  const codeMask = [];
  const searchableChars = [];
  let mode = 'code';
  let stringQuote = '';
  const interpolationBraceDepths = [];
  let index = 0;
  while (index < sourceText.length) {
    const current = sourceText.charAt(index);
    const next = sourceText.charAt(index + 1);
    if (mode === 'lineComment') {
      codeMask.push(false);
      searchableChars.push(current === '\n' ? '\n' : ' ');
      index += 1;
      if (current === '\n') mode = 'code';
      continue;
    }
    if (mode === 'blockComment') {
      codeMask.push(false);
      searchableChars.push(' ');
      index += 1;
      if (current === '*' && next === '/') {
        codeMask.push(false);
        searchableChars.push(' ');
        index += 1;
        mode = 'code';
      }
      continue;
    }
    if (mode === 'string') {
      codeMask.push(false);
      searchableChars.push(current);
      index += 1;
      if (current === '\\' && index < sourceText.length) {
        codeMask.push(false);
        searchableChars.push(sourceText.charAt(index));
        index += 1;
      } else if (current === stringQuote) {
        mode = 'code';
      }
      continue;
    }
    if (mode === 'template') {
      if (current === '\\' && index + 1 < sourceText.length) {
        codeMask.push(false);
        codeMask.push(false);
        searchableChars.push(current);
        searchableChars.push(next);
        index += 2;
        continue;
      }
      codeMask.push(false);
      searchableChars.push(current);
      index += 1;
      if (current === '`') {
        mode = 'code';
      } else if (current === '$' && next === '{') {
        codeMask.push(false);
        searchableChars.push(next);
        index += 1;
        interpolationBraceDepths.push(0);
        mode = 'code';
      }
      continue;
    }
    if (current === '/' && next === '/') {
      codeMask.push(false);
      codeMask.push(false);
      searchableChars.push(' ');
      searchableChars.push(' ');
      index += 2;
      mode = 'lineComment';
      continue;
    }
    if (current === '/' && next === '*') {
      codeMask.push(false);
      codeMask.push(false);
      searchableChars.push(' ');
      searchableChars.push(' ');
      index += 2;
      mode = 'blockComment';
      continue;
    }
    if (current === "'" || current === '"') {
      codeMask.push(false);
      searchableChars.push(current);
      index += 1;
      stringQuote = current;
      mode = 'string';
      continue;
    }
    if (current === '`') {
      codeMask.push(false);
      searchableChars.push(current);
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
        codeMask.push(true);
        searchableChars.push(current);
        index += 1;
        mode = 'template';
        continue;
      }
      interpolationBraceDepths[interpolationBraceDepths.length - 1] -= 1;
    }
    codeMask.push(true);
    searchableChars.push(current);
    index += 1;
  }
  return { codeMask, searchableText: searchableChars.join('') };
}

const DYNAMIC_IMPORT_PATTERN = /(?<![\w$.])import\s*\(\s*["'`]([^"'`]+)["'`]/g;
// eslint-disable-next-line security/detect-unsafe-regex -- scans committed repo source (never remote user input); the optional `.resolve` group overlaps only whitespace runs, so a pathological file only slows a local check
const REQUIRE_PATTERN = /(?<![\w$.])require(?:\s*\.\s*resolve)?\s*\(\s*["'`]([^"'`]+)["'`]/g;
const IMPORT_META_RESOLVE_PATTERN =
  /(?<![\w$.])import\s*\.\s*meta\s*\.\s*resolve\s*\(\s*["'`]([^"'`]+)["'`]/g;
const STATIC_IMPORT_PATTERN =
  // eslint-disable-next-line security/detect-unsafe-regex -- scans committed repo source (never remote user input); the lazy span is bounded by an excluded quote/semicolon class, so a pathological file only slows a local check
  /(?<![\w$.])import\b(?!\s*\()(?!\s*\.)\s*(?:type\s+)?(?:["']([^"']+)["']|[^"';]*?\bfrom\s*["']([^"']+)["'])/g;
// eslint-disable-next-line security/detect-unsafe-regex -- same bounded lazy span over committed repo source as above
const REEXPORT_PATTERN = /(?<![\w$.])export\s*(?:type\s+)?[^"';]*?\bfrom\s*["']([^"']+)["']/g;

/***
 * MARK: extractImportSpecifiers
 * @description Lists every module specifier a source file imports: static
 *   `import`, side-effect, type-only, and multiline imports, `export … from`
 *   re-exports, dynamic `import("x")`, `require("x")` /
 *   `require.resolve("x")`, and `import.meta.resolve("x")`. A match only
 *   counts when its keyword sits in real code (see maskCommentsAndStrings),
 *   and template-literal dynamic imports with interpolation are skipped.
 * @example extractImportSpecifiers('import x from "react";') => ["react"]
 * @param {string} sourceText - the file content to scan.
 * @returns {string[]} The raw specifiers in first-seen order (duplicates kept).
 ***/
export function extractImportSpecifiers(sourceText) {
  const { codeMask, searchableText } = maskCommentsAndStrings(sourceText);
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
  collectMatches(IMPORT_META_RESOLVE_PATTERN, (match) => [match[1]]);
  collectMatches(STATIC_IMPORT_PATTERN, (match) => [match[1], match[2]]);
  collectMatches(REEXPORT_PATTERN, (match) => [match[1]]);
  return specifiers;
}

/***
 * MARK: mapSpecifierToPackageName
 * @description Maps an import specifier to the package.json name that must
 *   declare it (`react-dom/client` → `react-dom`, `@scope/pkg/sub` →
 *   `@scope/pkg`), or null when the specifier never needs a manifest entry:
 *   relative, absolute, `#`-internal, `~`-prefixed, `node:`-prefixed, and
 *   bare Node builtins (including their subpaths, e.g. `fs/promises`), plus
 *   URL-shaped imports. Vite `?raw`-style suffixes are stripped before
 *   mapping.
 * @example mapSpecifierToPackageName("react-dom/client") => "react-dom"
 * @param {string} specifier - the raw import specifier.
 * @returns {string|null} The owning package name, or null when not a bare package import.
 ***/
export function mapSpecifierToPackageName(specifier) {
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
  // A bare builtin subpath (`fs/promises`) resolves in Node exactly like its
  // parent, even where the runtime list omits the subpath spelling — but only
  // when the bare parent is itself a builtin (`test` is not; only `node:test`
  // is, so a bare `test` import still needs a manifest entry).
  if (builtinModuleNames.has(withoutSuffix.split('/')[0])) return null;
  if (withoutSuffix.startsWith('@')) {
    const segments = withoutSuffix.split('/');
    if (segments.length < 2 || segments[1].length === 0) return null;
    return `${segments[0]}/${segments[1]}`;
  }
  const packageName = withoutSuffix.split('/')[0];
  return packageName.length > 0 ? packageName : null;
}

/***
 * MARK: listDependencyNames
 * @description Lists the keys of one manifest dependency section, tolerating
 *   the missing, null, or non-object shapes a hand-edited package.json can
 *   hold (an empty section simply declares nothing).
 * @example listDependencyNames({ react: "^18.0.0" }) => ["react"]
 * @param {*} sectionValue - the dependencies/devDependencies/... value.
 * @returns {string[]} The declared names (empty when the section is absent).
 ***/
function listDependencyNames(sectionValue) {
  if (sectionValue === null || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
    return [];
  }
  return Object.keys(sectionValue);
}

/***
 * MARK: collectSourceFiles
 * @description Lists the bundled-or-executed sources the guardrail scans:
 *   every JS/TS file under `<package>/src` (`.js/.jsx/.ts/.tsx/.mjs/.cjs/
 *   .mts/.cts`, any letter case) plus the root `*.config.{js,cjs,mjs,mts,
 *   cts,ts}` files (vite, vitest, eslint, postcss, tailwind).
 *   `node_modules`/`dist` trees and `scripts/` are excluded — dev-only Node
 *   tooling that never ships; a missing import there fails its own build
 *   step immediately with a Node resolution error, and the slow depcheck
 *   sweep still covers it.
 * @example collectSourceFiles("/repo/frontend").length > 100 => true
 * @param {string} packageDirectoryPath - the package root (owns package.json).
 * @returns {string[]} Absolute file paths in walk order.
 * @throws {Error} When a source directory cannot be listed (a merely missing
 *   directory simply contributes no files).
 ***/
export function collectSourceFiles(packageDirectoryPath) {
  const collected = [];
  const sourceDirectory = path.join(packageDirectoryPath, 'src');
  const walkDirectory = (directoryPath) => {
    let entries;
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw new Error(
        `cannot list ${directoryPath}: ${error.message} — refusing to pass a partially scanned tree`,
      );
    }
    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walkDirectory(fullPath);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        collected.push(fullPath);
      }
    }
  };
  walkDirectory(sourceDirectory);
  let rootEntries;
  try {
    rootEntries = fs.readdirSync(packageDirectoryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return collected;
    throw new Error(
      `cannot list ${packageDirectoryPath}: ${error.message} — refusing to pass a partially scanned tree`,
    );
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
 *   optionalDependencies). Throws when the manifest cannot be read or
 *   parsed: guessing an empty set would either flag the whole tree with a
 *   misleading report or pass a tree that was never checked against reality.
 * @example readDeclaredDependencies("/repo/frontend").has("react") => true
 * @param {string} packageDirectoryPath - the package root (owns package.json).
 * @returns {Set<string>} The declared package names.
 * @throws {Error} When package.json is missing or not valid JSON.
 ***/
export function readDeclaredDependencies(packageDirectoryPath) {
  const manifestPath = path.join(packageDirectoryPath, 'package.json');
  let manifestText;
  try {
    manifestText = fs.readFileSync(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(
      `cannot read ${manifestPath}: ${error.message} — refusing to pass without the dependency manifest`,
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(
      `cannot parse ${manifestPath}: ${error.message} — refusing to pass with a broken manifest`,
    );
  }
  return new Set([
    ...listDependencyNames(manifest.dependencies),
    ...listDependencyNames(manifest.devDependencies),
    ...listDependencyNames(manifest.peerDependencies),
    ...listDependencyNames(manifest.optionalDependencies),
  ]);
}

/***
 * MARK: findViolationsInFiles
 * @description Scans already-collected source files and returns one violation
 *   per (file, package) pair whose bare import has no manifest entry, sorted
 *   by file then package for stable output.
 * @example findViolationsInFiles({ sourceFilePaths: [], declaredDependencies: new Set(), packageDirectoryPath: "/pkg" }) => []
 * @param {Object} options
 * @param {string[]} options.sourceFilePaths - absolute file paths to scan.
 * @param {Set<string>} options.declaredDependencies - manifest package names.
 * @param {string} options.packageDirectoryPath - the package root (owns package.json).
 * @returns {Array<{file: string, specifier: string, packageName: string}>} Violations with package-relative-posix file paths.
 * @throws {Error} When a source file cannot be read.
 ***/
function findViolationsInFiles({ sourceFilePaths, declaredDependencies, packageDirectoryPath }) {
  const seen = new Set();
  const violations = [];
  for (const absolutePath of sourceFilePaths) {
    const relativeFile = path
      .relative(packageDirectoryPath, absolutePath)
      .split(path.sep)
      .join('/');
    let sourceText;
    try {
      sourceText = fs.readFileSync(absolutePath, 'utf8');
    } catch (error) {
      throw new Error(
        `cannot scan ${relativeFile}: ${error.message} — refusing to pass an unscanned file`,
      );
    }
    for (const specifier of extractImportSpecifiers(sourceText)) {
      const packageName = mapSpecifierToPackageName(specifier);
      if (packageName === null) continue;
      if (declaredDependencies.has(packageName)) continue;
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
 * MARK: findUndeclaredImports
 * @description Scans the package sources and returns one violation per
 *   (file, package) pair whose bare import has no manifest entry, sorted by
 *   file then package for stable output. This is the pure scanner: it
 *   reports what it finds (an empty scan yields no violations), while
 *   checkPackageDirectory is the gate entry point that additionally refuses
 *   vacuous passes.
 * @example findUndeclaredImports({ packageDirectoryPath: "/repo/frontend" }) => []
 * @param {Object} options
 * @param {string} options.packageDirectoryPath - the package root (owns package.json).
 * @returns {Array<{file: string, specifier: string, packageName: string}>} Violations with package-relative-posix file paths.
 * @throws {Error} When the manifest or a source file cannot be read.
 ***/
export function findUndeclaredImports({ packageDirectoryPath }) {
  const declaredDependencies = readDeclaredDependencies(packageDirectoryPath);
  const sourceFilePaths = collectSourceFiles(packageDirectoryPath);
  return findViolationsInFiles({ sourceFilePaths, declaredDependencies, packageDirectoryPath });
}

/***
 * MARK: checkPackageDirectory
 * @description Gate entry point over findUndeclaredImports: same violations
 *   plus the scanned-file count and wall time, in the same result shape as
 *   the Settings-duplicate preflight so the gate prints both checks the same
 *   way. Refuses to pass vacuously: a scan that finds zero files throws
 *   instead of reporting clean, so a mistyped --package directory or a
 *   vanished src tree can never go green.
 * @example checkPackageDirectory({ packageDirectoryPath: "/repo/frontend" }).isClean => true
 * @param {Object} options
 * @param {string} options.packageDirectoryPath - the package root (owns package.json).
 * @returns {{isClean: boolean, violationsList: Array, totalFilesScanned: number, durationMilliseconds: number}}
 * @throws {Error} When the manifest or a source file cannot be read, or when
 *   zero files are found.
 ***/
export function checkPackageDirectory({ packageDirectoryPath }) {
  const startMilliseconds = Date.now();
  const declaredDependencies = readDeclaredDependencies(packageDirectoryPath);
  const sourceFilePaths = collectSourceFiles(packageDirectoryPath);
  if (sourceFilePaths.length === 0) {
    throw new Error(
      `scanned 0 files under ${packageDirectoryPath} (expected <package>/src sources or root *.config.* files) — refusing to pass vacuously`,
    );
  }
  const violationsList = findViolationsInFiles({
    sourceFilePaths,
    declaredDependencies,
    packageDirectoryPath,
  });
  return {
    isClean: violationsList.length === 0,
    violationsList,
    totalFilesScanned: sourceFilePaths.length,
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
 * @param {string} [options.installPrefix] - directory shown in the npm install hint.
 * @returns {string} The human-readable failure report.
 ***/
export function formatUndeclaredReport({
  violationsList,
  packageManifestLabel = 'frontend/package.json',
  installPrefix = 'frontend',
}) {
  const lines = violationsList.map(
    (violation) => `   - ${violation.packageName} imported by ${violation.file}`,
  );
  return (
    '❌ Undeclared dependencies: these imports have no matching package.json entry:\n' +
    `${lines.join('\n')}\n` +
    `Add each package to ${packageManifestLabel} in the same commit ` +
    `(npm install <pkg> --prefix ${installPrefix}) so the lockfile stays in sync.`
  );
}

/***
 * MARK: resolvePackageDirectory
 * @description Resolves the `--package <dir>` / `--package=<dir>` CLI
 *   override, defaulting to the package that owns this script (frontend). A
 *   follow-up can point the same script at api or root behind this one flag.
 *   Unknown flags, missing values, and stray positionals throw with the
 *   usage: silently checking the wrong directory would be a false pass.
 * @example resolvePackageDirectory([]) => "/repo/frontend"
 * @param {string[]} cliArgs - process.argv without the node/script prefix.
 * @returns {string} The absolute package directory to check.
 * @throws {Error} On CLI misuse, with CHECK_IMPORTS_DECLARED_USAGE appended.
 ***/
export function resolvePackageDirectory(cliArgs) {
  const equalsForm = cliArgs.find((arg) => arg.startsWith('--package='));
  if (equalsForm !== undefined) {
    const value = equalsForm.slice('--package='.length);
    if (value.length === 0) {
      throw new Error(`Missing value for --package=<dir>.\n${CHECK_IMPORTS_DECLARED_USAGE}`);
    }
    return path.resolve(value);
  }
  const flagIndex = cliArgs.indexOf('--package');
  if (flagIndex !== -1) {
    const value = cliArgs[flagIndex + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`Missing value for --package <dir>.\n${CHECK_IMPORTS_DECLARED_USAGE}`);
    }
    return path.resolve(value);
  }
  // No --package flag above, so any remaining argument is a mistake: name
  // the first one rather than silently checking the default directory.
  const unexpectedArg = cliArgs[0];
  if (unexpectedArg !== undefined) {
    if (unexpectedArg.startsWith('-')) {
      throw new Error(`Unknown flag "${unexpectedArg}".\n${CHECK_IMPORTS_DECLARED_USAGE}`);
    }
    throw new Error(`Unexpected argument "${unexpectedArg}".\n${CHECK_IMPORTS_DECLARED_USAGE}`);
  }
  return defaultPackageDirectory;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const cliArgs = process.argv.slice(2);
  if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
    console.log(CHECK_IMPORTS_DECLARED_USAGE);
    process.exit(0);
  }
  let packageDirectoryPath;
  try {
    packageDirectoryPath = resolvePackageDirectory(cliArgs);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
  const directoryName = path.basename(packageDirectoryPath);
  const packageLabel = directoryName.charAt(0).toUpperCase() + directoryName.slice(1);
  let result;
  try {
    result = checkPackageDirectory({ packageDirectoryPath });
  } catch (error) {
    console.error(`❌ ${packageLabel} imports check failed: ${error.message}`);
    process.exit(1);
  }
  if (!result.isClean) {
    console.error(
      formatUndeclaredReport({
        violationsList: result.violationsList,
        packageManifestLabel: `${directoryName}/package.json`,
        installPrefix: directoryName,
      }),
    );
    process.exit(1);
  }
  console.log(
    `✅ ${packageLabel} imports check passed (${result.totalFilesScanned} files in ${result.durationMilliseconds}ms)`,
  );
}
