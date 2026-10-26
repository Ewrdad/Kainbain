import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../../testUtils';
import { StorageSection } from './StorageSection';

/**
 * MARK: StorageSection tests
 * @description Black-box coverage for the System Settings › Storage tab: the
 *   four global storage locations render from the live config-spec payload
 *   (never the old `~/.kainbain` wireframe constants), the installation
 *   directory derives from the served dist dir, rows carry their env-var
 *   name, copy sends the live value to the clipboard, and load failure
 *   offers a Retry that refetches. The api module and the clipboard helper
 *   are mocked; values are asserted from the payload.
 */

const getConfigSpec = vi.hoisted(() => vi.fn());
const copyToClipboard = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getConfigSpec },
}));

vi.mock('../../services/clipboard', () => ({
  copyToClipboard,
}));

function entry(key, env, value, source = 'env', doc = `${key} doc`) {
  return { key, env, value, default: value, type: 'path', group: 'storage', doc, source, secret: false };
}

const CONFIG_PAYLOAD = vi.hoisted(() => ({
  entries: [
    entry('projectsRoot', 'PROJECTS_ROOT', '/home/server/projects'),
    entry('siteDocsDir', 'KAINBAIN_SITE_DOCS', '/home/server/projects/kainbain/site-docs'),
    entry('notesSpaceRoot', 'NOTES_SPACE_ROOT', '/home/server/apps/notes/silverbullet/space/Projects/Personal'),
    entry('agyBin', 'KAINBAIN_AGY_BIN', 'agy'),
    entry('museBin', 'KAINBAIN_MUSE_BIN', 'muse'),
    entry('opencodeBin', 'KAINBAIN_OPENCODE_BIN', 'opencode'),
    entry('vibeBin', 'KAINBAIN_VIBE_BIN', 'vibe'),
    entry('distDir', 'KAINBAIN_DIST', '/home/server/projects/kainbain/frontend/dist'),
    entry('piAgentDir', 'PI_AGENT_DIR', '/home/someone/.pi/agent'),
    entry('port', 'PORT', 3100),
  ],
  warnings: [],
}));

beforeEach(() => {
  getConfigSpec.mockReset();
  copyToClipboard.mockReset();
  getConfigSpec.mockResolvedValue(CONFIG_PAYLOAD);
  copyToClipboard.mockResolvedValue(true);
});

test('renders the four documented locations with live backend values', async () => {
  renderWithKainBain(<StorageSection />);

  expect(await screen.findByTestId('storage-section')).toBeInTheDocument();
  expect(getConfigSpec).toHaveBeenCalledTimes(1);

  // Projects folder with its env-var name.
  expect(screen.getByTestId('storage-row-projectsRoot')).toBeInTheDocument();
  expect(screen.getByLabelText('Projects folder')).toHaveValue('/home/server/projects');
  expect(screen.getByText(/PROJECTS_ROOT · env/)).toBeInTheDocument();

  // Centralised docs: the linked notes space only — the in-app Docs tab
  // directory is intentionally not a setting (human rejection 2026-10-07).
  expect(screen.getByLabelText('Centralised docs location')).toHaveValue(
    '/home/server/apps/notes/silverbullet/space/Projects/Personal',
  );
  expect(screen.queryByLabelText('In-app docs (Docs tab)')).not.toBeInTheDocument();
  expect(screen.queryByTestId('storage-row-siteDocsDir')).not.toBeInTheDocument();

  // Harness check locations: one row per binary knob.
  expect(screen.getByLabelText('agy binary (antigravity harness)')).toHaveValue('agy');
  expect(screen.getByLabelText('muse binary (muse harness)')).toHaveValue('muse');
  expect(screen.getByLabelText('opencode binary (opencode harness)')).toHaveValue('opencode');
  expect(screen.getByLabelText('vibe binary (vibe harness)')).toHaveValue('vibe');
});

test('derives the installation directory from the served dist dir', async () => {
  renderWithKainBain(<StorageSection />);

  expect(await screen.findByTestId('storage-row-installDir')).toBeInTheDocument();
  expect(screen.getByLabelText('Installation directory')).toHaveValue(
    '/home/server/projects/kainbain',
  );
  expect(screen.getByLabelText('Built frontend served by the API')).toHaveValue(
    '/home/server/projects/kainbain/frontend/dist',
  );
});

test('values follow the payload, never hardcoded constants', async () => {
  getConfigSpec.mockResolvedValue({
    entries: [
      entry('projectsRoot', 'PROJECTS_ROOT', '/srv/other/projects', 'env'),
      entry('notesSpaceRoot', 'NOTES_SPACE_ROOT', '/srv/other/notes', 'env'),
      entry('agyBin', 'KAINBAIN_AGY_BIN', '/opt/bin/agy', 'env'),
      entry('museBin', 'KAINBAIN_MUSE_BIN', '/opt/bin/muse', 'env'),
      entry('opencodeBin', 'KAINBAIN_OPENCODE_BIN', '/opt/bin/opencode', 'env'),
      entry('vibeBin', 'KAINBAIN_VIBE_BIN', '/opt/bin/vibe', 'env'),
      entry('distDir', 'KAINBAIN_DIST', '/srv/other/frontend/dist', 'env'),
    ],
    warnings: [],
  });
  renderWithKainBain(<StorageSection />);

  expect(await screen.findByTestId('storage-section')).toBeInTheDocument();
  expect(screen.getByLabelText('Projects folder')).toHaveValue('/srv/other/projects');
  expect(screen.getByLabelText('Centralised docs location')).toHaveValue('/srv/other/notes');
  expect(screen.queryByTestId('storage-row-siteDocsDir')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Installation directory')).toHaveValue('/srv/other');
  // The retired wireframe constant is gone from the tab.
  expect(screen.queryByDisplayValue('~/.kainbain')).not.toBeInTheDocument();
});

test('a location the payload omits stays visible, padded as (not set) with its env name', async () => {
  // Schema drift / older backend: a reported-but-unlisted location is NEVER
  // silently dropped — it pads in as an honest placeholder so the four
  // requested locations keep rendering.
  getConfigSpec.mockResolvedValue({
    entries: CONFIG_PAYLOAD.entries.filter(
      (e) => !['notesSpaceRoot', 'distDir'].includes(e.key),
    ),
    warnings: [],
  });
  renderWithKainBain(<StorageSection />);

  expect(await screen.findByTestId('storage-section')).toBeInTheDocument();
  expect(screen.getByTestId('storage-group-docs')).toBeInTheDocument();
  expect(screen.getByLabelText('Centralised docs location')).toHaveValue('(not set)');
  expect(screen.getByText('NOTES_SPACE_ROOT · missing')).toBeInTheDocument();
  expect(screen.getByText(/Not reported by the running backend — NOTES_SPACE_ROOT/)).toBeInTheDocument();
  // Nothing to copy when the value does not exist.
  expect(screen.getByRole('button', { name: 'Copy Centralised docs location' })).toBeDisabled();

  // distDir is missing as well: its row pads to (not set), and the synthetic
  // install dir cannot be derived from a value that does not exist.
  expect(screen.getByLabelText('Built frontend served by the API')).toHaveValue('(not set)');
  expect(screen.getByLabelText('Installation directory')).toHaveValue('(not set)');
  expect(screen.getByRole('button', { name: 'Copy Installation directory' })).toBeDisabled();
});

test('rows are read-only and copy sends the live value to the clipboard', async () => {
  renderWithKainBain(<StorageSection />);

  const projectsInput = await screen.findByLabelText('Projects folder');
  expect(projectsInput).toHaveAttribute('readonly');

  fireEvent.click(screen.getByRole('button', { name: 'Copy Projects folder' }));
  expect(copyToClipboard).toHaveBeenCalledWith('/home/server/projects');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Copy Projects folder' })).toHaveTextContent(
      'Copied',
    ),
  );
});

test('load failure shows an error with Retry that refetches live values', async () => {
  getConfigSpec.mockRejectedValueOnce(new Error('boom'));
  renderWithKainBain(<StorageSection />);

  expect(await screen.findByTestId('storage-section-error')).toBeInTheDocument();
  expect(screen.getByText(/Could not load storage settings/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('storage-section')).toBeInTheDocument();
  expect(getConfigSpec).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Projects folder')).toHaveValue('/home/server/projects');
});

test('empty config renders an honest empty state, never fake paths', async () => {
  getConfigSpec.mockResolvedValue({ entries: [], warnings: [] });
  renderWithKainBain(<StorageSection />);

  expect(await screen.findByTestId('storage-section-empty')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('~/.kainbain')).not.toBeInTheDocument();
});
