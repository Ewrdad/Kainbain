# Hand Notes on Parallelism — Transcription

Source: `HandNotesOnParrelism.pdf` (7 pages, scanned handwritten notes).
Transcribed 2026-10-22. `[?]` marks an uncertain reading. Excalidraw diagrams:
[HandNotesOnParallelism.excalidraw](./HandNotesOnParallelism.excalidraw) (open via
excalidraw.com → Open → Load from file).

---

## Page 1 — Context notes (two sticky-note style sheets)

Left sheet, titled "3 things":

- Past / annoyance
  - chat
  - earbuds
- Present / Risk
  - multimodal avoidance [?]
  - transparency
- Future
  - compute smoothing
  - drive down costs

Right sheets:

- Deliverables
  - open sourceable
    - can run on any device
  - multi threading
- Integrate muse
  - voice describe
  - tickets [?]
  - Generate prototype UI

## Page 2 — Queue UI sketches by runner count

- Top: "Queue pushes task to harness". Diagram: `[Queue]` —old→ `[Harness]`
  (arrow from Queue back to Harness, labelled "old").
- "6+ Runners": a panel containing an "IDLE 5" card plus the text
  "Top runners — 3 plan, 2 in prog, 1 code". Annotation: "< Above 5 runners".
- "2–5 Runners": a panel with three cards: "Run 2 / Plan", "in-pro", "Review".
  Annotation: "< for under 5 Runners".
- "1 Runner": a single bar: "Plan | Fix a thing | ▶ (play) | ⏹ | Queue ③ [?]".
  Annotation: "^ current" under the play button — i.e. this single-runner
  layout is the current UI.

## Page 3 — Runner architecture (labelled "New" [?])

- "Kainbain Engine" creates the queue ("creates queue" written vertically):
  `[UI]` + `[API]` feed the engine, `[Engine]` → `[Queue]`
  (UI ↔ API; API → engine; engine → queue).
- Three runners poll the queue for tasks ("Poll for task", arrows Runner → Queue):
  - Runner local ("Local Runner baked in")
  - Runner local (second)
  - Runner Remote ("Remote over SSH")
- Each runner works through its own git worktree ("Worktree to avoid clash")
  into a Harness session:
  - Local runners → one shared "Harness" box ("sep. sessions, same config").
  - Remote runner → its own "Harness" ("muse code / Pi / etc").
  - Note on the remote worktree: "may need project allowlist [?]".

## Page 4 — Runners config screen (UI wireframe)

Panel titled "Runners", with a "to conf [?]" button top-right and a Search box.

- Name: [text field]; Remote: [dropdown/check]
- ID: `abcd-1234` (example)
- Hostname: [text field]
- Working Dir: [text field]
- Table: Project | loaded | actions — one row: "Proj A | 22/03/2008 [?] |
  [refresh] [X]"
- Second row: [search] [Load button]
- "Harnesses detected: Pi, muse code, vibe"

## Page 5 — Harness/model routing + Engine aliases

Left flowchart:

- "Does Runner have a Priority 1 harness + model?"
  - Yes → "Pick P1 model, Randomly weighted"
  - No → "Does it have a P2?" → (dashed arrow down) → "Runner can't take job"

Right:

- `[Engine / Alias]` → `[Runners / Harness / models]`
- "alias as Priority ratio"; "Runners Report Availability" (arrow back to Engine).
- Alias form: Alias [name]; [Harness ▾] [model ▾]; [Priority] [weight].

## Page 6 — System data flow + config scopes

Top flow diagram:

- Queue → Engine → Runner ↔ Harness; Model → Harness.
- Harness ↔ Worktree; Runner → Worktree; Worktree ← Repo; Repo ↔ origin
  (dashed, two-way).
- UI ↔ API; API ↔ Logging; Runner → API; UI/API row connects back up to Queue.

Bottom table (three config scopes):

- Global: Runners, central logs, Hosting, Notifications, UI
- Project: stages, theme, Aliases, Retries [reads "Refries" ?], Defaults,
  Skills, secrets
- Runner: Harnesses, Projects available

## Page 7 — Startup sequence + packaging

Top flowchart:

- Start up → Load .Env → Setup local Runner by default? → UI Port → API Port

Bottom panels:

- "Docker compose": [UI] [Backend]
- "Runner is native" (plus faint bleed-through text from the next sheet,
  illegible — ignored).
