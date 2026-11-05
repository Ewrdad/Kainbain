# screen-inventory.md — UI screens referenced by new guides

Verified live (scratch API :3100 + vite :5173, 2026-11-04):

| Screen | Route / path | Evidence |
| --- | --- | --- |
| Docs tab, new pages | `/#/docs/getting-started` (+ runner, skills) | Screenshots in this folder; all 7 new slugs 200 via API too |
| Docs sidebar order | same | Screenshot shows Getting Started first, then Install & Run, Adding a New Runner, Link Runner to Pi/Muse, First-Time Setup — matches reservations |
| Runners approval | System Settings › Runners tab (`runners`; `harness` is a legacy alias) | Approve flow verified via API (`POST /runners/:id/approve` → credential); tab ids read from `frontend/src/components/settings/settingsTabs.js` |
| One-time credential | Runners tab, `runner-credential-once` block | Copy verified in `RunnerConfigurationSection.jsx` ("never shown again"); credential consumed end-to-end by the daemon |
| Project menu adopt | `+ Add Existing Project…` | Label verified in `ProjectMenu.jsx`; flow verified via `POST /projects/register` |
| Project Settings tabs | Project Settings, Aliases, Files & Repos, Addresses, Named Workflows, Skills | Tab ids verified in `projectSettingsTabs.js`; "Files & Links" staleness fixed in first-project/review-gates |
| Skills import | Project Settings › Skills | `.md`/`.zip` import verified via API (201); UI accept list verified in `SkillsSection.jsx` |
| Stage Skills panel | stage editor, `direct` vs `option` | `direct` injection verified via `POST /tasks/preview` |
| Keyboard map | `1/2/3/4/5/A/R/C/G/S/P/N/?/Esc` | Verified against `App.jsx` key handler; `N` (orchestrator, not focus-input) and missing `A` fixed in keyboard-shortcuts + submit-track-task + faq |

## Render rules discovered (applied to all new/rewritten pages)

1. Ordered AND unordered list items must be exactly one source line —
   continuation lines render as detached paragraphs and ordered items
   restart at 1. A one-off script (`/tmp/kb-verify/join-lists.mjs`)
   joined 86 wrapped continuations across the 11 new/rewritten pages;
   code fences untouched.
2. Tables need leading/trailing `|` (already the repo rule) — all new
   tables comply; verified in screenshots.
3. No raw HTML; no image assets shipped (screenshots stay here as
   task evidence — no `site-docs/assets/` deployment path confirmed).

Screenshots: `getting-started-3.png`, `add-new-runner-2.png`,
`custom-skills.png` (final renders; earlier captures in /tmp only).
