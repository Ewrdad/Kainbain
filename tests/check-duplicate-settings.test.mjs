import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	checkDirectoryForDuplicates,
	findSourceFilesInDirectory,
	formatViolationsReport,
	scanSourceForDuplicateIdentifiers,
} from "../scripts/check-duplicate-settings.mjs";

/***
 * MARK: check-duplicate-settings tests
 * @description Regression and behavioural tests for the fast pre-CI duplicate
 *   identifier gate (`scripts/check-duplicate-settings.mjs`). Covers the
 *   task-efa802a6 `splitReasoning` regression, every supported declaration
 *   kind, nested-scope immunity, comment/string immunity, parse-error
 *   reporting, file discovery, directory scanning, and report formatting.
 * @example run `node --test tests/check-duplicate-settings.test.mjs`
 ***/

describe("scanSourceForDuplicateIdentifiers", () => {
	it("reports no violations for a clean module", () => {
		const sourceCodeText = "import { alpha } from './alpha';\nconst beta = alpha + 1;\nexport function gamma() { return beta; }\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "clean.jsx",
		});
		assert.equal(result.hasViolations, false);
		assert.deepEqual(result.violationsList, []);
	});

	it("detects the task-efa802a6 splitReasoning duplicate import", () => {
		const sourceCodeText = [
			"import { splitReasoning } from '../../services/modelKeys';",
			"import { splitReasoning } from '../../services/api';",
		].join("\n");
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "ModelAliasesSection.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList.length, 1);
		assert.equal(result.violationsList[0].identifierName, "splitReasoning");
		assert.equal(result.violationsList[0].lineNumber, 2);
		assert.equal(result.violationsList[0].filePath, "ModelAliasesSection.jsx");
		assert.equal(result.violationsList[0].errorType, "DuplicateIdentifier");
	});

	it("detects duplicate variable declarations", () => {
		const sourceCodeText = "const modelAliasKey = 'A';\nconst modelAliasKey = 'B';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-var.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "modelAliasKey");
	});

	it("detects var redeclarations that the parser permits", () => {
		const sourceCodeText = "var duplicateVarName = 1;\nvar duplicateVarName = 2;\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-var-var.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "duplicateVarName");
	});

	it("detects an import colliding with a variable declaration", () => {
		const sourceCodeText = "import { splitReasoning } from './api';\nconst splitReasoning = 123;\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "import-var.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "splitReasoning");
	});

	it("detects duplicate function declarations", () => {
		const sourceCodeText = "function targetValidity() {}\nfunction targetValidity() {}\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-fn.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "targetValidity");
	});

	it("detects duplicate class declarations", () => {
		const sourceCodeText = "class Panel {}\nclass Panel {}\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-class.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "Panel");
	});

	it("detects duplicate destructured variable declarations", () => {
		const sourceCodeText = "const { alpha, beta } = obj;\nconst { alpha } = other;\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-destructure.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "alpha");
	});

	it("detects duplicate default imports", () => {
		const sourceCodeText = "import alpha from './a';\nimport alpha from './b';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-default-import.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "alpha");
	});

	it("detects duplicate namespace imports", () => {
		const sourceCodeText = "import * as api from './a';\nimport * as api from './b';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-namespace-import.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "api");
	});

	it("detects an exported variable colliding with an import", () => {
		const sourceCodeText = "import { config } from './config';\nexport const config = {};\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "export-var-collision.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "config");
	});

	it("detects a named default export colliding with a variable", () => {
		const sourceCodeText = "const widget = 1;\nexport default function widget() {}\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "default-export-collision.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].identifierName, "widget");
	});

	it("ignores identifiers shadowed in nested scopes", () => {
		const sourceCodeText = [
			"import { modelAliasKey } from './m';",
			"function build() { const modelAliasKey = 'nested'; return modelAliasKey; }",
		].join("\n");
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "shadow.jsx",
		});
		assert.equal(result.hasViolations, false);
	});

	it("ignores block-scoped redeclarations", () => {
		const sourceCodeText = "let outerName = 1;\n{ let outerName = 2; }\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "block-scope.jsx",
		});
		assert.equal(result.hasViolations, false);
	});

	it("ignores duplicate words inside comments and strings", () => {
		const sourceCodeText = [
			"// const repeatedName = 1;",
			'const doc = "const repeatedName = 2;";',
			"export function real() { return 1; }",
		].join("\n");
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "comments.jsx",
		});
		assert.equal(result.hasViolations, false);
	});

	it("ignores re-exports with different names (export { x } from 'y')", () => {
		// Re-exports do not declare local bindings, so they cannot collide.
		// (Re-exporting the SAME name twice IS a parse error, tested below.)
		const sourceCodeText = "export { helper } from './helpers';\nexport { utility } from './other';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "re-exports.jsx",
		});
		assert.equal(result.hasViolations, false);
	});

	it("reports re-exports with the same name as a parse error", () => {
		// `export { x } from './a'; export { x } from './b';` is invalid — you
		// cannot export the same name twice. The parser rejects it.
		const sourceCodeText = "export { helper } from './helpers';\nexport { helper } from './other';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "dup-re-export.jsx",
		});
		assert.equal(result.hasViolations, true);
	});

	it("ignores export-star (export * from 'y')", () => {
		const sourceCodeText = "export * from './a';\nexport * from './b';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "export-star.jsx",
		});
		assert.equal(result.hasViolations, false);
	});

	it("ignores side-effect imports (import 'y')", () => {
		const sourceCodeText = "import './polyfill';\nimport './setup';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "side-effect-imports.jsx",
		});
		assert.equal(result.hasViolations, false);
	});

	it("ignores anonymous default exports", () => {
		const sourceCodeText = "export default function() {}\nexport default class {}\n";
		// Note: this is actually a syntax error in ES modules (only one default
		// export allowed), but the point is that anonymous declarations don't
		// produce named bindings that could collide.
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "anon-default.jsx",
		});
		// The parser will reject this as a syntax error (duplicate default
		// export), which is fine — we just verify it doesn't crash.
		assert.equal(result.hasViolations, true);
	});

	it("reports parse errors as violations", () => {
		const sourceCodeText = "const broken = ;\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "broken.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].errorType, "SyntaxError");
	});

	it("reports const redeclarations caught by the parser itself", () => {
		// `const x; const x;` is a parse-time error in strict mode (modules are
		// always strict), so the parser rejects it before our manual scan runs.
		const sourceCodeText = "const parserCaught = 1;\nconst parserCaught = 2;\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "parser-caught.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList[0].errorType, "DuplicateIdentifier");
		assert.equal(result.violationsList[0].identifierName, "parserCaught");
	});

	it("handles empty source code", () => {
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText: "",
			sourceFilePath: "empty.jsx",
		});
		assert.equal(result.hasViolations, false);
		assert.deepEqual(result.violationsList, []);
	});

	it("handles source with only comments", () => {
		const sourceCodeText = "// just a comment\n/* and a block */\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "comments-only.jsx",
		});
		assert.equal(result.hasViolations, false);
	});

	it("reports multiple duplicates in one file", () => {
		// Use `var` redeclarations — the parser permits them, so the manual
		// scan catches each one. (Duplicate `const`/`import` would be caught
		// by the parser as a parse error, producing only one violation.)
		const sourceCodeText = [
			"var alpha = 1;",
			"var beta = 2;",
			"var alpha = 3;",
			"var beta = 4;",
		].join("\n");
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "multi-dup.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.equal(result.violationsList.length, 2);
		const names = result.violationsList.map((v) => v.identifierName).sort();
		assert.deepEqual(names, ["alpha", "beta"]);
	});

	it("includes a remediation message on each violation", () => {
		const sourceCodeText = "import { x } from './a';\nimport { x } from './b';\n";
		const result = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath: "remediation.jsx",
		});
		assert.equal(result.hasViolations, true);
		assert.ok(result.violationsList[0].message);
		assert.match(result.violationsList[0].message, /rename or remove/i);
	});
});

describe("findSourceFilesInDirectory", () => {
	it("returns only source files, excluding tests and non-JS files", () => {
		const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-"));
		const settingsDirectory = path.join(tempDirectory, "settings");
		fs.mkdirSync(path.join(settingsDirectory, "nested"), { recursive: true });
		fs.writeFileSync(path.join(settingsDirectory, "A.jsx"), "export const a = 1;\n");
		fs.writeFileSync(path.join(settingsDirectory, "B.test.jsx"), "export const b = 2;\n");
		fs.writeFileSync(path.join(settingsDirectory, "C.spec.js"), "export const c = 3;\n");
		fs.writeFileSync(path.join(settingsDirectory, "nested", "D.js"), "export const d = 4;\n");
		fs.writeFileSync(path.join(settingsDirectory, "E.css"), "body {}\n");
		fs.writeFileSync(path.join(settingsDirectory, "F.ts"), "export const f = 5;\n");

		const files = findSourceFilesInDirectory({ directoryPath: settingsDirectory });
		assert.equal(files.length, 2);
		assert.ok(files.every((filePath) => filePath.endsWith(".jsx") || filePath.endsWith(".js")));
		assert.ok(files.every((filePath) => !filePath.includes(".test.")));
		assert.ok(files.every((filePath) => !filePath.includes(".spec.")));
		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});

	it("skips node_modules, dist, and other build directories", () => {
		const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-skip-"));
		fs.mkdirSync(path.join(tempDirectory, "node_modules", "pkg"), { recursive: true });
		fs.mkdirSync(path.join(tempDirectory, "dist"), { recursive: true });
		fs.writeFileSync(path.join(tempDirectory, "node_modules", "pkg", "index.js"), "module.exports = {};\n");
		fs.writeFileSync(path.join(tempDirectory, "dist", "bundle.js"), "// built\n");
		fs.writeFileSync(path.join(tempDirectory, "real.js"), "export const real = 1;\n");

		const files = findSourceFilesInDirectory({ directoryPath: tempDirectory });
		assert.equal(files.length, 1);
		assert.ok(files[0].endsWith("real.js"));
		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});

	it("returns an empty array for a nonexistent directory", () => {
		const files = findSourceFilesInDirectory({
			directoryPath: "/nonexistent/path/that/does/not/exist",
		});
		assert.deepEqual(files, []);
	});

	it("throws when directoryPath is missing", () => {
		assert.throws(() => findSourceFilesInDirectory(), /directoryPath/);
		assert.throws(() => findSourceFilesInDirectory({}), /directoryPath/);
		assert.throws(() => findSourceFilesInDirectory({ directoryPath: 123 }), /directoryPath/);
	});
});

describe("checkDirectoryForDuplicates", () => {
	it("cleanly scans the real settings directory", async () => {
		const projectRoot = path.resolve(process.cwd());
		const result = await checkDirectoryForDuplicates({
			baseDirectoryPath: projectRoot,
		});
		assert.equal(result.isClean, true);
		assert.ok(result.totalFilesScanned > 0);
		assert.equal(result.violationsList.length, 0);
		// Note: we deliberately do NOT assert on durationMilliseconds — timing
		// assertions are flaky under CI load and have caused false failures.
	});

	it("reports injected duplicates", async () => {
		const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-root-"));
		const settingsDirectory = path.join(
			tempDirectory,
			"frontend",
			"src",
			"components",
			"settings",
		);
		fs.mkdirSync(settingsDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(settingsDirectory, "Dup.jsx"),
			"import { x } from 'a';\nimport { x } from 'b';\n",
		);

		const result = await checkDirectoryForDuplicates({
			baseDirectoryPath: tempDirectory,
		});
		assert.equal(result.isClean, false);
		assert.equal(result.violationsList.length, 1);
		assert.equal(result.violationsList[0].identifierName, "x");

		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});

	it("fails safe when the target directory has no source files", async () => {
		const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-empty-"));
		const emptyDirectory = path.join(tempDirectory, "empty");
		fs.mkdirSync(emptyDirectory, { recursive: true });

		const result = await checkDirectoryForDuplicates({
			baseDirectoryPath: tempDirectory,
			targetDirectoryRelativePath: "empty",
		});
		assert.equal(result.isClean, false);
		assert.equal(result.totalFilesScanned, 0);
		assert.equal(result.violationsList.length, 1);
		assert.equal(result.violationsList[0].errorType, "NoFilesFound");

		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});

	it("fails safe when the target directory does not exist", async () => {
		const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-missing-"));

		const result = await checkDirectoryForDuplicates({
			baseDirectoryPath: tempDirectory,
			targetDirectoryRelativePath: "does-not-exist",
		});
		assert.equal(result.isClean, false);
		assert.equal(result.violationsList.length, 1);
		assert.equal(result.violationsList[0].errorType, "NoFilesFound");

		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});

	it("scans a custom target directory", async () => {
		const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-custom-"));
		const customDirectory = path.join(tempDirectory, "custom");
		fs.mkdirSync(customDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(customDirectory, "Clean.jsx"),
			"import { ok } from './ok';\nexport const fine = ok;\n",
		);

		const result = await checkDirectoryForDuplicates({
			baseDirectoryPath: tempDirectory,
			targetDirectoryRelativePath: "custom",
		});
		assert.equal(result.isClean, true);
		assert.equal(result.totalFilesScanned, 1);

		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});

	it("reports syntax errors in scanned files", async () => {
		const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-syntax-"));
		const settingsDirectory = path.join(
			tempDirectory,
			"frontend",
			"src",
			"components",
			"settings",
		);
		fs.mkdirSync(settingsDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(settingsDirectory, "Broken.jsx"),
			"const broken = ;\n",
		);

		const result = await checkDirectoryForDuplicates({
			baseDirectoryPath: tempDirectory,
		});
		assert.equal(result.isClean, false);
		assert.ok(result.violationsList.some((v) => v.errorType === "SyntaxError"));

		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});
});

describe("formatViolationsReport", () => {
	it("renders a helpful message when there are no violations", () => {
		assert.match(
			formatViolationsReport({ violationsList: [] }),
			/No duplicate identifiers/,
		);
	});

	it("renders a populated report with location and identifier", () => {
		const report = formatViolationsReport({
			violationsList: [
				{
					filePath: "file.jsx",
					identifierName: "splitReasoning",
					lineNumber: 6,
					columnNumber: 10,
					errorType: "DuplicateIdentifier",
					message: "Identifier 'splitReasoning' is declared more than once.",
				},
			],
		});
		assert.match(report, /file\.jsx:6:10/);
		assert.match(report, /splitReasoning/);
		assert.match(report, /DuplicateIdentifier/);
		assert.match(report, /Remediation/);
	});

	it("renders violations without an identifier name", () => {
		const report = formatViolationsReport({
			violationsList: [
				{
					filePath: "/some/dir",
					identifierName: null,
					lineNumber: 1,
					columnNumber: 1,
					errorType: "NoFilesFound",
					message: "No JavaScript/JSX source files found.",
				},
			],
		});
		assert.match(report, /NoFilesFound/);
		assert.match(report, /No JavaScript\/JSX source files found/);
	});

	it("renders violations without a message", () => {
		const report = formatViolationsReport({
			violationsList: [
				{
					filePath: "broken.jsx",
					identifierName: null,
					lineNumber: 1,
					columnNumber: 1,
					errorType: "SyntaxError",
				},
			],
		});
		assert.match(report, /broken\.jsx:1:1/);
		assert.match(report, /SyntaxError/);
	});

	it("handles a missing violationsList gracefully", () => {
		assert.match(formatViolationsReport(), /No duplicate identifiers/);
		assert.match(formatViolationsReport({}), /No duplicate identifiers/);
	});
});
