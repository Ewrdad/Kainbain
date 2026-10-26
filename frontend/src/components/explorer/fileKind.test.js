// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  IMAGE_EXTENSIONS,
  IMAGE_PREVIEW_MAX_BYTES,
  extensionOf,
  formatFileSize,
  getFileIcon,
  getFileKind,
  isImageKind,
} from './fileKind';

/***
 * MARK: fileKind tests
 * @description Black-box checks for the explorer preview classifier: image
 *   allowlist, case-insensitivity, directory guard, and binary fallback.
 ***/
describe('fileKind classifier', () => {
  it('recognises every supported image extension', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg']) {
      expect(IMAGE_EXTENSIONS).toContain(ext);
      expect(getFileKind({ isDirectory: false, extension: ext })).toBe('image');
    }
  });

  it('matches image extensions case-insensitively', () => {
    expect(getFileKind({ isDirectory: false, extension: '.PNG' })).toBe('image');
    expect(getFileKind({ isDirectory: false, name: 'Photo.JPG' })).toBe('image');
    expect(getFileKind('.SVG')).toBe('image');
  });

  it('classifies markdown, text, and unknown extensions', () => {
    expect(getFileKind({ isDirectory: false, extension: '.md' })).toBe('markdown');
    expect(getFileKind({ isDirectory: false, extension: '.markdown' })).toBe('markdown');
    expect(getFileKind({ isDirectory: false, extension: '.js' })).toBe('text');
    expect(getFileKind({ isDirectory: false, extension: '.txt' })).toBe('text');
    expect(getFileKind({ isDirectory: false, extension: '.xyz' })).toBe('text');
  });

  it('classifies known binary extensions as unsupported', () => {
    expect(getFileKind({ isDirectory: false, extension: '.zip' })).toBe('unsupported-binary');
    expect(getFileKind({ isDirectory: false, extension: '.pdf' })).toBe('unsupported-binary');
    expect(getFileKind({ isDirectory: false, extension: '.mp4' })).toBe('unsupported-binary');
  });

  it('never classifies a directory as an image', () => {
    expect(getFileKind({ isDirectory: true, extension: null, name: 'photos' })).not.toBe('image');
    expect(getFileKind({ isDirectory: true, extension: '.png', name: 'photos.png' })).not.toBe(
      'image',
    );
  });

  it('derives the extension from the file name when none is given', () => {
    expect(getFileKind({ isDirectory: false, name: 'logo.svg' })).toBe('image');
    expect(getFileKind({ isDirectory: false, name: 'notes.md' })).toBe('markdown');
    expect(getFileKind({ isDirectory: false, path: 'docs/a/spec.markdown' })).toBe('markdown');
    expect(getFileKind('archive.zip')).toBe('unsupported-binary');
  });

  it('trusts the server-provided kind when present', () => {
    expect(getFileKind({ isDirectory: false, extension: '.png', kind: 'image' })).toBe('image');
    expect(getFileKind({ isDirectory: false, extension: '.png', kind: 'text' })).toBe('text');
  });

  it('exposes isImageKind for entries and kind strings', () => {
    expect(isImageKind({ isDirectory: false, extension: '.png' })).toBe(true);
    expect(isImageKind({ isDirectory: false, extension: '.md' })).toBe(false);
    expect(isImageKind({ isDirectory: true })).toBe(false);
    expect(isImageKind('image')).toBe(true);
    expect(isImageKind('text')).toBe(false);
  });

  it('extracts extensions from mixed inputs', () => {
    expect(extensionOf('.PNG')).toBe('.png');
    expect(extensionOf('photo.JPG')).toBe('.jpg');
    expect(extensionOf({ extension: '.SVG' })).toBe('.svg');
    expect(extensionOf({ name: 'no-extension' })).toBe('');
    expect(extensionOf(null)).toBe('');
  });

  it('keeps the preview cap aligned with the backend (15 MB)', () => {
    expect(IMAGE_PREVIEW_MAX_BYTES).toBe(15 * 1024 * 1024);
  });

  it('formats file sizes accurately', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1048576)).toBe('1.00 MB');
  });

  it('assigns an image icon to image files and keeps existing mappings', () => {
    expect(getFileIcon({ isDirectory: true })).toBe('📁');
    expect(getFileIcon({ isDirectory: false, extension: '.png' })).toBe('🖼️');
    expect(getFileIcon({ isDirectory: false, extension: '.JPG' })).toBe('🖼️');
    expect(getFileIcon({ isDirectory: false, extension: '.svg' })).toBe('🖼️');
    expect(getFileIcon({ isDirectory: false, extension: '.md' })).toBe('📝');
    expect(getFileIcon({ isDirectory: false, extension: '.json' })).toBe('📦');
    expect(getFileIcon({ isDirectory: false, extension: '.js' })).toBe('⚡');
    expect(getFileIcon({ isDirectory: false, extension: '.log' })).toBe('📋');
  });
});
