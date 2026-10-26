/***
 * MARK: PROJECT_BLOCKER_ALERT_MEMORY_LIMIT
 * @description How many gate@sha dedupe tokens the in-memory project-blocker
 *   alert memory keeps. Bounded so a long-lived process cannot accumulate an
 *   unbounded map across every red gate@sha the fleet ever hit; the oldest
 *   entries are pruned once the cap is exceeded.
 * @example PROJECT_BLOCKER_ALERT_MEMORY_LIMIT => 200
 ***/
export const PROJECT_BLOCKER_ALERT_MEMORY_LIMIT = 200;
