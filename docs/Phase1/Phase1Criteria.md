# Acceptance criteria phase 1

## scafolding

* [x] clone repo to project space
* [x] Create agents.md for project linking back to this space
* [x] Create API folder and a simple status API
* [x] Create front-end folder with simple "hello world" interface
* [x] create a canary-e2e tests folder with playwright installed and setup

## front-end

* [x] make sure tailwind CSS is installed correctly
* [x] make sure simple eslint rules are configured and running
* [x] make sure prettier is setup and configured.
* [x] make sure prettier and eslint don't clash
* [x] install vitetest and start creating a simple "does the main page render without errors " unit test to verify

## API

* [x] make sure Fastify is properly setup
* [x] install and configure vitest
* [x] create a simple status check API test for the status endpoint
* [x] create simple unit tests for the endpoint

## Devops

* [x] Replace default `npm run test` with a test script that reduces context bloat by just reporting errors and number of successes. This should also run all types of tests(except live external integrations like ai)
* [x] allow for `npm run test:canary` or `npm run test:unit` to allow for running specific test suites.
* [x] Copy test suite behaviour for frontend (same structure just running only frontend specific tests)
* [x] copy test suite behaviour for API (same structure and just running only API specific tests)
* [x] Integrate lint behaviours into `npm run test` script to provide a one stop shop for checking (make sure if lint fails the script exits early as lint is often real quick)
* [x] Make sure an at least surface level `npm run build` works

## Standards

* [x] Make sure code exists as we wish to continue
* [x] Make sure there are clear examples of how most things should be done
* [x] Make sure there is regular sign posting back to the docs
* [x] Double check all eslint configs are properly settup
