// jsdom pin: this suite needs window.confirm stub (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { SkillsSection, serverErrorMessage, isSkillFile } from './SkillsSection';
import {
  assertAllNamed,
  assertDialogLabelled,
  assertHeadingOrder,
} from '../../a11y/a11yTestHelpers';
import '@testing-library/jest-dom';

/***
 * MARK: SkillsSection tests
 * @description Black-box coverage for Settings › Skills: grouped
 *   default/custom rendering, invalid + shadow badges, preview modal, import
 *   success/warnings/409/400 states with list refresh, delete confirm flow,
 *   and empty/error states. The api module is mocked; the shared skills
 *   context is provided per-test through renderWithKainBain overrides.
 ***/

vi.mock('../../services/api', () => ({
  api: {
    importSkill: vi.fn(),
    deleteSkill: vi.fn(),
  },
}));
vi.mock('../../services/logger', () => ({ logger: { error: vi.fn() } }));

import { api } from '../../services/api';

const GLOBAL_SKILLS = [
  {
    name: 'creating-new-tickets',
    description: 'Create follow-on KainBain tasks via the API.',
    source: 'global',
    path: '/skills/creating-new-tickets/SKILL.md',
    hasConfig: true,
    config: {},
    keywords: {},
    markdownChars: 500,
  },
  {
    name: 'stage-verdict',
    description: 'Verdict formatting.',
    source: 'global',
    path: '/skills/stage-verdict/SKILL.md',
    hasConfig: false,
    config: {},
    keywords: {},
    markdownChars: 100,
  },
];

const CUSTOM_SKILLS = [
  {
    name: 'my-guide',
    description: 'A custom guide.',
    source: 'project',
    path: '/proj/skills/my-guide/SKILL.md',
    hasConfig: false,
    config: {},
    keywords: {},
    markdownChars: 200,
  },
];

function renderSection(overrides = {}) {
  const fetchSkills = vi.fn().mockResolvedValue([]);
  const getSkillByName = vi.fn().mockResolvedValue(null);
  renderWithKainBain(<SkillsSection activeProjectId="proj-1" />, {
    skills: [...GLOBAL_SKILLS, ...CUSTOM_SKILLS],
    skillsLoading: false,
    skillsError: null,
    fetchSkills,
    getSkillByName,
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
    ...overrides,
  });
  return { fetchSkills, getSkillByName };
}

function pickFile(filename, content = '# Guide') {
  const input = screen.getByLabelText('Skill file (.md or .zip)');
  const file = new File([content], filename, { type: 'text/markdown' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('renders grouped defaults and customs with counts', () => {
  renderSection();
  expect(screen.getByText('Custom skills (1)')).toBeInTheDocument();
  expect(screen.getByText('KainBain defaults (2)')).toBeInTheDocument();
  expect(screen.getByText('my-guide')).toBeInTheDocument();
  expect(screen.getByText('creating-new-tickets')).toBeInTheDocument();
});

test('fetches the library on mount for the active project', () => {
  const { fetchSkills } = renderSection();
  expect(fetchSkills).toHaveBeenCalledWith('proj-1');
});

test('shows delete only for custom skills, never for defaults', () => {
  renderSection();
  expect(screen.getByRole('button', { name: 'Delete custom skill my-guide' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Delete custom skill creating-new-tickets' }),
  ).not.toBeInTheDocument();
});

test('flags invalid skills and global shadowing with badges', () => {
  renderSection({
    skills: [
      ...GLOBAL_SKILLS,
      {
        name: 'creating-new-tickets',
        description: 'Project override.',
        source: 'project',
        path: '/proj/skills/creating-new-tickets/SKILL.md',
        hasConfig: false,
        config: {},
        keywords: {},
        markdownChars: 50,
        invalid: true,
        error: 'KB_config.json parse error: boom',
      },
    ],
  });
  // The custom row carries both badges; the default row carries neither.
  const customGroup = screen.getByRole('region', { name: 'Custom skills' });
  expect(within(customGroup).getByText('Invalid')).toBeInTheDocument();
  expect(within(customGroup).getByText('Shadows default')).toBeInTheDocument();
  expect(within(customGroup).getByText(/KB_config.json parse error/)).toBeInTheDocument();
  // The shadowed default is retained under KainBain defaults (q3: both rows render).
  const defaultGroup = screen.getByRole('region', { name: 'KainBain default skills' });
  expect(within(defaultGroup).getByText('creating-new-tickets')).toBeInTheDocument();
  expect(within(defaultGroup).queryByText('Shadows default')).not.toBeInTheDocument();
  expect(within(defaultGroup).getByText('Create follow-on KainBain tasks via the API.')).toBeInTheDocument();
  expect(within(customGroup).getByText('Project override.')).toBeInTheDocument();
});

test('opens a preview modal with the raw markdown', async () => {
  const { getSkillByName } = renderSection();
  getSkillByName.mockResolvedValue({ markdown: '# Raw skill body' });

  const previews = screen.getAllByRole('button', { name: 'Preview' });
  fireEvent.click(previews[0]);
  await waitFor(() => expect(getSkillByName).toHaveBeenCalledWith('my-guide', 'proj-1'));
  expect(await screen.findByText('Raw skill body')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByText('Raw skill body')).not.toBeInTheDocument());
});

test('imports a picked file, shows warnings, and refreshes the list', async () => {
  const { fetchSkills } = renderSection();
  api.importSkill.mockResolvedValue({
    skills: [{ name: 'my-guide', source: 'project' }],
    warnings: ["Skill name 'my-guide' derived from the filename (no frontmatter 'name')"],
  });

  pickFile('my-guide.md');
  fireEvent.click(screen.getByRole('button', { name: 'Import Skill' }));

  await waitFor(() => expect(api.importSkill).toHaveBeenCalledTimes(1));
  const [projectId, payload] = api.importSkill.mock.calls[0];
  expect(projectId).toBe('proj-1');
  expect(payload.file.name).toBe('my-guide.md');
  expect(payload.overwrite).toBe(false);
  expect(await screen.findByText(/Imported my-guide/)).toBeInTheDocument();
  expect(await screen.findByText(/derived from the filename/)).toBeInTheDocument();
  await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(2));
});

test('sends the name override and overwrite consent when set', async () => {
  renderSection();
  api.importSkill.mockResolvedValue({ skills: [{ name: 'renamed' }], warnings: [] });

  pickFile('guide.md');
  fireEvent.change(screen.getByLabelText('Name override (optional)'), {
    target: { value: 'renamed' },
  });
  fireEvent.click(screen.getByLabelText(/Overwrite an existing custom skill/));
  fireEvent.click(screen.getByRole('button', { name: 'Import Skill' }));

  await waitFor(() => expect(api.importSkill).toHaveBeenCalledTimes(1));
  expect(api.importSkill.mock.calls[0][1].name).toBe('renamed');
  expect(api.importSkill.mock.calls[0][1].overwrite).toBe(true);
});

test('surfaces a 409 clash with the overwrite hint and no list refresh', async () => {
  const { fetchSkills } = renderSection();
  const clash = new Error('API 409 on /projects/proj-1/skills/import');
  clash.status = 409;
  clash.body = JSON.stringify({ error: "Skill 'my-guide' already exists" });
  api.importSkill.mockRejectedValue(clash);

  pickFile('my-guide.md');
  fireEvent.click(screen.getByRole('button', { name: 'Import Skill' }));

  expect(await screen.findByRole('alert')).toHaveTextContent("Skill 'my-guide' already exists");
  expect(screen.getByText(/needed to retry the clash above/)).toBeInTheDocument();
  await waitFor(() => expect(api.importSkill).toHaveBeenCalledTimes(1));
  expect(fetchSkills).toHaveBeenCalledTimes(1);
});

test('surfaces a 400 validation error from the server message', async () => {
  renderSection();
  const failure = new Error('API 400 on /projects/proj-1/skills/import');
  failure.status = 400;
  failure.body = JSON.stringify({ error: 'Only .md and .zip files can be imported' });
  api.importSkill.mockRejectedValue(failure);

  pickFile('notes.txt', 'hi');
  // Bypass the client-side extension guard to prove the server message wins.
  fireEvent.click(screen.getByRole('button', { name: 'Import Skill' }));
  // Client guard fires first for a .txt pick…
  expect(await screen.findByRole('alert')).toHaveTextContent(/Only .md and .zip/);

  // …while a server 400 on an accepted extension surfaces verbatim.
  failure.body = JSON.stringify({ error: 'Zip entry hops out (rejected)' });
  api.importSkill.mockRejectedValue(failure);
  pickFile('pack.zip', 'junk');
  fireEvent.click(screen.getByRole('button', { name: 'Import Skill' }));
  expect(await screen.findByText(/hops out/)).toBeInTheDocument();
});

test('deletes a custom skill after confirm and refreshes the list', async () => {
  const { fetchSkills } = renderSection();
  api.deleteSkill.mockResolvedValue({ status: 'deleted', name: 'my-guide' });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

  try {
    fireEvent.click(screen.getByRole('button', { name: 'Delete custom skill my-guide' }));
    await waitFor(() => expect(api.deleteSkill).toHaveBeenCalledWith('proj-1', 'my-guide'));
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(2));
  } finally {
    confirm.mockRestore();
  }
});

test('aborts the delete when the confirm is dismissed', async () => {
  renderSection();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

  try {
    fireEvent.click(screen.getByRole('button', { name: 'Delete custom skill my-guide' }));
    expect(api.deleteSkill).not.toHaveBeenCalled();
  } finally {
    confirm.mockRestore();
  }
});

test('shows the custom empty state when no custom skills exist', () => {
  renderSection({ skills: GLOBAL_SKILLS });
  expect(
    screen.getByText('No custom skills yet — import one above to extend this project.'),
  ).toBeInTheDocument();
});

test('shows the fetch error state with a working retry', async () => {
  const { fetchSkills } = renderSection({
    skills: [],
    skillsError: 'boom',
  });
  expect(await screen.findByText(/Failed to load skills: boom/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(fetchSkills).toHaveBeenCalledTimes(2);
});

test('asks for a project when none is active', () => {
  renderWithKainBain(<SkillsSection activeProjectId={null} />, {
    skills: [],
    skillsLoading: false,
    skillsError: null,
    fetchSkills: vi.fn(),
    getSkillByName: vi.fn(),
  });
  expect(screen.getByText('Select a project to manage its skills.')).toBeInTheDocument();
});

test('serverErrorMessage prefers the JSON error, then raw text, then the message', () => {
  expect(serverErrorMessage({ body: '{"error":"Taken"}' })).toBe('Taken');
  expect(serverErrorMessage({ body: 'plain failure' })).toBe('plain failure');
  expect(serverErrorMessage(new Error('down'), 'Fallback')).toBe('down');
  expect(serverErrorMessage({}, 'Fallback')).toBe('Fallback');
});

test('isSkillFile accepts only .md and .zip', () => {
  expect(isSkillFile(new File([], 'a.md'))).toBe(true);
  expect(isSkillFile(new File([], 'a.ZIP'))).toBe(true);
  expect(isSkillFile(new File([], 'a.txt'))).toBe(false);
  expect(isSkillFile(null)).toBe(false);
});

const QUESTION_ME_SKILL = {
  name: 'question-me',
  description: 'Generate survey questions.',
  source: 'global',
  path: '/skills/question-me/SKILL.md',
  hasConfig: true,
  config: {
    keywords: {
      outputFile: {
        value: 'SURVEY.md',
        description: 'Name of the task-folder file that holds the question-me rounds.',
      },
      minQuestions: {
        value: '0',
        description: 'Suggested minimum number of questions (0 disables).',
      },
    },
  },
  markdownChars: 900,
};

test('shows a read-only config view with keyword defaults from the list payload', async () => {
  const { getSkillByName } = renderSection({
    skills: [QUESTION_ME_SKILL],
  });

  // The toggle names the skill and counts its keywords, like the stage panel.
  fireEvent.click(screen.getByRole('button', { name: 'Toggle config for question-me' }));

  const panel = await screen.findByTestId('skill-config-question-me');
  expect(within(panel).getByText('outputFile')).toBeInTheDocument();
  expect(within(panel).getByText(/default: SURVEY\.md/)).toBeInTheDocument();
  expect(within(panel).getByText('minQuestions')).toBeInTheDocument();
  expect(within(panel).getByText(/default: 0/)).toBeInTheDocument();
  expect(
    within(panel).getByText(/Defaults are read-only here/),
  ).toBeInTheDocument();
  // List payload already carried the keywords: no detail fetch needed.
  expect(getSkillByName).not.toHaveBeenCalled();

  // Collapsing hides the panel again.
  fireEvent.click(screen.getByRole('button', { name: 'Toggle config for question-me' }));
  await waitFor(() =>
    expect(screen.queryByTestId('skill-config-question-me')).not.toBeInTheDocument(),
  );
});

test('fetches detail keywords when the list entry carries none', async () => {
  const { getSkillByName } = renderSection({
    skills: [
      {
        name: 'thin-skill',
        description: 'A skill with config but no list keywords.',
        source: 'global',
        path: '/skills/thin-skill/SKILL.md',
        hasConfig: true,
        config: {},
        keywords: {},
        markdownChars: 50,
      },
    ],
  });
  getSkillByName.mockResolvedValue({
    config: { keywords: { outputFile: { value: 'FEEDBACK.md' } } },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Toggle config for thin-skill' }));
  await waitFor(() => expect(getSkillByName).toHaveBeenCalledWith('thin-skill', 'proj-1'));
  const panel = await screen.findByTestId('skill-config-thin-skill');
  expect(within(panel).getByText('outputFile')).toBeInTheDocument();
  expect(within(panel).getByText(/default: FEEDBACK\.md/)).toBeInTheDocument();
});

test('hides the config toggle for skills without config', () => {
  renderSection();
  expect(
    screen.queryByRole('button', { name: 'Toggle config for stage-verdict' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Toggle config for my-guide' }),
  ).not.toBeInTheDocument();
});

test('meets the repo a11y contracts: named controls, heading order, labelled preview dialog', async () => {
  const { getSkillByName } = renderSection();
  getSkillByName.mockResolvedValue({ markdown: '# Preview body' });

  assertAllNamed(document.body);
  assertHeadingOrder(document.body);

  fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
  const dialog = await screen.findByRole('dialog');
  assertDialogLabelled(dialog);
});
