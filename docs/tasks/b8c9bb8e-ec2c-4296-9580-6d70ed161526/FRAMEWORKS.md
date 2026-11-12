# Frameworks for the post-hackathon tech-debt / refactor audit

Advice for the auditor. This file recommends which industry-standard
frameworks to use, how to apply each one to this codebase, and which
frameworks to leave out. It contains no audit findings.

Task context: 10-day hackathon rewrite of the KainBain app (Node 20+/22 API
in `api/`, React 18 frontend in `frontend/src/`, shared code in `shared/`,
harnesses in `runner/` and `scripts/`, tests in `tests/` plus co-located
`*.test.js(x)`). Features mostly work; suspected tech debt. Goal: find what
needs breaking down or refactoring to speed up other agents, and verify
recent non-KainBain changes against the standards in `./docs`.

Scope note: `INTENT-SURVEY.md` in this task directory has no answers
recorded, and the cited `task-spec-20261110-165113.md` is not present in the
directory. The auditor should confirm scope (recommendation: hackathon
window via `git log --since="10 days ago"` plus every task directory those
commits touched, with the whole current tree as context) before scoring.

## 1. Recommended frameworks

Use all of groups A–E. Group F is supporting method only.

### A. Maintainability and tech-debt quantification (the scoring backbone)

| # | Framework (version) | Why for this audit | How to apply |
|---|---|---|---|
| A1 | ISO/IEC 25010:2023, Maintainability characteristic | Gives the audit a standard vocabulary: modularity, reusability, analysability, modifiability, testability. Map every finding to one sub-characteristic so the backlog is comparable across areas. | Tag each finding; use analysability/modifiability as the primary lens for agent-velocity claims. |
| A2 | ISO/IEC 5055:2021 (automated source-code quality measures) | Standard, tool-measurable weaknesses for reliability, security, performance efficiency, and maintainability at code level. | Use its maintainability measures (excessive coupling, duplication, complexity) as the pass/fail bar for hot files; cite measure IDs in findings. |
| A3 | SQALE method (Software Quality Assessment based on Lifecycle Expectations) | Converts quality violations into remediation cost and a single Technical Debt Ratio with A–E ratings. Ideal for "prioritized refactor backlog with effort estimates". | Score each refactor candidate with remediation time; rank by debt ratio and interest (how often agents touch the file). |
| A4 | SIG / TÜViT Maintainability Model (Oman & Hagemeister lineage, SIG white paper) | Proven thresholds for volume, duplication, unit size, unit complexity, and module coupling on a 5-star scale. | Apply to `api/`, `shared/`, `frontend/src/`; any unit below 3 stars is a refactor candidate. |
| A5 | Fowler Technical Debt Quadrant + McConnell's intentional/unintentional taxonomy | Classifies hackathon debt (mostly deliberate-prudent and inadvertent) so the report distinguishes "pay now" from "acceptable shortcut". | Label each debt item deliberate/inadvertent × prudent/reckless; reckless items go first. |

### B. Code-level metrics (thresholds the auditor enforces)

| # | Framework | Why for this audit | Thresholds to use |
|---|---|---|---|
| B1 | McCabe cyclomatic complexity (1976) | Flags untestable branching in new hackathon code. | Function > 10 investigate, > 20 must split (aligns with SIG unit-complexity bands). |
| B2 | SonarSource Cognitive Complexity (Campbell, 2017) | Penalizes nesting and hard-to-follow flow better than McCabe; closer to "agent read budget". | Function > 15 investigate, > 25 must split. |
| B3 | Chidamber & Kemerer (CK) suite: WMC, CBO, LCOM | Measures the class/object problems the KB standards ban (state mingled with behaviour). | High CBO / high LCOM on any class outside the documented `taskStore.js` / `projectStore.js` facades is a finding. |
| B4 | Martin package metrics (afferent/efferent coupling, instability, abstractness, distance) | Checks domain splits (`api/work|flow|crew|watch|house|auth/`, `frontend/src/services/*/`) actually reduced coupling. | New cross-domain imports that bypass a domain `index.js` fail; flag dependency cycles. |
| B5 | Duplication / clone detection (CPD-style token matching) | Hackathons copy-paste; KB standards tolerate repetition but the auditor must price it. | Report clones > 50 tokens; recommend extraction only where SQALE interest justifies it (KB standards prefer explicit repetition over premature helpers). |

Project-specific size gates override generic ones where stricter: soft
~400-line backend subjects / ~300-line components, hard review rejection
for any **new** file over 800 lines without a documented exception
(`docs/ARCHITECTURE_DOMAINS.md`), plus the WP-8 one-function-per-file gate
(`npm run check:one-function`) and JSDoc `@example` gate
(`npm run check:jsdoc-example`). Existing oversized files are tracked debt,
not permission to grow.

### C. Design principles for judging breakdown proposals

| # | Framework | Why for this audit |
|---|---|---|
| C1 | SOLID, with emphasis on Single Responsibility + Dependency Inversion | Every proposed split must show each new module has one reason to change and depends on abstractions (domain `index.js` facades), not concrete siblings. |
| C2 | Parnas information hiding (1972) + high cohesion / low coupling (Stevens–Myers–Constantine) | The test for whether a split is at the right seam: secrets hidden, cohesion up, coupling down. |
| C3 | Fowler Refactoring catalog (2nd ed., 2018): Extract Function/Module/Class, Move Function, Split Phase, Replace Temp with Query, etc. | Name every refactor proposal with its catalog operation so follow-up tasks are unambiguous and estimate-able. |
| C4 | Domain-Driven Design bounded contexts (Evans) + Vertical Slice Architecture (Palermo) / REPR pattern | Validates placement in the six business domains (Work, Flow, Crew, Watch, House, Access Control) and keeps new operations in subject files, not facades. |
| C5 | C4 model (Brown, levels 1–3) + arc42 (sections 5/8) + ADR/MADR records | The auditor documents proposed splits at container/component level and records each accepted split decision as an ADR. |

Note on KB vocabulary: `KB Code Standards.md` forbids mentioning design
patterns by name in code and comments ("NEVER MENTION DESIGN PATTERNS").
The auditor follows that rule in all code-facing output (findings,
examples, JSDoc patches): describe behaviour in plain business language.
Framework and pattern names appear only in this audit's own process
documentation, never in proposed code or comments.

### D. Test and verification frameworks

| # | Framework | Why for this audit |
|---|---|---|
| D1 | Test Pyramid (Fowler/Cohn): unit > API/integration > E2E | Checks the hackathon did not invert the pyramid. KB standards demand the lowest possible level for the fastest cycle. |
| D2 | FIRST principles (Martin: Fast, Independent, Repeatable, Self-validating, Timely) + Given-When-Then structuring | Scores slow/flaky suites, the "slow or flaky tests" agent friction. |
| D3 | Characterization tests (Feathers, Working Effectively with Legacy Code) | Required safety net before any proposed split of untested hackathon code: pin current behaviour first, then refactor. |
| D4 | Mutation testing (selective, e.g. StrykerJS) | Spot-check only on the highest-risk new modules: passing tests that survive mutants are false confidence. Do not gate the whole audit on a mutation score. |

Repo gates the auditor runs as evidence: `npm run test:unit`,
`npm run docs:check`, `npm run check:one-function`,
`npm run check:jsdoc-example`, `npm run lint`, plus `depcheck` and the
Knip config (`.knip.json`) for dead exports left by the rewrite.

### E. Agent-velocity and documentation frameworks (the "speed up agents" lens)

| # | Framework | Why for this audit |
|---|---|---|
| E1 | SPACE framework (Forsgren et al., 2021): Satisfaction, Performance, Activity, Communication, Efficiency | The balanced scorecard for "faster agents". Map each friction (oversized files, stale maps, slow tests, missing JSDoc) to a SPACE dimension; never optimize one dimension alone. |
| E2 | DORA metrics (Accelerate / Google Cloud DORA) | Lead time for changes and change-fail rate are the outcome proxies: if breakdowns are right, small agent changes ship faster with fewer failures. Auditor proposes baselining them, not computing history. |
| E3 | Team Topologies cognitive load (Skelton & Pais): intrinsic vs extraneous load | The principled argument for splits: a file/folder an agent cannot hold in context is extraneous load. Cite against `AGENTS-MAP.md` read-budget rules (≤3 reads to orient, grep-to-seam, never `ls -R`). |
| E4 | Diátaxis (Procida: tutorial, how-to, reference, explanation) | Scores `AGENTS-MAP.md`, `agents.md`, `site-docs/`, and runbooks: each gap gets the quadrant it belongs in, so doc fixes land in the right place. |

### F. Supporting method

- Conventional Commits + git history mining (10-day window, churn vs
  complexity hotspot analysis in the style of Tornhill, Your Code as a
  Crime Scene): identify files that are both complex and frequently
  changed — those are the highest-interest debt and the first splits.
- Keep a Changelog (Olivetti): any behaviour-affecting proposal the audit
  endorses must note its changelog entry.

## 2. Mapping: KB standards values to audit checks

Check hackathon changes against all five values in
`docs/KB Code Standards.md`, using this mapping. No value is optional.

| KB value | Framework checks | Concrete evidence to collect |
|---|---|---|
| User-understandable over technical language | A1 analysability, C2, project JSDoc rules | Long descriptive names; business vocabulary (tasks/stages); `MARK` + `@description` + `@example` on functions; no pattern names in code; labelled-data import `({a, b}) => {}` |
| Functional over object-oriented | B3, C1 (SRP), A2 | No new classes outside documented facades; no curried pseudo-classes; black-box pure functions; verb-named functions; minimal data passed in; immutable-by-default |
| Co-location over abstraction | C2, C4, B4, B5 | Tests next to source; callees in caller-named folders; helpers at lowest common folder; no single-line abstractions; searchable placement ("modify the task history box" test); folders as organization |
| Tested over trusted | D1, D2, D3 | Tests planned before code; no trusted typing without proof; transparent failures; consistent suites; integration tests reflect user use; lowest test level used |
| Fast iteration over long planning | E1, E2, D3 | Small changes with green tests between; change-easy-first refactors; safe non-prod verification paths; checkpointed plans |

Cross-check placement and ownership against
`docs/ARCHITECTURE_DOMAINS.md` (domain table, facade freeze list, import
rules, size warnings) and `AGENTS-MAP.md` (ownership roster, god-file
seams, no-split decisions, read-budget rules). A file that contradicts the
map without updating it is both a code finding and a docs finding (E4).

## 3. Audit method the auditor follows

1. Confirm scope and the ./docs standards set (code standards at minimum;
   recommend code standards + `ARCHITECTURE_DOMAINS.md` + `AGENTS-MAP.md`
   + `TASK_DIRECTORY_HYGIENE.md` + check-script gates).
2. Mine the hackathon window: `git log --since` + churn/complexity
   hotspots; list every task directory touched.
3. Run the repo gates (Section D) and record green/red as baseline
   evidence; do not re-litigate gate design.
4. Score hotspots with A1–A5 and B1–B5; classify debt with the Fowler /
   McConnell labels.
5. Draft split proposals using C1–C5, each naming its Fowler operation,
   target domain, seam tests (D3), and ADR sketch.
6. Score agent frictions with E1–E4: read-budget violations, stale maps,
   slow/flaky tests, missing JSDoc/examples, unclear module boundaries.
7. Deliver a prioritized backlog ordered by (interest × risk ÷ effort):
   SQALE remediation cost as effort, hotspot churn as interest. Separate
   report-only findings from safe fixes per the task's risk decision.
8. Respect `TASK_DIRECTORY_HYGIENE.md`: read task artifacts, never
   move/rename/delete task directories during this audit.

## 4. Frameworks explicitly out of scope

| Framework | Reason |
|---|---|
| NIST CSF 2.0 / ISO/IEC 27001 (security management) | This is a maintainability audit, not a security audit. Run `./Security_scans.sh` as hygiene only; escalate to a dedicated security audit if it fails. |
| OWASP ASVS / SAMM (full assessment) | Same reason; a full ASVS pass is disproportionate. Spot-check auth-adjacent hackathon changes (`api/auth/`, `api/routes/auth.js`) against ASVS L1 only. |
| WCAG 2.2 (accessibility) | Only if the audit samples `frontend/` splits: then check that proposed component splits preserve existing accessible names/roles; no conformance claim. |
| ISO/IEC 25010 full eight-characteristic appraisal | Use Maintainability (+ Performance Efficiency where tests are slow) only; a full quality-model appraisal is out of scope. |
| CMMI / ITIL / SAFe-style process maturity | Measures organisations, not this codebase; SPACE + DORA cover the velocity question. |

## 5. References (canonical sources)

- ISO/IEC 25010:2023, Systems and software Quality Requirements and
  Evaluation (SQuaRE) — quality model.
- ISO/IEC 5055:2021, Automated source code quality measures.
- SQALE method (sqale.org) and SonarQube documentation (Clean Code
  attribute model, Cognitive Complexity white paper, Campbell 2017).
- SIG Software Maintainability Model (Software Improvement Group white
  paper; also ISO/IEC 15939-aligned).
- McCabe, "A Complexity Measure" (IEEE TSE, 1976).
- Chidamber & Kemerer, "A Metrics Suite for Object Oriented Design"
  (IEEE TSE, 1994); Martin, Agile Software Development (package metrics).
- Martin, Agile Software Development (SOLID); Parnas, "On the Criteria
  To Be Used in Decomposing Systems into Modules" (1972);
  Stevens–Myers–Constantine structured design.
- Fowler, Refactoring, 2nd ed. (2018); Feathers, Working Effectively
  with Legacy Code (2004); Tornhill, Your Code as a Crime Scene (2015).
- Evans, Domain-Driven Design (2003); Palermo, Vertical Slice
  Architecture; C4 model (c4model.com); arc42 template; MADR
  (adr.github.io/madr).
- Fowler/Cohn Test Pyramid; Martin FIRST principles; StrykerJS docs.
- Forsgren et al., "The SPACE of Developer Productivity" (ACM Queue,
  2021); Google Cloud DORA research; Skelton & Pais, Team Topologies
  (2019); Diátaxis (diataxis.fr).
