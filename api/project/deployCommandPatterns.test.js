import { expect, test, describe } from "vitest";
import {
	DEPLOY_COMMAND_PATTERN,
	HOST_COMMAND_PATTERN,
	PUBLISH_COMMAND_PATTERN,
} from "./deployCommandPatterns.js";
import { isDeployCommand } from "./isDeployCommand.js";
import { isHostCommand } from "./isHostCommand.js";
import { isPublishCommand } from "./isPublishCommand.js";

/***
 * MARK: deployCommandPatterns Tests
 * @description Pins the command-recognition patterns and predicates
 *   imported from their own modules (not the deployCommands barrel) so the
 *   extraction stays directly covered: deploy/publish/redeploy/install
 *   scripts match, ordinary commands never do, and non-strings fail safe
 *   to false.
 ***/
describe("deployCommandPatterns", () => {
	test("patterns recognise their scripts only", () => {
		expect(DEPLOY_COMMAND_PATTERN.test("./deploy.sh --prod")).toBe(true);
		expect(DEPLOY_COMMAND_PATTERN.test("./publish.sh --detect")).toBe(true);
		expect(DEPLOY_COMMAND_PATTERN.test("./redeploy.sh --frontend")).toBe(true);
		expect(DEPLOY_COMMAND_PATTERN.test("npm test")).toBe(false);
		expect(HOST_COMMAND_PATTERN.test("./deploy.sh --prod")).toBe(true);
		expect(HOST_COMMAND_PATTERN.test("./publish.sh --detect")).toBe(false);
		expect(PUBLISH_COMMAND_PATTERN.test("./publish.sh --detect")).toBe(true);
		expect(PUBLISH_COMMAND_PATTERN.test("./deploy.sh --prod")).toBe(false);
	});

	test("predicates fail safe on non-strings", () => {
		for (const check of [isDeployCommand, isHostCommand, isPublishCommand]) {
			expect(check("")).toBe(false);
			expect(check(undefined)).toBe(false);
			expect(check(null)).toBe(false);
			expect(check(42)).toBe(false);
		}
		expect(isDeployCommand("./deploy.sh --prod")).toBe(true);
		expect(isHostCommand("./deploy.sh --prod")).toBe(true);
		expect(isPublishCommand("./publish.sh --detect")).toBe(true);
	});
});
