/***
 * MARK: SETTINGS_SEARCH_INDEX
 * @description Single source of truth mapping search terms to project
 *   settings locations. Each entry names the tab that renders the setting
 *   (`tab`), the human-readable tab name (`tabLabel`, stored per entry so
 *   consumers never index a map by a variable), and the DOM id to scroll to
 *   and highlight (`elementId`).
 * @example SETTINGS_SEARCH_INDEX.find((e) => e.id === 'git-repo') => { id: 'git-repo', tab: 'files', … }
 ***/
export const SETTINGS_SEARCH_INDEX = [
  { id: 'active-project', tab: 'project', tabLabel: 'Project', label: 'Active Project', keywords: ['project', 'switch', 'select', 'active'], elementId: 'active-project-select' },
  { id: 'project-name', tab: 'project', tabLabel: 'Project', label: 'Project Name', keywords: ['project', 'name', 'rename', 'title'], elementId: 'project-name-input' },
  { id: 'ai-harness', tab: 'project', tabLabel: 'Project', label: 'AI Harness', keywords: ['harness', 'engine', 'agent', 'pi', 'antigravity', 'mock', 'custom'], elementId: 'project-harness-select' },
  { id: 'default-model', tab: 'project', tabLabel: 'Project', label: 'Default AI Model', keywords: ['model', 'default', 'ai', 'llm', 'picker'], elementId: 'project-default-model-select' },
  { id: 'harness-command', tab: 'project', tabLabel: 'Project', label: 'Custom Harness Command', keywords: ['custom', 'command', 'cli', 'harness'], elementId: 'project-harness-command-input' },
  { id: 'accent-color', tab: 'project', tabLabel: 'Project', label: 'Accent Theme Color', keywords: ['accent', 'color', 'colour', 'theme', 'brand'], elementId: 'project-accent-color-input' },
  { id: 'visibility', tab: 'project', tabLabel: 'Project', label: 'Hide Project from Active List', keywords: ['hide', 'archive', 'visible', 'show'], elementId: 'project-visibility-toggle' },
  { id: 'max-auto-iterations', tab: 'project', tabLabel: 'Project', label: 'Max auto-iterations', keywords: ['retry', 'retries', 'iterations', 'failback', 'loop', 'budget'], elementId: 'project-retry-max-auto-iterations' },
  { id: 'max-transient-retries', tab: 'project', tabLabel: 'Project', label: 'Max transient retries', keywords: ['retry', 'retries', 'transient', 'infrastructure', 'timeout', 'budget'], elementId: 'project-retry-max-transient-retries' },
  { id: 'auto-iteration', tab: 'project', tabLabel: 'Project', label: 'Automatic iteration', keywords: ['automatic', 'iteration', 'auto', 'retry', 'rerun'], elementId: 'project-retry-auto-iteration' },
  { id: 'agent-timeout', tab: 'project', tabLabel: 'Project', label: 'Agent stage timeout', keywords: ['timeout', 'agent', 'minutes', 'ceiling', 'retry'], elementId: 'project-retry-agent-timeout' },
  { id: 'ci-timeout', tab: 'project', tabLabel: 'Project', label: 'CI stage timeout', keywords: ['timeout', 'ci', 'deploy', 'minutes', 'ceiling'], elementId: 'project-retry-ci-timeout' },
  { id: 'merge-timeout', tab: 'project', tabLabel: 'Project', label: 'Merge stage timeout', keywords: ['timeout', 'merge', 'minutes', 'ceiling'], elementId: 'project-retry-merge-timeout' },
  { id: 'model-aliases', tab: 'aliases', tabLabel: 'Aliases', label: 'Model Aliases', keywords: ['alias', 'aliases', 'nickname', 'model', 'small', 'medium', 'large'], elementId: 'model-aliases-section' },
  { id: 'app-url', tab: 'files', tabLabel: 'Files & Links', label: 'App URL', keywords: ['app', 'url', 'link', 'go to app', 'address', 'health'], elementId: 'project-applink-url-input' },
  { id: 'app-network-host', tab: 'files', tabLabel: 'Files & Links', label: 'Network Host Override', keywords: ['network', 'host', 'lan', 'app', 'override'], elementId: 'project-applink-network-input' },
  { id: 'app-health-endpoint', tab: 'files', tabLabel: 'Files & Links', label: 'Health Endpoint', keywords: ['health', 'endpoint', 'probe', 'app'], elementId: 'project-applink-health-input' },
  { id: 'app-status', tab: 'files', tabLabel: 'Files & Links', label: 'App Status', keywords: ['status', 'running', 'stopped', 'degraded', 'app'], elementId: 'project-applink-status-select' },
  { id: 'working-dir', tab: 'files', tabLabel: 'Files & Links', label: 'Working Directory', keywords: ['working', 'directory', 'cwd', 'root', 'folder', 'path'], elementId: 'project-cwd-input' },
  { id: 'notes-dir', tab: 'files', tabLabel: 'Files & Links', label: 'Notes Space Symlink Directory', keywords: ['notes', 'symlink', 'knowledge', 'directory', 'space'], elementId: 'project-notes-input' },
  { id: 'docs-dir', tab: 'files', tabLabel: 'Files & Links', label: 'Documentation Folder Name', keywords: ['docs', 'documentation', 'folder', 'directory', 'name'], elementId: 'project-docs-dir-input' },
  { id: 'kainbain-dir', tab: 'files', tabLabel: 'Files & Links', label: 'KainBain Folder Name', keywords: ['kainbain', 'state', 'folder', 'directory', 'sessions', 'name'], elementId: 'project-kainbain-dir-input' },
  { id: 'centralized-docs', tab: 'files', tabLabel: 'Files & Links', label: 'Link to Centralised Documentation', keywords: ['centralised', 'centralized', 'docs', 'symlink', 'link'], elementId: 'project-centralized-docs-input' },
  { id: 'git-repo', tab: 'files', tabLabel: 'Files & Links', label: 'Git Repository URL', keywords: ['git', 'repo', 'repository', 'remote', 'url', 'origin'], elementId: 'project-git-input' },
  { id: 'task-branches', tab: 'files', tabLabel: 'Files & Links', label: 'Use Task Branches', keywords: ['branch', 'branches', 'task', 'merge', 'git'], elementId: 'project-use-branches-input' },
  { id: 'preserve-review-diff', tab: 'files', tabLabel: 'Files & Links', label: 'Preserve PR Review Diff After Merge', keywords: ['review', 'diff', 'preserve', 'merge', 'pr'], elementId: 'project-preserve-review-diff-input' },
  { id: 'reset-review-baseline', tab: 'files', tabLabel: 'Files & Links', label: 'Reset Review Baseline On Each Merge', keywords: ['review', 'baseline', 'reset', 'merge'], elementId: 'project-reset-review-baseline-input' },
];

/***
 * MARK: matchesSetting
 * @description Scores one index entry against a normalized query: 3 for a
 *   label prefix match, 2 for a label substring, 1 for a keyword substring,
 *   0 for no match. Scores rank `searchSettings` so label hits lead.
 * @example matchesSetting({ label: 'Git Repository URL', keywords: ['git'] }, 'git') => 3
 * @param {Object} entry - One `SETTINGS_SEARCH_INDEX` entry.
 * @param {string} query - Lowercase trimmed query.
 * @returns {number} Match score (0 = no match).
 ***/
const matchesSetting = (entry, query) => {
  const label = entry.label.toLowerCase();
  if (label.startsWith(query)) return 3;
  if (label.includes(query)) return 2;
  if (entry.keywords.some((keyword) => keyword.toLowerCase().includes(query))) return 1;
  return 0;
};

/***
 * MARK: searchSettings
 * @description Returns index entries matching a query (case-insensitive
 *   substring over labels + keywords), best matches first. Blank queries
 *   and non-matches return an empty array.
 * @example searchSettings('git') => [{ id: 'git-repo', tab: 'files', … }]
 * @param {string} query - Raw user input.
 * @returns {Array<Object>} Matching entries, ranked best-first.
 ***/
export const searchSettings = (query) => {
  const normalized = String(query ?? '').trim().toLowerCase();
  if (!normalized) return [];
  return SETTINGS_SEARCH_INDEX.map((entry) => ({ entry, score: matchesSetting(entry, normalized) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
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
