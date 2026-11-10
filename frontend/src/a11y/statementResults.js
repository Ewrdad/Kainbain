/***
 * MARK: statementResults
 * @description Frontend seam for the dynamic accessibility statement
 *   (task 4bda7321): re-exports the shared catalogue, schema, parser, and
 *   selectors from `shared/accessibilityStatement.js` (the single source
 *   of truth both sides honour), and adds the runtime loader that fetches
 *   the latest stored results with a curated fallback when the fetch
 *   fails. The statement view builds on this module — never on raw fetch
 *   or hand-written statuses.
 * @example import { loadStatementResults, NEED_GROUPS } from '../a11y/statementResults';
 ***/
import {
  FALLBACK_ARTIFACT,
  groupStatementResults,
  parseResultsArtifact,
} from '../../../shared/accessibilityStatement.js';

// Re-exported catalogue, schema, parser, and selectors (the view's vocabulary).
export {
  AAA_STATUS_LABELS,
  AAA_STATUSES,
  ARTIFACT_SCHEMA_VERSION,
  FALLBACK_ARTIFACT,
  FALLBACK_KNOWN_ISSUES,
  GROUP_AAA_LABELS,
  NEED_GROUPS,
  NEED_GROUP_IDS,
  READINESS_LABELS,
  READINESS_LEVELS,
  WCAG22_AAA_CRITERIA,
  WCAG30_OUTCOMES,
  groupStatementResults,
  isNeedGroupId,
  parseResultsArtifact,
} from '../../../shared/accessibilityStatement.js';

/***
 * MARK: loadStatementResults
 * @description Loads the latest stored check results through `fetchResults`
 *   (normally `api.accessibilityResults`), parses them leniently, and
 *   returns `{ artifact, groups, isFallback, warnings }` with the per-group
 *   aggregation applied. When the fetch rejects, the curated fallback
 *   artifact renders instead (`isFallback: true`) so the statement never
 *   goes blank and never crashes.
 * @example const { groups, isFallback } = await loadStatementResults(api.accessibilityResults);
 ***/
export const loadStatementResults = async (fetchResults) => {
  try {
    const raw = await fetchResults();
    const { artifact, warnings } = parseResultsArtifact(raw);
    return { artifact, groups: groupStatementResults(artifact), isFallback: false, warnings };
  } catch {
    const { artifact } = parseResultsArtifact(FALLBACK_ARTIFACT);
    return {
      artifact,
      groups: groupStatementResults(artifact),
      isFallback: true,
      warnings: ['Latest results could not be loaded; showing the last-known statement.'],
    };
  }
};
