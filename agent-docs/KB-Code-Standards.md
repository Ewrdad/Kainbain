> **Vendored:** byte-identical copy of the SilverBullet page `Projects/Personal/KainBain/KB Code Standards.md` (vendored 2026-09-24).
> Source of truth is this in-repo copy — the external notes store is unreachable on a fresh checkout.
> Upstream edits must be re-vendored here; keep everything below the header identical to the source page.

# KainBain coding standards


## Architecture
The action should always be split by logical function not architectural feature. This means the architecture should have a natural call hierarchy, this is inspired by reacts component tree behaviours.

This should be as functional as possible(within reason). Most things should largely look like state is external to the system, and ergo mostly stored in files. However due to readability concerns be careful to avoid 

> **warning** Warning
> Keep an eye out for technical language (like factory, types or ...) this is a sign the architecture is not readable and should force a moment of pause to re-evaluate how you architect this change.


## Readability
Code should be readable with zero context and only minor technical knowledge. It should describe the business level logic of the code not the technical details for example:
```js

const agentSessionIdentifier = getSessionIdentifier(SessionInstance)

if (agentSessionIdentifier == "false"){

  return {value: null , error: new Error("Session not found")}
}

```

To this end we should also make liberal use of JSDocs to describe variables and functions in plain English to assist. Extra important to use the `@example` and `@description` tags

Example
```js
/***
* MARK: getSessionIdentifier
* @description Gets the unique id (UUIDv4) for a given instance
* @example console.log(getSessionIdentifier(SessionInstance)) => 892739292092
*
***/

```

Notice the use of MARK: since this is going to be viewed likely in vscode it is good to tailor the experience to that. `MARK:` for example creates a header in the minimap view of VScode




## Testing
First of all, all testing should not use a real live AI agent, and preferably use a mock. We will create a dedicated subset which are Ai agent included tests and those can only be run with explicit permission and thorough checks (as not to waste AI tokens)

Largely the process of Test driven development should be followed, where you define the tests before you write the function. This because only by proving something with a test can you prove your function works and ergo the work is complete. An untested bit of code should be treated as broken 


### Unit Tests
This should be the majority of tests used as they are quick and easy. They are too be run regularly. 

They should largely be black box tests, without influencing or testing how things work internally. This means we can judge log based tests as an anti pattern. 


### Canary E2E tests

These are very simple e2e tests (excluding ai) that are just meant to mainly detect major errors and runtime errors. This is not a full end to end suite. These should mainly just assert no errors while touching as many things as possible, although ideally should be done in a way that doesn't need to be touched. 

There needs to be a separate set of canary tests for every error boundary. At the start it'll just mainly render a ui/start the app and detect if there are things such as missing imports or other errors. After awhile you will need to do this on each boundary separately 

### API tests
Although UI based tests take awhile to run, API tests can be quick and easy. They should just mock the the AI agent layer, the rest should be authentic e2e of the API. These are good for any new endpoints or changes in endpoint behaviour. These also serve as really good documentation.

### screenshot generator 
Although these tests don't assert anything it is really useful to generate images so the app can be analysed. The tests should generate a screenshot per screen, for mobile, tablet and desktop views. 

It should easily be extendable so we can do exploratory screenshots. This is the primary eyes on the app. 


## Documentation 

### Jsdoc
As mentioned above Jsdoc should be used to make sure things are in line with business behaviour. Key to use examples and make them readable.

**Enforced (WP-8 automated gates — not advisory):**
- `@example` on every public export (`export function/class/const/let/var/default`
  in `api/`, `shared/`, `frontend/src/`): enforced for all *new* exports by
  `npm run check:jsdoc-example` (wired into `npm run docs:check` and CI).
  Pre-existing gaps are grandfathered in
  `scripts/baselines/jsdoc-example-missing.json` and shrink via `--prune`;
  never add a new export to that baseline (see §q6: new exports document
  themselves). Reproduce: `node scripts/check-jsdoc-example.mjs --report`.
- One function per file for newly added source files: at most one top-level
  named `function` declaration per new file in `api/`, `shared/`,
  `frontend/src/` (nested helpers and arrow constants are fine), enforced by
  `npm run check:one-function` (and CI). Pre-existing multi-function files are
  grandfathered in `scripts/allowlists/one-function-per-file.json` (q13);
  never add a new file to it — split the function into its own module instead.

### open API/swagger
The API layer should have a fully documented API since this will allow for easier testing and the ability to abstract the API rather than needing to read the code every time. 

### comments
Comments beyond Jsdoc should be kept to a minimum. It is preferred generally to have longer variables and a more descriptive architectural style. 

### other 
Any other documents should be in the general document store under the projects section (projects/personal/kainbain)


#project/kainbain#codestandards #documentation #testing 