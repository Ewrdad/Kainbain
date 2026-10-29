import { PROJECT_SETTINGS_TABS } from './projectSettingsTabs.js';

/***
 * MARK: SETTINGS_SEARCH_INDEX entries (raw)
 * @description Mapping of search terms to project settings locations. Each
 *   entry names the tab that renders the setting (`tab`) and the DOM id to
 *   scroll to and highlight (`elementId`). The human-readable tab name is
 *   not copied here — it is filled in from the tab config below.
 * @example SETTINGS_SEARCH_INDEX_SOURCE_ENTRIES.find((e) => e.id === 'git-repo') => { id: 'git-repo', tab: 'files', … }
 ***/
const SETTINGS_SEARCH_INDEX_SOURCE_ENTRIES = [
  {
    id: 'active-project',
    tab: 'project',
    label: 'Active Project',
    keywords: ['project', 'switch', 'select', 'active'],
    elementId: 'active-project-select',
  },
  {
    id: 'project-name',
    tab: 'project',
    label: 'Project Name',
    keywords: ['project', 'name', 'rename', 'title'],
    elementId: 'project-name-input',
  },
  {
    id: 'ai-harness',
    tab: 'project',
    label: 'AI Harness',
    keywords: ['harness', 'engine', 'agent', 'pi', 'antigravity', 'mock', 'custom'],
    elementId: 'project-harness-select',
  },
  {
    id: 'default-model',
    tab: 'project',
    label: 'Default AI Model',
    keywords: ['model', 'default', 'ai', 'llm', 'picker'],
    elementId: 'project-default-model-select',
  },
  {
    id: 'harness-command',
    tab: 'project',
    label: 'Custom Harness Command',
    keywords: ['custom', 'command', 'cli', 'harness'],
    elementId: 'project-harness-command-input',
  },
  {
    id: 'accent-color',
    tab: 'project',
    label: 'Accent Theme Color',
    keywords: ['accent', 'color', 'colour', 'theme', 'brand'],
    elementId: 'project-accent-color-input',
  },
  {
    id: 'visibility',
    tab: 'project',
    label: 'Hide Project from Active List',
    keywords: ['hide', 'archive', 'visible', 'show'],
    elementId: 'project-visibility-toggle',
  },
  {
    id: 'max-auto-iterations',
    tab: 'project',
    label: 'Max auto-iterations',
    keywords: ['retry', 'retries', 'iterations', 'failback', 'loop', 'budget'],
    elementId: 'project-retry-max-auto-iterations',
  },
  {
    id: 'max-transient-retries',
    tab: 'project',
    label: 'Max transient retries',
    keywords: ['retry', 'retries', 'transient', 'infrastructure', 'timeout', 'budget'],
    elementId: 'project-retry-max-transient-retries',
  },
  {
    id: 'auto-iteration',
    tab: 'project',
    label: 'Automatic iteration',
    keywords: ['automatic', 'iteration', 'auto', 'retry', 'rerun'],
    elementId: 'project-retry-auto-iteration',
  },
  {
    id: 'agent-timeout',
    tab: 'project',
    label: 'Agent stage timeout',
    keywords: ['timeout', 'agent', 'minutes', 'ceiling', 'retry'],
    elementId: 'project-retry-agent-timeout',
  },
  {
    id: 'ci-timeout',
    tab: 'project',
    label: 'CI stage timeout',
    keywords: ['timeout', 'ci', 'deploy', 'minutes', 'ceiling'],
    elementId: 'project-retry-ci-timeout',
  },
  {
    id: 'merge-timeout',
    tab: 'project',
    label: 'Merge stage timeout',
    keywords: ['timeout', 'merge', 'minutes', 'ceiling'],
    elementId: 'project-retry-merge-timeout',
  },
  {
    id: 'model-aliases',
    tab: 'aliases',
    label: 'Model Aliases',
    keywords: ['alias', 'aliases', 'nickname', 'model', 'small', 'medium', 'large'],
    elementId: 'model-aliases-section',
  },
  {
    id: 'app-url',
    tab: 'addresses',
    label: 'App URL',
    keywords: ['app', 'url', 'link', 'go to app', 'address', 'health'],
    elementId: 'project-applink-url-input',
  },
  {
    id: 'app-network-host',
    tab: 'addresses',
    label: 'Network Host Override',
    keywords: ['network', 'host', 'lan', 'app', 'override'],
    elementId: 'project-applink-network-input',
  },
  {
    id: 'app-health-endpoint',
    tab: 'addresses',
    label: 'Health Endpoint',
    keywords: ['health', 'endpoint', 'probe', 'app'],
    elementId: 'project-applink-health-input',
  },
  {
    id: 'app-status',
    tab: 'addresses',
    label: 'App Status',
    keywords: ['status', 'running', 'stopped', 'degraded', 'app'],
    elementId: 'project-applink-status-select',
  },
  {
    id: 'working-dir',
    tab: 'files-repos',
    label: 'Working Directory',
    keywords: ['working', 'directory', 'cwd', 'root', 'folder', 'path'],
    elementId: 'project-cwd-input',
  },
  {
    id: 'notes-dir',
    tab: 'files-repos',
    label: 'Notes Space Symlink Directory',
    keywords: ['notes', 'symlink', 'knowledge', 'directory', 'space'],
    elementId: 'project-notes-input',
  },
  {
    id: 'docs-dir',
    tab: 'files-repos',
    label: 'Documentation Folder Name',
    keywords: ['docs', 'documentation', 'folder', 'directory', 'name'],
    elementId: 'project-docs-dir-input',
  },
  {
    id: 'kainbain-dir',
    tab: 'files-repos',
    label: 'KainBain Folder Name',
    keywords: ['kainbain', 'state', 'folder', 'directory', 'sessions', 'name'],
    elementId: 'project-kainbain-dir-input',
  },
  {
    id: 'centralized-docs',
    tab: 'files-repos',
    label: 'Link to Centralised Documentation',
    keywords: ['centralised', 'centralized', 'docs', 'symlink', 'link'],
    elementId: 'project-centralized-docs-input',
  },
  {
    id: 'git-repo',
    tab: 'files-repos',
    label: 'Git Repository URL',
    keywords: ['git', 'repo', 'repository', 'remote', 'url', 'origin'],
    elementId: 'project-git-input',
  },
  {
    id: 'task-branches',
    tab: 'files-repos',
    label: 'Use Task Branches',
    keywords: ['branch', 'branches', 'task', 'merge', 'git'],
    elementId: 'project-use-branches-input',
  },
  {
    id: 'preserve-review-diff',
    tab: 'files-repos',
    label: 'Preserve PR Review Diff After Merge',
    keywords: ['review', 'diff', 'preserve', 'merge', 'pr'],
    elementId: 'project-preserve-review-diff-input',
  },
  {
    id: 'reset-review-baseline',
    tab: 'files-repos',
    label: 'Reset Review Baseline On Each Merge',
    keywords: ['review', 'baseline', 'reset', 'merge'],
    elementId: 'project-reset-review-baseline-input',
  },
];

/***
 * MARK: SETTINGS_SEARCH_INDEX
 * @description Search entries with their tab name filled in from
 *   `PROJECT_SETTINGS_TABS` (the one place tab names live), so a tab rename
 *   updates search results instead of leaving a stale copied name behind.
 *   An entry pointing at an unknown tab keeps a plain fallback name and is
 *   caught by the agreement test; at runtime the jump handler also ignores
 *   unknown tabs, so a bad entry can never switch to a blank page.
 * @example SETTINGS_SEARCH_INDEX.find((e) => e.id === 'git-repo').tabLabel => 'Files & Repos'
 ***/
export const SETTINGS_SEARCH_INDEX = SETTINGS_SEARCH_INDEX_SOURCE_ENTRIES.map((entry) => ({
  ...entry,
  tabLabel: PROJECT_SETTINGS_TABS.find((tab) => tab.id === entry.tab)?.label ?? 'Project Settings',
}));

/***
 * MARK: scoreWord
 * @description Scores one index entry against a single normalized word: 3 for
 *   a label prefix match, 2 for a label substring, 1 for a keyword
 *   substring, 0 for no match. Scores rank `searchSettings` so label hits
 *   lead. A non-array `keywords` field scores 0 instead of throwing.
 * @example scoreWord({ label: 'Git Repository URL', keywords: ['git'] }, 'git') => 3
 * @param {Object} entry - One `SETTINGS_SEARCH_INDEX` entry.
 * @param {string} word - Lowercase query word.
 * @returns {number} Match score (0 = no match).
 ***/
const scoreWord = (entry, word) => {
  const label = String(entry?.label ?? '').toLowerCase();
  if (label.startsWith(word)) return 3;
  if (label.includes(word)) return 2;
  const keywords = Array.isArray(entry?.keywords) ? entry.keywords : [];
  if (keywords.some((keyword) => String(keyword).toLowerCase().includes(word))) return 1;
  return 0;
};

/***
 * MARK: searchSettings
 * @description Returns index entries matching a query (case-insensitive).
 *   Multi-word queries match when EVERY word hits (label substring or
 *   keyword substring), so "centralised docs folder" finds the docs-link
 *   setting however the words are ordered. Scores sum the per-word best
 *   hits, best matches first with index order breaking ties. Blank queries
 *   and non-matches return an empty array.
 * @example searchSettings('git') => [{ id: 'git-repo', tab: 'files', … }]
 * @param {string} query - Raw user input.
 * @returns {Array<Object>} Matching entries, ranked best-first.
 ***/
export const searchSettings = (query) => {
  const normalized = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  return SETTINGS_SEARCH_INDEX.map((entry, index) => {
    let score = 0;
    for (const word of words) {
      const wordScore = scoreWord(entry, word);
      // One missed word disqualifies the entry (AND semantics).
      if (wordScore === 0) return null;
      score += wordScore;
    }
    return { entry, score, index };
  })
    .filter((hit) => hit !== null)
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .map((hit) => hit.entry);
};

/***
 * MARK: findBestMatch
 * @description Returns the single best index entry for a query (for
 *   jump-on-Enter), or null when nothing matches.
 * @example findBestMatch('git') => { id: 'git-repo', tab: 'files', … }
 * @param {string} query - Raw user input.
 * @returns {Object|null} The best matching entry, if any.
 ***/
export const findBestMatch = (query) => searchSettings(query)[0] ?? null;
