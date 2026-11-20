// jsdom pin: this suite needs window.confirm stub (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { SkillsSection } from './SkillsSection';
import { ModelAliasesSection, formatAliasSummary } from './ModelAliasesSection';
import '@testing-library/jest-dom';

/***
 * MARK: SettingsCards overflow tests
 * @description Sibling-section coverage for the Settings overflow fix: every
 *   card that renders a user-controlled name reuses the shared TruncatedText
 *   contract, so a future edit that drops the truncation guards on any of
 *   these cards must fail here.
 ***/

vi.mock('../../services/api', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    api: {
      ...original.api,
      importSkill: vi.fn(),
      deleteSkill: vi.fn(),
    },
  };
});
vi.mock('../../services/logger', () => ({ logger: { error: vi.fn() } }));

const LONG_SKILL = `my-custom-skill-for-release-automation-${'z'.repeat(120)}`;
const LONG_ALIAS = `quarterly-release-router-${'q'.repeat(120)}`;
const LONG_DESCRIPTION = `A custom skill that automates the release pipeline end to end ${'s'.repeat(140)}`;
const LONG_KEYWORD_KEY = `outputFileNameForReleaseAutomation${'k'.repeat(140)}`;
const LONG_KEYWORD_DESCRIPTION = `Where the generated survey questions are written for later review ${'d'.repeat(140)}`;
const LONG_MODEL_REF = `google::quarterly-release-router-${'m'.repeat(140)}`;
const LONG_HARNESS_ID = `custom-runner-harness-${'h'.repeat(140)}`;

const HARNESSES = [
  {
    id: 'pi',
    label: 'pi',
    description: 'pi',
    modelSelection: 'list',
    models: [{ id: 'm1', name: 'M1', provider: 'google', key: 'google::m1' }],
  },
];

describe('settings card truncation', () => {
  it('truncates very long skill names with the full name on hover', () => {
    renderWithKainBain(<SkillsSection activeProjectId="proj-1" />, {
      skills: [
        {
          name: LONG_SKILL,
          description: 'A custom guide.',
          source: 'project',
          path: '/proj/skills/long/SKILL.md',
          hasConfig: false,
          config: {},
          keywords: {},
          markdownChars: 200,
        },
      ],
      skillsLoading: false,
      skillsError: null,
      fetchSkills: vi.fn().mockResolvedValue([]),
      getSkillByName: vi.fn().mockResolvedValue(null),
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    const label = screen.getByText(LONG_SKILL);
    expect(label).toHaveClass('min-w-0', 'truncate');
    expect(label).toHaveAttribute('title', LONG_SKILL);
  });

  it('truncates very long alias names in the expanded card header', () => {
    render(
      <ModelAliasesSection
        aliases={[
          {
            name: LONG_ALIAS,
            harness: 'pi',
            model: 'google::m1',
            targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }],
          },
        ]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );

    // Cards mount collapsed; the expanded header carries the full name.
    const toggle = screen.getByTestId('model-alias-toggle-0');
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);

    const header = document.getElementById('model-alias-header-0');
    expect(header).not.toBeNull();
    expect(header).toHaveClass('min-w-0', 'truncate');
    expect(header).toHaveAttribute('title', LONG_ALIAS);
    // The labelledby link to the card body survives the truncation wrapper.
    expect(header.textContent).toContain(LONG_ALIAS);
    const body = document.getElementById('model-alias-body-0');
    expect(body?.getAttribute('aria-labelledby')).toBe('model-alias-header-0');
  });

  it('exposes the full skill description on hover', () => {
    renderWithKainBain(<SkillsSection activeProjectId="proj-1" />, {
      skills: [
        {
          name: 'release-guide',
          description: LONG_DESCRIPTION,
          source: 'project',
          path: '/proj/skills/release-guide/SKILL.md',
          hasConfig: false,
          config: {},
          keywords: {},
          markdownChars: 200,
        },
      ],
      skillsLoading: false,
      skillsError: null,
      fetchSkills: vi.fn().mockResolvedValue([]),
      getSkillByName: vi.fn().mockResolvedValue(null),
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    // The description clips to one line, so the full text must ride on hover.
    expect(screen.getByText(LONG_DESCRIPTION)).toHaveAttribute('title', LONG_DESCRIPTION);
  });

  it('wraps very long config keyword keys and descriptions', () => {
    renderWithKainBain(<SkillsSection activeProjectId="proj-1" />, {
      skills: [
        {
          name: 'release-guide',
          description: 'A custom guide.',
          source: 'project',
          path: '/proj/skills/release-guide/SKILL.md',
          hasConfig: true,
          config: {
            keywords: {
              [LONG_KEYWORD_KEY]: { value: 'SURVEY.md', description: LONG_KEYWORD_DESCRIPTION },
            },
          },
          keywords: {},
          markdownChars: 200,
        },
      ],
      skillsLoading: false,
      skillsError: null,
      fetchSkills: vi.fn().mockResolvedValue([]),
      getSkillByName: vi.fn().mockResolvedValue(null),
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle config for release-guide' }));
    const panel = screen.getByTestId('skill-config-release-guide');
    expect(within(panel).getByText(LONG_KEYWORD_KEY)).toHaveClass('break-all');
    expect(within(panel).getByText(LONG_KEYWORD_DESCRIPTION)).toHaveClass('break-words');
  });

  it('wraps the preview modal title for very long skill names', async () => {
    renderWithKainBain(<SkillsSection activeProjectId="proj-1" />, {
      skills: [
        {
          name: LONG_SKILL,
          description: 'A custom guide.',
          source: 'project',
          path: '/proj/skills/long/SKILL.md',
          hasConfig: false,
          config: {},
          keywords: {},
          markdownChars: 200,
        },
      ],
      skillsLoading: false,
      skillsError: null,
      fetchSkills: vi.fn().mockResolvedValue([]),
      getSkillByName: vi.fn().mockResolvedValue({ markdown: '# Raw skill body' }),
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const title = await screen.findByText('Raw skill body').then(
      () => document.getElementById('skill-preview-title'),
    );
    expect(title).not.toBeNull();
    expect(title.textContent).toBe(LONG_SKILL);
    expect(title).toHaveClass('break-words');
  });

  it('keeps the full long model ref readable in the collapsed summary', () => {
    const targets = [{ harness: 'pi', model: LONG_MODEL_REF, percent: 100 }];
    render(
      <ModelAliasesSection aliases={[{ name: 'router', targets }]} onChange={() => {}} harnesses={HARNESSES} />,
    );

    // Cards mount collapsed; the summary is a wrapping chips row, and the
    // full long ref stays in the DOM — never cut to a mid-name ellipsis.
    const summary = screen.getByTestId('model-alias-summary-0');
    expect(summary).toHaveClass('w-full', 'flex-wrap');
    const chip = screen.getByTestId('model-alias-summary-chip-0-0');
    // Full ref on the chip tooltip…
    expect(chip).toHaveAttribute('title', `100% pi (${LONG_MODEL_REF})`);
    // …and verbatim in the accessibility tree (sr-only), not hover-only.
    expect(summary.textContent).toContain(LONG_MODEL_REF);
    // The model id wraps (break-all) instead of relying on a one-line
    // ellipsis; the plain-text fallback still carries the same ref.
    const modelText = chip.querySelector('.break-all');
    expect(modelText).not.toBeNull();
    expect(modelText).not.toHaveClass('truncate');
    expect(modelText.textContent).toContain('quarterly-release-router-');
    expect(formatAliasSummary(targets, HARNESSES)).toContain(LONG_MODEL_REF);
  });

  it('contains very long alias error messages in collapsed and expanded views', () => {
    render(
      <ModelAliasesSection
        aliases={[{ name: 'router', targets: [{ harness: LONG_HARNESS_ID, model: 'm1', percent: 100 }] }]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );

    // Collapsed: the error badge names the unknown harness verbatim on its
    // own full-width line (never squeezed into the header row).
    const badge = screen.getByTestId('model-alias-error-badge-0');
    expect(badge.textContent).toContain(LONG_HARNESS_ID);
    expect(badge).toHaveClass('break-all');
    expect(screen.getByTestId('model-alias-error-alert-0')).toHaveClass('w-full', 'min-w-0');

    // Expanded: the same message renders in full inside the card body.
    const toggle = screen.getByTestId('model-alias-toggle-0');
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    const body = document.getElementById('model-alias-body-0');
    const alert = within(body).getByRole('alert');
    expect(alert.textContent).toContain(LONG_HARNESS_ID);
    expect(alert).toHaveClass('break-words');
  });

  it('wraps very long target validity messages', () => {
    render(
      <ModelAliasesSection
        aliases={[{ name: 'router', targets: [{ harness: LONG_HARNESS_ID, model: 'm1', percent: 100 }] }]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );

    const toggle = screen.getByTestId('model-alias-toggle-0');
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    const validity = screen.getByTestId('model-alias-target-validity-0-0');
    expect(validity.textContent).toContain(LONG_HARNESS_ID);
    expect(validity).toHaveClass('break-words');
  });
});
