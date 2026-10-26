/***
 * MARK: pipelineTransfer
 * @description Pure, JSX-free pipeline export/import logic (the trust boundary
 *   for hand-edited files). The UI layer (`AddStageMenu`) contains zero parsing
 *   logic itself — every branch delegates here.
 *
 *   Exported doc schema (v1):
 *   `{ "kainbainPipeline": 1, "name", "exportedAt", "stages": [...] }`.
 *   Stage `id`s are deliberately dropped on export — ids are remapped to fresh
 *   values on import so an imported pipeline can never collide with existing
 *   stage ids or stale `currentStageId` pointers. Do NOT "fix" this by
 *   persisting ids.
 * @example serializePipeline({ name: 'Main' }, stages) => { kainbainPipeline: 1, ... }
 ***/

import { normalizeStageTags } from '../../../../shared/stageTags.js';

export const PIPELINE_EXPORT_VERSION = 1;
export const PIPELINE_FILE_SUFFIX = '.pipeline.json';
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_STAGES = 200;

/***
 * MARK: oversizeImportError
 * @description Single source for the over-cap import message so the
 *   pre-read `File.size` check in the UI and the post-read text check in
 *   `parsePipelineFile` can never drift apart.
 * @example oversizeImportError() => 'That file is larger than 1 MB …'
 ***/
export function oversizeImportError() {
  return `That file is larger than ${Math.round(MAX_IMPORT_BYTES / 1_000_000)} MB — imports are capped to keep hand-edited files reviewable. Split it or trim long prompts.`;
}

/***
 * MARK: isFileOversize
 * @description Pre-read guard: true when a `File`-like object declares a
 *   known numeric `size` above the import cap. Unknown sizes return false
 *   (the post-read text check in `parsePipelineFile` still applies), so a
 *   missing `size` never blocks a legitimate import.
 * @example isFileOversize({ size: 2_000_000 }) => true
 ***/
export function isFileOversize(file) {
  return (
    !!file && typeof file.size === 'number' && Number.isFinite(file.size) && file.size > MAX_IMPORT_BYTES
  );
}

/***
 * MARK: KNOWN_STAGE_TYPES
 * @description Canonical stage types plus the legacy aliases the backend also
 *   normalizes (`review→human`, `script→ci`, `deploy→ci`, `custom→agent`).
 *   Anything else is a validation error, never a silent coercion.
 ***/
const CANONICAL_STAGE_TYPES = ['agent', 'human', 'ci', 'merge'];

// JSON.parse can materialize an own `__proto__` (and hand editors can add
// `constructor`/`prototype`) — never copy such keys through, they pollute
// object prototypes rather than describe a pipeline.
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

function isUnsafeKey(key) {
  return UNSAFE_KEYS.includes(key);
}

function normalizeTransferType(type) {
  if (typeof type !== 'string' || type.trim() === '') return 'agent';
  const lower = type.trim().toLowerCase();
  if (lower === 'review') return 'human';
  if (lower === 'script' || lower === 'deploy') return 'ci';
  if (lower === 'custom') return 'agent';
  if (CANONICAL_STAGE_TYPES.includes(lower)) return lower;
  return null;
}

export function isKnownTransferType(type) {
  return normalizeTransferType(type) !== null;
}

/***
 * MARK: slugifyWorkflowName
 * @description Turns a workflow name into a safe filename stem.
 * @example slugifyWorkflowName('My Main Pipeline!') => 'my-main-pipeline'
 ***/
export function slugifyWorkflowName(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'pipeline';
}

/***
 * MARK: exportFilename
 * @description Filename for a pipeline export download.
 * @example exportFilename('Main') => 'main.pipeline.json'
 ***/
export function exportFilename(workflowName) {
  return `${slugifyWorkflowName(workflowName)}${PIPELINE_FILE_SUFFIX}`;
}

// Canonical stage keys in stable export order. Alias keys (`criteria`,
// `script`, `fallback`, `timeoutMs`) are coalesced into their canonical form
// on export so hand-edited files only ever show one spelling.
const STAGE_KEY_ORDER = [
  'name',
  'type',
  'description',
  // board filter tags (additive; absent on legacy stages stays absent)
  'tags',
  'prompt',
  'model',
  'harness',
  'command',
  'timeout',
  'skills',
  'paused',
  'failback',
  // ci-only branch execution mode (see StageTypeConfig): 'task' | 'primary'
  // | 'custom', plus the branch name for 'custom'.
  'runOnBranch',
  'customBranch',
];

function coalesceStage(stage) {
  const out = {};
  if (stage.prompt !== undefined || stage.criteria !== undefined) {
    out.prompt = stage.prompt ?? stage.criteria;
  }
  if (stage.command !== undefined || stage.script !== undefined) {
    out.command = stage.command ?? stage.script;
  }
  if (stage.failback !== undefined || stage.fallback !== undefined) {
    out.failback = stage.failback ?? stage.fallback;
  }
  if (stage.timeout !== undefined || stage.timeoutMs !== undefined) {
    out.timeout = stage.timeout ?? stage.timeoutMs;
  }
  return out;
}

/***
 * MARK: toCanonicalStageDoc
 * @description Single canonicalization for a stage source object: canonical
 *   keys first in stable export order (aliases coalesced), then any
 *   unrecognized keys verbatim in source order so round-trips stay lossless
 *   even for fields added later. Never carries `id` (remapped on import) or
 *   prototype-polluting keys. Shared by `serializePipeline` and
 *   `buildImportPayload` so export and import can never drift apart.
 * @example toCanonicalStageDoc({ id: 's1', name: 'A', type: 'review' }) => { name: 'A', type: 'human' }
 ***/
function toCanonicalStageDoc(source) {
  const input = source && typeof source === 'object' ? source : {};
  const aliased = coalesceStage(input);
  const doc = {};
  for (const key of STAGE_KEY_ORDER) {
    if (key === 'name') {
      doc.name = input.name;
    } else if (key === 'type') {
      doc.type = normalizeTransferType(input.type) || 'agent';
    } else if (key === 'tags') {
      // Normalised with the shared helper so exports are always clean tag
      // arrays; an absent tags field stays absent (legacy round-trip).
      const normalizedTags = normalizeStageTags(input.tags);
      if (normalizedTags !== undefined) doc.tags = normalizedTags;
    } else if (key in aliased) {
      doc[key] = aliased[key];
    } else if (input[key] !== undefined) {
      doc[key] = input[key];
    }
  }
  // Carry unknown keys verbatim (never `id` — ids are remapped on import;
  // never `__proto__`/`constructor`/`prototype` — they pollute prototypes).
  for (const key of Object.keys(input)) {
    if (key === 'id' || isUnsafeKey(key)) continue;
    if (key in doc) continue;
    if (key === 'criteria' || key === 'script' || key === 'fallback' || key === 'timeoutMs') {
      continue;
    }
    doc[key] = input[key];
  }
  return doc;
}

/***
 * MARK: serializePipeline
 * @description Builds the export document for a named workflow and its stages.
 *   Drops stage `id`s (remapped on import); every other field is preserved
 *   via `toCanonicalStageDoc`.
 * @example serializePipeline({ name: 'Main' }, [{ id: 's1', name: 'A', type: 'agent' }])
 ***/
export function serializePipeline(workflow, stages) {
  const list = Array.isArray(stages) ? stages : [];
  return {
    kainbainPipeline: PIPELINE_EXPORT_VERSION,
    name: workflow?.name || 'Pipeline',
    exportedAt: new Date().toISOString(),
    stages: list.map((stage) => toCanonicalStageDoc(stage)),
  };
}

/***
 * MARK: serializePipelineJson
 * @description Pretty-printed (2-space) JSON text of the export document — the
 *   human-editable file content.
 ***/
export function serializePipelineJson(workflow, stages) {
  return JSON.stringify(serializePipeline(workflow, stages), null, 2);
}

function byteLength(text) {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

function jsonPositionMessage(text, position) {
  if (!Number.isFinite(position)) return null;
  const clamped = Math.max(0, Math.min(position, text.length));
  const upto = text.slice(0, clamped);
  const line = upto.split('\n').length;
  const col = clamped - (upto.lastIndexOf('\n') + 1) + 1;
  return `line ${line}, column ${col}`;
}

/***
 * MARK: parsePipelineFile
 * @description Parses raw file text into a candidate doc. Never throws for
 *   bad input — returns `{ ok, doc?, error? }` with an actionable message.
 *   Enforces the ~1 MB size cap and names the JSON error position.
 * @example parsePipelineFile('{"kainbainPipeline": 1, ...}') => { ok: true, doc }
 ***/
export function parsePipelineFile(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'That file is empty — pick a .pipeline.json export to import.' };
  }
  if (byteLength(text) > MAX_IMPORT_BYTES) {
    return { ok: false, error: oversizeImportError() };
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    const match = /at position (\d+)/.exec(e?.message || '');
    const where = match ? jsonPositionMessage(text, Number(match[1])) : null;
    return {
      ok: false,
      error: `Invalid JSON${where ? ` (${where})` : ''}: ${e?.message || 'could not be parsed'}. Fix the syntax and try again.`,
    };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      ok: false,
      error:
        'That file must contain a JSON object like {"kainbainPipeline": 1, "name": "...", "stages": [...]}.',
    };
  }
  return { ok: true, doc };
}

function isAbsent(value) {
  return value === undefined || value === null;
}

function checkStringField(errors, stageRef, key, value) {
  if (!isAbsent(value) && typeof value !== 'string') {
    errors.push(`${stageRef}: "${key}" must be a string, got ${typeof value}.`);
    return false;
  }
  return true;
}

/***
 * MARK: validatePipelineDoc
 * @description Validates a parsed doc, collecting ALL errors (not just the
 *   first) so hand editors can fix everything in one pass. Returns
 *   `{ ok, errors[] }`. Unknown stage types are errors, never silent coercion.
 * @example validatePipelineDoc({ kainbainPipeline: 1, name: 'X', stages: [] }) => { ok: false, errors: [...] }
 ***/
export function validatePipelineDoc(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      ok: false,
      errors: [
        'File must contain a JSON object like {"kainbainPipeline": 1, "name": "...", "stages": [...]}.',
      ],
    };
  }
  if (doc.kainbainPipeline !== PIPELINE_EXPORT_VERSION) {
    errors.push(
      `"kainbainPipeline" must be ${PIPELINE_EXPORT_VERSION} — is this a pipeline export? Check you picked the right file.`,
    );
  }
  if (typeof doc.name !== 'string' || doc.name.trim() === '') {
    errors.push('"name" must be a non-empty string (e.g. "My Pipeline").');
  }
  if (!Array.isArray(doc.stages)) {
    errors.push('"stages" must be an array of stage objects.');
    return { ok: false, errors };
  }
  if (doc.stages.length === 0) {
    errors.push('"stages" is empty — there is nothing to import.');
  }
  if (doc.stages.length > MAX_STAGES) {
    errors.push(`"stages" has ${doc.stages.length} entries — imports are capped at ${MAX_STAGES}.`);
  }
  doc.stages.slice(0, MAX_STAGES).forEach((stage, index) => {
    const label = stage?.name ? `"${stage.name}"` : `#${index + 1}`;
    const ref = `stages[${index}] (${label})`;
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      errors.push(`${ref}: must be an object with at least "name" and "type".`);
      return;
    }
    if (typeof stage.name !== 'string' || stage.name.trim() === '') {
      errors.push(`${ref}: "name" must be a non-empty string.`);
    }
    if (Object.keys(stage).some(isUnsafeKey)) {
      errors.push(`${ref}: keys ${UNSAFE_KEYS.join(', ')} are not valid stage fields.`);
    }
    if (
      stage.type !== undefined &&
      stage.type !== null &&
      !(typeof stage.type === 'string' && stage.type.trim() === '') &&
      normalizeTransferType(stage.type) === null
    ) {
      errors.push(
        `${ref}: unknown stage type ${JSON.stringify(stage.type)} — expected one of: ${CANONICAL_STAGE_TYPES.join(', ')} (legacy review/script/deploy/custom are also accepted).`,
      );
    }
    checkStringField(errors, ref, 'description', stage.description);
    checkStringField(errors, ref, 'prompt', stage.prompt);
    checkStringField(errors, ref, 'criteria', stage.criteria);
    checkStringField(errors, ref, 'model', stage.model);
    checkStringField(errors, ref, 'harness', stage.harness);
    checkStringField(errors, ref, 'command', stage.command);
    checkStringField(errors, ref, 'script', stage.script);
    const timeout = stage.timeout ?? stage.timeoutMs;
    if (!isAbsent(timeout) && timeout !== '') {
      if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 0) {
        errors.push(
          `${ref}: "timeout" must be a non-negative number of milliseconds (or empty for the default), got ${JSON.stringify(timeout)}.`,
        );
      }
    }
    const failback = stage.failback ?? stage.fallback;
    if (!isAbsent(failback) && typeof failback !== 'string') {
      errors.push(
        `${ref}: "failback" must be a string (a routing rule or stage reference), got ${typeof failback}.`,
      );
    }
    if (!isAbsent(stage.paused) && typeof stage.paused !== 'boolean') {
      errors.push(`${ref}: "paused" must be true or false, got ${JSON.stringify(stage.paused)}.`);
    }
    // ci-only branch execution mode. The legacy 'main' spelling is accepted
    // here (the backend normalizer migrates it to 'primary' on save); any
    // other value is a typo worth failing loudly at import time rather than
    // silently degrading to the task branch.
    const RUN_ON_BRANCH_VALUES = ['task', 'primary', 'custom', 'main'];
    if (!isAbsent(stage.runOnBranch) && !RUN_ON_BRANCH_VALUES.includes(stage.runOnBranch)) {
      errors.push(
        `${ref}: "runOnBranch" must be one of ${RUN_ON_BRANCH_VALUES.join(', ')} (ci stages only), got ${JSON.stringify(stage.runOnBranch)}.`,
      );
    }
    checkStringField(errors, ref, 'customBranch', stage.customBranch);
    // Tags are free-text labels (board filter). Arrays must hold strings; a
    // comma-separated string is accepted for hand-edited files and normalised
    // to an array on import.
    if (!isAbsent(stage.tags)) {
      if (typeof stage.tags === 'string') {
        // Comma-separated convenience — normalised on import.
      } else if (Array.isArray(stage.tags)) {
        stage.tags.forEach((tag, tagIndex) => {
          if (typeof tag !== 'string') {
            errors.push(`${ref}: "tags"[${tagIndex}] must be a string, got ${typeof tag}.`);
          }
        });
      } else {
        errors.push(
          `${ref}: "tags" must be an array of strings (or a comma-separated string), got ${typeof stage.tags}.`,
        );
      }
    }
    if (!isAbsent(stage.skills)) {
      if (!Array.isArray(stage.skills)) {
        errors.push(`${ref}: "skills" must be an array, got ${typeof stage.skills}.`);
      } else {
        stage.skills.forEach((entry, skillIndex) => {
          // Arrays are `typeof 'object'` too, but a skill entry is always a
          // plain descriptor — never a list.
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            errors.push(`${ref}: "skills"[${skillIndex}] must be an object.`);
          } else if (entry.name !== undefined && typeof entry.name !== 'string') {
            errors.push(`${ref}: "skills"[${skillIndex}].name must be a string.`);
          }
        });
      }
    }
  });
  return { ok: errors.length === 0, errors };
}

/***
 * MARK: summarizeImport
 * @description Stage count + per-type breakdown for the import confirmation
 *   step. Normally called with a doc that passed `validatePipelineDoc`;
 *   malformed input degrades to an empty summary instead of throwing.
 * @example summarizeImport(doc) => { stageCount: 3, byType: { agent: 2, human: 1 } }
 ***/
export function summarizeImport(doc) {
  // Defensive: only validated docs should reach here, but a malformed doc
  // must yield an empty summary — never throw inside the confirm dialog.
  const stages = doc && Array.isArray(doc.stages) ? doc.stages : [];
  const byType = {};
  for (const stage of stages) {
    const type = normalizeTransferType(stage?.type) || 'agent';
    // eslint-disable-next-line security/detect-object-injection
    byType[type] = (byType[type] || 0) + 1;
  }
  return { stageCount: stages.length, byType };
}

/***
 * MARK: buildImportPayload
 * @description Builds the `{ name, stages }` payload for `createWorkflow` from
 *   a validated doc: fresh ids (`stage-<timestamp>-<index>`), legacy types
 *   normalized, order preserved, aliases coalesced to canonical keys. Throws
 *   on invalid docs so callers can never write a partial import.
 * @example buildImportPayload(doc, { name: 'X (imported)', timestamp: 123 }) => { name, stages }
 ***/
export function buildImportPayload(doc, { name, timestamp = Date.now() } = {}) {
  const validation = validatePipelineDoc(doc);
  if (!validation.ok) {
    throw new Error(`Invalid pipeline file: ${validation.errors.join(' ')}`);
  }
  const finalName = typeof name === 'string' && name.trim() !== '' ? name.trim() : doc.name;
  const stages = doc.stages.map((stage, index) => {
    const next = toCanonicalStageDoc(stage);
    if (Array.isArray(next.skills)) {
      next.skills = next.skills.map((entry) =>
        entry && typeof entry === 'object' ? { ...entry } : entry,
      );
    }
    return { id: `stage-${timestamp}-${index}`, ...next };
  });
  return { name: finalName, stages };
}
