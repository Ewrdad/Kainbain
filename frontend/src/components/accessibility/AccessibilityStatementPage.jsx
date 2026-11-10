import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { GlossaryTerm } from '../common/GlossaryTerm';
import {
  AAA_STATUS_LABELS,
  READINESS_LABELS,
  loadStatementResults,
} from '../../a11y/statementResults';
import { AccessibilityReportDialog } from './AccessibilityReportDialog';

// Container-token chip per status (every pair holds 7:1 — see
// theme/containerContrast.test.js). The text label always carries the
// meaning, never the colour alone (WCAG 1.4.1).
const CHIP_TONES = {
  supported: 'bg-primary-container text-on-primary-container',
  'partly-supported': 'bg-warning-container text-on-warning-container',
  'not-supported': 'bg-error-container text-on-error-container',
  'not-applicable': 'bg-secondary-container text-on-secondary-container',
  unknown: 'bg-tertiary-container text-on-tertiary-container',
  partial: 'bg-warning-container text-on-warning-container',
};

const StatusChip = ({ prefix, tone, label }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-sm text-xs font-bold ${CHIP_TONES[tone] || CHIP_TONES.unknown}`}
  >
    <span className="font-mono">{prefix}</span>
    <span>{label}</span>
  </span>
);

const CriterionRow = ({ row }) => (
  <li className="py-2 border-b border-border-standard last:border-b-0">
    <p className="text-sm text-on-surface">
      <strong className="font-bold">
        {row.id} {row.title}
      </strong>{' '}
      <span className="text-text-muted">— {AAA_STATUS_LABELS[row.status]}</span>
    </p>
    <p className="text-sm text-text-muted mt-0.5">{row.plainWords}</p>
    <p className="text-xs text-text-muted mt-0.5 font-mono">
      Checked by: {row.instrument}
      {row.evidence ? ` · ${row.evidence}` : ''}
    </p>
  </li>
);

const OutcomeRow = ({ row }) => (
  <li className="py-2 border-b border-border-standard last:border-b-0">
    <p className="text-sm text-on-surface">
      <strong className="font-bold">{row.plainWords}</strong>{' '}
      <span className="text-text-muted">— {READINESS_LABELS[row.readiness]}</span>
    </p>
    <p className="text-xs text-text-muted mt-0.5 font-mono">
      Assessed from: {row.approximatedBy}
      {row.note ? ` · ${row.note}` : ''}
    </p>
  </li>
);

const NeedGroupSection = ({ entry }) => {
  const checkCount = entry.aaaRows.length + entry.w30Rows.length;
  return (
    <section
      aria-labelledby={`need-group-heading-${entry.group.id}`}
      data-testid={`need-group-${entry.group.id}`}
      className="border border-border-standard rounded-sm bg-surface-container-low p-4"
    >
      <h2
        id={`need-group-heading-${entry.group.id}`}
        className="text-lg font-bold text-on-surface"
      >
        {entry.group.label}
      </h2>
      <p className="text-sm text-text-muted mt-1">{entry.group.blurb}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <StatusChip prefix="AAA" tone={entry.aaaStatus} label={entry.aaaLabel} />
        <StatusChip prefix="3.0" tone={entry.w30Readiness} label={entry.w30Label} />
      </div>
      {entry.knownIssues.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-bold text-on-surface">Known issues in this area</h3>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            {entry.knownIssues.map((issue) => (
              <li key={issue.id} className="text-sm text-text-muted">
                {issue.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-3 border border-border-standard rounded-sm bg-surface-container">
        <summary className="min-h-[44px] flex items-center px-3 py-2 text-sm font-bold text-on-surface cursor-pointer">
          Show the {checkCount} checks behind this group
        </summary>
        <div className="px-3 pb-3">
          <h3 className="text-sm font-bold text-on-surface mt-1">AAA checks</h3>
          <ul>
            {entry.aaaRows.map((row) => (
              <CriterionRow key={row.id} row={row} />
            ))}
          </ul>
          <h3 className="text-sm font-bold text-on-surface mt-3">
            WCAG 3.0 draft readiness (not a certificate)
          </h3>
          <ul>
            {entry.w30Rows.map((row) => (
              <OutcomeRow key={row.id} row={row} />
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
};

const formatCheckedDate = (isoValue) => {
  if (typeof isoValue !== 'string' || isoValue === '') return 'date unknown';
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return 'date unknown';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(parsed);
};

/***
 * MARK: AccessibilityStatementPage
 * @description Dynamic accessibility statement (`/accessibility`): grouped
 *   by the five user needs (not by report structure), with each group
 *   showing its WCAG 2.2 AAA status and its WCAG 3.0 draft-readiness side
 *   by side. Statuses derive from the latest stored check results fetched
 *   at runtime (with a visible last-checked date); a curated fallback
 *   renders only when no results can be loaded. A report-a-problem call to
 *   action opens above the statement and repeats at the end. Document title
 *   stays owned by App.jsx; this view never sets it.
 * @example <AccessibilityStatementPage />
 ***/
export function AccessibilityStatementPage() {
  const [data, setData] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const result = await loadStatementResults(api.accessibilityResults);
      if (!alive) return;
      if (!result.isFallback && result.warnings.length > 0) {
        logger.warn('Accessibility results carried warnings:', result.warnings);
      }
      setData(result);
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const checkedDate = data ? formatCheckedDate(data.artifact.generatedAt) : 'date unknown';
  const appVersion = data?.artifact.appVersion || 'unknown';
  const contactEmail = data?.artifact.contactEmail || '';

  // Page scroll owner (`flex-1 min-h-0 overflow-y-auto`, matching the
  // TaskDetailPage / DocsView contract). A plain <div>, NOT a second
  // <main>: the shell already owns the single top-level main landmark.
  return (
    <div data-testid="accessibility-page" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto w-full">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-on-surface">Accessibility statement</h1>
          <p className="text-sm text-text-muted">
            We want everyone to be able to use KainBain. This statement explains how accessible
            the app is today, grouped by what you need to do rather than by the checklists we
            run. It covers{' '}
            <GlossaryTerm
              term="WCAG"
              expansion="Web Content Accessibility Guidelines"
              definition="The shared standard for accessible web content, published by the W3C."
            />{' '}
            2.2 level{' '}
            <GlossaryTerm
              term="AAA"
              expansion="Triple-A"
              definition="The highest WCAG conformance level, above A and AA."
            />{' '}
            checks and our readiness for the WCAG 3.0 draft. WCAG 3.0 is still a draft, so its
            readiness is our own assessment, never a certificate.
          </p>
          <p role="status" className="text-sm text-text-muted" data-testid="statement-freshness">
            {!data && 'Loading the latest accessibility results…'}
            {data &&
              !data.isFallback &&
              `Results last checked ${checkedDate} · App version ${appVersion}.`}
            {data &&
              data.isFallback &&
              `Showing the last-known statement from ${checkedDate} because the latest results could not be loaded · App version ${appVersion}.`}
          </p>
          <div>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all cursor-pointer"
            >
              Report an accessibility problem
            </button>
            <p className="text-xs text-text-muted mt-1">
              For any barrier you hit, whether or not it appears in a standard.
            </p>
          </div>
        </header>

        {data?.groups.map((entry) => <NeedGroupSection key={entry.group.id} entry={entry} />)}

        <section
          aria-labelledby="statement-commitment-heading"
          className="border border-border-standard rounded-sm bg-surface-container-low p-4"
        >
          <h2 id="statement-commitment-heading" className="text-lg font-bold text-on-surface">
            Our commitment and how to contact us
          </h2>
          <p className="text-sm text-text-muted mt-2">
            We are committed to making KainBain usable by people with disabilities, and we treat
            accessibility problems as defects. This statement covers the whole app: the
            orchestrator board, files and repository, project settings, the observability
            monitor, docs, task detail, review, and survey pages, the retrospective, and this
            statement itself.
          </p>
          <p className="text-sm text-text-muted mt-2">
            The app aims for WCAG 2.2 level AA conformance everywhere, and level AAA except for
            the known issues listed above. If you find a barrier — in a standard or not — please
            report it using the button on this page
            {contactEmail && (
              <>
                {' '}
                or by emailing the website team at{' '}
                <a
                  href={`mailto:${contactEmail}`}
                  className="underline underline-offset-2 hover:text-on-surface"
                >
                  {contactEmail}
                </a>
              </>
            )}
            . We reply to every report.
          </p>
        </section>

        <section
          aria-labelledby="statement-checks-heading"
          className="border border-border-standard rounded-sm bg-surface-container-low p-4"
        >
          <h2 id="statement-checks-heading" className="text-lg font-bold text-on-surface">
            How we check accessibility
          </h2>
          <p className="text-sm text-text-muted mt-2">
            Every change runs automated scans at the AAA level plus a text-contrast walk, unit
            gates for focus, targets, and wording, and manual keyboard and screen-reader passes.
            The app works in current browsers with JavaScript and needs no plug-ins. This
            statement was last checked on {checkedDate} and is reviewed with each release.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all cursor-pointer"
            >
              Report an accessibility problem
            </button>
          </div>
        </section>

        {reportOpen && (
          <AccessibilityReportDialog
            contactEmail={contactEmail}
            onClose={() => setReportOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/***
 * MARK: AccessibilityStatementPage default export
 * @description Default export mirroring the named component export.
 * @example import AccessibilityStatementPage from './AccessibilityStatementPage';
 ***/
export default AccessibilityStatementPage;
