import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { SurveyBanner } from './SurveyBanner';
import '@testing-library/jest-dom';

/***
 * MARK: SurveyBanner tests
 * @description The task-page banner appears only for question-me stages whose
 *   survey still needs a human (pending/none); answered, empty, or disabled
 *   renders nothing. A failed status fetch keeps the entry link (fail-visible)
 *   so parked tasks never strand without a way to answer.
 ***/

describe('SurveyBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderBanner = (status, enabled = true) => {
    const client = { getSurvey: vi.fn(async () => ({ status, rounds: [] })) };
    const result = renderWithKainBain(
      <SurveyBanner taskId="t1" projectId="p1" enabled={enabled} client={client} />,
    );
    return { client, ...result };
  };

  it('links to the survey page while answers are pending', async () => {
    const { client } = renderBanner('pending');
    await waitFor(() => expect(client.getSurvey).toHaveBeenCalledWith('p1', 't1'));
    const link = await screen.findByRole('link', { name: /open survey/i });
    expect(link).toHaveAttribute('href', '#/tasks/t1/survey');
  });

  it('shows for a missing survey file (agent wrote nothing yet)', async () => {
    renderBanner('none');
    expect(await screen.findByRole('region', { name: /survey awaiting/i })).toBeInTheDocument();
  });

  it('renders nothing once answered or explicitly empty', async () => {
    const { container } = renderBanner('answered');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /survey awaiting/i })).not.toBeInTheDocument(),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the entry link when the status fetch fails (fail-visible)', async () => {
    const client = {
      getSurvey: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    renderWithKainBain(<SurveyBanner taskId="t1" projectId="p1" enabled client={client} />);
    const link = await screen.findByRole('link', { name: /open survey/i });
    expect(link).toHaveAttribute('href', '#/tasks/t1/survey');
  });

  it('renders nothing when the stage does not carry the skill', () => {
    const client = { getSurvey: vi.fn() };
    const { container } = renderWithKainBain(
      <SurveyBanner taskId="t1" projectId="p1" enabled={false} client={client} />,
    );
    expect(client.getSurvey).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
