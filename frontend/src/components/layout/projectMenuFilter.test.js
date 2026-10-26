import { describe, expect, test } from 'vitest';
import { filterProjects } from './projectMenuFilter';

/***
 * MARK: filterProjects tests
 * @description Unit coverage for the project-menu search matcher: blank
 *   queries pass the list through, matching is a case-insensitive trimmed
 *   substring on `name`, and extra fields (notably `group`) survive.
 ***/
describe('filterProjects', () => {
  const projects = [
    { id: 'p1', name: 'Build API', group: 'Platform' },
    { id: 'p2', name: 'build pipeline' },
    { id: 'p3', name: 'Docs Site', accentColor: '#ff0000' },
  ];

  test('blank query returns the input list unchanged (same reference)', () => {
    expect(filterProjects(projects, '')).toBe(projects);
    expect(filterProjects(projects, '   ')).toBe(projects);
    expect(filterProjects(projects)).toBe(projects);
    expect(filterProjects(projects, null)).toBe(projects);
  });

  test('matches case-insensitively on name', () => {
    expect(filterProjects(projects, 'build').map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(filterProjects(projects, 'BUILD').map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(filterProjects(projects, 'docs').map((p) => p.id)).toEqual(['p3']);
  });

  test('trims the query before matching', () => {
    expect(filterProjects(projects, '  docs  ').map((p) => p.id)).toEqual(['p3']);
  });

  test('no match returns an empty list', () => {
    expect(filterProjects(projects, 'zzz-no-such-project')).toEqual([]);
  });

  test('preserves extra fields including group on the same object references', () => {
    const result = filterProjects(projects, 'build');
    expect(result[0]).toBe(projects[0]);
    expect(result[0].group).toBe('Platform');
    expect(filterProjects(projects, 'docs')[0].accentColor).toBe('#ff0000');
  });

  test('tolerates missing names and non-array input', () => {
    expect(filterProjects([{ id: 'x' }, { id: 'y', name: null }], 'x')).toEqual([]);
    expect(filterProjects(undefined, 'a')).toEqual([]);
    expect(filterProjects(null, '')).toEqual([]);
  });
});
