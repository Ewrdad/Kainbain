// jsdom pin: this suite needs native select/option click semantics (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { StageSkillsPanel, estimateSkillsChars, keywordDefaultValue, keywordStoredText } from './StageSkillsPanel';
import '@testing-library/jest-dom';

// The panel mounts useKbReferenceData (cascading KB reference data), so the
// API service must be mocked for deterministic selector tests.
vi.mock('../../services/api', () => ({
  api: {
    listProjects: vi.fn(),
    getWorkflows: vi.fn(),
  },
}));
vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../../services/api';

/***
 * MARK: StageSkillsPanel tests
 * @description Verifies the per-stage skills panel: available-skills picker with
 *   multi-add, Option/Direct mode toggle, KB_config keyword config editor with
 *   raw-JSON escape hatch, preview modal, removal, and the live context-size
 *   readout. All mutations flow through onChange so saves ride the existing
 *   saveStages path.
 ***/

const library = [
  {
    name: 'creating-new-tickets',
    description: 'Create follow-on KainBain tasks via the API.',
    source: 'global',
    path: '/skills/creating-new-tickets/SKILL.md',
    hasConfig: true,
    config: {
      keywords: {
        targetStage: { value: 'Intake', description: 'Where to put new tasks' },
      },
    },
    markdownChars: 500,
  },
  {
    name: 'plain-skill',
    description: 'A skill with no config.',
    source: 'global',
    path: '/skills/plain-skill/SKILL.md',
    hasConfig: false,
    config: {},
    markdownChars: 100,
  },
];

const rawSkill = {
  name: 'creating-new-tickets',
  description: 'Create follow-on KainBain tasks via the API.',
  source: 'global',
  path: '/skills/creating-new-tickets/SKILL.md',
  config: { keywords: { targetStage: { value: 'Intake' } } },
  markdown: '---\nname: creating-new-tickets\ndescription: d\n---\n# Creating New Tickets\nCreate tickets into {{targetStage}}.',
  body: '# Creating New Tickets\nCreate tickets into {{targetStage}}.',
};

const stage = { id: '5', name: 'In Progress', type: 'agent', prompt: 'Do work' };

function renderPanel(overrides = {}) {
  const props = {
    stage,
    skills: library,
    fetchSkills: () => {},
    getSkillByName: (name) => (name === 'creating-new-tickets' ? rawSkill : null),
    activeProjectId: 'proj-1',
    onChange: () => {},
    ...overrides,
  };
  return renderWithKainBain(<StageSkillsPanel {...props} />, { activeProjectId: 'proj-1' });
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
  api.listProjects.mockResolvedValue(kbProjects);
  api.getWorkflows.mockResolvedValue(kbWorkflowsPayload);
});

test('renders an empty state with no attachments and shows the budget readout', () => {
  renderPanel();
  expect(screen.getByTestId('stage-skills-panel-5')).toBeInTheDocument();
  expect(screen.getByText(/No skills attached/)).toBeInTheDocument();
  const readout = screen.getByTestId('skills-budget-readout');
  expect(readout).toHaveTextContent('0/16000 chars');
});

test('multi-add from the searchable picker writes stage.skills via onChange', async () => {
  const onChange = vi.fn();
  renderPanel({ onChange });

  fireEvent.click(screen.getByRole('button', { name: /Add skills to In Progress/i }));
  const picker = screen.getByTestId('skills-picker');
  expect(picker).toBeInTheDocument();

  // Search narrows the list.
  fireEvent.change(screen.getByLabelText('Search skills'), { target: { value: 'tickets' } });
  fireEvent.click(screen.getByRole('button', { name: /Attach skill creating-new-tickets/i }));

  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      skills: [{ name: 'creating-new-tickets', mode: 'direct', config: {} }],
    }),
  );
});

test('mode toggle switches an attachment between Option and Direct', () => {
  const onChange = vi.fn();
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config: {} }],
  };
  renderPanel({ stage: stageWithSkill, onChange });

  const radiogroup = screen.getByRole('radiogroup', {
    name: /Delivery mode for creating-new-tickets/i,
  });
  fireEvent.click(within(radiogroup).getByRole('radio', { name: 'Option' }));

  expect(onChange).toHaveBeenCalledWith({
    skills: [{ name: 'creating-new-tickets', mode: 'option', config: {} }],
  });
});

test('config editor renders KB_config keyword inputs and overrides write stage config', async () => {
  const onChange = vi.fn();
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config: {} }],
  };
  renderPanel({ stage: stageWithSkill, onChange });

  fireEvent.click(screen.getByRole('button', { name: /Toggle config editor for creating-new-tickets/i }));

  const input = await screen.findByLabelText('Keyword targetStage for creating-new-tickets');
  expect(input).toBeInTheDocument();
  // The input starts at the KB_config default ('Intake'); typing an OVERRIDE value
  // writes it into stage.skills[i].config (React dedupes same-value change events).
  fireEvent.change(input, { target: { value: 'Audit Intake' } });

  expect(onChange).toHaveBeenCalledWith({
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config: { targetStage: 'Audit Intake' } }],
  });
});

test('question-me keywords render from the library descriptor with no detail fetch', async () => {
  const onChange = vi.fn();
  const withQuestionMe = [
    ...library,
    {
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
    },
  ];
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'question-me', mode: 'direct', config: {} }],
  };
  // Detail fetch never resolves: the keyword inputs must come from the
  // library descriptor alone so settings are visible immediately on attach.
  renderPanel({
    skills: withQuestionMe,
    stage: stageWithSkill,
    onChange,
    getSkillByName: () => null,
  });

  fireEvent.click(screen.getByRole('button', { name: /Toggle config editor for question-me/i }));

  const outputFile = await screen.findByLabelText('Keyword outputFile for question-me');
  expect(outputFile).toHaveValue('SURVEY.md');
  expect(screen.getByLabelText('Keyword minQuestions for question-me')).toHaveValue('0');

  fireEvent.change(outputFile, { target: { value: 'FEEDBACK.md' } });
  expect(onChange).toHaveBeenCalledWith({
    skills: [{ name: 'question-me', mode: 'direct', config: { outputFile: 'FEEDBACK.md' } }],
  });
});

test('raw JSON escape hatch applies valid objects and rejects invalid JSON', async () => {
  const onChange = vi.fn();
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config: {} }],
  };
  renderPanel({ stage: stageWithSkill, onChange });

  fireEvent.click(screen.getByRole('button', { name: /Toggle config editor for creating-new-tickets/i }));
  fireEvent.click(screen.getByRole('button', { name: /raw JSON/ }));
  const textarea = screen.getByLabelText('Raw config JSON for creating-new-tickets');
  fireEvent.change(textarea, { target: { value: '{ not valid' } });
  fireEvent.click(screen.getByRole('button', { name: /Apply JSON/i }));
  await waitFor(() =>
    expect(screen.getByText(/JSON at position|Unexpected token|Config must be a JSON object/)).toBeInTheDocument(),
  );
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.change(textarea, { target: { value: '{"targetStage":"Intake","custom":"kept"}' } });
  fireEvent.click(screen.getByRole('button', { name: /Apply JSON/i }));
  expect(onChange).toHaveBeenCalledWith({
    skills: [
      {
        name: 'creating-new-tickets',
        mode: 'direct',
        config: { targetStage: 'Intake', custom: 'kept' },
      },
    ],
  });
});

test('preview modal renders the resolved skill markdown', async () => {
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config: { targetStage: 'Audit Intake' } }],
  };
  renderPanel({ stage: stageWithSkill });

  fireEvent.click(screen.getByRole('button', { name: /Preview skill creating-new-tickets/i }));

  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  const dialog = screen.getByRole('dialog');
  // The {{targetStage}} keyword resolves with the stage config override.
  await waitFor(() => expect(within(dialog).getByText(/Create tickets into/)).toBeInTheDocument());
  expect(dialog.textContent).toContain('Audit Intake');
  // Escape closes.
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('remove button drops the skill from stage.skills', () => {
  const onChange = vi.fn();
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'plain-skill', mode: 'option', config: {} }],
  };
  renderPanel({ stage: stageWithSkill, onChange });
  fireEvent.click(screen.getByRole('button', { name: 'Remove skill plain-skill' }));
  expect(onChange).toHaveBeenCalledWith({ skills: [] });
});

test('shows a fetch error in the picker', async () => {
  renderPanel({ skillsError: 'Failed to fetch skills' });
  fireEvent.click(screen.getByRole('button', { name: /Add skills to In Progress/i }));
  await waitFor(() => expect(screen.getByTestId('skills-error')).toBeInTheDocument());
  expect(screen.getByTestId('skills-error')).toHaveTextContent('Failed to fetch skills');
});

test('refresh control re-fetches the skills library', () => {
  const fetchSpy = vi.fn();
  renderPanel({ skillsError: null, fetchSkills: fetchSpy });
  fireEvent.click(screen.getByRole('button', { name: /Refresh skills library for In Progress/i }));
  expect(fetchSpy).toHaveBeenCalledWith('proj-1');
});

test('estimateSkillsChars mirrors the engine accounting for direct and option modes', () => {
  const content = new Map([
    ['direct-skill', { body: 'x'.repeat(200), config: {} }],
    ['option-skill', { description: 'y'.repeat(40), config: {} }],
  ]);
  const total = estimateSkillsChars(
    [
      { name: 'direct-skill', mode: 'direct' },
      { name: 'option-skill', mode: 'option' },
    ],
    content,
  );
  // direct: '## direct-skill\n' (16) + 200; option: ~120 + 40
  expect(total).toBeGreaterThanOrEqual(16 + 200 + 120 + 40 - 10);
  expect(total).toBeLessThanOrEqual(16 + 200 + 160 + 40 + 10);
});

test('over-budget skills turn the readout red', async () => {
  const bigSkill = { ...rawSkill, body: 'z'.repeat(17000) };
  const stageBig = {
    ...stage,
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config: {} }],
  };
  renderPanel({
    stage: stageBig,
    getSkillByName: () => bigSkill,
  });
  const readout = screen.getByTestId('skills-budget-readout');
  await waitFor(() => expect(readout).toHaveTextContent('/16000 chars'));
  await waitFor(() => expect(readout.querySelector('.bg-red-500')).not.toBeNull());
});
// ---------------------------------------------------------------------------
// Cascading KB reference selectors (kbRef-declared keywords)
// ---------------------------------------------------------------------------

const kbProjects = [
  { id: 'proj-1', name: 'Alpha', slug: 'alpha' },
  { id: 'proj-2', name: 'Beta', slug: 'beta' },
];

const kbWorkflowsPayload = {
  workflows: [
    {
      id: 'wf-feature',
      name: 'Feature Pipeline',
      isDefault: true,
      stages: [{ id: 'stage-idea', name: 'Idea' }],
    },
    {
      id: 'wf-hotfix',
      name: 'Hotfix',
      isDefault: false,
      stages: [{ id: 'stage-ship', name: 'Ship' }],
    },
  ],
  activeWorkflowId: 'wf-feature',
};

/** Raw skill whose KB_config carries the full kbRef/dependsOn metadata. */
const kbSkillRaw = {
  name: 'creating-new-tickets',
  description: 'Create follow-on KainBain tasks via the API.',
  source: 'global',
  path: '/skills/creating-new-tickets/SKILL.md',
  config: {
    keywords: {
      kbApiBase: { value: 'http://localhost:3100', description: 'API base' },
      targetProject: { value: '{{project}}', description: 'p', kbRef: 'project' },
      targetWorkflow: {
        value: 'wf-feature',
        description: 'w',
        kbRef: 'workflow',
        dependsOn: 'targetProject',
      },
      targetStage: {
        value: 'stage-idea',
        description: 's',
        kbRef: 'stage',
        dependsOn: 'targetWorkflow',
      },
    },
  },
  markdown: '---\nname: creating-new-tickets\ndescription: d\n---\n# Creating New Tickets\nTargets {{targetStage}}.',
  body: '# Creating New Tickets\nTargets {{targetStage}}.',
};

/***
 * MARK: renderKbPanel
 * @description Renders the panel with a creating-new-tickets attachment whose
 *   raw skill declares kbRef metadata, plus optional stored overrides.
 ***/
function renderKbPanel({ config = {}, onChange = vi.fn(), activeProjectId = 'proj-1' } = {}) {
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config }],
  };
  renderWithKainBain(
    <StageSkillsPanel
      stage={stageWithSkill}
      skills={library}
      fetchSkills={() => {}}
      getSkillByName={(name) => (name === 'creating-new-tickets' ? kbSkillRaw : null)}
      activeProjectId={activeProjectId}
      onChange={onChange}
    />,
    { activeProjectId },
  );
  return { onChange };
}

async function expandConfig() {
  fireEvent.click(screen.getByRole('button', { name: /Toggle config editor for creating-new-tickets/i }));
  await screen.findByRole('combobox', { name: 'Keyword targetProject for creating-new-tickets' });
}

test('renders KB dropdowns for kbRef keywords and a text input for plain keywords', async () => {
  renderKbPanel();
  await expandConfig();
  expect(
    screen.getByRole('combobox', { name: 'Keyword targetProject for creating-new-tickets' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Keyword targetWorkflow for creating-new-tickets' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Keyword targetStage for creating-new-tickets' }),
  ).toBeInTheDocument();
  // kbApiBase declares no kbRef: stays a plain text input.
  const plain = screen.getByLabelText('Keyword kbApiBase for creating-new-tickets');
  expect(plain.tagName).toBe('INPUT');
  expect(plain.getAttribute('role')).not.toBe('combobox');
});

test('selecting a workflow writes the canonical id into stage config via onChange', async () => {
  const onChange = vi.fn();
  renderKbPanel({ onChange });
  await expandConfig();
  const combo = screen.getByRole('combobox', { name: 'Keyword targetWorkflow for creating-new-tickets' });
  fireEvent.click(combo);
  fireEvent.click(await screen.findByRole('option', { name: /Hotfix \(wf-hotfix\)/ }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      skills: [
        { name: 'creating-new-tickets', mode: 'direct', config: { targetWorkflow: 'wf-hotfix' } },
      ],
    }),
  );
});

test('shows the human-readable label for a stored canonical id', async () => {
  renderKbPanel({ config: { targetWorkflow: 'wf-hotfix' } });
  await expandConfig();
  await waitFor(() => expect(api.getWorkflows).toHaveBeenCalledWith('proj-1'));
  expect(
    screen.getByRole('combobox', { name: 'Keyword targetWorkflow for creating-new-tickets' }),
  ).toHaveTextContent('Hotfix (wf-hotfix)');
});

test('changing the project keyword clears dependent workflow/stage overrides', async () => {
  const onChange = vi.fn();
  renderKbPanel({
    onChange,
    config: { targetProject: 'proj-2', targetWorkflow: 'wf-hotfix', targetStage: 'stage-ship' },
  });
  await expandConfig();
  fireEvent.click(screen.getByRole('combobox', { name: 'Keyword targetProject for creating-new-tickets' }));
  fireEvent.click(await screen.findByRole('option', { name: /Alpha \(proj-1\)/ }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      skills: [
        { name: 'creating-new-tickets', mode: 'direct', config: { targetProject: 'proj-1' } },
      ],
    }),
  );
});

test('project selector offers the {{project}} built-in and stores it verbatim', async () => {
  const onChange = vi.fn();
  renderKbPanel({ onChange });
  await expandConfig();
  fireEvent.click(screen.getByRole('combobox', { name: 'Keyword targetProject for creating-new-tickets' }));
  fireEvent.click(screen.getByRole('option', { name: /Use current project/i }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      skills: [
        { name: 'creating-new-tickets', mode: 'direct', config: { targetProject: '{{project}}' } },
      ],
    }),
  );
});

test('stage selector is disabled with a reason when the stored workflow is unknown', async () => {
  renderKbPanel({ config: { targetWorkflow: 'wf-ghost' } });
  await expandConfig();
  const stageCombo = screen.getByRole('combobox', { name: 'Keyword targetStage for creating-new-tickets' });
  expect(stageCombo).toBeDisabled();
  expect(
    screen.getByText(/Parent target workflow does not match a known workflow/),
  ).toBeInTheDocument();
});

test('unmatched legacy stored values render as-is with a custom value badge', async () => {
  renderKbPanel({ config: { targetWorkflow: 'my-legacy-wf' } });
  await expandConfig();
  const combo = screen.getByRole('combobox', { name: 'Keyword targetWorkflow for creating-new-tickets' });
  expect(combo).toHaveTextContent('my-legacy-wf');
  expect(screen.getByText('custom value')).toBeInTheDocument();
});

test('manual entry fallback stores the typed value', async () => {
  const onChange = vi.fn();
  renderKbPanel({ onChange });
  await expandConfig();
  fireEvent.click(screen.getByRole('combobox', { name: 'Keyword targetWorkflow for creating-new-tickets' }));
  fireEvent.click(await screen.findByRole('option', { name: /Enter value manually…/ }));
  const input = screen.getByRole('textbox', {
    name: /Keyword targetWorkflow for creating-new-tickets \(manual entry\)/i,
  });
  fireEvent.change(input, { target: { value: 'wf-manual' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      skills: [
        { name: 'creating-new-tickets', mode: 'direct', config: { targetWorkflow: 'wf-manual' } },
      ],
    }),
  );
});

test('preview modal shows the resolved-targets summary for kbRef keywords', async () => {
  renderKbPanel({
    config: { targetProject: '{{project}}', targetWorkflow: 'wf-hotfix', targetStage: 'stage-ship' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Preview skill creating-new-tickets/i }));
  const dialog = await screen.findByRole('dialog');
  const summary = await within(dialog).findByTestId('preview-resolved-targets');
  await waitFor(() => {
    expect(summary.textContent).toContain('Alpha (proj-1)');
    expect(summary.textContent).toContain('(current project)');
    expect(summary.textContent).toContain('Hotfix (wf-hotfix)');
    expect(summary.textContent).toContain('Ship (stage-ship)');
  });
});

test('preview modal warns for unresolvable stored values', async () => {
  renderKbPanel({ config: { targetWorkflow: 'wf-ghost' } });
  fireEvent.click(screen.getByRole('button', { name: /Preview skill creating-new-tickets/i }));
  const dialog = await screen.findByRole('dialog');
  const summary = await within(dialog).findByTestId('preview-resolved-targets');
  await waitFor(() => {
    expect(summary.textContent).toContain('unresolvable value: wf-ghost');
    // The {{project}} built-in still resolves against the active project.
    expect(summary.textContent).toContain('Alpha (proj-1)');
  });
});

test('keywordDefaultValue mirrors the engine coercion and fails safe', () => {
  expect(keywordDefaultValue('SURVEY.md')).toBe('SURVEY.md');
  expect(keywordDefaultValue({ value: 'FEEDBACK.md' })).toBe('FEEDBACK.md');
  expect(keywordDefaultValue({ value: 5 })).toBe('5');
  expect(keywordDefaultValue(0)).toBe('0');
  expect(keywordDefaultValue(false)).toBe('false');
  expect(keywordDefaultValue({ value: undefined })).toBe('');
  expect(keywordDefaultValue({ other: 'x' })).toBe('');
  expect(keywordDefaultValue(['FEEDBACK.md'])).toBe('');
  expect(keywordDefaultValue(null)).toBe('');
  expect(keywordDefaultValue(undefined)).toBe('');
  expect(keywordDefaultValue(Number.NaN)).toBe('');
});

test('keywordStoredText only passes strings to the text input', () => {
  expect(keywordStoredText({ config: { outputFile: 'FEEDBACK.md' } }, 'outputFile')).toBe('FEEDBACK.md');
  expect(keywordStoredText({ config: { outputFile: 5 } }, 'outputFile')).toBeUndefined();
  expect(keywordStoredText({ config: {} }, 'outputFile')).toBeUndefined();
  expect(keywordStoredText(null, 'outputFile')).toBeUndefined();
});

test('string-form keyword entries render their default without a detail fetch', async () => {
  const stringFormLibrary = [
    {
      name: 'question-me',
      description: 'Generate survey questions.',
      source: 'global',
      path: '/skills/question-me/SKILL.md',
      hasConfig: true,
      // Hand-written KB_config.json may use plain scalars instead of { value } objects.
      config: {
        keywords: {
          outputFile: 'SURVEY.md',
          minQuestions: { value: 0 },
        },
      },
      markdownChars: 900,
    },
  ];
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'question-me', mode: 'direct', config: {} }],
  };
  renderPanel({
    skills: stringFormLibrary,
    stage: stageWithSkill,
    onChange: () => {},
    getSkillByName: () => null,
  });

  fireEvent.click(screen.getByRole('button', { name: /Toggle config editor for question-me/i }));

  expect(await screen.findByLabelText('Keyword outputFile for question-me')).toHaveValue('SURVEY.md');
  expect(screen.getByLabelText('Keyword minQuestions for question-me')).toHaveValue('0');
});

test('non-string stored overrides fall back to the default in the text input', async () => {
  const stringFormLibrary = [
    {
      name: 'question-me',
      description: 'Generate survey questions.',
      source: 'global',
      path: '/skills/question-me/SKILL.md',
      hasConfig: true,
      config: { keywords: { outputFile: { value: 'SURVEY.md' } } },
      markdownChars: 900,
    },
  ];
  const stageWithSkill = {
    ...stage,
    // A number can only arrive via the raw JSON editor; the text input must
    // show the default instead of crashing or rendering "[object Object]".
    skills: [{ name: 'question-me', mode: 'direct', config: { outputFile: 5 } }],
  };
  renderPanel({
    skills: stringFormLibrary,
    stage: stageWithSkill,
    onChange: () => {},
    getSkillByName: () => null,
  });

  fireEvent.click(screen.getByRole('button', { name: /Toggle config editor for question-me/i }));

  expect(await screen.findByLabelText('Keyword outputFile for question-me')).toHaveValue('SURVEY.md');
});

test('legacy skill without kbRef metadata keeps plain text inputs', async () => {
  const stageWithSkill = {
    ...stage,
    skills: [{ name: 'creating-new-tickets', mode: 'direct', config: {} }],
  };
  renderWithKainBain(
    <StageSkillsPanel
      stage={stageWithSkill}
      skills={library}
      fetchSkills={() => {}}
      getSkillByName={(name) => (name === 'creating-new-tickets' ? rawSkill : null)}
      activeProjectId="proj-1"
      onChange={() => {}}
    />,
    { activeProjectId: 'proj-1' },
  );
  fireEvent.click(screen.getByRole('button', { name: /Toggle config editor for creating-new-tickets/i }));
  const input = await screen.findByLabelText('Keyword targetStage for creating-new-tickets');
  expect(input.tagName).toBe('INPUT');
  expect(
    screen.queryByRole('combobox', { name: 'Keyword targetStage for creating-new-tickets' }),
  ).not.toBeInTheDocument();
});
