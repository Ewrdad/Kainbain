import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { SurveyPage } from './SurveyPage';
import '@testing-library/jest-dom';

/***
 * MARK: SurveyPage tests
 * @description Verifies the question-me survey page: question rendering by
 *   type with per-question notes, conditional visibility, save-without-advance,
 *   submit-and-advance, and the empty/none continue paths.
 ***/

const pendingSurvey = {
  taskId: 't1',
  exists: true,
  status: 'pending',
  rounds: [
    {
      round: 1,
      generatedAt: '2026-10-18T00:00:00.000Z',
      stage: 'ask',
      questions: [
        {
          id: 'q1',
          type: 'single',
          text: 'Primary concern?',
          options: ['Auth', 'Data'],
          required: true,
          showIf: null,
        },
        {
          id: 'q2',
          type: 'multiple',
          text: 'Frameworks?',
          options: ['GDPR', 'HIPAA'],
          required: false,
          showIf: { questionId: 'q1', value: 'Data' },
        },
      ],
      answers: {},
    },
  ],
  errors: [],
  missing: [{ round: 1, id: 'q1' }],
};

function makeClient(survey = pendingSurvey) {
  return {
    getSurvey: vi.fn(async () => JSON.parse(JSON.stringify(survey))),
    submitSurvey: vi.fn(async () => ({ status: 'pending', advanced: false, missing: [{ round: 1, id: 'q1' }] })),
  };
}

const renderPage = (client, props = {}) =>
  renderWithKainBain(<SurveyPage taskId="t1" projectId="p1" client={client} {...props} />);

const panelTask = {
  id: 't1',
  goal: '# Surveyed task goal\n\nContext with ![screenshot](assets/shot.png).',
  currentStageId: 's-1',
  timeline: [{ stage: 'Plan', status: 'Moved', duration: '9s', timestamp: '2026-10-20T15:00:00Z' }],
  history: [{ timestamp: '2026-10-20T15:00:00Z', action: 'Task created' }],
};

const panelReports = [
  {
    filename: 'plan-20261020-150000.md',
    stageName: 'Plan',
    timestamp: '2026-10-20T15:00:00Z',
    content: '# Plan report\n\nThe plan is complete.',
  },
];

function makeFullClient(survey = pendingSurvey, overrides = {}) {
  return {
    ...makeClient(survey),
    getTask: vi.fn(async () => JSON.parse(JSON.stringify(panelTask))),
    getTaskReports: vi.fn(async () => JSON.parse(JSON.stringify(panelReports))),
    ...overrides,
  };
}

describe('SurveyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders single-choice radios, multi checkboxes, and a notes field per question', async () => {
    const client = makeClient();
    renderPage(client);
    await waitFor(() => expect(client.getSurvey).toHaveBeenCalledWith('p1', 't1'));
    expect(await screen.findByText('Primary concern?')).toBeInTheDocument();
    expect(screen.getByLabelText('Primary concern?: Auth')).toHaveAttribute('type', 'radio');
    expect(screen.getByLabelText('Notes for: Primary concern?')).toBeInTheDocument();
    // The second question is conditional on answering 'Data' — reveal it first.
    fireEvent.click(screen.getByLabelText('Primary concern?: Data'));
    expect(await screen.findByText('Frameworks?')).toBeInTheDocument();
    expect(screen.getByLabelText('Frameworks?: GDPR')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Notes for: Frameworks?')).toBeInTheDocument();
  });

  it('hides conditional questions until their trigger is selected', async () => {
    const client = makeClient();
    renderPage(client);
    await screen.findByText('Primary concern?');
    expect(screen.queryByText('Frameworks?')).not.toBeInTheDocument();
    expect(screen.getByText(/1 follow-up question hidden/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Primary concern?: Data'));
    expect(await screen.findByText('Frameworks?')).toBeInTheDocument();
  });

  it('saves answers without advancing and surfaces the saved notice', async () => {
    const client = makeClient();
    client.submitSurvey.mockResolvedValue({ status: 'pending', advanced: false, missing: [{ round: 1, id: 'q1' }] });
    renderPage(client);
    await screen.findByText('Primary concern?');
    fireEvent.click(screen.getByLabelText('Primary concern?: Auth'));
    fireEvent.click(screen.getByRole('button', { name: /save answers/i }));
    await waitFor(() =>
      expect(client.submitSurvey).toHaveBeenCalledWith('p1', 't1', {
        answers: expect.objectContaining({ q1: { selected: ['Auth'], notes: '' } }),
      }),
    );
    expect(await screen.findByText(/answers saved/i)).toBeInTheDocument();
  });

  it('submits complete answers, reports completion, and calls onDone', async () => {
    const client = makeClient();
    client.submitSurvey.mockResolvedValue({ status: 'answered', advanced: true, currentStageId: 's-2' });
    const onDone = vi.fn();
    renderPage(client, { onDone });
    await screen.findByText('Primary concern?');
    fireEvent.click(screen.getByLabelText('Primary concern?: Auth'));
    fireEvent.click(screen.getByRole('button', { name: /submit & continue/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ advanced: true })));
    expect(await screen.findByText(/moved to its next stage/i)).toBeInTheDocument();
  });

  it('shows the continue path when the agent asked nothing', async () => {
    const client = makeClient({
      taskId: 't1',
      exists: true,
      status: 'empty',
      rounds: [{ round: 1, generatedAt: null, stage: 'ask', questions: [], answers: {} }],
      errors: [],
      missing: [],
    });
    client.submitSurvey.mockResolvedValue({ status: 'empty', advanced: true });
    renderPage(client);
    expect(await screen.findByText(/nothing worth asking/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue without questions/i }));
    await waitFor(() =>
      expect(client.submitSurvey).toHaveBeenCalledWith('p1', 't1', { action: 'skip' }),
    );
  });

  it('explains a missing survey file and still offers continue', async () => {
    const client = makeClient({ taskId: 't1', exists: false, status: 'none', rounds: [], errors: [], missing: [] });
    renderPage(client);
    expect(await screen.findByText(/did not write any survey questions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue without questions/i })).toBeInTheDocument();
  });
});

describe('SurveyPage task context split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the read-only task panel beside the survey with desktop-only markers', async () => {
    renderPage(makeFullClient());
    await screen.findByText('Primary concern?');

    const panel = screen.getByRole('region', { name: 'Task context' });
    expect(panel).toBeInTheDocument();
    const column = panel.parentElement;
    // Desktop-only: hidden below the md (768px) breakpoint, half width at/above it.
    expect(column.className).toContain('hidden');
    expect(column.className).toContain('md:flex');
    expect(column.className).toContain('md:w-1/2');
    // The survey column takes the other half on desktop, full width on phones.
    const surveyColumn = screen.getByRole('region', { name: 'Task survey' });
    expect(surveyColumn.className).toContain('md:w-1/2');
  });

  it('fetches and shows the task description with resolved images in the panel', async () => {
    const client = makeFullClient();
    renderPage(client);
    await screen.findByText('Primary concern?');
    await waitFor(() => expect(client.getTask).toHaveBeenCalledWith('p1', 't1'));
    await waitFor(() => expect(client.getTaskReports).toHaveBeenCalledWith('p1', 't1'));

    // Panel header plus the markdown heading inside the Description tab.
    expect(screen.getAllByRole('heading', { name: 'Surveyed task goal' })).toHaveLength(2);
    const img = document.querySelector('#survey-panel-tabpanel-description img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('/projects/p1/tasks/t1/images/shot.png');
  });

  it('shows full reports and timeline from the fetched context', async () => {
    renderPage(makeFullClient());
    await screen.findByText('Primary concern?');
    await screen.findByText('Context with', { exact: false });

    fireEvent.click(screen.getByRole('tab', { name: /reports/i }));
    expect(await screen.findByText('The plan is complete.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
    expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
    expect(screen.getByText('Moved')).toBeInTheDocument();
  });

  it('keeps the survey fully usable while the context panel is shown', async () => {
    const client = makeFullClient();
    client.submitSurvey.mockResolvedValue({ status: 'pending', advanced: false, missing: [{ round: 1, id: 'q1' }] });
    renderPage(client);
    await screen.findByText('Primary concern?');
    fireEvent.click(screen.getByLabelText('Primary concern?: Auth'));
    fireEvent.click(screen.getByRole('button', { name: /save answers/i }));
    await waitFor(() =>
      expect(client.submitSurvey).toHaveBeenCalledWith('p1', 't1', {
        answers: expect.objectContaining({ q1: { selected: ['Auth'], notes: '' } }),
      }),
    );
    // The panel stays mounted next to the answered survey.
    expect(screen.getByRole('region', { name: 'Task context' })).toBeInTheDocument();
  });

  it('renders the injected task prop when no fetch client is available', async () => {
    renderPage(makeClient(), { task: panelTask });
    await screen.findByText('Primary concern?');
    expect(screen.getAllByRole('heading', { name: 'Surveyed task goal' })).toHaveLength(2);
  });

  it('still renders the survey when task and reports fetches fail', async () => {
    const client = makeFullClient(pendingSurvey, {
      getTask: vi.fn(async () => {
        throw new Error('task gone');
      }),
      getTaskReports: vi.fn(async () => {
        throw new Error('reports gone');
      }),
    });
    renderPage(client);
    expect(await screen.findByText('Primary concern?')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Task context' })).toBeInTheDocument();
    expect(screen.getByText('Task details are unavailable.')).toBeInTheDocument();
  });
});
