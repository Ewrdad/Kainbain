import { describe, expect, it } from 'vitest';
import { SETTINGS_SEARCH_INDEX, searchSettings, findBestMatch } from './projectSettingsSearch';
import { PROJECT_SETTINGS_TABS } from './projectSettingsTabs.js';

/***
 * MARK: projectSettingsSearch tests
 * @description Verifies the settings search index: label and keyword
 *   matching, ranking, empty/no-match behaviour, and best-match lookup.
 ***/
describe('searchSettings', () => {
  it('matches by label substring, case-insensitively', () => {
    const hits = searchSettings('GIT');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('git-repo');
  });

  it('matches by keyword', () => {
    const hits = searchSettings('nickname');
    expect(hits.map((hit) => hit.id)).toContain('model-aliases');
  });

  it('ranks label hits above keyword-only hits', () => {
    // 'timeout' is in the agent-timeout label but only a keyword elsewhere.
    const hits = searchSettings('timeout');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0].label.toLowerCase()).toContain('timeout');
  });

  it('returns an empty array for blank queries and non-matches', () => {
    expect(searchSettings('')).toEqual([]);
    expect(searchSettings('   ')).toEqual([]);
    expect(searchSettings('zzz-no-such-setting')).toEqual([]);
    // Non-string input never throws — it matches nothing.
    expect(searchSettings(null)).toEqual([]);
    expect(searchSettings(undefined)).toEqual([]);
  });

  it('matches multi-word queries on every word, in any order', () => {
    expect(searchSettings('git repo')[0]?.id).toBe('git-repo');
    expect(searchSettings('repo git')[0]?.id).toBe('git-repo');
    expect(searchSettings('centralised docs')[0]?.id).toBe('centralized-docs');
    expect(searchSettings('use task branches')[0]?.id).toBe('task-branches');
  });

  it('finds the separate docs repo settings by label and keyword', () => {
    expect(searchSettings('separate docs repo')[0]?.id).toBe('docs-repo-url');
    expect(searchSettings('stealth')[0]?.id).toBe('docs-repo-url');
    expect(searchSettings('docs repo local path')[0]?.id).toBe('docs-repo-path');
    const urlHit = searchSettings('separate')[0];
    expect(urlHit.tab).toBe('files-repos');
    expect(urlHit.elementId).toBe('project-docs-repo-url-input');
    // The pre-existing git-remote entry still wins plain "git" queries.
    expect(searchSettings('git')[0]?.id).toBe('git-repo');
    // Natural-language "kainbain" queries find the stealth docs repo too
    // (previously "kainbain docs" matched nothing under AND semantics).
    expect(searchSettings('kainbain docs').map((hit) => hit.id)).toContain('docs-repo-url');
    expect(searchSettings('kainbain docs')[0]?.id).toBe('docs-repo-path');
    expect(searchSettings('kainbain')[0]?.id).toBe('kainbain-dir');
  });

  it('requires every word to hit (one miss disqualifies the entry)', () => {
    // No single setting is about both git and timeouts.
    expect(searchSettings('git timeout')).toEqual([]);
    // "git repo health" nearly matches git-repo, but health lives elsewhere.
    expect(searchSettings('git repo health')).toEqual([]);
  });

  it('covers every project-related tab', () => {
    const tabs = new Set(SETTINGS_SEARCH_INDEX.map((entry) => entry.tab));
    // The workflows tab is searchable too: its panel exposes stable elementIds
    // (e.g. the pipeline base-branch field), so settings search must find it.
    expect(tabs).toEqual(
      new Set(['project', 'aliases', 'files-repos', 'addresses', 'workflows']),
    );
  });

  it('finds the pipeline base branch on the workflows tab', () => {
    expect(searchSettings('base branch')[0]?.id).toBe('pipeline-base-branch');
    expect(searchSettings('pipeline base')[0]?.id).toBe('pipeline-base-branch');
    const hit = findBestMatch('branch main pipeline');
    expect(hit).toMatchObject({ id: 'pipeline-base-branch', tab: 'workflows' });
  });

  it('names each entry with the current label of its home tab', () => {
    // tabLabel is derived from the tab config, so a tab rename cannot leave
    // a stale copied name in search results.
    for (const entry of SETTINGS_SEARCH_INDEX) {
      const homeTab = PROJECT_SETTINGS_TABS.find((tab) => tab.id === entry.tab);
      expect(homeTab).toBeDefined();
      expect(entry.tabLabel).toBe(homeTab.label);
    }
  });

  it('uses unique ids and elementIds', () => {
    const ids = SETTINGS_SEARCH_INDEX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const elementIds = SETTINGS_SEARCH_INDEX.map((entry) => entry.elementId);
    expect(new Set(elementIds).size).toBe(elementIds.length);
  });
});

describe('findBestMatch', () => {
  it('returns the single best match for jump-on-Enter', () => {
    expect(findBestMatch('git')?.id).toBe('git-repo');
    expect(findBestMatch('accent')?.id).toBe('accent-color');
  });

  it('returns null when nothing matches', () => {
    expect(findBestMatch('zzz-no-such-setting')).toBeNull();
  });
});
