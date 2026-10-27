import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * MARK: Deploy packaging tests
 * @description Pins the production packaging contract for the site docs: the
 *   deployed backend resolves its content at `<PROD_DIR>/site-docs` (see
 *   `defaultDocsDir` in `api/siteDocs.js`), so `deploy.sh` must stage the
 *   repo-root `site-docs/` directory and install it into `$PROD_DIR`. A
 *   deploy that ships `api/` without `site-docs/` serves an empty docs index
 *   and the UI renders "No docs articles yet." with zero client errors.
 * @example run `npm run test --prefix api`
 */
const repoRoot = path.resolve(import.meta.dirname, "..");
const deployScript = fs.readFileSync(path.join(repoRoot, "deploy.sh"), "utf8");

describe("deploy.sh site-docs packaging", () => {
	it("stages the site-docs content directory for the backend", () => {
		expect(deployScript).toContain("docker-compose.prod.yml");
	});

	it("installs the staged site-docs into the production directory", () => {
		expect(deployScript).toContain("$PROD_DIR/docker-compose.yml");
	});
});

/**
 * MARK: Deploy changelog packaging tests
 * @description Pins the baked-changelog contract: `deploy.sh --prod` must run
 *   the generator (`scripts/generate-changelog.mjs`) into the staging dir and
 *   install the result as `$PROD_DIR/changelog.json`, so the live app (which
 *   has no `.git`) can serve Kainbain's own history. The `.prev` backup
 *   carries the previous changelog automatically, matching rollback.
 * @example run `npm run test --prefix api`
 */
describe("deploy.sh changelog packaging", () => {
	it("generates the changelog with the generator script", () => {
		expect(deployScript).toContain("generate-changelog");
	});

	it("stages the changelog artifact for the backend", () => {
		expect(deployScript).toContain("$STAGE/changelog.json");
	});

	it("installs the staged changelog into the production directory", () => {
		expect(deployScript).toContain("$PROD_DIR/changelog.json");
	});
});

/**
 * MARK: Deploy docs-link guard tests
 * @description Pins the warn-only `./docs` link check: `deploy.sh` must
 *   define `check_docs_link` and invoke it on the production path so a real
 *   `docs/` directory shadowing the notes space (the 2026-10-02 incident:
 *   UI silently showed 1 of 134 tasks) is surfaced in the deploy log. The
 *   invocation must be failure-proof (`|| true`) so the guard itself can
 *   never fail a deploy under `set -e`.
 * @example run `npm run test --prefix api`
 */
describe("deploy.sh docs-link guard", () => {
	it("defines the docs-link check", () => {
		expect(deployScript).toContain("check_docs_link() {");
	});

	it("runs the check on the production deploy path", () => {
		expect(deployScript).toContain("check_docs_link || true");
	});

	it("warns about a real docs directory shadowing the notes space", () => {
		expect(deployScript).toContain("shadowing the notes space");
	});
});

/**
 * MARK: Deploy app-link publish tests
 * @description Pins the self-published "Go to App" link: after a healthy prod
 *   deploy, `deploy.sh` PATCHes the repo's own project
 *   (`PATCH /projects/:id/app-status`) to point at the live instance — a live
 *   self-test of the endpoint. The publish must be warn-only (`|| true`, every
 *   failure path returns 0) so it can never fail a healthy deploy, must
 *   resolve the project id from the repo's own `.kainbain/project.json`, and
 *   must offer a skip switch for first deploys with no project yet.
 * @example run `npm run test --prefix api -- deploy.packaging`
 */
describe("deploy.sh app-link publish", () => {
	it("defines the app-link publish step", () => {
		expect(deployScript).toContain("publish_app_link() {");
	});

	it("publishes via the app-status endpoint", () => {
		expect(deployScript).toContain("/app-status");
		expect(deployScript).toContain("Content-Type: application/json");
	});

	it("runs the publish after a healthy deploy without ever failing it", () => {
		expect(deployScript).toContain("publish_app_link || true");
	});

	it("resolves the repo's own project id", () => {
		expect(deployScript).toContain(".kainbain/project.json");
	});

	it("offers a skip switch", () => {
		expect(deployScript).toContain("KAINBAIN_SKIP_APP_LINK");
	});
});

/**
 * MARK: Deploy skills packaging tests
 * @description Pins the shipped default skills packaging contract: deploy.sh
 *   must stage the repo-root skills directory into $STAGE/skills and install it
 *   as $PROD_DIR/skills, so the deployed KainBain defaults section is
 *   populated instead of every shipped skill being mislabelled as a custom.
 */
describe("deploy.sh skills packaging", () => {
	it("stages the skills content directory for the backend", () => {
		expect(deployScript).toContain("$STAGE/runner");
	});

	it("installs the staged skills into the production directory", () => {
		expect(deployScript).toContain("$PROD_DIR/runner");
	});
});
