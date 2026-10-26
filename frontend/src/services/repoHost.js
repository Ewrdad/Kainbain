/***
 * MARK: parseGitRemote
 * @description Parses a git remote URL (https://, http://, ssh://, or
 *   scp-like `user@host:path`) into host + path parts. Returns null for
 *   empty, non-string, or unparseable input — callers treat null as "no
 *   derivation possible" and fall back to in-app views, never a guessed URL.
 * @example parseGitRemote('https://github.com/acme/app.git') => { host: 'github.com', path: 'acme/app' }
 * @example parseGitRemote('git@git.home:team/app.git') => { host: 'git.home', path: 'team/app' }
 * @example parseGitRemote('') => null
 * @param {string} remoteUrl - Git remote URL as stored on the project.
 * @returns {{host: string, path: string}|null} Lower-cased host and unslashed path.
 ***/
const parseGitRemote = (remoteUrl) => {
  if (typeof remoteUrl !== 'string') return null;
  const trimmed = remoteUrl.trim();
  if (trimmed === '') return null;
  // scp-like syntax: [user@]host:path (no scheme). Parsed with plain
  // string ops (no nested-quantifier regex): the user@ prefix is stripped,
  // a single-letter host is a Windows drive (`C:\...`), not a remote.
  if (!trimmed.includes('://') && trimmed.includes(':')) {
    const colon = trimmed.indexOf(':');
    let left = trimmed.slice(0, colon);
    const at = left.lastIndexOf('@');
    if (at >= 0) left = left.slice(at + 1);
    const path = trimmed
      .slice(colon + 1)
      .replace(/\.git$/, '')
      .replace(/^\/+|\/+$/g, '');
    if (left.length > 1 && !left.includes('/') && path !== '') {
      return { host: left.toLowerCase(), path };
    }
    return null;
  }
  try {
    const url = new URL(trimmed);
    // ssh:// remotes carry user + port (the URL parser splits both off):
    // only the host and path matter for the web URL.
    if (url.protocol === 'ssh:') {
      const path = url.pathname.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '');
      if (url.hostname === '' || path === '') return null;
      return { host: url.hostname.toLowerCase(), path };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const path = url.pathname.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '');
    if (url.hostname === '' || path === '') return null;
    return { host: url.hostname.toLowerCase(), path };
  } catch {
    return null;
  }
};

/***
 * MARK: getRepoHostFileUrl
 * @description Derives the provider web URL for a repo-relative file from
 *   the project's git remote (D13): GitHub and Forgejo/Gitea use
 *   `/src/branch/<branch>/<path>`, GitLab uses `/-/blob/<branch>/<path>`.
 *   Provider detection is hostname-based (`github.com` → github,
 *   `gitlab.com` → gitlab, everything else → forgejo-style generic, which
 *   covers Forgejo/Gitea self-hosts). A self-hosted GitLab on a custom
 *   hostname is therefore rendered forgejo-style — documented limit, loud
 *   404 on the host rather than a silent wrong guess, and fixable by
 *   reporting the host (no silent substitution, per D3). File links need
 *   the branch (the frontend never guesses it): pass `branch` when known;
 *   with an empty path the repo home is linked (branch-free, always valid).
 *   Returns null when no URL can be derived (no remote, unparseable
 *   remote) so callers stay in-app.
 * @example getRepoHostFileUrl('https://github.com/acme/app.git', { path: 'README.md', branch: 'main' }) => 'https://github.com/acme/app/blob/main/README.md'
 * @example getRepoHostFileUrl('git@git.home:team/app.git', { path: 'api/index.js', branch: 'master' }) => 'https://git.home/team/app/src/branch/master/api/index.js'
 * @example getRepoHostFileUrl('https://github.com/acme/app.git', {}) => 'https://github.com/acme/app'
 * @example getRepoHostFileUrl('', { path: 'x' }) => null
 * @param {string} remoteUrl - Git remote URL as stored on the project.
 * @param {Object} [opts] - Options.
 * @param {string} [opts.path=''] - Repo-relative file path (empty → repo home).
 * @param {string} [opts.branch='HEAD'] - Branch or ref to link (required for file links).
 * @returns {string|null} Provider web URL, or null when underivable.
 ***/
export function getRepoHostFileUrl(remoteUrl, { path = '', branch = 'HEAD' } = {}) {
  const parsed = parseGitRemote(remoteUrl);
  const cleanPath = String(path || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  const cleanBranch = String(branch || 'HEAD').trim() || 'HEAD';
  if (!parsed) return null;
  const { host, path: repoPath } = parsed;
  const origin = `https://${host}/${repoPath}`;
  if (cleanPath === '') return origin;
  if (host === 'github.com' || host.endsWith('.github.com')) {
    return `${origin}/blob/${encodeURIComponent(cleanBranch)}/${cleanPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }
  if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) {
    return `${origin}/-/blob/${encodeURIComponent(cleanBranch)}/${cleanPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }
  return `${origin}/src/branch/${encodeURIComponent(cleanBranch)}/${cleanPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

/***
 * MARK: getRepoHostLabel
 * @description Short display name for the provider hosting a remote:
 *   `github.com` → 'GitHub', `gitlab.com` → 'GitLab', any other host →
 *   the hostname itself (honest: the frontend cannot know whether a
 *   self-host is Forgejo, Gitea, or a plain git server). Null when the
 *   remote is unparseable, so callers render nothing.
 * @example getRepoHostLabel('https://github.com/acme/app.git') => 'GitHub'
 * @example getRepoHostLabel('git@git.home:team/app.git') => 'git.home'
 * @example getRepoHostLabel('') => null
 ***/
export const getRepoHostLabel = (remoteUrl) => {
  const parsed = parseGitRemote(remoteUrl);
  if (!parsed) return null;
  if (parsed.host === 'github.com' || parsed.host.endsWith('.github.com')) return 'GitHub';
  if (parsed.host === 'gitlab.com' || parsed.host.endsWith('.gitlab.com')) return 'GitLab';
  return parsed.host;
};

/***
 * MARK: getRepoHostFileUrl default export
 * @description Default-export alias of the provider URL derivation above.
 * @example getRepoHostFileUrl('https://github.com/acme/app.git', {}) => 'https://github.com/acme/app'
 ***/
export default getRepoHostFileUrl;
