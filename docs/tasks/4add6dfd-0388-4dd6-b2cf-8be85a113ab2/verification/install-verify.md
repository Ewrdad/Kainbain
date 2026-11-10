# install-verify.md — commands actually run, observed output

Reference host: Node v24.22.2, npm 11.19.1. No live KainBain on :3100/:5173
(verified via ss + curl before starting). Scratch API started with isolated
state: PROJECTS_ROOT=/tmp/kb-verify/projects,
NOTES_SPACE_ROOT=/tmp/kb-verify/notes, KAINBAIN_RUNNER_JOIN_TOKEN=verify-token-1.

## Boot + health

- `npm run setup` → ok (deps + Playwright Chromium; apt step skipped, no root).
- `PORT=3100 node api/index.js` → boots; `GET /status` → `{"status":"ok",…}`
  with engine idle.
- `GET /status/config` → `{entries:[…]}`; confirmed
  `KAINBAIN_DEFAULT_HARNESS=pi`,
  `KAINBAIN_DEFAULT_MODEL=deepseek-v4-flash:0731-cloud`, `PORT=3100`.
- `GET /docs` → index lists all 34 slugs in reservation order
  (getting-started 5 … api-reference 80).
- `GET /docs/<slug>` → 200 for all 7 new slugs: getting-started,
  add-new-runner, link-runner-pi, link-runner-muse, link-runner-opencode,
  existing-projects, custom-skills.
- `GET /harnesses` → 8 harnesses; muse available (binary present),
  pi/custom/mock available, antigravity/opencode/vibe/codex unavailable;
  tiers match docs (pi 1, muse 2, opencode 2, custom 3, mock 1).
- `muse --version` → `Muse Code 1.4.14`. pi/agy/vibe/opencode/codex absent
  from PATH (documented as install steps, not assumed present).

## Projects

- `POST /projects` WITHOUT gitUrl → 400
  "New projects require a fetchable git remote (D11)…" — this forced a
  doc fix: first-project.md now shows gitUrl + the D11 rule.
- `POST /projects/register {"path":"/tmp/kb-verify/ext-repo"}` → 201 with
  project; re-register → 200 (idempotent). `.kainbain/project.json`
  written in the repo; outside-root repo remembered in
  `~/.kainbain/projects.json` (created by this test, removed after —
  see cleanup note).

## Runner (mock, dispatch mode)

- Daemon without credential → registers, polls
  ("Join pending; waiting for human approval…"), and on approval exits:
  "Join … approved. Paste the one-time credential … into
  KAINBAIN_RUNNER_CREDENTIAL and restart." (D4, as documented.)
- `POST /runners/:id/approve` → active + credential (36 chars).
- `POST /runners/:id/rotate` → fresh credential.
- Credentialed daemon → heartbeat ok, one dispatch poll, no claimable
  tasks, idle-limit 1 → exit 0
  ("Runner assignment done: {assignments:0,polls:1,idle:true}").
- `GET /runners/models/catalogue` → `{"models":[]}` (unpinned mock +
  revoked fixture runner ineligible — consistent with docs).

## Skills (hello-reviewer worked example, exactly as documented)

- Zip (SKILL.md + KB_config.json, built with python zipfile) →
  `POST /projects/:id/skills/import` (multipart `file`) → 201
  `{skills:[{name:hello-reviewer, source:project, …mode:direct}], warnings:[]}`;
  lands in `<repo>/skills/hello-reviewer/`.
- `PUT /projects/:id/workflow` attaching
  `{name:hello-reviewer, mode:direct}` to stage 1 → 200.
- `POST /tasks/preview {goal, projectId, stageId}` → prompt contains the
  skill body ("Report each item as pass or fail") — injection verified.

## Frontend

- `vite --port 5173 --strictPort` → 200, no frontend/.env needed for smoke.
- Screenshots (in this folder): getting-started (numbering fix verified
  across 3 captures), add-new-runner (list-wrap fix verified),
  custom-skills. Render finding: the in-app MarkdownViewer breaks list
  items at source newlines, so every list item in new/rewritten pages is
  now exactly one source line (see join script output in screen-inventory).

## Cleanup

- Scratch API + frontend stopped after captures.
- `/home/server2/.kainbain/projects.json` (created solely by the adoption
  test) removed; the `verify-mock-1` entry removed from
  `~/.kainbain/engine/runners.json` (pre-existing `test-fleet-muse`
  fixture preserved). No other home-dir or repo state touched.
  /tmp/kb-verify holds raw logs (api-boot.log, runner-*.log, frontend.log).
