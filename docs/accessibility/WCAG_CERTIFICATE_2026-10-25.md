# WCAG Conformance Certificate — KainBain frontend

**Certificate ID:** WB-KAINBAIN-2026-10-25
**Issued:** 2026-10-25
**Auditor:** accessibility stage (automated gates + manual keyboard/low-vision/touch lanes; see audit register)
**Normative reference:** WCAG 2.2 (W3C Recommendation, 2023) — Levels A, AA and AAA applied cumulatively
**Advisory annex:** WCAG 3.0 (working draft) — alignment note only, no conformance claim (see §6)
**Audit register:** [`docs/accessibility/AUDIT-REGISTER-2026-10-25.md`](./AUDIT-REGISTER-2026-10-25.md)
(δ continuation of `AUDIT-REGISTER-2026-10-15.md` and `AUDIT-REGISTER-2026-09-20.md`)
**Accessibility statement:** [`docs/accessibility/STATEMENT.md`](./STATEMENT.md)

---

## 1. Scope of conformance

**Applies to:** the KainBain single-page web application as served from the audited build on
branch `kb/ae49090e-46e1-4676-8d6f-ef34deafcf5d`, including all of the following views and
their shared chrome:

- Orchestrator `/`
- Project Explorer `/explorer`
- Project Settings `/settings`
- System Settings `/system-settings` and `/system-settings/:section`
- Observability `/observability` (full cockpit + compact 390×844 mobile monitor)
- Docs `/docs` and `/docs/:slug`
- Task Detail `/tasks/:id`
- Task Review `/tasks/:id/review`
- Task Survey `/tasks/:id/survey`
- Retrospective `/retrospective`
- Legacy redirect shapes (`/orchestrator`, `/task/:id*`)

Shared chrome in scope: header, tab strip, Now Playing bar, project dropdown, stage configuration
drawer, task inspector, widget manager, modals (`Modal`, `FeedbackDialog`, `UiPreferencesModal`,
`KeyboardShortcutsModal`, `SystemGuideModal`, `PromptReviewModal`), toasts, tooltips, skip link,
route announcer, and live regions.

**Excluded:** backend HTTP/WebSocket APIs, persistence, infrastructure, native desktop/terminal
wrappers, and third-party library internals (except where a wrapper choice exposed a barrier).

**Styles/themes in scope:** dark, light, midnight, high-contrast; OS `prefers-reduced-motion` and
`prefers-contrast: more`; 320–1024 px viewports including portrait/landscape.

## 2. Conformance verdict

| Level | Verdict |
|---|---|
| **WCAG 2.2 Level A** | **Conformant** across the audited scope. |
| **WCAG 2.2 Level AA** | **Conformant** across the audited scope (re-verified 2026-10-25; see register §6). |
| **WCAG 2.2 Level AAA** | **Conformant except the four documented exemptions in §3.** |
| **WCAG 3.0 (working draft)** | **No conformance claim.** Alignment note only (§6). |

No criterion is recorded as "passed" if it does not apply; the N/A list is §5.

## 3. Exemptions (AAA)

| # | Criterion | Exemption | Owner | Review |
|---|---|---|---|---|
| 1 | 2.5.5 Target Size Enhanced (44×44) | Dense data controls (filter pills ≥ 32 px, listbox options, table rows) hold the AA 24 px minimum (2.5.8) but not 44 px, to preserve information density. Primary actions, icon/close buttons, tabs and dialog controls remain 44 px. | frontend | 2027-04-15 |
| 2 | 1.4.8 Visual Presentation | Themes + font-size setting cover colour/size choice; justified text is never used and body line-height ≥ 1.5, but no 80-character line-length control is offered for long-form text. | frontend | 2027-04-15 |
| 3 | 3.1.5 Reading Level | User-facing copy is written plainly and reviewed per change; no automated grade-level gate is enforced (reading-level was excluded from the manual lanes per the user survey). | frontend | 2027-04-15 |
| 4 | 2.4.13 Focus Appearance (custom accents) | The focus ring follows the project accent: default and preset accents exceed 3:1 on every theme, but a user-picked dark custom accent on a dark theme can reduce focus-ring contrast; the accent picker warns on mid-luminance values. | frontend | 2027-04-15 |

These are the only exemptions. Each carries owner and review date per the
[`STATEMENT.md`](./STATEMENT.md) table. No new exemption was added by this audit.

## 4. Verification instruments and results (2026-10-25)

| Instrument | Result |
|---|---|
| `npm run test:unit` (api + frontend) | Green: api 330 files / 5676 passed (1 skipped); frontend 273 files / 3742 passed. |
| `npm run lint` | 0 errors (524 warnings, pre-existing advisory class; no new `jsx-a11y` warnings). |
| `npm run test:canary -- accessibility.spec.js` (auto-provisioned scratch stack; never live) | 25/25 green: 18 axe + AAA-contract surface scans, 2 negative controls, 5 keyboard/focus guards. |
| `npm run test:visual` | 15/15 green (design preservation across 375/1024/1280 px). |
| `npm run docs:check` | Green (54 doc files scanned). |
| Source/contrast unit gates | `landmarkStructure`, `decorativeIcons`, `uiTextConventions`, theme contrast family, `a11yTestHelpers` — green. |
| Negative controls | Planted 1.7:1 node caught by the contrast walk; axe `color-contrast-enhanced` effective via the walk. |

Tooling recorded in the register §0:
Node v26.4.0 · npm 11.18.0 · Playwright 1.64.0 · @axe-core/playwright 4.13.0 ·
Tailwind ^3.0.0.

## 5. N/A list (criteria that do not apply to this product)

The following criteria do not apply and are recorded **N/A**, never "passed":

- **1.1.1 (non-text content)** — applied where media exist; there are no prerecorded audio/video
  or captions tracks in the SPA, so audio/video-derived sub-criteria are N/A.
- **1.2.1–1.2.5 (time-based media)** — the app ships no prerecorded audio, video, sign-language,
  extended audio description, or live captions; all applicable sub-criteria are N/A.
- **1.4.7 (low or no background audio)** — no background audio produced by the app; N/A.
- **2.2.1 (timing adjustable), 2.2.3 (no timing)** for session expiry — the app has no
  user-settable time limits on input; engine scheduling exists but no timed user-facing activity;
  recorded N/A for user-controlled timing, conformant-by-design for the engine.
- **2.2.4 (interruptions)** — no non-user-initiated interruptions disable input; N/A where no
  such mechanism exists.
- **2.2.5 (re-authenticating)** — no re-authentication challenge present; N/A.
- **2.2.6 (timeouts)** — no user-inactivity timeout exposed; N/A.
- **3.1.1 / 3.3.8 / 3.3.9 (language, accessible authentication)** — language of the page is
  set on the shell (`lang`); there is no login/cognitive challenge in the SPA, so authentication
  criteria are N/A.
- **4.1.1 (parsing)** — obsoleted in WCAG 2.2; treated as N/A by the standard.
- **Credential/feature-dependent criteria** (e.g. any that would require a new backend capability)
  are N/A or documented exemptions rather than silent passes.

Full per-criterion accounting is carried in the 2026-09-20 register and is not repeated here.

## 6. WCAG 3.0 alignment annex (advisory)

No conformance claim is made against WCAG 3.0 (working draft). Alignment against the applicable
draft outcomes is recorded as follows:

| Draft outcome | Alignment |
|---|---|
| Text/visual contrast detectability | Strengthened; cockpit covered by computed gate + live in-page walk. |
| Focus and keyboard controllability | Strengthened; scrollable regions reachable; single `main` enforced. |
| Clear language and visual aids | Strengthened; no literal all-caps copy; harness/model attribution carries `<abbr>` expansions. |
| Status not conveyed by colour alone | Strengthened; health cards state status in text. |
| Usability testing with disabled users | Open — human screen-reader pass not run; carried as residual risk (register §7). |

## 7. Known residual risks

1. Human screen-reader pass (NVDA+Chrome/Edge, VoiceOver+Safari, TalkBack+Chrome, Orca+Firefox)
   not run on this host. No AT is claimed. Owner: frontend; scheduled with the next review cycle.
2. All routed views now carry a dedicated canary axe + AAA-contract scan (incl. system-
   settings root/deep, retrospective + chat panel, task survey, deep docs article, task-detail
   waiting_human, explorer file-preview open). Remaining canary work is additional dynamic state
   variants and landscape orientations.
3. In-page contrast walk skips unmeasurable surfaces (gradients, gradient text-clip, disabled
   controls, sr-only nodes, zero-size) honestly; gradient composites covered by the unit gate.
4. axe evaluates ~30–40% of AAA; manual protocol remains the conformance instrument for the rest.

## 8. Validity

This certificate is valid for the audited build on branch `kb/ae49090e-46e1-4676-8d6f-ef34deafcf5d`
and the scope in §1, until the next review date **2027-04-15** or until a material change to the
audited surfaces, whichever comes first. Any change to conformance status requires a re-audit and
an updated register/certificate. Per the accessibility statement, issues in the app chrome should be
filed with the view, the barrier and, for contrast, the active theme + accent.

---

*Accessibility statement: [`STATEMENT.md`](./STATEMENT.md) · Audit register:
[`AUDIT-REGISTER-2026-10-25.md`](./AUDIT-REGISTER-2026-10-25.md)*
