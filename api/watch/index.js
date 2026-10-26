// Domain: Watching the Work — reports explaining what happened in a stage.
export { AUTO_REPORT_MARKER, isAutoReportContent, generateStageReportContent, saveStageReport, getTaskReports } from './stageReports.js';
export { _appendProcessLog, _logEntriesForFeed, _appendLogEntries, _replaceLogEntries, parseLegacyProcessLogText, renderLogEntriesText } from './processLogs.js';
export { computeObservabilityMetrics } from './observabilityMetrics.js';
export { computeHarnessReliability, RECENT_RELIABILITY_WINDOW_RUNS } from './harnessReliability.js';
export { computeAliasReliability } from './aliasReliability.js';
