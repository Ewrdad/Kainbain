# Spike: Mistral Vibe integration into KainBain

**Status:** Spike (no code changed)
**Date:** 2026-10-07
**Question:** Can Mistral's Vibe coding agent be integrated into KainBain, is that
within Mistral's terms on subscription plans, and what shape should the integration take?

**Bottom line:**

1. **Technically possible, low risk.** Vibe is an open-source (Apache-2.0) Python CLI
   with a documented non-interactive mode designed for exactly this kind of orchestration.
   It maps cleanly onto KainBain's existing CLI-harness pattern (`muse`, `agy`).
2. **There is no dedicated Vibe SDK.** The integration surface is the CLI itself
   (`vibe --prompt`, plus a `vibe-acp` Agent-Client-Protocol binary) — not a library.
   Aim for the simple `--prompt` spawn first, mirroring `api/agent/harnesses/muse/`.
3. **Use your own plan-linked API key, not a scraped login session.**
   This deployment is single-operator personal use (KainBain as a local "harness window",
   one user, own machine) — which fits the consumer plan's personal-use scope far better
   than a shared/multi-user server would. The practical rule stays the same: the engine
   can only consume an env-provided `MISTRAL_API_KEY` anyway (browser sign-in can't
   complete under a headless supervised spawn). Keep it to your own account and key;
   the sharing/multi-account clauses are what would bite in a team setup, not here.

---

## 1. What Mistral Vibe is

- Mistral AI's open-source agentic coding assistant: terminal CLI, VS Code / JetBrains /
  Zed extensions, and remote agents. Licensed **Apache-2.0**, installed via
  `curl -LsSf https://mistral.ai/vibe/install.sh | bash` or `uv tool install mistral-vibe`
  (Python 3.12+). Sources: [Vibe product page](https://mistral.ai/products/vibe/code/),
  [official repo README](https://raw.githubusercontent.com/mistralai/mistral-vibe/main/README.md).
- Powered by Mistral's coding models (Devstral 2, Codestral, Mistral Medium 3.x).
- Relevant to KainBain: it is a direct counterpart to the CLIs KainBain already wraps
  (`muse`, `agy`) — file read/write, shell execution, multi-step agentic runs.

## 2. Integration options (simplest first)

### Option A — No new harness: Mistral *models* through the existing `pi` harness (API key)

The `pi` SDK KainBain already depends on ships a Mistral provider
(`@earendil-works/pi-ai` includes `providers/mistral.js`), so Mistral models may already be
reachable from the `pi` harness with an API key and no engine changes. This buys
"run KainBain stages on Mistral models" without touching the harness registry.
It does **not** buy Vibe's agent behaviors (its tool loop, approvals, skills) — just the models.

### Option B (recommended if Vibe itself is wanted) — New `vibe` CLI harness: `vibe --prompt`

The official README documents a **Programmatic Mode** built for scripting:

```bash
vibe --prompt "<stage prompt>" --auto-approve --max-turns 5 --output streaming
```

Useful flags, all first-party: `--max-turns N`, `--max-price DOLLARS`, `--max-tokens N`,
`--agent NAME` (agent profile), `--auto-approve` / `--yolo`, `--enabled-tools` /
`--disabled-tools` (exact / glob / `re:` regex), and `--output text|json|streaming`
(`streaming` = newline-delimited JSON per message — the natural fit for KainBain's
stream-parser + event-mapper split).
Source: [official repo README, Programmatic Mode](https://raw.githubusercontent.com/mistralai/mistral-vibe/main/README.md).

This mirrors the `muse` harness shape almost 1:1
(`api/agent/harnesses/muse/museHarness.js`: one headless process per `prompt()`,
NDJSON stream parser, event mapper, argv allow-listing in `musePermissions.js`,
`modelSelection: "none"` since the CLI manages its own model). Per ADR 0004
(`docs/adr/0004-harness-pluggability-and-mock-mode.md`), a new harness only needs to
register a factory in `api/agent/harnessRegistry.js` and pass the existing session/harness
conformance gates — no engine changes.

Fit notes:

- One `vibe --prompt` run per stage turn matches the engine's fresh-per-stage semantics.
- `--max-price` / `--max-tokens` give cost guardrails the other CLI harnesses lack —
  worth surfacing in the run log.
- Watchouts to verify in a build spike: exact stdout/stderr contract of `--output streaming`
  (event schema, exit codes, resume/session support), startup latency (`uv tool` shim +
  Python), and binary resolution for `harnessDiscovery.js` (PATH name or absolute path env,
  same as `KAINBAIN_MUSE_BINARY`).

### Option C (later, richer) — `vibe-acp` (Agent Client Protocol)

The official installer also puts a `vibe-acp` command on PATH, and the README points
editors at [Agent Client Protocol](https://agentclientprotocol.com/overview/clients)
setup docs. ACP is a structured client/agent protocol — potentially a cleaner session
surface than scraping CLI stdout — but it means implementing a new protocol client in
the harness instead of reusing the proven spawn-and-parse scaffold. Defer until Option B
hits a limit (e.g. no session resume, insufficient streaming events).

### Explicit non-recommendation

There is **no embeddable "Vibe SDK"** (no npm/pip agent-runtime library analogous to the
`opencode-ai-sdk` tarball in repo root). Do not plan around one. The general
[publisher Mistral API SDKs](https://github.com/mistralai/platform-docs-public/blob/HEAD/public/resources/sdks.md)
cover raw model calls (which Option A already gets via `pi`), not the Vibe agent loop.

## 3. Auth: subscription vs API key

From the [official CLI docs](https://docs.mistral.ai/vibe/code/cli/install-setup) and
[API keys & profiles](https://docs.mistral.ai/vibe/code/cli/api-keys-profiles):

| Path | How | Notes |
| --- | --- | --- |
| Sign in with Mistral account | Browser-based sign-in (default); usage/rate limits follow the plan | Interactive; provisions and stores credentials in `~/.vibe/` |
| API key | `vibe --setup`, `MISTRAL_API_KEY` env (highest precedence after stored setup), or `~/.vibe/.env` | Same key works "in Free mode, with a paid plan, or with pay-as-you-go"; least-privilege + rotation advised |
| Third-party provider | `config.toml` provider presets (OpenAI-compatible `api_base` + key env var) | Vibe as a generic agent shell over non-Mistral models |

For KainBain (headless server, supervised spawn, redacted child env — the `muse` pattern):
only the **env-var API key** path is operable. Browser sign-in cannot complete under the
engine's watchdog spawn, and baking a personal login session (`~/.vibe/`) into a shared
server is both fragile and, per §4, likely non-compliant.

## 4. Terms of use (spike reading, not legal advice)

Checked 2026-10-07 against [Mistral Legal Center](https://legal.mistral.ai/terms/get-started)
(effective dates 2026-09-25 / Usage Policy 2026-06-11). Confirm with counsel before
productizing.

- **Consumer plans are personal.** The
  [ROW consumer ToS](https://legal.mistral.ai/terms/row-consumer-terms/) governs
  "personal use as a consumer" of Vibe; the account "is intended for your individual use
  only and you may not share your account with any other person", and multi-account use
  to bypass limits is prohibited. It explicitly redirects business/integration use
  ("integrate the Mistral AI Products with your own products or services that are
  distributed to third-party end users") to the Commercial Terms.
- **Commercial use has its own track.** The
  [Commercial ToS](https://legal.mistral.ai/terms/commercial-terms-of-service/) covers
  Vibe for organizations (Customer Account + End User accounts); the
  [Additional Product Terms](https://legal.mistral.ai/terms/additional-terms/) add that
  End User accounts "may not be shared, sold, licensed, or otherwise made available
  outside of Customer's entity or organization" and credentials must stay confidential.
- **Usage Policy** (applies to Vibe/Studio on Mistral infrastructure) is content-based
  (illegal activity, IP, CSAM, etc.) — ordinary coding-agent use is unaffected, but the
  harness must not strip or bypass it (e.g. no prompt laundering around refusals).

Implications for KainBain:

- **Deployment context (per operator): single-user, own machine.** KainBain here is a
  personal "harness window", not a shared service — one human, one Mistral account, one
  box. On that footing the consumer plan's personal-use scope applies and the
  account-sharing objection falls away: the credential is not being shared with anyone.
  (If this ever becomes multi-user or is exposed beyond your own use, re-read this
  section under the Commercial Terms instead — per-user keys/seats, no shared login.)
- **Still use an API key, not an automated login.** Browser sign-in can't complete under
  the engine's headless spawn, and a harness should never depend on a scraped personal
  login session. Generate a plan-linked key from Code › Vibe CLI, export it as
  `MISTRAL_API_KEY`, and let the harness consume only that.
- **Don't multiply accounts to dodge limits.** The consumer ToS explicitly prohibits
  creating/using multiple accounts to bypass rate limits or restrictions — one account,
  one key.
- Cost control is a feature here, not just hygiene: prefer keys with budgets/alerts and
  pass `--max-price` / `--max-tokens` per run so a stuck agent stage cannot burn a plan.

## 5. Suggested plan (if approved)

1. **Phase 0 (no engine code):** verify Option A — set `MISTRAL_API_KEY`, confirm Mistral
   models resolve through the `pi` harness model catalog. Documents the cheapest win.
2. **Phase 1 (one new harness dir):** `api/agent/harnesses/vibe/` following the `muse`
   harness file-for-file (`vibeHarness.js`, `vibeStreamParser.js`, `vibeEventMapper.js`,
   `vibePermissions.js` with argv allow-list + `--workspace`-equivalent cwd pinning +
   `--auto-approve` gating), registered in `harnessRegistry.js`, gated by the standard
   contract tests. Auth surface: `KAINBAIN_VIBE_BINARY` + env-provided API key only.
3. **Phase 2 (only if needed):** evaluate `vibe-acp` when the CLI streaming contract
   proves insufficient.
4. **Before any of it:** install the CLI on a scratch box, capture `vibe --help` output,
   and run 2–3 `--prompt --output streaming` probes to pin the event schema the parser
   must handle.

## 6. Open questions

- Does the plan-linked API key carry the subscription's Vibe quota, or meter separately
  pay-as-you-go? Docs say one key works across Free/plan/pay-as-you-go but not how
  quota is attributed — check console billing after a probe run.
- Exact `--output streaming` event schema and exit-code semantics (needed for the parser).
- Whether your plan's quota covers orchestrated `--prompt` runs the same as interactive
  ones (rate limits are per-account — a runaway stage loop could eat the same budget
  your interactive sessions use; `--max-price` mitigates). Only revisit Teams/Enterprise
  seats if this ever stops being single-user.
