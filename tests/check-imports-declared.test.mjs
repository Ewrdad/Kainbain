import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const {
  extractImportSpecifiers,
  mapSpecifierToPackageName,
  findUndeclaredImports,
  checkPackageDirectory,
  formatUndeclaredReport,
  readDeclaredDependencies,
  resolvePackageDirectory,
} = await import("../frontend/scripts/check-imports-declared.js");

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const FRONTEND_ROOT = path.join(REPO_ROOT, "frontend");
const CHECK_SCRIPT = path.join(
  FRONTEND_ROOT,
  "scripts",
  "check-imports-declared.js",
);

function makeFixturePackage({ manifest, files }) {
  const packageDirectoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "kainbain-imports-declared-"),
  );
  if (manifest !== null) {
    fs.writeFileSync(
      path.join(packageDirectoryPath, "package.json"),
      typeof manifest === "string"
        ? manifest
        : JSON.stringify({ name: "fixture", ...manifest }),
    );
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(packageDirectoryPath, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return packageDirectoryPath;
}

function removeFixturePackage(packageDirectoryPath) {
  fs.rmSync(packageDirectoryPath, { recursive: true, force: true });
}

/***
 * MARK: check-imports-declared tests
 * @description Hermetic tests for the fast dependency-manifest guardrail
 *   (`frontend/scripts/check-imports-declared.js`): the case-study failure
 *   was an undeclared dynamic `import("mermaid")` that sailed through every
 *   cheap stage and then failed the expensive ones (Frontend Build, depcheck,
 *   a 1500s canary timeout, publish). The scanner tests prove every import
 *   form is detected and comment/string lookalikes are ignored; the fixture
 *   tests prove an undeclared import fails with the file and package named
 *   while declared deps pass; the contract tests pin the gate ordering (the
 *   check runs before the frontend production build) and the clean real tree.
 * @example run `node --test tests/check-imports-declared.test.mjs`
 ***/

describe("extractImportSpecifiers", () => {
  it("finds static, side-effect, type-only, and re-export forms", () => {
    const source = [
      'import React from "react";',
      "import { useState } from 'react';",
      'import "regenerator-runtime/runtime";',
      'import type { Config } from "vite";',
      'export { api } from "./api.js";',
      'export * from "@scope/pkg/sub";',
    ].join("\n");
    assert.deepEqual(
      extractImportSpecifiers(source).sort(),
      [
        "./api.js",
        "@scope/pkg/sub",
        "react",
        "react",
        "regenerator-runtime/runtime",
        "vite",
      ].sort(),
    );
  });

  it("finds dynamic import() and require() with single, double, and template quotes", () => {
    const source = [
      'const mermaid = await import("mermaid");',
      "const legacy = require('left-pad');",
      "const sub = await import(`react-dom/client`);",
    ].join("\n");
    assert.deepEqual(
      extractImportSpecifiers(source).sort(),
      ["left-pad", "mermaid", "react-dom/client"].sort(),
    );
  });

  it("ignores import lookalikes inside comments", () => {
    const source = [
      '// const late = await import("commented-out-pkg");',
      "/* import ghost from 'block-commented-pkg'; */",
      "/**",
      ' * Builds a lookup from "filePath|side|line" for the renderer.',
      ' * Falls back from "unloaded unknown" when the entry is absent.',
      " */",
      'import real from "react";',
    ].join("\n");
    assert.deepEqual(extractImportSpecifiers(source), ["react"]);
  });

  it("ignores import lookalikes inside string literals", () => {
    const source = [
      'const hint = \'convert from "a" to "b"\';',
      'const docs = "run import(\\"some-pkg\\") to load it";',
      "const tpl = `dynamic import('node:…') flakes under happy-dom`;",
      'import real from "react";',
    ].join("\n");
    assert.deepEqual(extractImportSpecifiers(source), ["react"]);
  });

  it("finds multiline static imports", () => {
    const source = ["import {", "  a,", "  b,", '} from "multiline-pkg";'].join(
      "\n",
    );
    assert.deepEqual(extractImportSpecifiers(source), ["multiline-pkg"]);
  });
});

describe("mapSpecifierToPackageName", () => {
  it("maps subpath imports to their package", () => {
    assert.equal(mapSpecifierToPackageName("react-dom/client"), "react-dom");
    assert.equal(mapSpecifierToPackageName("@scope/pkg/sub/deep"), "@scope/pkg");
    assert.equal(mapSpecifierToPackageName("mermaid"), "mermaid");
  });

  it("returns null for relative, absolute, and internal specifiers", () => {
    assert.equal(mapSpecifierToPackageName("./api.js"), null);
    assert.equal(mapSpecifierToPackageName("../services/api"), null);
    assert.equal(mapSpecifierToPackageName("/absolute/path.js"), null);
    assert.equal(mapSpecifierToPackageName("#internal-alias"), null);
  });

  it("returns null for node builtins with and without the node: prefix", () => {
    assert.equal(mapSpecifierToPackageName("node:fs"), null);
    assert.equal(mapSpecifierToPackageName("fs"), null);
    assert.equal(mapSpecifierToPackageName("node:fs/promises"), null);
  });

  it("strips vite resource query and hash suffixes", () => {
    assert.equal(mapSpecifierToPackageName("some-pkg/file?raw"), "some-pkg");
  });
});

describe("findUndeclaredImports on a fixture package", () => {
  it("fails the case-study shape: dynamic import() of an undeclared package", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: { react: "^18.0.0" } },
      files: {
        "src/components/MarkdownViewer.jsx": [
          'import React from "react";',
          'const mermaid = await import("some-undeclared-pkg");',
        ].join("\n"),
      },
    });
    try {
      const result = checkPackageDirectory({ packageDirectoryPath });
      assert.equal(result.isClean, false);
      assert.equal(result.violationsList.length, 1);
      assert.equal(result.violationsList[0].packageName, "some-undeclared-pkg");
      assert.match(result.violationsList[0].file, /MarkdownViewer\.jsx/);
      const report = formatUndeclaredReport({
        violationsList: result.violationsList,
      });
      assert.match(report, /some-undeclared-pkg/);
      assert.match(report, /MarkdownViewer\.jsx/);
    } finally {
      fs.rmSync(packageDirectoryPath, { recursive: true, force: true });
    }
  });

  it("passes declared, builtin, and relative imports", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: {
        dependencies: { mermaid: "^12.0.0" },
        devDependencies: { vitest: "^5.0.0" },
      },
      files: {
        "src/components/MarkdownViewer.jsx": [
          'import { helper } from "../util/helper.js";',
          'const mermaid = await import("mermaid");',
          'export * from "./shapes.js";',
        ].join("\n"),
        "src/util/helper.js":
          'import path from "node:path";\nexport const helper = 1;\n',
        "src/util/helper.test.js": 'import { it } from "vitest";\n',
      },
    });
    try {
      const result = checkPackageDirectory({ packageDirectoryPath });
      assert.equal(result.isClean, true);
      assert.deepEqual(result.violationsList, []);
      assert.ok(result.totalFilesScanned >= 3);
    } finally {
      fs.rmSync(packageDirectoryPath, { recursive: true, force: true });
    }
  });

  it("reports every violating file, deduplicated per file and package", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: {} },
      files: {
        "src/a.js":
          'import x from "ghost-pkg";\nimport y from "ghost-pkg/sub";\n',
        "src/b.js": 'const z = await import("other-ghost");\n',
      },
    });
    try {
      const violations = findUndeclaredImports({ packageDirectoryPath });
      assert.deepEqual(
        violations
          .map((violation) => `${violation.file}:${violation.packageName}`)
          .sort(),
        ["src/a.js:ghost-pkg", "src/b.js:other-ghost"],
      );
    } finally {
      fs.rmSync(packageDirectoryPath, { recursive: true, force: true });
    }
  });
});

describe("extractImportSpecifiers edge forms", () => {
  it("finds require.resolve, import.meta.resolve, backtick require, and import-equals", () => {
    const source = [
      'const resolved = require.resolve("resolve-pkg");',
      'const meta = import.meta.resolve("meta-pkg");',
      "const legacy = require(`backtick-pkg`);",
      'import equalsForm = require("equals-pkg");',
    ].join("\n");
    assert.deepEqual(
      extractImportSpecifiers(source).sort(),
      ["backtick-pkg", "equals-pkg", "meta-pkg", "resolve-pkg"].sort(),
    );
  });

  it("skips template-literal dynamic imports with interpolation", () => {
    const source = [
      "const name = condition ? `real/${variant}` : `real/other`;",
      "const lazy = await import(`some-pkg/${name}`);",
      'import real from "react";',
    ].join("\n");
    assert.deepEqual(extractImportSpecifiers(source), ["react"]);
  });

  it("finds imports split by comments or newlines", () => {
    const source = [
      'const chunked = import(/* webpackChunkName: "lazy" */ "comment-between-pkg");',
      'import split from /* inline */ "comment-from-pkg";',
      'const beforeParen = import /* chunk */ ("comment-before-paren-pkg");',
      "const lazy = await import(",
      '  "multiline-dynamic-pkg",',
      ");",
    ].join("\n");
    assert.deepEqual(
      extractImportSpecifiers(source).sort(),
      [
        "comment-before-paren-pkg",
        "comment-between-pkg",
        "comment-from-pkg",
        "multiline-dynamic-pkg",
      ].sort(),
    );
  });

  it("finds type re-exports and import attributes", () => {
    const source = [
      'export type * from "type-star-pkg";',
      'import data from "attributes-pkg" with { type: "json" };',
    ].join("\n");
    assert.deepEqual(
      extractImportSpecifiers(source).sort(),
      ["attributes-pkg", "type-star-pkg"].sort(),
    );
  });

  it("ignores method calls and property access shaped like imports", () => {
    const source = [
      'loader.require("method-pkg");',
      "const url = import.meta.url;",
      'import myimport from "myimport-pkg";',
    ].join("\n");
    // Only the genuine static import counts: `loader.require` is a method
    // call (not the module loader), `import.meta` is metadata (not a module),
    // and only the specifier of the `myimport` line is collected.
    assert.deepEqual(extractImportSpecifiers(source), ["myimport-pkg"]);
  });

  it("ignores bare words that merely contain the import keyword", () => {
    const source = [
      "const important = fromNothing;",
      "myimport(fromWalker);",
    ].join("\n");
    assert.deepEqual(extractImportSpecifiers(source), []);
  });
});

describe("mapSpecifierToPackageName edge forms", () => {
  it("returns null for URL-shaped and home-style specifiers", () => {
    assert.equal(mapSpecifierToPackageName("https://example.com/lib.js"), null);
    assert.equal(
      mapSpecifierToPackageName("data:text/javascript,export default 1"),
      null,
    );
    assert.equal(mapSpecifierToPackageName("blob:https://example.com/id"), null);
    assert.equal(mapSpecifierToPackageName("~/alias/path.js"), null);
    assert.equal(mapSpecifierToPackageName("~legacy-alias"), null);
  });

  it("returns null for bare builtin subpaths and malformed scoped names", () => {
    assert.equal(mapSpecifierToPackageName("fs/promises"), null);
    assert.equal(mapSpecifierToPackageName("node:fs/promises"), null);
    assert.equal(mapSpecifierToPackageName("@scope"), null);
    assert.equal(mapSpecifierToPackageName("@scope/"), null);
    assert.equal(mapSpecifierToPackageName(""), null);
  });

  it("treats bare test as a package (only the node: form is a builtin)", () => {
    assert.equal(mapSpecifierToPackageName("node:test"), null);
    assert.equal(mapSpecifierToPackageName("test"), "test");
  });
});

describe("resolvePackageDirectory", () => {
  it("defaults to the frontend package that owns the script", () => {
    assert.equal(resolvePackageDirectory([]), FRONTEND_ROOT);
  });

  it("accepts --package <dir> and --package=<dir>", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: {} },
      files: {},
    });
    try {
      assert.equal(
        resolvePackageDirectory(["--package", packageDirectoryPath]),
        packageDirectoryPath,
      );
      assert.equal(
        resolvePackageDirectory([`--package=${packageDirectoryPath}`]),
        packageDirectoryPath,
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("rejects a missing --package value instead of silently checking frontend", () => {
    assert.throws(
      () => resolvePackageDirectory(["--package"]),
      /Missing value for --package/,
    );
    assert.throws(
      () => resolvePackageDirectory(["--package="]),
      /Missing value for --package/,
    );
    assert.throws(
      () => resolvePackageDirectory(["--package", "--other"]),
      /Missing value for --package/,
    );
  });

  it("rejects unknown flags and positionals instead of silently ignoring them", () => {
    assert.throws(
      () => resolvePackageDirectory(["--nope"]),
      /Unknown flag "--nope"/,
    );
    assert.throws(
      () => resolvePackageDirectory(["somepositional"]),
      /Unexpected argument "somepositional"/,
    );
  });
});

describe("readDeclaredDependencies failure modes", () => {
  it("throws naming the manifest when package.json is missing", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: null,
      files: { "src/a.js": 'import x from "react";\n' },
    });
    try {
      assert.throws(
        () => readDeclaredDependencies(packageDirectoryPath),
        /cannot read .*package\.json/,
      );
      assert.throws(
        () => findUndeclaredImports({ packageDirectoryPath }),
        /package\.json/,
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("throws naming the manifest when package.json is not valid JSON", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: "{ not valid json",
      files: { "src/a.js": 'import x from "react";\n' },
    });
    try {
      assert.throws(
        () => readDeclaredDependencies(packageDirectoryPath),
        /cannot parse .*package\.json/,
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("reads a manifest with a byte-order mark and tolerates empty dep sections", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest:
        String.fromCharCode(0xfeff) +
        JSON.stringify({
          name: "fixture",
          dependencies: { react: "^18.0.0" },
          devDependencies: null,
        }),
      files: { "src/a.js": 'import x from "react";\n' },
    });
    try {
      const declared = readDeclaredDependencies(packageDirectoryPath);
      assert.ok(declared.has("react"));
      assert.deepEqual(findUndeclaredImports({ packageDirectoryPath }), []);
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });
});

describe("checkPackageDirectory failure modes", () => {
  it("refuses to pass vacuously when no source files are found", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: {} },
      files: {},
    });
    try {
      assert.throws(
        () => checkPackageDirectory({ packageDirectoryPath }),
        /scanned 0 files/,
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("names the file it cannot scan instead of crashing with a raw error", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: {} },
      files: { "src/ok.js": "export const ok = 1;\n" },
    });
    try {
      fs.symlinkSync(
        path.join(packageDirectoryPath, "src", "does-not-exist.js"),
        path.join(packageDirectoryPath, "src", "broken.js"),
      );
      assert.throws(
        () => findUndeclaredImports({ packageDirectoryPath }),
        /cannot scan src\/broken\.js/,
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });
});

describe("findUndeclaredImports coverage", () => {
  it("scans root config files as well as src/", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { devDependencies: { vite: "^8.0.0" } },
      files: {
        "src/a.js": "export const a = 1;\n",
        "vite.config.js": [
          'import { defineConfig } from "vite";',
          'import ghost from "ghost-config-pkg";',
        ].join("\n"),
      },
    });
    try {
      const violations = findUndeclaredImports({ packageDirectoryPath });
      assert.deepEqual(
        violations.map(
          (violation) => `${violation.file}:${violation.packageName}`,
        ),
        ["vite.config.js:ghost-config-pkg"],
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("ignores non-source files and node_modules/dist trees under src/", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: {} },
      files: {
        "src/a.js": "export const a = 1;\n",
        "src/notes.txt": 'import ghost from "ghost-txt-pkg";\n',
        "src/node_modules/ghost/index.js":
          'import ghost from "ghost-nested-pkg";\n',
        "src/dist/bundle.js": 'import ghost from "ghost-dist-pkg";\n',
      },
    });
    try {
      assert.deepEqual(findUndeclaredImports({ packageDirectoryPath }), []);
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("scans .mts/.cts modules and uppercase extensions", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: {} },
      files: {
        "src/mod.mts": 'import ghost from "ghost-mts-pkg";\n',
        "src/other.CTS": 'import ghost from "ghost-cts-pkg";\n',
      },
    });
    try {
      const violations = findUndeclaredImports({ packageDirectoryPath });
      assert.deepEqual(
        violations
          .map((violation) => `${violation.file}:${violation.packageName}`)
          .sort(),
        ["src/mod.mts:ghost-mts-pkg", "src/other.CTS:ghost-cts-pkg"],
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("sorts violations by file then package for stable output", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: {} },
      files: {
        "src/z.js": 'import b from "b-pkg";\nimport a from "a-pkg";\n',
        "src/a.js": 'import c from "c-pkg";\n',
      },
    });
    try {
      const violations = findUndeclaredImports({ packageDirectoryPath });
      assert.deepEqual(
        violations.map(
          (violation) => `${violation.file}:${violation.packageName}`,
        ),
        ["src/a.js:c-pkg", "src/z.js:a-pkg", "src/z.js:b-pkg"],
      );
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });
});

describe("formatUndeclaredReport", () => {
  it("names the owning manifest and install prefix in the fix hint", () => {
    const report = formatUndeclaredReport({
      violationsList: [
        { file: "src/a.js", specifier: "ghost", packageName: "ghost" },
      ],
      packageManifestLabel: "api/package.json",
      installPrefix: "api",
    });
    assert.match(report, /ghost imported by src\/a\.js/);
    assert.match(report, /api\/package\.json/);
    assert.match(report, /npm install <pkg> --prefix api/);
  });
});

describe("check CLI end to end", () => {
  it("exits 1 naming the file and package for an undeclared import", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: { react: "^18.0.0" } },
      files: {
        "src/components/MarkdownViewer.jsx": [
          'import React from "react";',
          'const mermaid = await import("some-undeclared-pkg");',
        ].join("\n"),
      },
    });
    try {
      const result = spawnSync(
        process.execPath,
        [CHECK_SCRIPT, "--package", packageDirectoryPath],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /some-undeclared-pkg/);
      assert.match(result.stderr, /MarkdownViewer\.jsx/);
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });

  it("exits 0 on a clean tree and --help prints usage", () => {
    const packageDirectoryPath = makeFixturePackage({
      manifest: { dependencies: { react: "^18.0.0" } },
      files: { "src/a.js": 'import x from "react";\n' },
    });
    try {
      const clean = spawnSync(
        process.execPath,
        [CHECK_SCRIPT, "--package", packageDirectoryPath],
        { encoding: "utf8" },
      );
      assert.equal(clean.status, 0);
      assert.match(clean.stdout, /passed/);
      const help = spawnSync(process.execPath, [CHECK_SCRIPT, "--help"], {
        encoding: "utf8",
      });
      assert.equal(help.status, 0);
      assert.match(help.stdout, /Usage:/);
    } finally {
      removeFixturePackage(packageDirectoryPath);
    }
  });
});

describe("frontend guardrail contract", () => {
  it("the real frontend tree is clean (including the declared mermaid import)", () => {
    const result = checkPackageDirectory({
      packageDirectoryPath: FRONTEND_ROOT,
    });
    assert.deepEqual(result.violationsList, []);
    assert.equal(result.isClean, true);
  });

  it("the frontend build runs the check before vite resolves anything", () => {
    /* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
    const manifest = JSON.parse(
      fs.readFileSync(path.join(FRONTEND_ROOT, "package.json"), "utf8"),
    );
    /* eslint-enable security/detect-non-literal-fs-filename */
    assert.ok(
      manifest.scripts["check:deps"],
      "frontend package.json must define a check:deps script",
    );
    const buildSteps = manifest.scripts.build
      .split("&&")
      .map((step) => step.trim());
    assert.match(
      buildSteps[0],
      /check:deps/,
      "check:deps must be the first step of the frontend build",
    );
  });

  it("the root gate exposes the check and runs it before the overlap window", () => {
    /* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
    const rootManifest = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    );
    const gateSource = fs.readFileSync(
      path.join(REPO_ROOT, "scripts", "run-tests.mjs"),
      "utf8",
    );
    /* eslint-enable security/detect-non-literal-fs-filename */
    assert.ok(
      rootManifest.scripts["check:deps:frontend"],
      "root package.json must define a check:deps:frontend script",
    );
    const preflightIndex = gateSource.indexOf("check-imports-declared");
    assert.ok(
      preflightIndex !== -1,
      "scripts/run-tests.mjs must invoke the imports-declared check",
    );
    assert.ok(
      preflightIndex < gateSource.indexOf("runParallel(fast"),
      "the imports-declared check must run before the overlap window starts",
    );
  });

  it("the gate reports check failures (unreadable manifest, unscanned files) without a stack trace", () => {
    /* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
    const gateSource = fs.readFileSync(
      path.join(REPO_ROOT, "scripts", "run-tests.mjs"),
      "utf8",
    );
    /* eslint-enable security/detect-non-literal-fs-filename */
    assert.ok(
      gateSource.includes("Frontend imports check failed"),
      "scripts/run-tests.mjs must catch check errors and report them as a one-line gate failure",
    );
  });
});
