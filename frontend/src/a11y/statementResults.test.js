// @vitest-environment node
// Pure-logic suite: the loader seam plus the re-exported parser contract,
// with no DOM needs.
import { describe, it, expect, vi } from 'vitest';
import {
  FALLBACK_ARTIFACT,
  NEED_GROUP_IDS,
  WCAG22_AAA_CRITERIA,
  groupStatementResults,
  loadStatementResults,
  parseResultsArtifact,
} from './statementResults';

/***
 * MARK: statementResults tests
 * @description Pins the frontend seam behind the dynamic accessibility
 *   statement: the loader fetches latest results with an honest fallback
 *   path, and the re-exported parser/selector contract holds (valid
 *   artifact, missing artifact, malformed entries, unknown ids, and
 *   timestamp/version surfacing).
 ***/
describe('loadStatementResults', () => {
  it('loads live results with the group aggregation applied', async () => {
    const fetchResults = vi.fn().mockResolvedValue(FALLBACK_ARTIFACT);
    const { artifact, groups, isFallback, warnings } = await loadStatementResults(fetchResults);
    expect(fetchResults).toHaveBeenCalledTimes(1);
    expect(isFallback).toBe(false);
    expect(warnings).toEqual([]);
    expect(artifact.generatedAt).toBe('2026-10-25T00:00:00.000Z');
    expect(artifact.appVersion).toBe('1.0.0');
    expect(groups.map((entry) => entry.group.id)).toEqual(NEED_GROUP_IDS);
  });

  it('falls back to the curated artifact when the fetch fails', async () => {
    const fetchResults = vi.fn().mockRejectedValue(new Error('API down'));
    const { artifact, groups, isFallback, warnings } = await loadStatementResults(fetchResults);
    expect(isFallback).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(artifact.wcag22aaa).toHaveLength(28);
    expect(groups).toHaveLength(5);
  });

  it('surfaces parser warnings without crashing on malformed payloads', async () => {
    const fetchResults = vi.fn().mockResolvedValue({ wcag22aaa: 'nope', unknown: true });
    const { artifact, groups, isFallback, warnings } = await loadStatementResults(fetchResults);
    expect(isFallback).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
    expect(artifact.wcag22aaa.every((row) => row.status === 'unknown')).toBe(true);
    expect(groups.every((entry) => entry.aaaStatus === 'unknown')).toBe(true);
  });
});

describe('parser and selector contract (via the frontend seam)', () => {
  it('parses a valid artifact with zero warnings', () => {
    expect(parseResultsArtifact(FALLBACK_ARTIFACT).warnings).toEqual([]);
  });

  it('covers the full 28-criterion catalogue exactly once', () => {
    const { artifact } = parseResultsArtifact(FALLBACK_ARTIFACT);
    expect(artifact.wcag22aaa.map((row) => row.criterion).sort()).toEqual(
      WCAG22_AAA_CRITERIA.map((entry) => entry.id).sort(),
    );
  });

  it('ignores unknown criterion ids with a warning', () => {
    const { artifact, warnings } = parseResultsArtifact({
      schemaVersion: 1,
      wcag22aaa: [{ criterion: '9.9.9', status: 'pass' }],
      wcag30: [],
    });
    expect(warnings.some((warning) => warning.includes('9.9.9'))).toBe(true);
    expect(artifact.wcag22aaa).toHaveLength(28);
  });

  it('aggregates one entry per need group', () => {
    const { artifact } = parseResultsArtifact(FALLBACK_ARTIFACT);
    expect(groupStatementResults(artifact).map((entry) => entry.group.id)).toEqual(
      NEED_GROUP_IDS,
    );
  });
});
