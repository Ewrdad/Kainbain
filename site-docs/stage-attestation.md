---
title: Stage Attestation
section: working-with
order: 51
slug: stage-attestation
---

# Stage Attestation

Every stage that finishes with a wrap-up commit leaves proof that the task
passed through that stage under that exact config: a hash of the task plus
stage definition, stored in the commit and in the stage history together.
Given either side, you can confirm the other — the compliance story for
`#/docs/pipeline-stages` without trusting prose log lines.

## Where the proof lives

| Evidence | Location | Contents |
| --- | --- | --- |
| Commit trailers | Wrap-up commit body (`git log --format=%B`) | `KainBain-Task`, `KainBain-Stage`, `KainBain-Config-Hash` |
| History token | Task history entry (`[attestation …]` suffix) | Task, stage, config hash, commit SHA |
| Structured fields | Same history entry (`configHash`, `commitSha`) | Live-process copy of the token |

The token is the durable copy: history persists as prose markdown, so the
structured fields exist only until the next restart, while the token and the
commit trailers survive. Commit subjects are unchanged, so changelog
filtering and `git log --oneline` read exactly as before.

Stages that finish with a clean tree record the same proof with an explicit
null commit (`commit=none`) — "the stage ran, there was nothing to commit"
stays distinguishable from "no record". Entries and commits from before this
feature carry no hashes; absence means "predates attestation", never failure.

## Verifying one stage

The read-only checker needs only the repo on disk:

```bash
node scripts/verify-stage-attestation.mjs --repo /path/to/project --task <task-id> --sha <commit-sha>
```

It prints `PASS` plus the linked values, or `FAIL` naming every problem
(missing token, missing trailers, task/stage/config/commit mismatch). Omit
`--sha` to check the task's latest attested entry, and pass
`--docs-dir <name>` when the project uses a custom docs directory.

To close the loop against the config itself, re-hash a pinned copy of the
attestation input and compare:

```bash
node scripts/verify-stage-attestation.mjs --repo /path/to/project --task <task-id> --config pinned-input.json
```

`pinned-input.json` is the `{ taskId, goal, workflowId, stage }` object from
the table below, as it was when the stage ran. A mismatch here means the
config changed after the run — see the limits section.

The manual form of the same check, without the script:

```bash
git -C /path/to/project log --format=%B -n 1 <sha>   # read the trailers
grep -o '\[attestation [^]]*\]' /path/to/project/docs/tasks/<task-id>/task.md  # read the tokens
```

## What the hash covers

The config hash is `sha256` over canonical JSON (recursively key-sorted, no
whitespace), built from:

| Field | Source | Why |
| --- | --- | --- |
| `taskId` | Task id | Binds the proof to the task |
| `goal` | Task goal text | Binds the exact task statement |
| `workflowId` | Task workflow | Binds the pipeline the task runs in |
| `stage` | Whole stage definition | Binds every stage setting |

Two stage keys are excluded: `name` (a display label — renames must not void
proof) and `paused` (an enable flag, not behavior). Everything else on the
stage — type, prompt or command, harness, model, skills, tags, no-code,
Runner policy, approval hold, branch mode, failback, and any setting added
later — is covered. Volatile runtime state (status, branches, SHAs,
timestamps) never enters the hash, and project-level inherited defaults are
out of scope: only the task plus the stage definition.

Both execution paths attest with the same shared code, so embedded stages
and Runner stages produce byte-identical hashes for the same inputs. The
backend dispatches its hash at claim time and the Runner echoes it; when the
claim predates the feature, the Runner hashes locally instead.

## Limits

- A config edited after the run no longer re-hashes to the recorded value.
  The history↔commit link still holds (same hash on both sides); only the
  comparison against today's config fails. Pin the input JSON at run time
  when you need long-term re-verification.
- Human-approval stages never finalise, so they leave no attestation.
- Failed-stage partial commits, merge commits, and engine snapshot commits
  are outside the scheme: only per-stage wrap-up commits attest.
- The scheme is hash linkage, not signing: it proves agreement between the
  recorded pieces, with no third-party timestamp or PKI.
