// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { getFileRawUrl, houseRequests } from './index.js';

/***
 * MARK: house getFileRawUrl tests
 * @description Covers the direct raw-bytes URL builder behind `<img src>`
 *   and download links (encoding, empty-base same-origin form).
 ***/
describe('getFileRawUrl', () => {
  it('builds an encoded raw URL under the API base', () => {
    expect(getFileRawUrl('http://localhost:3100', 'proj-1', 'img/logo.png')).toBe(
      'http://localhost:3100/projects/proj-1/files/raw?path=img%2Flogo.png',
    );
  });

  it('encodes spaces and special characters in the file path', () => {
    expect(getFileRawUrl('http://localhost:3100', 'proj-1', 'my docs/a b.png')).toBe(
      'http://localhost:3100/projects/proj-1/files/raw?path=my%20docs%2Fa%20b.png',
    );
  });

  it('falls back to a same-origin relative URL without a base', () => {
    expect(getFileRawUrl('', 'proj-1', 'logo.png')).toBe(
      '/projects/proj-1/files/raw?path=logo.png',
    );
  });
});

/***
 * MARK: house skill import/delete client tests
 * @description Pins the Settings › Skills tab's request contracts: multipart
 *   FormData uploads (file + optional name/overwrite fields) and the
 *   encoded DELETE path.
 ***/
describe('house skill import requests', () => {
  it('uploads the skill file as multipart form data', async () => {
    const request = vi.fn().mockResolvedValue({ skills: [], warnings: [] });
    const file = new File(['# Guide'], 'guide.md', { type: 'text/markdown' });
    await houseRequests(request).importSkill('p1', { file });

    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/projects/p1/skills/import');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file').name).toBe('guide.md');
    expect(options.body.has('name')).toBe(false);
    expect(options.body.has('overwrite')).toBe(false);
  });

  it('carries the name override and overwrite consent as text fields', async () => {
    const request = vi.fn().mockResolvedValue({ skills: [], warnings: [] });
    const file = new File(['# Guide'], 'guide.md', { type: 'text/markdown' });
    await houseRequests(request).importSkill('p1', {
      file,
      name: 'renamed',
      overwrite: true,
    });

    const options = request.mock.calls[0][1];
    expect(options.body.get('name')).toBe('renamed');
    expect(options.body.get('overwrite')).toBe('true');
  });

  it('deletes skills with an encoded path', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'deleted' });
    await houseRequests(request).deleteSkill('p1', 'my skill');

    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/projects/p1/skills/my%20skill');
    expect(options.method).toBe('DELETE');
  });
});
