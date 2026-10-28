import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { FilePreview } from './FilePreview';
import '@testing-library/jest-dom';

/***
 * MARK: FilePreview tests
 * @description Verifies the explorer preview dispatch: images render an
 *   <img> with loading/loaded/error states, oversize and binary files offer
 *   downloads, and markdown/code rendering is unchanged.
 ***/
describe('FilePreview Component', () => {
  const rawUrl = 'http://localhost:3100/projects/proj-1/files/raw?path=logo.png';

  it('renders an image entry as an <img> with expected src and alt', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'logo.png',
          path: 'logo.png',
          content: null,
          size: 512,
          extension: '.png',
          kind: 'image',
        }}
        selectedFile={{
          name: 'logo.png',
          path: 'logo.png',
          isDirectory: false,
          size: 512,
          extension: '.png',
        }}
        previewMode="rendered"
        lines={[]}
        rawUrl={rawUrl}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    const img = screen.getByAltText('logo.png');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', rawUrl);
    expect(screen.getByLabelText('Loading image preview')).toBeInTheDocument();
  });

  it('derives the image kind from the entry when the server omits kind', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'photo.JPG',
          path: 'photo.JPG',
          content: null,
          size: 100,
          extension: '.JPG',
        }}
        selectedFile={{
          name: 'photo.JPG',
          path: 'photo.JPG',
          isDirectory: false,
          size: 100,
          extension: '.JPG',
        }}
        previewMode="rendered"
        lines={[]}
        rawUrl={rawUrl}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    expect(screen.getByAltText('photo.JPG')).toBeInTheDocument();
  });

  it('shows natural dimensions once the image loads', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'logo.png',
          path: 'logo.png',
          content: null,
          size: 512,
          extension: '.png',
          kind: 'image',
        }}
        selectedFile={{
          name: 'logo.png',
          path: 'logo.png',
          isDirectory: false,
          size: 512,
          extension: '.png',
        }}
        previewMode="rendered"
        lines={[]}
        rawUrl={rawUrl}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    const img = screen.getByAltText('logo.png');
    Object.defineProperty(img, 'naturalWidth', { value: 800 });
    Object.defineProperty(img, 'naturalHeight', { value: 600 });
    fireEvent.load(img);

    expect(screen.getByText(/512 B • 800×600/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading image preview')).not.toBeInTheDocument();
  });

  it('shows a download fallback when the image fails to load', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'logo.png',
          path: 'logo.png',
          content: null,
          size: 512,
          extension: '.png',
          kind: 'image',
        }}
        selectedFile={{
          name: 'logo.png',
          path: 'logo.png',
          isDirectory: false,
          size: 512,
          extension: '.png',
        }}
        previewMode="rendered"
        lines={[]}
        rawUrl={rawUrl}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    fireEvent.error(screen.getByAltText('logo.png'));

    expect(screen.getByText(/Could not load this image/)).toBeInTheDocument();
    const download = screen.getByRole('link', { name: /Download logo.png/i });
    expect(download).toHaveAttribute('href', rawUrl);
  });

  it('shows a download state instead of fetching oversize images', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'huge.png',
          path: 'huge.png',
          content: null,
          size: 16 * 1024 * 1024,
          extension: '.png',
          kind: 'image',
        }}
        selectedFile={{
          name: 'huge.png',
          path: 'huge.png',
          isDirectory: false,
          size: 16 * 1024 * 1024,
          extension: '.png',
        }}
        previewMode="rendered"
        lines={[]}
        rawUrl={rawUrl}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    expect(screen.getByText(/too large to preview/i)).toBeInTheDocument();
    expect(screen.queryByAltText('huge.png')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download huge.png/i })).toBeInTheDocument();
  });

  it('offers a download for unsupported binary files', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'archive.zip',
          path: 'archive.zip',
          content: null,
          size: 99,
          extension: '.zip',
          kind: 'unsupported-binary',
        }}
        selectedFile={{
          name: 'archive.zip',
          path: 'archive.zip',
          isDirectory: false,
          size: 99,
          extension: '.zip',
        }}
        previewMode="rendered"
        lines={[]}
        rawUrl={rawUrl}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    expect(screen.getByText(/Preview unavailable for this file type/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download archive.zip/i })).toBeInTheDocument();
  });

  it('keeps markdown rendering unchanged', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'README.md',
          path: 'README.md',
          content: '# Hello',
          size: 7,
          extension: '.md',
        }}
        selectedFile={{
          name: 'README.md',
          path: 'README.md',
          isDirectory: false,
          size: 7,
          extension: '.md',
        }}
        previewMode="rendered"
        lines={['# Hello']}
        rawUrl={null}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('keeps code rendering with line numbers unchanged', () => {
    renderWithKainBain(
      <FilePreview
        fileContent={{
          name: 'a.json',
          path: 'a.json',
          content: '{"a": 1}',
          size: 9,
          extension: '.json',
        }}
        selectedFile={{
          name: 'a.json',
          path: 'a.json',
          isDirectory: false,
          size: 9,
          extension: '.json',
        }}
        previewMode="raw"
        lines={['{"a": 1}']}
        rawUrl={null}
      />,
      { projects: [], activeProjectId: 'proj-1' },
    );

    expect(screen.getByText('{"a": 1}')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
