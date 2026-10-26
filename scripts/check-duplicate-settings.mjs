#!/usr/bin/env node
/***
 * MARK: check-duplicate-settings
 * @description Fast pre-CI gate for duplicate module-level identifiers in the
 *   settings UI components (`frontend/src/components/settings`). Each source
 *   file is parsed with `@babel/parser` (JSX + ES modules); any duplicate
 *   binding (import specifier, variable, function, or class) is reported with
 *   its file, line, column, and identifier name, and the process exits
 *   non-zero so a single identifier collision surfaces in under a second
 *   instead of only after the full Vitest suite has initialised. The incident
 *   that motivated this gate: task-efa802a6 redeclared `splitReasoning` in
 *   `ModelAliasesSection.jsx`, which broke four frontend test files only after
 *   the 100s+ unit suite had already started.
 * @example node scripts/check-duplicate-settings.mjs
 * @example npm run check:duplicate-settings
 ***/

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

/** Directory names that are never source trees (build output, VCS, deps). */
const SKIP_DIRECTORY_NAMES = new Set(["node_modules", "dist", ".git", "coverage"]);

/** File extensions treated as JavaScript/JSX source. */
const SOURCE_FILE_EXTENSIONS = new Set([".js", ".jsx"]);

/** Matches test/spec files so they are excluded from the scan. */
const TEST_FILE_PATTERN = /\.(test|spec)\./;

/** Default settings directory, relative to the repo root. */
const SETTINGS_DIRECTORY_RELATIVE_PATH = path.join(
	"frontend",
	"src",
	"components",
	"settings",
);

/**
 * The kinds of problem this gate can report. Every violation carries one of
 * these so callers can branch on the failure mode without parsing strings.
 */
const ERROR_TYPES = {
	/** The same identifier is declared more than once at module scope. */
	DUPLICATE_IDENTIFIER: "DuplicateIdentifier",
	/** The file could not be parsed (e.g. a genuine syntax error). */
	SYNTAX_ERROR: "SyntaxError",
	/** The file could not be read from disk. */
	IO_ERROR: "IOError",
	/** The target directory exists but contains no scannable source files. */
	NO_FILES_FOUND: "NoFilesFound",
	/** The `@babel/parser` dependency is not installed. */
	MISSING_PARSER: "MissingParser",
};

const requireFromFrontend = createRequire(
	path.join(REPO_ROOT, "frontend", "package.json"),
);

/***
 * MARK: loadBabelParser
 * @description Resolves `@babel/parser` from the frontend dependency tree.
 *   Returns `null` (instead of throwing) when the package is not installed so
 *   callers can fail with a clear, actionable message — a missing dependency
 *   must never surface as a raw `MODULE_NOT_FOUND` stack trace.
 * @example const parser = loadBabelParser();
 * @returns {Object|null} The `@babel/parser` module, or null when unavailable.
 ***/
function loadBabelParser() {
	if (loadBabelParser.cachedResult !== undefined) {
		return loadBabelParser.cachedResult;
	}
	try {
		loadBabelParser.cachedResult = requireFromFrontend("@babel/parser");
	} catch {
		loadBabelParser.cachedResult = null;
	}
	return loadBabelParser.cachedResult;
}
loadBabelParser.cachedResult = undefined;

/***
 * MARK: findSourceFilesInDirectory
 * @description Recursively locates all JavaScript/JSX source files within a
 *   directory, excluding test/spec files and build-output directories. Used
 *   to build the list of files the duplicate-identifier gate scans.
 * @example const files = findSourceFilesInDirectory({ directoryPath: './frontend/src/components/settings' });
 * @param {Object} options
 * @param {string} options.directoryPath - Directory to scan recursively.
 * @returns {Array<string>} Sorted list of absolute file paths to scan.
 ***/
export function findSourceFilesInDirectory({ directoryPath } = {}) {
	if (!directoryPath || typeof directoryPath !== "string") {
		throw new Error("findSourceFilesInDirectory requires a directoryPath string.");
	}
	const results = [];
	const rootDirectory = path.resolve(directoryPath);

	const walkDirectory = (currentDirectory) => {
		let directoryEntries;
		try {
			directoryEntries = fs.readdirSync(currentDirectory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of directoryEntries) {
			const entryPath = path.join(currentDirectory, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRECTORY_NAMES.has(entry.name)) continue;
				walkDirectory(entryPath);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
			if (TEST_FILE_PATTERN.test(entry.name)) continue;
			results.push(path.resolve(entryPath));
		}
	};

	walkDirectory(rootDirectory);
	return results.sort();
}

/***
 * MARK: collectBindingPatternIdentifiers
 * @description Flattens a destructuring binding pattern into the identifiers
 *   it declares, so object/array/rest/default bindings are checked too.
 *   Pure helper: reads the AST node, writes into the output array.
 * @example collectBindingPatternIdentifiers({ type: 'Identifier', name: 'x' }, out);
 * @param {Object} bindingPattern - Babel AST binding pattern node.
 * @param {Array<Object>} outputIdentifiers - Accumulator of identifier nodes.
 * @returns {void}
 ***/
function collectBindingPatternIdentifiers(bindingPattern, outputIdentifiers) {
	if (!bindingPattern || typeof bindingPattern !== "object") return;
	switch (bindingPattern.type) {
		case "Identifier":
			outputIdentifiers.push(bindingPattern);
			break;
		case "ObjectPattern":
			for (const property of bindingPattern.properties || []) {
				if (property.type === "RestElement") {
					collectBindingPatternIdentifiers(property.argument, outputIdentifiers);
				} else {
					collectBindingPatternIdentifiers(property.value, outputIdentifiers);
				}
			}
			break;
		case "ArrayPattern":
			for (const element of bindingPattern.elements || []) {
				if (element) collectBindingPatternIdentifiers(element, outputIdentifiers);
			}
			break;
		case "RestElement":
			collectBindingPatternIdentifiers(bindingPattern.argument, outputIdentifiers);
			break;
		case "AssignmentPattern":
			collectBindingPatternIdentifiers(bindingPattern.left, outputIdentifiers);
			break;
		default:
			break;
	}
}

/***
 * MARK: collectTopLevelBindingEntries
 * @description Walks one top-level statement and records every module-scope
 *   identifier it declares (including re-exported declarations), without
 *   descending into nested function or block scopes. Each recorded entry is a
 *   *candidate* binding — it only becomes a violation when a second entry with
 *   the same name is found (see scanSourceForDuplicateIdentifiers).
 * @example collectTopLevelBindingEntries(statement, 'file.jsx', []);
 * @param {Object} statement - A Babel program body statement.
 * @param {string} sourceFilePath - File path used for violation reporting.
 * @param {Array<Object>} outputEntries - Accumulator of `{ identifierName, lineNumber, columnNumber }`.
 * @returns {void}
 ***/
function collectTopLevelBindingEntries(statement, sourceFilePath, outputEntries) {
	if (!statement || typeof statement !== "object") return;

	let declaration = statement;
	if (statement.type === "ExportNamedDeclaration" && statement.declaration) {
		declaration = statement.declaration;
	} else if (statement.type === "ExportDefaultDeclaration") {
		const defaultDeclaration = statement.declaration;
		if (
			defaultDeclaration &&
			(defaultDeclaration.type === "FunctionDeclaration" ||
				defaultDeclaration.type === "ClassDeclaration") &&
			defaultDeclaration.id
		) {
			outputEntries.push({
				filePath: sourceFilePath,
				identifierName: defaultDeclaration.id.name,
				lineNumber: defaultDeclaration.id.loc.start.line,
				columnNumber: defaultDeclaration.id.loc.start.column + 1,
			});
		}
		return;
	}

	switch (declaration.type) {
		case "ImportDeclaration":
			for (const specifier of declaration.specifiers || []) {
				if (specifier.local && specifier.local.type === "Identifier") {
					outputEntries.push({
						filePath: sourceFilePath,
						identifierName: specifier.local.name,
						lineNumber: specifier.local.loc.start.line,
						columnNumber: specifier.local.loc.start.column + 1,
					});
				}
			}
			break;
		case "VariableDeclaration":
			for (const declarator of declaration.declarations || []) {
				const bindings = [];
				collectBindingPatternIdentifiers(declarator.id, bindings);
				for (const binding of bindings) {
					outputEntries.push({
						filePath: sourceFilePath,
						identifierName: binding.name,
						lineNumber: binding.loc.start.line,
						columnNumber: binding.loc.start.column + 1,
					});
				}
			}
			break;
		case "FunctionDeclaration":
		case "ClassDeclaration":
			if (declaration.id && declaration.id.type === "Identifier") {
				outputEntries.push({
					filePath: sourceFilePath,
					identifierName: declaration.id.name,
					lineNumber: declaration.id.loc.start.line,
					columnNumber: declaration.id.loc.start.column + 1,
				});
			}
			break;
		default:
			break;
	}
}

/***
 * MARK: scanSourceForDuplicateIdentifiers
 * @description Inspects JavaScript/JSX source code for duplicate module-level
 *   identifier declarations (imports, variables, functions, classes). Parses
 *   the source with `@babel/parser`; when parsing itself fails (e.g. a
 *   duplicate `const` that the parser rejects), the parse error is reported
 *   as a violation so the gate still catches the problem.
 * @example const result = scanSourceForDuplicateIdentifiers({ sourceCodeText: "import { a } from 'x'; const a = 1;", sourceFilePath: "test.jsx" });
 * @param {Object} options
 * @param {string} options.sourceCodeText - Raw file contents to parse and inspect.
 * @param {string} options.sourceFilePath - File path used for reporting line and column positions.
 * @returns {{ hasViolations: boolean, violationsList: Array<Object> }}
 ***/
export function scanSourceForDuplicateIdentifiers({ sourceCodeText = "", sourceFilePath = "<source>" } = {}) {
	const filePathForReport = sourceFilePath || "<source>";
	const violationsList = [];

	const parser = loadBabelParser();
	if (!parser) {
		violationsList.push({
			filePath: filePathForReport,
			identifierName: null,
			lineNumber: 1,
			columnNumber: 1,
			errorType: ERROR_TYPES.MISSING_PARSER,
			message: "@babel/parser is not installed in the frontend workspace. Run `npm install` in the frontend directory.",
		});
		return { hasViolations: true, violationsList };
	}

	let ast;
	try {
		ast = parser.parse(sourceCodeText, {
			sourceType: "module",
			plugins: ["jsx"],
		});
	} catch (parseError) {
		// The parser itself rejects some duplicates (e.g. `const a; const a;`)
		// with "Identifier 'a' has already been declared". Surface that as a
		// violation so the gate catches it even though we never reach the
		// manual duplicate scan below.
		const message = String(parseError && parseError.message ? parseError.message : parseError);
		const duplicateMatch = message.match(/Identifier '([^']+)' has already been declared/);
		const parseErrorLocation = parseError && parseError.loc ? parseError.loc : {};
		violationsList.push({
			filePath: filePathForReport,
			identifierName: duplicateMatch ? duplicateMatch[1] : null,
			lineNumber: parseErrorLocation.line || 1,
			columnNumber: (parseErrorLocation.column || 0) + 1,
			errorType: duplicateMatch ? ERROR_TYPES.DUPLICATE_IDENTIFIER : ERROR_TYPES.SYNTAX_ERROR,
			message: duplicateMatch
				? `Identifier '${duplicateMatch[1]}' is declared more than once. Rename or remove one declaration.`
				: message,
		});
		return { hasViolations: true, violationsList };
	}

	const collectedEntries = [];
	for (const statement of ast.program && ast.program.body ? ast.program.body : []) {
		collectTopLevelBindingEntries(statement, filePathForReport, collectedEntries);
	}

	const entriesByName = new Map();
	for (const entry of collectedEntries) {
		if (!entriesByName.has(entry.identifierName)) {
			entriesByName.set(entry.identifierName, []);
		}
		entriesByName.get(entry.identifierName).push(entry);
	}

	for (const [identifierName, entries] of entriesByName) {
		if (entries.length <= 1) continue;
		// The first entry is the "original"; every subsequent entry is a
		// duplicate and gets reported with its own location.
		for (let index = 1; index < entries.length; index += 1) {
			const duplicateEntry = entries[index];
			violationsList.push({
				filePath: duplicateEntry.filePath,
				identifierName,
				lineNumber: duplicateEntry.lineNumber,
				columnNumber: duplicateEntry.columnNumber,
				errorType: ERROR_TYPES.DUPLICATE_IDENTIFIER,
				message: `Identifier '${identifierName}' is declared more than once. Rename or remove one declaration.`,
			});
		}
	}

	return {
		hasViolations: violationsList.length > 0,
		violationsList,
	};
}

/***
 * MARK: checkDirectoryForDuplicates
 * @description Scans every source file in a directory tree for duplicate
 *   module-level identifiers. This is the main entry point used by both the
 *   standalone CLI and the test-suite pre-flight. Fails safe: any I/O error,
 *   parse error, or missing-parser condition is reported as a violation so
 *   the gate never silently passes on a broken tree.
 * @example const result = await checkDirectoryForDuplicates({ baseDirectoryPath: process.cwd(), targetDirectoryRelativePath: path.join('frontend', 'src', 'components', 'settings') });
 * @param {Object} options
 * @param {string} options.baseDirectoryPath - Repository root directory path.
 * @param {string} [options.targetDirectoryRelativePath] - Directory to scan, relative to the base. Defaults to the settings components directory.
 * @returns {Promise<{ isClean: boolean, totalFilesScanned: number, violationsList: Array<Object>, durationMilliseconds: number }>}
 ***/
export async function checkDirectoryForDuplicates({
	baseDirectoryPath = REPO_ROOT,
	targetDirectoryRelativePath = SETTINGS_DIRECTORY_RELATIVE_PATH,
} = {}) {
	const startedAtMilliseconds = Date.now();
	const targetDirectoryPath = path.resolve(baseDirectoryPath, targetDirectoryRelativePath);
	const sourceFiles = findSourceFilesInDirectory({ directoryPath: targetDirectoryPath });

	if (sourceFiles.length === 0) {
		const noFilesViolation = {
			filePath: targetDirectoryPath,
			identifierName: null,
			lineNumber: 1,
			columnNumber: 1,
			errorType: ERROR_TYPES.NO_FILES_FOUND,
			message: `No JavaScript/JSX source files found in ${targetDirectoryPath}. The duplicate-identifier gate cannot verify an empty directory — check that the path is correct.`,
		};
		return {
			isClean: false,
			totalFilesScanned: 0,
			violationsList: [noFilesViolation],
			durationMilliseconds: Date.now() - startedAtMilliseconds,
		};
	}

	const allViolations = [];
	for (const sourceFilePath of sourceFiles) {
		let sourceCodeText;
		try {
			sourceCodeText = fs.readFileSync(sourceFilePath, "utf8");
		} catch {
			allViolations.push({
				filePath: sourceFilePath,
				identifierName: null,
				lineNumber: 1,
				columnNumber: 1,
				errorType: ERROR_TYPES.IO_ERROR,
				message: `Could not read ${sourceFilePath}. Check file permissions.`,
			});
			continue;
		}
		const scanResult = scanSourceForDuplicateIdentifiers({
			sourceCodeText,
			sourceFilePath,
		});
		if (scanResult.hasViolations) {
			allViolations.push(...scanResult.violationsList);
		}
	}

	return {
		isClean: allViolations.length === 0,
		totalFilesScanned: sourceFiles.length,
		violationsList: allViolations,
		durationMilliseconds: Date.now() - startedAtMilliseconds,
	};
}

/***
 * MARK: formatViolationsReport
 * @description Builds a human-readable report for a list of violations,
 *   including file, line, column, identifier name, and remediation guidance.
 *   Handles every error type the gate can produce.
 * @example const report = formatViolationsReport({ violationsList });
 * @param {Object} options
 * @param {Array<Object>} options.violationsList - Violations to format.
 * @returns {string} Formatted diagnostic report.
 ***/
export function formatViolationsReport({ violationsList } = {}) {
	const violations = Array.isArray(violationsList) ? violationsList : [];
	if (violations.length === 0) {
		return "No duplicate identifiers found in settings components.";
	}
	const lines = ["Duplicate identifier check failed for settings components:"];
	for (const violation of violations) {
		const location = `${violation.filePath}:${violation.lineNumber}:${violation.columnNumber}`;
		const identifierPart = violation.identifierName ? ` '${violation.identifierName}'` : "";
		const messagePart = violation.message ? ` — ${violation.message}` : "";
		lines.push(`  ${location} -${identifierPart} (${violation.errorType})${messagePart}`);
	}
	lines.push("");
	lines.push(
		"Remediation: rename or remove the duplicate import or declaration so each identifier appears only once in the module.",
	);
	return lines.join("\n");
}

// MARK: CLI entry point
// When run directly (`node scripts/check-duplicate-settings.mjs`), scan the
// settings directory and exit non-zero on any violation.
const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
	const gateResult = await checkDirectoryForDuplicates({
		baseDirectoryPath: REPO_ROOT,
	});
	if (!gateResult.isClean) {
		console.error(formatViolationsReport({ violationsList: gateResult.violationsList }));
		process.exitCode = 1;
	} else {
		console.log(
			`✅ Settings duplicate check passed (${gateResult.totalFilesScanned} files in ${gateResult.durationMilliseconds}ms)`,
		);
	}
}
