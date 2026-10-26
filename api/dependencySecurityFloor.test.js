import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MARK: Dependency security floor
 * @description Fails loudly when a dependency with a resolved SecObserve
 *   finding drifts below its patched version. The current floors are the
 *   2026-10-25 SecObserve set for product kainbain: undici >= 8.12.2
 *   (#211846/#211847/#211848), brace-expansion >= 5.0.12 on the 5.x line
 *   (#147021/#147022/#147023), fastify >= 5.12.6 (#152474/#205893), and
 *   fast-uri >= 4.2.3 / >= 3.1.9 on its 4.x / 3.x lines (#147024/#147025,
 *   #211842-#211845). The undici and brace-expansion floors are carried by
 *   the `overrides` in api/package.json; they can move the nested copies
 *   under @earendil-works/pi-coding-agent since 1.1.0, the first pi release
 *   without an npm-shrinkwrap.json pinning its nested copies (pinned here
 *   at 1.2.0: 1.1.0's real SDK import is broken upstream) (0.86.0's
 *   shrinkwrap pinned brace-expansion 5.0.9 / undici 8.10.2 and parent
 *   overrides could not move them). Every installed copy in the api tree
 *   is checked, so a second nested copy re-introducing a vulnerable version
 *   fails the suite instead of silently regressing.
 * @example undici 8.12.1 installed => test fails, pointing at SecObserve #211846
 */

const apiDirectory = dirname(fileURLToPath(import.meta.url));

const securityFloors = {
	"undici": { minimum: "8.12.2", finding: "SecObserve #211846/#211847/#211848" },
	"brace-expansion": { minimum: "5.0.12", finding: "SecObserve #147021/#147022/#147023" },
	"fastify": { minimum: "5.12.6", finding: "SecObserve #152474/#205893" },
};

// fast-uri ships patched fixes per major line, so its floor is per-major.
const fastUriFloorsByMajor = { 2: "2.4.8", 3: "3.1.9", 4: "4.2.3" };

function isAtLeast(installed, minimum) {
	const toParts = (version) => version.split(".").map((part) => parseInt(part, 10));
	const have = toParts(installed);
	const need = toParts(minimum);
	for (let index = 0; index < need.length; index += 1) {
		if (have[index] > need[index]) return true;
		if (have[index] < need[index]) return false;
	}
	return true;
}

function findInstalledCopies(packageName) {
	const found = [];
	const walk = (directory) => {
		let entries;
		try {
			entries = readdirSync(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const fullPath = join(directory, entry.name);
			if (entry.name === packageName) {
				const manifestPath = join(fullPath, "package.json");
				if (existsSync(manifestPath)) {
					const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
					found.push({ location: fullPath, version: manifest.version });
				}
				continue;
			}
			if (entry.name === ".bin" || entry.name === ".cache") continue;
			walk(fullPath);
		}
	};
	walk(join(apiDirectory, "node_modules"));
	return found;
}

describe("dependency security floor (SecObserve resolved set)", () => {
	for (const [packageName, floor] of Object.entries(securityFloors)) {
		it(`installs ${packageName} at or above ${floor.minimum} (${floor.finding})`, () => {
			const copies = findInstalledCopies(packageName);
			expect(copies.length).toBeGreaterThan(0);
			for (const copy of copies) {
				expect(
					isAtLeast(copy.version, floor.minimum),
					`${packageName}@${copy.version} at ${copy.location} is below floor ${floor.minimum} (${floor.finding})`,
				).toBe(true);
			}
		});
	}

	it("installs fast-uri at or above its per-major floors (SecObserve #147024/#147025/#211842-#211845)", () => {
		const copies = findInstalledCopies("fast-uri");
		expect(copies.length).toBeGreaterThan(0);
		for (const copy of copies) {
			const major = parseInt(copy.version.split(".")[0], 10);
			const minimum = fastUriFloorsByMajor[major];
			expect(
				minimum !== undefined && isAtLeast(copy.version, minimum),
				`fast-uri@${copy.version} at ${copy.location} is below floor ${minimum ?? "(no patched floor for this major)"}`,
			).toBe(true);
		}
	});

	it("pins the overrides in api/package.json at or above the floors", () => {
		const manifest = JSON.parse(readFileSync(join(apiDirectory, "package.json"), "utf8"));
		const undiciRanges = [
			manifest.overrides?.["undici"],
			manifest.overrides?.["@earendil-works/pi-coding-agent"]?.["undici"],
		];
		const braceRanges = [
			manifest.overrides?.["brace-expansion"],
			manifest.overrides?.["@earendil-works/pi-coding-agent"]?.["brace-expansion"],
		];
		expect([...undiciRanges, ...braceRanges].every(Boolean)).toBe(true);
		for (const range of undiciRanges) {
			expect(isAtLeast(range.replace(/^[^\d]*/, ""), "8.12.2")).toBe(true);
		}
		for (const range of braceRanges) {
			expect(isAtLeast(range.replace(/^[^\d]*/, ""), "5.0.12")).toBe(true);
		}
		expect(
			isAtLeast((manifest.dependencies?.["fastify"] ?? "").replace(/^[^\d]*/, ""), "5.12.6"),
		).toBe(true);
	});
});
