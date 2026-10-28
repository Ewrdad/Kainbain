#!/usr/bin/env node
/**
 * MARK: check-no-deprecations
 * @description Runs the real frontend production build (`vite build`), streams
 *   its output through untouched, and then fails the build when the output
 *   contains a deprecation warning — so a regressing plugin or dependency is
 *   caught by `npm run build`, `deploy.sh`, and the Docker image build instead
 *   of silently re-accumulating (see DEPRECATIONS.md). Known warnings can be
 *   accepted temporarily in `deprecation-allowlist.json`, each with a reason
 *   and an expiry date; expired or dateless entries never suppress.
 *
 * The build command can be overridden for tests with `-- <command...>`; the
 * default is the local vite binary with `VITE_DEPRECATION_TRACE=1` so vite
 * attributes each warning to the plugin that set the deprecated option.
 *
 * @example node scripts/check-no-deprecations.js
 * @example node scripts/check-no-deprecations.js -- node -e "console.log('ok')"
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '..');
const allowlistPath = path.join(scriptDirectory, 'deprecation-allowlist.json');

const warningPattern = /deprecat|recommend switching/i;

/**
 * MARK: compileAllowlistPattern
 * @description Compiles one allowlist `pattern` to a RegExp, or null when it
 *   does not compile — a typo'd entry must fail closed (suppress nothing),
 *   never crash the gate with an uncaught SyntaxError.
 * @example compileAllowlistPattern('([ oops') => null
 */
export function compileAllowlistPattern(pattern) {
  try {
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- pattern source is this repo's own allowlist file (reviewed, committed), never user input; invalid input returns null, never throws
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * MARK: findDeprecationWarnings
 * @description Returns the output lines that report a deprecation warning and
 *   are not covered by a live (dated, unexpired) allowlist entry. Entries
 *   whose pattern does not compile are ignored (fail-closed).
 * @example findDeprecationWarnings(['all good'], []) => []
 */
export function findDeprecationWarnings(outputLines, allowlistEntries) {
  const today = new Date().toISOString().slice(0, 10);
  const livePatterns = (allowlistEntries ?? [])
    .filter((entry) => entry?.pattern && entry?.expires && entry.expires >= today)
    .map((entry) => compileAllowlistPattern(entry.pattern))
    .filter((compiled) => compiled !== null);
  return outputLines.filter((line) => {
    if (!warningPattern.test(line)) return false;
    return !livePatterns.some((pattern) => pattern.test(line));
  });
}

/**
 * MARK: loadBuildAllowlist
 * @description Reads `deprecation-allowlist.json` next to this script; a
 *   missing or invalid file means no exceptions (fail-closed), never a crash.
 *   Entries whose pattern does not compile are dropped with a stderr note so
 *   the typo is visible instead of silently suppressing nothing.
 * @example loadBuildAllowlist() => []
 */
export function loadBuildAllowlist() {
  try {
    const parsed = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => {
      if (entry?.pattern && compileAllowlistPattern(entry.pattern) === null) {
        process.stderr.write(
          `check-no-deprecations: ignoring allowlist entry with invalid pattern: ${entry.pattern}\n`,
        );
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * MARK: resolveBuildCommand
 * @description The default build is the workspace-local vite binary (stable
 *   `bin/vite.js` entry, run on the current node so no shell or PATH lookup
 *   is involved). Anything after `--` replaces it (used by the gate tests).
 * @example resolveBuildCommand([]) => { command: '/usr/bin/node', args: ['…/vite.js', 'build'] }
 */
export function resolveBuildCommand(cliArgs) {
  const separator = cliArgs.indexOf('--');
  if (separator !== -1) {
    const [command, ...args] = cliArgs.slice(separator + 1);
    return { command, args };
  }
  return {
    command: process.execPath,
    args: [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
  };
}

/**
 * MARK: runGatedBuild
 * @description Spawns the build, mirrors every output byte to this process's
 *   stdio live, then scans the captured lines for deprecation warnings.
 * @example await runGatedBuild({ command: 'node', args: ['-e', '1'] }, []) => 0
 */
export function runGatedBuild(buildCommand, allowlistEntries) {
  return new Promise((resolve) => {
    const child = spawn(buildCommand.command, buildCommand.args, {
      cwd: frontendRoot,
      env: { ...process.env, VITE_DEPRECATION_TRACE: '1' },
    });
    const capturedLines = [];
    const mirror = (chunk, target) => {
      target.write(chunk);
      capturedLines.push(chunk.toString());
    };
    child.stdout.on('data', (chunk) => mirror(chunk, process.stdout));
    child.stderr.on('data', (chunk) => mirror(chunk, process.stderr));
    child.on('error', (error) => {
      process.stderr.write(`check-no-deprecations: cannot start the build: ${error.message}\n`);
      resolve(1);
    });
    child.on('close', (status) => {
      if (status !== 0) {
        resolve(status ?? 1);
        return;
      }
      const warnings = findDeprecationWarnings(
        capturedLines.join('').split('\n'),
        allowlistEntries,
      );
      if (warnings.length > 0) {
        process.stderr.write(
          `check-no-deprecations: ${warnings.length} deprecation warning(s) in the build output:\n` +
            warnings.map((line) => `  - ${line.trim()}\n`).join('') +
            'Fix the warning (preferred) or add a dated entry to frontend/scripts/deprecation-allowlist.json.\n',
        );
        resolve(1);
        return;
      }
      resolve(0);
    });
  });
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const status = await runGatedBuild(
    resolveBuildCommand(process.argv.slice(2)),
    loadBuildAllowlist(),
  );
  process.exit(status);
}
