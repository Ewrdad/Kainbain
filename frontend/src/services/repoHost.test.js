import { expect, test, describe } from 'vitest';
import { getRepoHostFileUrl, getRepoHostLabel } from './repoHost';

/***
 * MARK: repoHost Unit Tests
 * @description Verifies D13 provider derivation: GitHub/GitLab/Forgejo URL
 *   shapes, scp-like remotes, and the null fallbacks (no remote, bad
 *   input, empty path) that keep callers in-app instead of guessing.
 ***/
describe('getRepoHostFileUrl', () => {
  test('derives GitHub blob URLs', () => {
    expect(
      getRepoHostFileUrl('https://github.com/acme/app.git', {
        path: 'README.md',
        branch: 'main',
      }),
    ).toBe('https://github.com/acme/app/blob/main/README.md');
  });

  test('derives GitLab blob URLs', () => {
    expect(
      getRepoHostFileUrl('https://gitlab.com/acme/app.git', {
        path: 'api/index.js',
        branch: 'master',
      }),
    ).toBe('https://gitlab.com/acme/app/-/blob/master/api/index.js');
  });

  test('derives Forgejo-style URLs for other hosts', () => {
    expect(
      getRepoHostFileUrl('git@git.home:team/app.git', {
        path: 'api/index.js',
        branch: 'master',
      }),
    ).toBe('https://git.home/team/app/src/branch/master/api/index.js');
  });

  test('accepts remotes without .git and ssh:// scheme', () => {
    expect(getRepoHostFileUrl('https://github.com/acme/app', { path: 'x.md' })).toBe(
      'https://github.com/acme/app/blob/HEAD/x.md',
    );
    expect(getRepoHostFileUrl('ssh://git@git.home:222/team/app.git', { path: 'x.md' })).toBe(
      'https://git.home/team/app/src/branch/HEAD/x.md',
    );
  });

  test('links the repo home when no path is given', () => {
    expect(getRepoHostFileUrl('https://github.com/acme/app.git', {})).toBe(
      'https://github.com/acme/app',
    );
  });

  test('returns null when nothing derivable', () => {
    expect(getRepoHostFileUrl('', { path: 'x.md' })).toBe(null);
    expect(getRepoHostFileUrl(null, { path: 'x.md' })).toBe(null);
    expect(getRepoHostFileUrl('not a url', { path: 'x.md' })).toBe(null);
    expect(getRepoHostFileUrl('ftp://host/app.git', { path: 'x.md' })).toBe(null);
  });

  test('labels providers honestly', () => {
    expect(getRepoHostLabel('https://github.com/acme/app.git')).toBe('GitHub');
    expect(getRepoHostLabel('https://gitlab.com/acme/app.git')).toBe('GitLab');
    expect(getRepoHostLabel('git@git.home:team/app.git')).toBe('git.home');
    expect(getRepoHostLabel('')).toBe(null);
    expect(getRepoHostLabel('not a url')).toBe(null);
  });
});
