// jsdom pin: this suite needs window.confirm stub (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { SkillsSection } from './SkillsSection';
import { ModelAliasesSection } from './ModelAliasesSection';
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
});
