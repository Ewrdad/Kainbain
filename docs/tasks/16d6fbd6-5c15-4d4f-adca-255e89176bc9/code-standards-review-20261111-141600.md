# Code Standards Review Report (task 16d6fbd6-5c15-4d4f-adca-255e89176bc9)

## Overview
Review of the changes introduced on branch `kb/16d6fbd6-5c15-4d4f-adca-255e89176bc9` against `main` for compliance with [./docs/KB Code Standards.md](../../KB%20Code%20Standards.md).

The task normalises central queue dispatching across all pipelines and projects so workers pick up tasks regardless of UI focus, ordering waiting work oldest-first by default with furthest-along percentage tie-breaking and starvation safeguards.

## Review Against Code Standards

### 1. User understandable over technical language
- **Descriptive naming**: Functions and variables use clear, descriptive domain terminology (e.g., `resolveCentralQueuePolicy`, `compareCentralQueueCandidates`, `sortCentralQueue`, `isCentralQueueCandidateOverdue`, `CENTRAL_QUEUE_ORDER_OLDEST_FIRST`).
- **No forbidden jargon**: No usage of forbidden patterns or technical buzzwords like "factory" or "barrel".
- **Domain consistency**: Standard vocabulary maintained ("tasks", "stages", "projects", "queue").
- **JSDocs & Examples**: All new functions include comprehensive JSDocs with `@description` detailing the "why" and `@example` demonstrations showing clear input/output.
- **Labelled data import pattern**: Used across parameter signatures where appropriate.

### 2. Functional over Object-Oriented
- **No unnecessary classes**: Central queue scheduling logic is written as pure, composable utility functions (`sortCentralQueue`, `compareCentralQueueCandidates`, `isCentralQueueCandidateOverdue`, `resolveCentralQueuePolicy`).
- **Immutability & Pure Functions**: `sortCentralQueue` operates defensively on inputs and returns a new sorted array copy (`[...list].sort(...)`) without mutating arguments.
- **Action-oriented verbs**: Functions are explicitly named with actions (`sort...`, `compare...`, `resolve...`, `is...Overdue`).
- **Single responsibility**: Each new helper handles one discrete aspect of policy resolution, overdue checks, candidate comparison, and queue sorting.

### 3. Co-location over abstraction
- **Logical file placement**: Core scheduling comparison and sorting logic is co-located within `api/flow/scheduler/`.
- **Unit test proximity**: Test files (`centralQueueFairness.test.js`, `centralQueueSeam.test.js`) are placed directly next to the implementation files under `api/flow/scheduler/`.
- **Searchability**: Clear naming makes files easily discoverable when tracking down queue order or dispatch logic.

### 4. Tested over trusted
- **Thorough test coverage**: Added unit and regression test suites covering fairness between focused and non-focused pipelines, tie-breaking, starvation bounds, legacy fallback mode, and popup modal UI representation.
- **Consistent test execution**: Test suites pass cleanly (`flow/scheduler/` unit tests, `scanClaimableTasks.test.js`, `taskStore.test.js`, `taskWorkRoutes.test.js`, `QueuePopupModal.test.jsx`).
- **Observable error handling & defense**: Timestamp parsing defensively falls back to epoch 0 so malformed timestamps cannot hide candidates from dispatch.

### 5. Fast iteration & non-breaking changes
- Changes maintain backward compatibility via `KAINBAIN_CENTRAL_QUEUE_ORDER=furthest-along` configuration fallback.
- Code changes remain focused, clean, and conformant with linting standards (`npm run lint` reported 0 errors).

## Conclusion
The branch changes comply with the guidelines in `./docs/KB Code Standards.md`.
