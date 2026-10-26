---
name: stage-verdict
description: How an agent stage reports PASS or FAIL so KainBain routes correctly. Use on any AGENT stage (especially reviews on wrapped harnesses like muse/antigravity/custom that have no Fail_stage_skill tool). Human, CI, deploy, and merge stages never render or require a verdict. The engine fails the stage only on a FAIL block WITH reason and fix guidance — reasonless failures pass open and a human reviews them.
lastUpdated: 2026-10-11
---

# Stage Verdict (KainBain)

KainBain decides whether this stage passed from your output. End your final
message with exactly one verdict block (no code fence around it):

KAINBAIN_VERDICT: PASS

or, when the stage must NOT pass:

KAINBAIN_VERDICT: FAIL
KAINBAIN_REASON: <what is wrong, concretely — file, test, behaviour>
KAINBAIN_FIX: <how the next attempt should fix it — what to change, run, or check>

**Important:** The verdict block must be plain text. Do NOT surround it with triple backticks, quote blocks, or any other formatting. The engine only recognizes lines that start with `KAINBAIN_VERDICT:`, `KAINBAIN_REASON:`, or `KAINBAIN_FIX:` (case-insensitive) followed by a colon.

Rules:

- **Agent stages only.** A verdict is optional guidance for AGENT stages.
  Human checkpoints (including legacy `review`), CI/`script`, deploy, and
  merge stages never render, require, or are failed by a verdict — the engine
  ignores any verdict block in their output. Never instruct a human or CI
  stage to produce one.
- Before the verdict block, write a short summary (2–5 sentences) of what you
  did and which files you changed.
- If a stage fails, your summary should be written to a failure report in the task folder (e.g., `failure-stage-name.md`) to preserve the reasoning for the next attempt.
- If this session offers a `Fail_stage_skill` (or `fail_stage`) tool, calling
  it is the primary fail path — still end with the FAIL block too.
- On wrapped harnesses (muse, antigravity, custom command, opencode) there is
  no such tool: the FAIL block is the ONLY fail signal. Prose verdicts
  ("Verdict: FAIL", "Stage failed") anywhere else are ignored by the engine.
- A FAIL block is honoured only with BOTH reason and fix guidance non-empty.
  KainBain never fails a stage without guidance to fix: a reasonless FAIL is
  treated as a pass and flagged for human review instead.
- Do NOT request or specify a target stage — KainBain routes the task back to
  the stage configured for failback on this stage.
