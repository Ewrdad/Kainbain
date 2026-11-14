import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const {
  extractImportSpecifiers,
  packageNameFromSpecifier,
  findUndeclaredImports,
  checkPackageDirectory,
  formatUndeclaredReport,
} = await import("../frontend/scripts/check-imports-declared.js");

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const FRONTEND_ROOT = path.join(REPO_ROOT, "frontend");

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

describe("packageNameFromSpecifier", () => {
  it("maps subpath imports to their package", () => {
    assert.equal(packageNameFromSpecifier("react-dom/client"), "react-dom");
    assert.equal(packageNameFromSpecifier("@scope/pkg/sub/deep"), "@scope/pkg");
    assert.equal(packageNameFromSpecifier("mermaid"), "mermaid");
  });

  it("returns null for relative, absolute, and internal specifiers", () => {
    assert.equal(packageNameFromSpecifier("./api.js"), null);
    assert.equal(packageNameFromSpecifier("../services/api"), null);
    assert.equal(packageNameFromSpecifier("/absolute/path.js"), null);
    assert.equal(packageNameFromSpecifier("#internal-alias"), null);
  });

  it("returns null for node builtins with and without the node: prefix", () => {
    assert.equal(packageNameFromSpecifier("node:fs"), null);
    assert.equal(packageNameFromSpecifier("fs"), null);
    assert.equal(packageNameFromSpecifier("node:fs/promises"), null);
  });

  it("strips vite resource query and hash suffixes", () => {
    assert.equal(packageNameFromSpecifier("some-pkg/file?raw"), "some-pkg");
  });
});

describe("findUndeclaredImports on a fixture package", () => {
  function makeFixturePackage({ manifest, files }) {
    const packageDirectoryPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "kainbain-imports-declared-"),
    );
    fs.writeFileSync(
      path.join(packageDirectoryPath, "package.json"),
      JSON.stringify({ name: "fixture", ...manifest }),
    );
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(packageDirectoryPath, relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
    return packageDirectoryPath;
  }

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
});
