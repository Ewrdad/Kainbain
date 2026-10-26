// Domain: The Flow — automated and agentic stage execution, prompt curation dispatch, and output handling.
/***
 * MARK: Flow stage execution barrel
 * @description Historical barrel re-exporting stage execution loop mechanics from `api/flow/execution/` and retry prompt budgets.
 * @example import { executeStage } from './stageExecution.js';
 ***/
export * from './execution/index.js';
export { retryPromptLogBudget } from './routing/tables/index.js';
