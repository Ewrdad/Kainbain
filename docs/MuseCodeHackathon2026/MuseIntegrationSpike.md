# Spike: Muse Code integration — current state, `/goal` for prompts, and `/taste`-style skill opportunities

**Status:** Spike (no code changed — docs only)
**Date:** 2026-10-23
**Question:** How deep is the current Muse Code integration, does it use anything like `/goal` for prompts, can other slash commands such as `/taste` be used from KainBain stages, and what else on the Muse surface is worth wiring up for hackathon marks?
**Probed against:** `muse` 1.4.12 live on this box (`muse --version`, `skills list`, `schema generate-json-schema`), plus the in-repo harness source.

## Summary (the whole spike in 10 bullets)

- **Current integration is already Tier 2 and strong:** a long-lived `muse serve` MSP host per project, one session per KainBain session, with `turn/start`, `turn/steer`, `turn/interrupt`, per-request approval interception, live `model/list` + `session/setModel`, `session/resume` reconnect, and the per-turn `muse exec` path as rollback (`KAINBAIN_MUSE_MSP=off`). See [MuseHarness.md](../EngineDetails/MuseHarness.md).
- **There is no `/goal` slash command on the CLI.** "Goal" exists in two real places: (1) KainBain's `task.goal`, interpolated as *prompt text* by `api/promptCuration.js` (current path — works on both transports, no agent action needed); (2) MSP `goal/set` + `goal/edit` + `goal/pause` + `goal/resume` + `goal/clear`, a first-class session-goal object with a wake gate ("wakes a goal-driving turn iff idle and the resulting goal is unfinished") — **wired to nothing today**; the harness only *observes* `session/goalChanged` in the event mapper.
- **Biggest cheap win: call `goal/set` (or `goal/edit`) with the stage goal at the start of every MSP turn.** It is ~10 lines in `msp/museMspSession.js`, hermetically testable on the echo provider, and it turns the stage goal from inert text into a session-level objective the host itself tracks and drives.
- **There is no generic "slash command" flag on `muse exec` / `muse serve` either.** In the TUI, `/`-invocations are *skill shortcuts*: the MSP schema describes `skill/list` as "one row per typed-invocable shortcut spelling". So "`/taste`" really means "the `taste` skill, invoked by shortcut" — and skills are reachable headlessly, just not by typing a slash.
- **Four headless paths to a skill like `taste`, cheapest first:** (a) name the skill in prompt text (works today, zero code); (b) `--trust-workspace` so project skills/rules load (one env knob, but it competes with KainBain's curated prompt skills — currently off by default *deliberately*); (c) MSP `skill/setActivation` to force-enable a skill per stage (unwired, small diff, no prompt competition); (d) MSP `skill/import` / `--agents` ephemeral overlay to inject a skill definition (bigger, for skills that don't exist yet).
- **`taste` specifically needs no installation:** it is a *built-in* skill, `activation: on` (verified in `muse skills list`). The gap is only *triggering*: its body says to `read_skill` it "before the first frontend create or edit tool call" — an instruction to an orchestrating agent, which a headless stage turn will not reliably self-execute. Frontend stages should therefore either cite it explicitly in prompt text (today) or get it force-activated via `skill/setActivation` (proposed).
- **The MSP schema exposes 70 methods; the harness uses ~10.** Unwired, high-value, stage-relevant ones: `session/setReasoningEffort` (per-stage effort tiers — trivially mappable to stage config), `session/compact` (long stages), `media/upload` + exec `--image` (visual check stages; `visionSupport` is currently `false` for muse), `--output-schema` (structured JSON verdict stages — the review/verdict pipeline's dream), `--max-model-steps` / `--max-tool-output-bytes` caps, `session/fork` (parallel exploration), `recap/*` (stage handoffs), `subagent/*` + `task/*` (visibility into the agent's own decomposition), `view/*` (cursor subscriptions already half-used).
- **Do NOT chase:** an ACP-shim (already rejected in [MuseTier2Spike.md](../EngineDetails/MuseTier2Spike.md) §4C), `userInput/answer` plumbing before an approval UI exists (policy-cancel is correct for v1), or flipping `KAINBAIN_MUSE_TRUST_WORKSPACE` on globally (it loads *all* project skills/rules and directly competes with the curated prompt — scope it per stage instead).
- **Suggested marking story (3 diffs):** Diff 1 — `goal/set` per MSP turn + prompt-text skill citation for frontend stages (no transport change, echo-testable). Diff 2 — `skill/setActivation` (force `taste` on frontend stages) + `session/setReasoningEffort` from stage config. Diff 3 — `--output-schema` for verdict stages + `media/upload`/`--image` for visual stages. Each is independently demoable and keeps the exec rollback intact.
- **Schema drift is real and must be pinned:** this box (1.4.12) exports fingerprint `sha256:cfdb6d25…`, the Tier-2 spike (1.4.9) recorded `sha256:5d3b43e5…`. Refresh the `msp-*.jsonl` fixtures per muse upgrade, exactly as the exec fixtures already do.

## Diagram: where the goal and the skills flow today vs where they could

```
KainBain stage turn
  │
  │  task.goal ──► promptCuration ──► prompt TEXT ──► turn/start ──► agent
  │     (works today, both transports)        ▲
  │                                           │  text only — the host
  │                                           │  tracks NO goal object
  ═══════════════════════════════════════════════════════════════════
  PROPOSED (Diff 1): also ──► goal/set ──► session GOAL object ──► host
  drives/ tracks/ wakes turns; goalChanged events flow back to task logs
  ═══════════════════════════════════════════════════════════════════

Skills ("slash commands" = skill shortcuts per skill/list INV-007)
  │
  ├─ (a) prompt text cites skill ──► works TODAY, zero code ──► agent
  ├─ (b) --trust-workspace ──► loads PROJECT skills/rules ──► agent
  │        (one knob; OFF by default — competes with curated prompt skills)
  ├─ (c) skill/setActivation ──► PROPOSED Diff 2: force taste ON ──► agent
  └─ (d) skill/import | --agents overlay ──► PROPOSED if a skill must be
           invented (e.g. a KainBain "stage-verdict" skill)
```

---

## 1. What the integration looks like today (baseline for marking)

One paragraph the judges can hold onto: KainBain runs agent stages on Muse Code through a dedicated harness in `api/agent/harnesses/muse/` (id `"muse"`), conforming to the same `AgentHarness`/`HarnessSession` contract as the `pi`, `antigravity`, `vibe`, `opencode` and `codex` harnesses. Two transports, selected by `KAINBAIN_MUSE_MSP` (`auto` default, `on` force-MSP, `off` = exec rollback):

- **MSP transport (Tier 2, default when `serve` resolves).** One supervised `muse serve` host per project workspace (`msp/museServeHostPool.js`, idle TTL `KAINBAIN_MUSE_MSP_HOST_IDLE_TTL_MS`), one MSP session per KainBain session (`msp/museMspSession.js`). NDJSON JSON-RPC 2.0, UUIDv7 `commandId` idempotency handles, `initialized`-notification handshake (GOTCHA-1), `workspaceRoot` pinned to the project cwd, redacted child env, engine watchdog + 30 s handshake ceiling, host-eviction on wedged turns, `session/resume` reconnect (5 attempts).
- **Exec transport (Tier 3, rollback).** One `muse exec --workspace <cwd> --approval-mode never --json [--yolo] <prompt>` process per `prompt()`, with `--session-id` chaining (one id per KainBain session = multi-turn continuity), `--model` passthrough, 64 KiB `--prompt-file` staging, `readHistoryFromDisk` via `muse export --session <id> --redacted`.
- **Permission posture (operator-chosen YOLO, both transports).** No approval UI exists yet, so the default is `allowAll` per-session mode on MSP / `--yolo` on exec, every `approval/request` answered from policy with a per-decision `[MUSE MSP] approval <tool>` log line, unknown option shapes default-deny. `KAINBAIN_MUSE_YOLO=0` restores sandbox-on.
- **Observability.** One `[MUSE]` spawn/settle line per run (argv *shape* only — prompt text elided to byte length, asserted in the contract test), normalized `assistant_delta` / `tool_*` / `run_finished` / `run_error` events into task logs, live `session/tokenUsage` + `session/contextUsage` telemetry on MSP.

Full detail lives in [MuseHarness.md](../EngineDetails/MuseHarness.md); the Tier-2 design rationale in [MuseTier2Spike.md](../EngineDetails/MuseTier2Spike.md). Everything below assumes that baseline and proposes *additions* — no redesign.

## 2. "`/goal` for prompts": what the user asked, what actually exists

There is **no `/goal` slash command** on the `muse` CLI (verified: `muse --help`, `muse exec --help`, `muse serve --help` list no such thing, and `muse skills list` shows no goal skill). The word "goal" appears in exactly two integration-relevant places:

### 2a. KainBain `task.goal` → prompt text (CURRENT — keep it)

`api/promptCuration.js` interpolates the task goal into every stage prompt (`resolvedGoal = task.goal || task.title || task.description || ""`, plus the `{{...}}` keyword engine in `api/skills/skillInjection.js`). This is transport-agnostic, zero-harness-code, and already what carries the goal into `muse exec` and MSP `turn/start` alike. **Verdict: this is the correct primary channel and must stay regardless of anything below** — prompt text is the only goal channel the exec rollback will ever have.

### 2b. MSP `goal/*` methods (UNWIRED — the opportunity)

The exported MSP schema (70 methods, `muse` 1.4.12, stable surface) contains:

| Method | Schema description (verbatim, truncated) |
| --- | --- |
| `goal/set` | "Sets the session goal objective; wakes a goal-driving turn iff idle and the resulting goal is unfinished" |
| `goal/edit` | "Replaces the current goal's objective under the same wake gate as `goal/set`" |
| `goal/pause` / `goal/resume` | pause/resume the goal driver |
| `goal/clear` | clears the session goal |

And the harness already *receives* `session/goalChanged` events — `msp/museMspEventMapper.js:275` has a case for it (currently mapped to noise/observation, not surfaced). A repo-wide search shows **no `goal/set` (or siblings) is ever *sent*** by `msp/*.js` outside tests. So today the host tracks no goal object for KainBain sessions; the stage goal is inert text the moment the turn starts.

**Proposal (Diff 1, MSP only, exec untouched):** in `msp/museMspSession.js`, after `session/start` (or at each `prompt()`), send `goal/set` with the stage's resolved goal text (same string promptCuration already builds — single source of truth, no new wording to maintain). Effort is small: one request + one mapper case promoting `session/goalChanged` to a task-log event. Tests are hermetic: the echo provider (`muse serve --provider echo`) needs no credentials, and the existing `mock-muse-serve.mjs` fixture pattern extends directly. Edge cases to handle in the diff: `goal/set` on a *busy* session must not steal the running turn (the wake gate only fires "iff idle" — verify against echo, and serialize the call before `turn/start`); failure of `goal/set` must never fail the turn (log-and-continue: the prompt text in §2a remains the guarantee).

Why this scores: it is the literal answer to "does it use goal for prompts" — after Diff 1 the answer becomes "both: prompt text on every transport, plus a tracked session goal on MSP" — and it is probe-verifiable in the demo (`session/goalChanged` rows in the task log).

## 3. "Other `/` commands such as `/taste`": what slash commands are, and the four headless paths

Same negative result, same constructive mapping: **no slash-command flag exists** on `exec` or `serve`. In the Muse TUI, `/<name>` invokes a *skill shortcut* — the MSP schema says `skill/list` returns "one row per typed-invocable shortcut spelling … a query, not a command". So "`/taste`" = "the `taste` skill, invoked by its shortcut spelling". Skills *are* reachable from headless runs, through four mechanisms in increasing cost:

### Path (a) — name the skill in prompt text (TODAY, zero code)

The stage prompt already carries curated skill bodies via `buildSkillsPromptSections` (`api/skills/skillInjection.js`, `direct` vs `option` modes). Nothing stops a stage prompt from saying "follow the `taste` skill's constraints for this frontend change". Built-in skills ship *inside* the `muse` binary, so no installation or trust flag is needed for the skill to *exist*. Limitation: it is advisory — a long tool-using turn may never actually load the body. Good enough for the demo, and the fallback under every other path.

### Path (b) — `--trust-workspace` (one knob, deliberately off)

`--trust-workspace` on exec / `serve` "loads each session workspace's skills and rules". KainBain exposes it as `KAINBAIN_MUSE_TRUST_WORKSPACE` (default `0`), and `musePermissions.js` documents *why* it stays off: project skills/rules "compete with KainBain's curated prompt skills". Flipping it globally would let every project's `SKILL.md`/`AGENTS.md` (e.g. from `muse init`) fight the curated stage prompt for the agent's attention — a prompt-injection and determinism regression dressed as a feature. **Recommendation: do not flip globally.** If a *specific* project needs its workspace skills (a hackathon demo repo with a bespoke `/goal`-equivalent skill, say), scope it per-project/stage, never deployment-wide — and note the escalation loudly, per the harness's existing discipline.

### Path (c) — MSP `skill/setActivation` (PROPOSED Diff 2, the surgical option)

"Writes one skill's activation in any scope … each successful write is a `skill/changed` detection point." The harness sends **zero** `skill/*` calls today. Wiring `skill/setActivation` lets a stage declare e.g. `{ skill: "taste", active: true, when: "frontend stages" }` and have the host *force* the skill on for exactly that session — no prompt competition (path b's problem disappears: nothing else loads), no prompt-text reliance (path a's weakness disappears). Pair it with `skill/list` at session start for a pre-flight assertion ("taste resolves in this session") that fails the stage setup loudly rather than silently styling without guidance. Both calls are echo-testable.

### Path (d) — `skill/import` / `--agents` overlay (only if a skill must be invented)

`skill/import` and the `--agents <JSON>` ephemeral agent-definition overlay inject *new* skill/agent definitions. Reach for these only when KainBain needs a skill that does not exist in the binary — e.g. a "KainBain stage-verdict" skill teaching the exact JSON shape review stages must emit (alternative: exec `--output-schema`, §4). This is the largest diff of the four and is deferred behind (a)–(c).

### The `taste` skill, concretely (verified live)

`muse skills inspect taste` confirms: id `taste`, **built-in**, `activation: on`. Its contract: "Mandatory preflight for web frontend visual design … call `read_skill` for `bundled:taste` before the first frontend create or edit tool call … Negative constraints only; user requests and other explicit styles still win." Two consequences: (1) it constrains *without* overriding project style — safe to force on; (2) its trigger is written for an *orchestrating agent* (something that calls `read_skill` *before* acting), which a headless stage turn is not guaranteed to do by itself. Hence: frontend stages cite it in prompt text now (path a, immediate), force-activate it via `skill/setActivation` in Diff 2 (durable). The same pattern generalizes to every built-in skill in `muse skills list` (`plan`, `browser-app-delivery`, `git`, `web3d`, …): each is a candidate `when:` clause on stage types, not a slash to be typed.

## 4. The rest of the unwired surface (ranked by stage value)

The harness uses roughly 10 of 70 MSP methods plus a flag subset of `exec`. Ranked opportunities, each with the stage type that pays for it:

1. **`session/setReasoningEffort`** — "sets the session's standing reasoning-effort default; a turn carrying its own tier overrides it for that turn only." Map stage config → effort tier (plan-heavy stages `high`, mechanical stages `low`). Near-zero code (one call beside `session/setModel`, which already exists as precedent), immediate cost/latency lever. Diff 2.
2. **Exec `--output-schema`** — "shape the final answer with the JSON schema in FILE." The review/verdict pipeline (`api/reviewAssembly.js`, stage-verdict skills) currently parses free text; a schema-pinned final answer makes verdict stages machine-checkable. Exec-only, no MSP work. Diff 3.
3. **`media/upload` + exec `--image`** — vision stages. `api/agent/visionSupport.js` reports `false` for muse today; the `TurnInputPart` image shape and `--image` flag exist upstream. Unlocks screenshot-verify stages (render → capture → agent judges pixels). Needs the sandbox-on proof from MuseHarness.md R-07 first (a screenshotting agent that cannot write files is useless). Diff 3.
4. **`session/compact`** — "compacts the session's conversation context; runs asynchronously." Long multi-turn KainBain sessions (intake → plan → build → review on one MSP session) will eventually need it; wire as an engine-driven maintenance call, not stage logic. Later.
5. **`session/fork`** — branch a session to explore two implementations in parallel, keep the winner. Maps onto KainBain's parallel-stage ambitions (cf. `docs/MuseCodeHackathon2026/HandNotesOnParallelism.md`) without new engine primitives. Later.
6. **`recap/request` / `recap/cancel`** — host-generated summaries: natural stage-handoff material (feed the recap into the next stage's prompt alongside the curated goal text). Later.
7. **`subagent/*` + `task/*`** (`subagent/sendMessage`, `task/list`, `task/background`, …) — visibility into the agent's *own* decomposition: today `task.lifecycle.*` rows are deliberately ignored as noise (MuseHarness.md F-01); the structured subagent/task surface could promote selected rows to first-class progress events. Research spike first — noise risk is real.
8. **`session/setApprovalMode`** (already used for YOLO/`onRequest`) **+ `userInput/answer`** — today `userInput/*` is policy-cancelled ("no interactive answer UI yet"). When KainBain grows an interactions surface, answering instead of cancelling is the single largest capability unlock on this list — and the precondition for flipping the YOLO default back. Explicitly *not* now.
9. **`--agents` overlay + `--preset`** (`native-basic`, `miniswe`, `ac_orch`, …) — per-stage agent shaping without touching prompts. Cheap to probe (`KAINBAIN_MUSE_ARGS` already passes validated extras like `--max-model-steps 200`); evaluate presets against stage types before codifying.
10. **`muse export` history (done), `session-message send` (best-effort injector, NOT steering), `--context-compaction-*` flags, `workflow/*`, `view/*` subscriptions, `plugin/*`** — track, do not build; each is a paragraph in the next spike, not a diff.

## 5. Explicit non-recommendations (things that look like progress and are not)

- **Typing slash commands into prompts** (e.g. prefixing the stage prompt with `/goal …` or `/taste …` as literal text). Headless `exec` has no slash interpreter; the literal characters would reach the agent as confusing prose. Invoke skills through §3 paths, never by pasting TUI syntax into a prompt.
- **Global `--trust-workspace`** (§3b) — scoped opt-in only.
- **The ACP-shim** — settled in MuseTier2Spike.md §4C; MSP is not ACP, do not re-litigate.
- **`userInput/answer` before an approval UI** — cancel-by-policy stays.
- **Chasing `supportTier: "2"` cosmetics** — the registry tier flips when capabilities hold, not before; Diffs 1–3 each *demonstrate* a capability rather than relabeling one.

## 6. Suggested plan (3 diffs, each independently demoable, rollback intact)

- **Diff 1 — goals you can point at.** Send `goal/set` (stage goal text, same source as promptCuration) at MSP session start / each `prompt()`; promote `session/goalChanged` from mapper noise to a task-log event; cite `taste` in frontend stage prompt text (path a). Prove on echo provider + one meta-provider run; `KAINBAIN_MUSE_MSP=off` still passes everything. *Demo: task log shows goal-set → goalChanged → turn; reviewer sees the goal as a tracked object, not prose.*
- **Diff 2 — skills with a switch.** `skill/list` pre-flight + `skill/setActivation` per stage config (`taste` forced on for frontend stages); `session/setReasoningEffort` from stage config. Echo-provider contract tests; per-stage scoping only, global defaults unchanged. *Demo: a frontend stage with taste provably active vs a backend stage without it.*
- **Diff 3 — structured and visual stages.** `--output-schema` for verdict stages (JSON verdicts validated in-test); `--image` / `media/upload` probe for screenshot-verify stages behind the sandbox-on proof. *Demo: a verdict stage whose output is schema-validated, and/or an agent judging its own rendered pixels.*

## 7. Open questions

- O-1: does `goal/set`'s wake gate ("wakes a goal-driving turn iff idle") interact with the engine watchdog/queue (two drivers racing one session)? Serialize strictly: `goal/set` → `turn/start`, never concurrent — verify on echo first.
- O-2: does `session/setModel` mid-session break `session/resume` continuity (carried over from MuseTier2Spike.md O-4)? Same question now applies to goal state — probe before advertising per-stage model+goal switching.
- O-3: `skill/setActivation` scope semantics — which scope ("user / project / built-in / plugin" per `skills --help`) does a headless `serve` host honor, and does activation persist across `session/resume`? Probe; if it does not survive resume, re-assert post-resume in `museMspSession.js`.
- O-4: which built-in skills beyond `taste` earn a stage-type mapping (`plan` for planning stages? `browser-app-delivery` for UI stages? `git` already covered by engine discipline?)? One row per skill, decided against stage needs — not a blanket enable.
- O-5: fingerprint drift (`5d3b43e5…` on 1.4.9 → `cfdb6d25…` on 1.4.12): adopt a per-upgrade fixture-refresh checklist (re-export schema, re-capture `msp-*.jsonl`, diff-review) so drift keeps failing loudly instead of silently.

## 8. Sources (everything above is checkable)

- Live probes this session: `muse --version` → `1.4.12 (1.4.12-R6909.1)`; `muse skills list` (taste = built-in/on, plus full skill inventory); `muse schema generate-json-schema` → 70 stable methods incl. `goal/*`, `skill/*`, `session/setReasoningEffort`, `media/upload`, `subagent/*`, `workflow/*`, `recap/*`; `muse init --dry-run` (AGENTS.md project-rules shape); `muse session-message --help`.
- In-repo: `api/agent/harnesses/muse/museHarness.js`, `musePermissions.js`, `msp/museMspSession.js`, `msp/museMspEventMapper.js` (`session/goalChanged` case, `reminderChild` noise filtering), `msp/museMspSupport.js`, `msp/museServeHostPool.js`; `api/promptCuration.js` (§2a goal interpolation); `api/skills/skillsRegistry.js` + `api/skills/skillInjection.js` (curated prompt skills, `direct`/`option` modes); `docs/EngineDetails/MuseHarness.md`, `docs/EngineDetails/MuseTier2Spike.md`, `docs/EngineDetails/VibeHarness.md`.

