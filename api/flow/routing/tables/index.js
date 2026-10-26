/***
 * MARK: Routing tables barrel
 * @description Thin re-export barrel over pure declarative data tables in `api/flow/routing/tables/`.
 * @example import { transientRetryDefaults, harnessRetryableBlips } from './routing/tables/index.js';
 ***/

export { failureLogExcerptLimit } from "./failureLogExcerptLimit.js";
export { transientRetryDefaults } from "./transientRetryDefaults.js";
export { harnessRetryableBlips } from "./harnessRetryableBlips.js";
export { PROJECT_BLOCKER_ALERT_MEMORY_LIMIT } from "./projectBlockerAlertLimits.js";
export { RESUMED_PRIORITY_REASON } from "./resumedPriorityReason.js";
export { RESUMED_QUEUE_REASON } from "./resumedQueueReason.js";
export { RESUMED_PRIORITY_RANK } from "./resumedPriorityRank.js";
export { QUEUE_EMPTY_DEBOUNCE_MS } from "./queueEmptyDebounce.js";
export { retryPromptLogBudget } from "./retryPromptLogBudget.js";
