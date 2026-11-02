/***
 * MARK: accessibilityStatement
 * @description Single source of truth for the dynamic in-app accessibility
 *   statement (task 4bda7321), shared by the API producer and the frontend
 *   view so the two sides cannot drift apart. Owns the five user-need
 *   groups, the WCAG 2.2 AAA criterion catalogue (content contract:
 *   `docs/tasks/4bda7321-3aef-4ca9-b746-42b8c6969630/a11y-mapping.md`),
 *   the WCAG 3.0 draft-outcome catalogue (advisory only — never
 *   conformance language), the results-artifact schema, lenient parsing
 *   with safe defaults, and the per-group aggregation rule.
 * @example import { NEED_GROUPS, parseResultsArtifact } from '../../shared/accessibilityStatement.js'
 ***/

/***
 * MARK: NEED_GROUPS
 * @description The five user-need groups the statement is organised around
 *   (survey q2). Every AAA criterion and every 3.0 outcome belongs to
 *   exactly one group.
 * @example NEED_GROUPS.map((g) => g.id) => ['seeing', 'hearing', 'getting-around', 'thinking', 'helpful-tech']
 ***/
export const NEED_GROUPS = [
  { id: 'seeing', label: 'Seeing', blurb: 'Text size, colours, contrast, flashing, and motion.' },
  { id: 'hearing', label: 'Hearing', blurb: 'Sound, alerts, and alternatives to audio.' },
  {
    id: 'getting-around',
    label: 'Getting around',
    blurb: 'Keyboard, mouse, touch screen, focus, and timing.',
  },
  {
    id: 'thinking',
    label: 'Thinking and understanding',
    blurb: 'Clear words, simple layout, help, and forgiving forms.',
  },
  {
    id: 'helpful-tech',
    label: 'Helpful technology',
    blurb: 'Screen readers, input devices, and device settings.',
  },
];

/***
 * MARK: NEED_GROUP_IDS
 * @description The five group ids as a plain list (validation shorthand).
 * @example NEED_GROUP_IDS.includes('seeing') => true
 ***/
export const NEED_GROUP_IDS = NEED_GROUPS.map((group) => group.id);

/***
 * MARK: isNeedGroupId
 * @description Whether a value names one of the five need groups.
 * @example isNeedGroupId('thinking') => true
 * @example isNeedGroupId('smell') => false
 ***/
export const isNeedGroupId = (value) =>
  typeof value === 'string' && NEED_GROUP_IDS.includes(value);

/***
 * MARK: WCAG22_AAA_CRITERIA
 * @description The 28 AAA-level WCAG 2.2 success criteria — the set that
 *   distinguishes an AAA claim from an AA claim — each mapped onto exactly
 *   one need group with a plain-words summary and its verifying instrument.
 * @example WCAG22_AAA_CRITERIA.length => 28
 ***/
export const WCAG22_AAA_CRITERIA = [
  {
    id: '1.2.6',
    title: 'Sign language',
    plainWords: 'Sign language for video: the app ships no video.',
    group: 'hearing',
    instrument: 'Manual scope check (no media shipped)',
  },
  {
    id: '1.2.7',
    title: 'Extended audio description',
    plainWords: 'Videos with extra spoken description: the app ships no video.',
    group: 'seeing',
    instrument: 'Manual scope check (no media shipped)',
  },
  {
    id: '1.2.8',
    title: 'Media alternative',
    plainWords: 'A text alternative for video: the app ships no video.',
    group: 'seeing',
    instrument: 'Manual scope check (no media shipped)',
  },
  {
    id: '1.2.9',
    title: 'Audio-only (live)',
    plainWords: 'A text alternative for live audio: the app ships no live audio.',
    group: 'hearing',
    instrument: 'Manual scope check (no media shipped)',
  },
  {
    id: '1.4.6',
    title: 'Contrast (enhanced)',
    plainWords: 'Text stands out from its background at 7 to 1 or better.',
    group: 'seeing',
    instrument: 'axe color-contrast-enhanced + AAA contrast walk + theme contrast gates',
  },
  {
    id: '1.4.8',
    title: 'Visual presentation',
    plainWords:
      'Comfortable reading: colour and size choices, wide line spacing, no justified text. A line-length control for long text is not offered.',
    group: 'seeing',
    instrument: 'Manual + theme and font-size settings',
  },
  {
    id: '2.1.3',
    title: 'Keyboard (no exception)',
    plainWords: 'Everything works with the keyboard alone, with no exceptions.',
    group: 'getting-around',
    instrument: 'Canary keyboard guards + manual keyboard walk',
  },
  {
    id: '2.2.3',
    title: 'No timing',
    plainWords: 'No time limits; nothing expires while you read.',
    group: 'getting-around',
    instrument: 'Manual (toasts pause on hover and focus)',
  },
  {
    id: '2.2.4',
    title: 'Interruptions',
    plainWords: 'Nothing pops up and interrupts you.',
    group: 'getting-around',
    instrument: 'Manual check',
  },
  {
    id: '2.2.5',
    title: 'Re-authenticating',
    plainWords: 'Staying signed in while you work: the app has no sign-in.',
    group: 'getting-around',
    instrument: 'Manual scope check (no authentication)',
  },
  {
    id: '2.2.6',
    title: 'Timeouts',
    plainWords:
      'Warnings before a timeout loses your work: the app has no inactivity timeouts and drafts persist.',
    group: 'getting-around',
    instrument: 'Manual (draft persistence)',
  },
  {
    id: '2.3.2',
    title: 'Three flashes',
    plainWords: 'Nothing flashes three times per second.',
    group: 'seeing',
    instrument: 'Manual check (no flashing content ships)',
  },
  {
    id: '2.3.3',
    title: 'Animation from interactions',
    plainWords: 'Motion you start can be turned off; the app follows the Reduce Motion setting.',
    group: 'seeing',
    instrument: 'reducedMotion gate + global CSS collapse + manual',
  },
  {
    id: '2.4.8',
    title: 'Location',
    plainWords: 'You can always tell where you are: titles and navigation state say so.',
    group: 'getting-around',
    instrument: 'Manual + per-view document titles',
  },
  {
    id: '2.4.9',
    title: 'Link purpose (link only)',
    plainWords: 'Every link makes sense from its own text.',
    group: 'getting-around',
    instrument: 'axe link-name + named-control assertions',
  },
  {
    id: '2.4.10',
    title: 'Section headings',
    plainWords: 'Every section starts with a heading for screen-reader navigation.',
    group: 'getting-around',
    instrument: 'Section-heading and heading-order assertions',
  },
  {
    id: '2.4.12',
    title: 'Focus not obscured (enhanced)',
    plainWords: 'The keyboard focus indicator is never hidden behind other content.',
    group: 'getting-around',
    instrument: 'Canary keyboard guards + manual',
  },
  {
    id: '2.4.13',
    title: 'Focus appearance',
    plainWords:
      'A clear focus ring on everything you tab to. With a very dark custom accent on a dark theme the ring can lose contrast, and the accent picker warns about that.',
    group: 'getting-around',
    instrument: 'Shared focus-visible indicator + accent gate + manual',
  },
  {
    id: '2.5.5',
    title: 'Target size (enhanced)',
    plainWords:
      'Buttons and controls are at least 44 by 44 pixels. Dense data controls such as filter pills and list rows hold the 24 pixel minimum instead, to keep lists readable.',
    group: 'getting-around',
    instrument: '44px target-size gate + target-size heuristic',
  },
  {
    id: '2.5.6',
    title: 'Concurrent input mechanisms',
    plainWords:
      'The app never locks you to one input: touch, mouse, keyboard, and assistive technology all keep working.',
    group: 'helpful-tech',
    instrument: 'Manual check',
  },
  {
    id: '3.1.3',
    title: 'Unusual words',
    plainWords: 'Unusual words are explained where they appear.',
    group: 'thinking',
    instrument: 'Glossary terms + UI-text conventions gate + manual copy review',
  },
  {
    id: '3.1.4',
    title: 'Abbreviations',
    plainWords: 'Abbreviations are expanded on first use and look-up-able everywhere.',
    group: 'thinking',
    instrument: 'Glossary terms + manual copy review',
  },
  {
    id: '3.1.5',
    title: 'Reading level',
    plainWords:
      'Copy is written plainly. There is no automatic reading-grade check yet; every change is reviewed by hand.',
    group: 'thinking',
    instrument: 'Manual copy review per change',
  },
  {
    id: '3.1.6',
    title: 'Pronunciation',
    plainWords:
      'Words that change meaning with pronunciation are marked: no such words ship, so nothing needs marking.',
    group: 'helpful-tech',
    instrument: 'Manual copy review',
  },
  {
    id: '3.2.5',
    title: 'Change on request',
    plainWords: 'Nothing important changes unless you ask it to.',
    group: 'thinking',
    instrument: 'Manual check',
  },
  {
    id: '3.3.5',
    title: 'Help',
    plainWords: 'Help is at hand: a system guide, tooltips, and docs on every view.',
    group: 'thinking',
    instrument: 'Manual check',
  },
  {
    id: '3.3.6',
    title: 'Error prevention (all)',
    plainWords: 'Important actions ask you to confirm or can be undone.',
    group: 'thinking',
    instrument: 'Manual + form and confirmation tests',
  },
  {
    id: '3.3.9',
    title: 'Accessible authentication (enhanced)',
    plainWords: 'Signing in without solving puzzles: the app has no sign-in.',
    group: 'thinking',
    instrument: 'Manual scope check (no authentication)',
  },
];

/***
 * MARK: WCAG30_OUTCOMES
 * @description WCAG 3.0 draft outcomes tracked as readiness (advisory only —
 *   the draft forbids conformance claims). Each belongs to exactly one need
 *   group and names the instrument its readiness is approximated from.
 * @example WCAG30_OUTCOMES.length => 10
 ***/
export const WCAG30_OUTCOMES = [
  {
    id: 'text-contrast',
    plainWords: 'Text stays readable in every theme.',
    group: 'seeing',
    approximatedBy: '7:1 gates + contrast walk',
  },
  {
    id: 'motion-and-flashing',
    plainWords: 'Motion follows your settings; nothing flashes.',
    group: 'seeing',
    approximatedBy: 'reducedMotion gate + manual',
  },
  {
    id: 'audio-alternatives',
    plainWords: 'Alternatives for audio content: the app ships no audio content.',
    group: 'hearing',
    approximatedBy: 'Manual scope check',
  },
  {
    id: 'sound-alerts-have-text',
    plainWords:
      'Sounds are decoration only: every alert also appears as text, and sounds are off by default.',
    group: 'hearing',
    approximatedBy: 'Manual (sounds default off + live regions)',
  },
  {
    id: 'full-keyboard-operation',
    plainWords: 'The whole app works by keyboard.',
    group: 'getting-around',
    approximatedBy: 'Canary keyboard guards + manual walk',
  },
  {
    id: 'pointer-targets',
    plainWords: 'Touch and mouse targets are roomy; dense lists hold a smaller minimum.',
    group: 'getting-around',
    approximatedBy: '44px target-size gate',
  },
  {
    id: 'plain-language',
    plainWords: 'Words are kept simple; no automatic reading-grade check yet.',
    group: 'thinking',
    approximatedBy: 'Manual copy review',
  },
  {
    id: 'error-help-and-undo',
    plainWords: 'Forms name the problem, suggest a fix, and important actions confirm or undo.',
    group: 'thinking',
    approximatedBy: 'Form tests + manual',
  },
  {
    id: 'screen-reader-support',
    plainWords: 'Screen readers get named controls, headings, live updates, and page titles.',
    group: 'helpful-tech',
    approximatedBy: 'axe + named-control assertions + route announcer',
  },
  {
    id: 'respects-device-settings',
    plainWords: 'The app honours Reduce Motion, themes, and text-size settings.',
    group: 'helpful-tech',
    approximatedBy: 'reducedMotion + theme and font settings',
  },
];

/***
 * MARK: ARTIFACT_SCHEMA_VERSION
 * @description Current version of the results-artifact schema. The parser
 *   warns (never crashes) on a mismatch and still reads the fields it knows.
 * @example ARTIFACT_SCHEMA_VERSION => 1
 ***/
export const ARTIFACT_SCHEMA_VERSION = 1;

/***
 * MARK: AAA_STATUSES
 * @description Valid per-criterion AAA statuses. `unknown` is parser-only:
 *   it marks criteria the artifact omits, so gaps render honestly instead
 *   of silently passing.
 * @example AAA_STATUSES => ['pass', 'partial', 'not-supported', 'not-applicable', 'unknown']
 ***/
export const AAA_STATUSES = ['pass', 'partial', 'not-supported', 'not-applicable', 'unknown'];

/***
 * MARK: AAA_STATUS_LABELS
 * @description Plain-words label per AAA status, shown beside each criterion.
 * @example AAA_STATUS_LABELS.pass => 'Supported'
 ***/
export const AAA_STATUS_LABELS = {
  pass: 'Supported',
  partial: 'Partly supported',
  'not-supported': 'Not supported',
  'not-applicable': 'Does not apply here',
  unknown: 'Unknown',
};

/***
 * MARK: GROUP_AAA_LABELS
 * @description Plain-words label per aggregated group AAA status.
 * @example GROUP_AAA_LABELS.supported => 'Supported'
 ***/
export const GROUP_AAA_LABELS = {
  supported: 'Supported',
  'partly-supported': 'Partly supported',
  'not-supported': 'Not supported',
  unknown: 'Unknown',
  'not-applicable': 'Does not apply here',
};

/***
 * MARK: READINESS_LEVELS
 * @description Valid WCAG 3.0 readiness levels. Draft-readiness vocabulary
 *   only — never conformance language.
 * @example READINESS_LEVELS.includes('supported') => true
 ***/
export const READINESS_LEVELS = ['supported', 'partial', 'unknown', 'not-applicable'];

/***
 * MARK: READINESS_LABELS
 * @description Plain-words label per 3.0 readiness level.
 * @example READINESS_LABELS.supported => 'Ready'
 ***/
export const READINESS_LABELS = {
  supported: 'Ready',
  partial: 'Partly ready',
  unknown: 'Unknown',
  'not-applicable': 'Does not apply here',
};

/***
 * MARK: FALLBACK_STATUSES
 * @description Last-known AAA statuses per criterion (the 2026-10-25 audit
 *   position). Used ONLY to build the curated fallback artifact rendered
 *   when no results artifact exists — never as live data.
 * @example FALLBACK_STATUSES['1.4.6'] => 'pass'
 ***/
export const FALLBACK_STATUSES = {
  '1.2.6': 'not-applicable',
  '1.2.7': 'not-applicable',
  '1.2.8': 'not-applicable',
  '1.2.9': 'not-applicable',
  '1.4.6': 'pass',
  '1.4.8': 'partial',
  '2.1.3': 'pass',
  '2.2.3': 'pass',
  '2.2.4': 'pass',
  '2.2.5': 'not-applicable',
  '2.2.6': 'pass',
  '2.3.2': 'pass',
  '2.3.3': 'pass',
  '2.4.8': 'pass',
  '2.4.9': 'pass',
  '2.4.10': 'pass',
  '2.4.12': 'pass',
  '2.4.13': 'partial',
  '2.5.5': 'partial',
  '2.5.6': 'pass',
  '3.1.3': 'pass',
  '3.1.4': 'pass',
  '3.1.5': 'partial',
  '3.1.6': 'pass',
  '3.2.5': 'pass',
  '3.3.5': 'pass',
  '3.3.6': 'pass',
  '3.3.9': 'not-applicable',
};

/***
 * MARK: FALLBACK_READINESS
 * @description Last-known WCAG 3.0 draft readiness per outcome (the
 *   2026-10-25 position). Fallback use only, like FALLBACK_STATUSES.
 * @example FALLBACK_READINESS['text-contrast'] => 'supported'
 ***/
export const FALLBACK_READINESS = {
  'text-contrast': 'supported',
  'motion-and-flashing': 'supported',
  'audio-alternatives': 'not-applicable',
  'sound-alerts-have-text': 'supported',
  'full-keyboard-operation': 'supported',
  'pointer-targets': 'partial',
  'plain-language': 'partial',
  'error-help-and-undo': 'supported',
  'screen-reader-support': 'supported',
  'respects-device-settings': 'supported',
};

/***
 * MARK: FALLBACK_KNOWN_ISSUES
 * @description The four documented AAA exemptions as user-facing known
 *   issues (WAI: statements should name known limitations). Fallback use
 *   only; the live artifact carries its own list.
 * @example FALLBACK_KNOWN_ISSUES.length => 4
 ***/
export const FALLBACK_KNOWN_ISSUES = [
  {
    id: 'target-size-dense',
    summary:
      'Dense lists use smaller touch targets: filter pills and list rows hold the 24 pixel minimum instead of 44, to keep lists readable. All main buttons are full size.',
    group: 'getting-around',
  },
  {
    id: 'line-length-control',
    summary:
      'No line-length control for long text: themes and text size can be changed, but very long lines cannot be narrowed to 80 characters.',
    group: 'seeing',
  },
  {
    id: 'reading-grade-gate',
    summary:
      'No automatic reading-grade check: copy is written plainly and reviewed by hand on every change, but no machine gate enforces a grade level.',
    group: 'thinking',
  },
  {
    id: 'focus-ring-custom-accent',
    summary:
      'A very dark custom accent on a dark theme can make the keyboard focus ring harder to see. The accent picker warns about such colours.',
    group: 'getting-around',
  },
];

/***
 * MARK: FALLBACK_ARTIFACT
 * @description Curated static artifact rendered ONLY when no results
 *   artifact exists (missing file, failed fetch, or malformed payload).
 *   Honestly dated at the last audit; the view labels it as last-known.
 * @example FALLBACK_ARTIFACT.schemaVersion => 1
 ***/
export const FALLBACK_ARTIFACT = {
  schemaVersion: ARTIFACT_SCHEMA_VERSION,
  generatedAt: '2026-10-25T00:00:00.000Z',
  appVersion: '1.0.0',
  contactEmail: '',
  wcag22aaa: WCAG22_AAA_CRITERIA.map((criterion) => ({
    criterion: criterion.id,
    status: FALLBACK_STATUSES[criterion.id] || 'unknown',
    evidence: 'Last audit position (2026-10-25).',
  })),
  wcag30: WCAG30_OUTCOMES.map((outcome) => ({
    outcome: outcome.id,
    readiness: FALLBACK_READINESS[outcome.id] || 'unknown',
    note: 'Last audit position (2026-10-25).',
  })),
  knownIssues: FALLBACK_KNOWN_ISSUES.map((issue) => ({ ...issue })),
};

const cleanText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, maxLength);
};

const cleanEmail = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.length > 320 || /\s/.test(trimmed) || !trimmed.includes('@')) return null;
  return trimmed;
};

/***
 * MARK: parseResultsArtifact
 * @description Leniently parses a raw results artifact into a fully
 *   populated, render-safe shape. Never throws and never crashes the view:
 *   missing sections get safe defaults, malformed entries are skipped with
 *   a warning, unknown criterion/outcome ids are ignored with a warning,
 *   and criteria the artifact omits render as `unknown` (an honest gap, not
 *   a silent pass). Returns `{ artifact, warnings }`.
 * @example parseResultsArtifact(null).artifact.wcag22aaa.length => 28
 * @example parseResultsArtifact(FALLBACK_ARTIFACT).warnings => []
 ***/
export const parseResultsArtifact = (raw) => {
  const warnings = [];
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (raw === null || raw === undefined) warnings.push('No results artifact found; using safe defaults.');
  else if (typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('Results artifact is not an object; using safe defaults.');
  }
  if (
    source.schemaVersion !== undefined &&
    source.schemaVersion !== ARTIFACT_SCHEMA_VERSION
  ) {
    warnings.push(
      `Unsupported artifact schema version ${String(source.schemaVersion)}; reading known fields only.`,
    );
  }

  const generatedAt = typeof source.generatedAt === 'string' ? source.generatedAt : null;
  const appVersion = cleanText(source.appVersion, 64);
  const contactRaw = cleanEmail(source.contactEmail);
  if (typeof source.contactEmail === 'string' && source.contactEmail.trim() !== '' && contactRaw === null) {
    warnings.push('Artifact contact email is malformed; omitting it.');
  }

  const criterionById = new Map(WCAG22_AAA_CRITERIA.map((entry) => [entry.id, entry]));
  const statusByCriterion = new Map();
  const evidenceByCriterion = new Map();
  const aaaEntries = Array.isArray(source.wcag22aaa) ? source.wcag22aaa : [];
  if (source.wcag22aaa !== undefined && !Array.isArray(source.wcag22aaa)) {
    warnings.push('Artifact wcag22aaa section is not a list; treating every criterion as unknown.');
  }
  for (const entry of aaaEntries) {
    if (entry === null || typeof entry !== 'object') {
      warnings.push('Skipping a malformed AAA entry (not an object).');
      continue;
    }
    const id = entry.criterion;
    if (!criterionById.has(id)) {
      warnings.push(`Ignoring unknown AAA criterion id ${JSON.stringify(id)}.`);
      continue;
    }
    if (!AAA_STATUSES.includes(entry.status)) {
      warnings.push(`Ignoring malformed status for criterion ${id}; marking it unknown.`);
      continue;
    }
    statusByCriterion.set(id, entry.status);
    evidenceByCriterion.set(id, cleanText(entry.evidence, 500));
  }

  const outcomeById = new Map(WCAG30_OUTCOMES.map((entry) => [entry.id, entry]));
  const readinessByOutcome = new Map();
  const noteByOutcome = new Map();
  const w30Entries = Array.isArray(source.wcag30) ? source.wcag30 : [];
  if (source.wcag30 !== undefined && !Array.isArray(source.wcag30)) {
    warnings.push('Artifact wcag30 section is not a list; treating every outcome as unknown.');
  }
  for (const entry of w30Entries) {
    if (entry === null || typeof entry !== 'object') {
      warnings.push('Skipping a malformed 3.0 entry (not an object).');
      continue;
    }
    const id = entry.outcome;
    if (!outcomeById.has(id)) {
      warnings.push(`Ignoring unknown 3.0 outcome id ${JSON.stringify(id)}.`);
      continue;
    }
    if (!READINESS_LEVELS.includes(entry.readiness)) {
      warnings.push(`Ignoring malformed readiness for outcome ${id}; marking it unknown.`);
      continue;
    }
    readinessByOutcome.set(id, entry.readiness);
    noteByOutcome.set(id, cleanText(entry.note, 500));
  }

  const knownIssues = [];
  if (source.knownIssues !== undefined && !Array.isArray(source.knownIssues)) {
    warnings.push('Artifact knownIssues section is not a list; showing no known issues.');
  }
  for (const entry of Array.isArray(source.knownIssues) ? source.knownIssues : []) {
    const id = cleanText(entry?.id, 80);
    const summary = cleanText(entry?.summary, 1000);
    const group = entry?.group;
    if (!id || !summary || !isNeedGroupId(group)) {
      warnings.push('Skipping a malformed known-issue entry.');
      continue;
    }
    knownIssues.push({ id, summary, group });
  }

  return {
    artifact: {
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      generatedAt,
      appVersion,
      contactEmail: contactRaw || '',
      wcag22aaa: WCAG22_AAA_CRITERIA.map((criterion) => ({
        criterion: criterion.id,
        status: statusByCriterion.get(criterion.id) || 'unknown',
        evidence: evidenceByCriterion.get(criterion.id) || '',
      })),
      wcag30: WCAG30_OUTCOMES.map((outcome) => ({
        outcome: outcome.id,
        readiness: readinessByOutcome.get(outcome.id) || 'unknown',
        note: noteByOutcome.get(outcome.id) || '',
      })),
      knownIssues,
    },
    warnings,
  };
};

const aggregateAaa = (statuses) => {
  const applicable = statuses.filter((status) => status !== 'not-applicable');
  if (applicable.length === 0) return 'not-applicable';
  if (applicable.some((status) => status === 'unknown')) return 'unknown';
  if (applicable.some((status) => status === 'not-supported')) return 'not-supported';
  if (applicable.some((status) => status === 'partial')) return 'partly-supported';
  return 'supported';
};

const aggregateReadiness = (levels) => {
  const applicable = levels.filter((level) => level !== 'not-applicable');
  if (applicable.length === 0) return 'not-applicable';
  if (applicable.some((level) => level === 'unknown')) return 'unknown';
  if (applicable.some((level) => level === 'partial')) return 'partial';
  return 'supported';
};

/***
 * MARK: groupStatementResults
 * @description Applies the mapping doc's aggregation rule to a parsed
 *   artifact: one entry per need group with its AAA rows, 3.0 rows, and
 *   aggregated group statuses. Pure and total over NEED_GROUPS.
 * @example groupStatementResults(parseResultsArtifact(FALLBACK_ARTIFACT).artifact)[0].group.id => 'seeing'
 ***/
export const groupStatementResults = (parsedArtifact) => {
  const artifact = parsedArtifact && typeof parsedArtifact === 'object' ? parsedArtifact : null;
  const statusByCriterion = new Map(
    (artifact?.wcag22aaa || []).map((row) => [row.criterion, row]),
  );
  const readinessByOutcome = new Map(
    (artifact?.wcag30 || []).map((row) => [row.outcome, row]),
  );
  const issuesByGroup = new Map(NEED_GROUPS.map((group) => [group.id, []]));
  for (const issue of artifact?.knownIssues || []) {
    if (issuesByGroup.has(issue.group)) issuesByGroup.get(issue.group).push(issue);
  }
  return NEED_GROUPS.map((group) => {
    const criteria = WCAG22_AAA_CRITERIA.filter((entry) => entry.group === group.id);
    const aaaRows = criteria.map((criterion) => ({
      ...criterion,
      status: statusByCriterion.get(criterion.id)?.status || 'unknown',
      evidence: statusByCriterion.get(criterion.id)?.evidence || '',
    }));
    const outcomes = WCAG30_OUTCOMES.filter((entry) => entry.group === group.id);
    const w30Rows = outcomes.map((outcome) => ({
      ...outcome,
      readiness: readinessByOutcome.get(outcome.id)?.readiness || 'unknown',
      note: readinessByOutcome.get(outcome.id)?.note || '',
    }));
    const aaaStatus = aggregateAaa(aaaRows.map((row) => row.status));
    const w30Readiness = aggregateReadiness(w30Rows.map((row) => row.readiness));
    return {
      group,
      aaaStatus,
      aaaLabel: GROUP_AAA_LABELS[aaaStatus],
      w30Readiness,
      w30Label: READINESS_LABELS[w30Readiness],
      aaaRows,
      w30Rows,
      knownIssues: issuesByGroup.get(group.id),
    };
  });
};
