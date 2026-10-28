import { describe, expect, test } from 'vitest';
import {
  MAX_IMPORT_BYTES,
  PIPELINE_EXPORT_VERSION,
  buildImportPayload,
  exportFilename,
  isFileOversize,
  oversizeImportError,
  parsePipelineFile,
  serializePipeline,
  serializePipelineJson,
  slugifyWorkflowName,
  summarizeImport,
  validatePipelineDoc,
} from './pipelineTransfer';

/***
 * MARK: pipelineTransfer tests
 * @description Unit tests for the pipeline export/import trust boundary:
 *   round-trip fidelity, legacy types, hand-edited docs, and rejection of
 *   malformed/hostile files with messages that name the problem.
 ***/

function kitchenSinkStages() {
  return [
    {
      id: 'stage-old-1',
      name: 'Elaborate',
      type: 'agent',
      description: 'Autonomous elaboration',
      prompt: 'Do the thing with {{project}}',
      model: 'deepseek-v4-pro:0813-cloud',
      harness: 'pi',
      timeout: 1800000,
      skills: [{ name: 'refine', mode: 'DIRECT' }],
      paused: false,
      failback: 'previous',
    },
    {
      id: 'stage-old-2',
      name: 'Review',
      type: 'human',
      prompt: 'Checklist here',
      paused: true,
      failback: 'start',
    },
    {
      id: 'stage-old-3',
      name: 'Verify',
      type: 'ci',
      command: 'npm run test:unit',
      timeout: 60000,
      paused: false,
      failback: 'previous',
      runOnBranch: 'primary',
    },
    {
      id: 'stage-old-4',
      name: 'Ship',
      type: 'deploy',
      command: './deploy.sh --prod',
      timeout: 300000,
      failback: 'abort',
    },
    {
      id: 'stage-old-5',
      name: 'Land',
      type: 'merge',
      command: './deploy.sh --prod',
      failback: 'any',
    },
  ];
}

describe('serializePipeline', () => {
  test('round-trips every persisted stage field and drops ids', () => {
    const stages = kitchenSinkStages();
    const doc = serializePipeline({ name: 'Main Pipeline' }, stages);
    expect(doc.kainbainPipeline).toBe(PIPELINE_EXPORT_VERSION);
    expect(doc.name).toBe('Main Pipeline');
    expect(typeof doc.exportedAt).toBe('string');
    expect(doc.stages).toHaveLength(5);
    for (const exported of doc.stages) {
      expect(exported).not.toHaveProperty('id');
    }
    // Stage key order is stable for hand editors.
    expect(Object.keys(doc.stages[0]).slice(0, 2)).toEqual(['name', 'type']);
    // Full fidelity: re-import reproduces every field (post-normalization).
    const payload = buildImportPayload(doc, { name: 'Copy', timestamp: 42 });
    expect(payload.name).toBe('Copy');
    expect(payload.stages.map((s) => s.name)).toEqual(stages.map((s) => s.name));
    payload.stages.forEach((imported, i) => {
      const original = stages[i];
      for (const key of [
        'type',
        'description',
        'prompt',
        'model',
        'harness',
        'command',
        'timeout',
        'paused',
        'failback',
        'runOnBranch',
      ]) {
        if (original[key] !== undefined) {
          // Legacy `deploy` is accepted on import and normalizes to `ci`.
          const expected = key === 'type' && original.type === 'deploy' ? 'ci' : original[key];
          expect(imported[key], `${key} of stage ${i}`).toEqual(expected);
        }
      }
      expect(imported.skills).toEqual(original.skills);
    });
  });

  test('coalesces legacy aliases to canonical keys', () => {
    const doc = serializePipeline({ name: 'Legacy' }, [
      {
        id: 's1',
        name: 'R',
        type: 'review',
        criteria: 'check it',
        script: 'make test',
        fallback: 'start',
        timeoutMs: 5000,
      },
    ]);
    const stage = doc.stages[0];
    expect(stage.type).toBe('human');
    expect(stage.prompt).toBe('check it');
    expect(stage.command).toBe('make test');
    expect(stage.failback).toBe('start');
    expect(stage.timeout).toBe(5000);
    expect(stage).not.toHaveProperty('criteria');
    expect(stage).not.toHaveProperty('script');
    expect(stage).not.toHaveProperty('fallback');
    expect(stage).not.toHaveProperty('timeoutMs');
  });

  test('serializePipelineJson is pretty human-editable JSON', () => {
    const text = serializePipelineJson({ name: 'Main' }, [{ id: 's1', name: 'A', type: 'agent' }]);
    expect(text).toContain('\n  ');
    expect(JSON.parse(text).kainbainPipeline).toBe(PIPELINE_EXPORT_VERSION);
  });

  test('round-trips the ci run-on-branch fields (custom mode keeps its branch)', () => {
    const stages = [
      { id: 's1', name: 'Verify main', type: 'ci', command: 'npm test', runOnBranch: 'primary' },
      {
        id: 's2',
        name: 'Verify release',
        type: 'ci',
        command: 'npm test',
        runOnBranch: 'custom',
        customBranch: 'release/next',
      },
    ];
    const doc = serializePipeline({ name: 'Branched' }, stages);
    expect(doc.stages[0].runOnBranch).toBe('primary');
    expect(doc.stages[1]).toMatchObject({ runOnBranch: 'custom', customBranch: 'release/next' });
    const payload = buildImportPayload(doc, { name: 'Copy', timestamp: 42 });
    expect(payload.stages[0].runOnBranch).toBe('primary');
    expect(payload.stages[1]).toMatchObject({
      runOnBranch: 'custom',
      customBranch: 'release/next',
    });
  });

  test('validates runOnBranch/customBranch values on import (typos fail loud)', () => {
    const good = validatePipelineDoc({
      kainbainPipeline: 1,
      name: 'OK',
      stages: [
        { name: 'A', type: 'ci', runOnBranch: 'main' },
        { name: 'B', type: 'ci', runOnBranch: 'custom', customBranch: 'release/next' },
      ],
    });
    expect(good.ok).toBe(true);

    const bad = validatePipelineDoc({
      kainbainPipeline: 1,
      name: 'Typos',
      stages: [
        { name: 'A', type: 'ci', runOnBranch: 'mainn' },
        { name: 'B', type: 'ci', runOnBranch: 'custom', customBranch: 42 },
      ],
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes('"runOnBranch" must be one of'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('"customBranch" must be a string'))).toBe(true);
  });
});

describe('parsePipelineFile', () => {
  test('accepts a valid export', () => {
    const text = serializePipelineJson({ name: 'Main' }, [{ id: 's1', name: 'A', type: 'agent' }]);
    const parsed = parsePipelineFile(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.doc.name).toBe('Main');
  });

  test('rejects truncated JSON naming the position', () => {
    const parsed = parsePipelineFile('{"kainbainPipeline": 1, "name": "Main", "stages": [');
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/invalid json/i);
  });

  test('rejects empty files', () => {
    expect(parsePipelineFile('   ').ok).toBe(false);
    expect(parsePipelineFile('   ').error).toMatch(/empty/i);
  });

  test('rejects oversize files', () => {
    const big = `{"kainbainPipeline": 1, "name": "x", "stages": [], "pad": "${'x'.repeat(MAX_IMPORT_BYTES)}"}`;
    const parsed = parsePipelineFile(big);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/larger than/i);
  });

  test('rejects top-level arrays', () => {
    const parsed = parsePipelineFile('[1, 2, 3]');
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/json object/i);
  });

  test('rejects non-string input without throwing', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      const parsed = parsePipelineFile(bad);
      expect(parsed.ok).toBe(false);
      expect(typeof parsed.error).toBe('string');
    }
  });

  test('oversize text error matches the shared helper (single message source)', () => {
    const big = `{"kainbainPipeline": 1, "name": "x", "stages": [], "pad": "${'x'.repeat(MAX_IMPORT_BYTES)}"}`;
    expect(parsePipelineFile(big)).toEqual({ ok: false, error: oversizeImportError() });
  });
});

describe('import size guards', () => {
  test('isFileOversize flags known sizes above the cap only', () => {
    expect(isFileOversize({ size: MAX_IMPORT_BYTES + 1 })).toBe(true);
    expect(isFileOversize({ size: MAX_IMPORT_BYTES })).toBe(false);
    expect(isFileOversize({ size: 10 })).toBe(false);
  });

  test('isFileOversize fails open on unknown sizes (text check still applies)', () => {
    expect(isFileOversize(null)).toBe(false);
    expect(isFileOversize(undefined)).toBe(false);
    expect(isFileOversize({})).toBe(false);
    expect(isFileOversize({ size: 'huge' })).toBe(false);
    expect(isFileOversize({ size: NaN })).toBe(false);
  });
});

describe('validatePipelineDoc', () => {
  function validDoc() {
    return JSON.parse(
      serializePipelineJson({ name: 'Main' }, [
        { id: 's1', name: 'A', type: 'agent', prompt: 'hi' },
      ]),
    );
  }

  test('accepts hand-edited docs missing ids', () => {
    const doc = validDoc();
    delete doc.exportedAt;
    expect(validatePipelineDoc(doc).ok).toBe(true);
  });

  test('accepts legacy types review/script/custom', () => {
    const doc = validDoc();
    doc.stages = [
      { name: 'R', type: 'review' },
      { name: 'S', type: 'script' },
      { name: 'C', type: 'custom' },
    ];
    const result = validatePipelineDoc(doc);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    const payload = buildImportPayload(doc, { timestamp: 7 });
    expect(payload.stages.map((s) => s.type)).toEqual(['human', 'ci', 'agent']);
  });

  test('rejects empty stages', () => {
    const doc = { ...validDoc(), stages: [] };
    const result = validatePipelineDoc(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/empty/i);
  });

  test('rejects a bad marker', () => {
    const doc = { ...validDoc(), kainbainPipeline: 999 };
    const result = validatePipelineDoc(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/kainbainPipeline/);
  });

  test('rejects a missing marker', () => {
    const doc = validDoc();
    delete doc.kainbainPipeline;
    const result = validatePipelineDoc(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/kainbainPipeline/);
  });

  test('rejects unknown types naming the stage', () => {
    const doc = validDoc();
    doc.stages = [{ name: 'Weird', type: 'sorcery' }];
    const result = validatePipelineDoc(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Weird/);
    expect(result.errors.join(' ')).toMatch(/sorcery/);
  });

  test('rejects wrong field types naming each problem', () => {
    const doc = validDoc();
    doc.stages = [
      {
        name: 'Bad',
        type: 'agent',
        prompt: 42,
        timeout: 'soon',
        paused: 'yes',
        failback: 7,
        skills: 'x',
      },
    ];
    const result = validatePipelineDoc(doc);
    expect(result.ok).toBe(false);
    const joined = result.errors.join(' ');
    expect(joined).toMatch(/"prompt"/);
    expect(joined).toMatch(/"timeout"/);
    expect(joined).toMatch(/"paused"/);
    expect(joined).toMatch(/"failback"/);
    expect(joined).toMatch(/"skills"/);
    // ALL errors collected, not just the first.
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  test('rejects nameless stages and nameless docs', () => {
    expect(validatePipelineDoc({ ...validDoc(), stages: [{ type: 'agent' }] }).ok).toBe(false);
    expect(validatePipelineDoc({ ...validDoc(), name: '  ' }).ok).toBe(false);
  });

  test('rejects array entries inside skills', () => {
    const doc = validDoc();
    doc.stages = [{ name: 'Bad', type: 'agent', skills: [['refine']] }];
    const result = validatePipelineDoc(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/"skills"\[0\]/);
    expect(() => buildImportPayload(doc, { timestamp: 1 })).toThrow(/invalid pipeline file/i);
  });
});

describe('stage tags in pipeline transfer', () => {
  test('export normalises tags and round-trips them through import', () => {
    const stages = [
      { id: 's1', name: 'Idea', type: 'agent', tags: [' PO ', 'po', 'Dev', ''] },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    const doc = serializePipeline({ name: 'Main' }, stages);
    // Normalised: trimmed, case-insensitive dedupe, empties dropped.
    expect(doc.stages[0].tags).toEqual(['PO', 'Dev']);
    // Legacy stage without tags stays without the key.
    expect(doc.stages[1]).not.toHaveProperty('tags');

    const payload = buildImportPayload(
      JSON.parse(serializePipelineJson({ name: 'Main' }, stages)),
      {
        timestamp: 7,
      },
    );
    expect(payload.stages[0].tags).toEqual(['PO', 'Dev']);
    expect(payload.stages[1]).not.toHaveProperty('tags');
  });

  test('import coerces a comma-separated tags string to a normalised array', () => {
    const doc = {
      kainbainPipeline: 1,
      name: 'Hand-Edited',
      stages: [{ name: 'A', type: 'agent', tags: 'PO, Dev, po' }],
    };
    const payload = buildImportPayload(doc, { timestamp: 3 });
    expect(payload.stages[0].tags).toEqual(['PO', 'Dev']);
  });

  test('validation rejects non-string tag entries and non-array tags', () => {
    const badEntries = validatePipelineDoc({
      kainbainPipeline: 1,
      name: 'X',
      stages: [{ name: 'A', type: 'agent', tags: ['PO', 42] }],
    });
    expect(badEntries.ok).toBe(false);
    expect(badEntries.errors.some((e) => e.includes('"tags"[1] must be a string'))).toBe(true);

    const badType = validatePipelineDoc({
      kainbainPipeline: 1,
      name: 'X',
      stages: [{ name: 'A', type: 'agent', tags: { label: 'PO' } }],
    });
    expect(badType.ok).toBe(false);
    expect(badType.errors.some((e) => e.includes('"tags" must be an array of strings'))).toBe(true);
  });
});

describe('buildImportPayload', () => {
  test('remaps ids uniquely and preserves order', () => {
    const doc = JSON.parse(
      serializePipelineJson(
        { name: 'Main' },
        ['A', 'B', 'C'].map((name, i) => ({ id: `same-id-${i}`, name, type: 'agent' })),
      ),
    );
    const payload = buildImportPayload(doc, { timestamp: 12345 });
    const ids = payload.stages.map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['stage-12345-0', 'stage-12345-1', 'stage-12345-2']);
    expect(payload.stages.map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  test('re-import of an export works (ids never collide)', () => {
    const doc = JSON.parse(serializePipelineJson({ name: 'Main' }, kitchenSinkStages()));
    const payload = buildImportPayload(doc, { timestamp: 1 });
    for (const stage of payload.stages) {
      expect(kitchenSinkStages().map((s) => s.id)).not.toContain(stage.id);
    }
  });

  test('throws on invalid docs so callers never write partial imports', () => {
    expect(() => buildImportPayload({ kainbainPipeline: 1, name: 'X', stages: [] })).toThrow(
      /empty/i,
    );
    expect(() => buildImportPayload(null)).toThrow(/invalid pipeline file/i);
  });

  test('uses the doc name when no override is given', () => {
    const doc = JSON.parse(
      serializePipelineJson({ name: 'Original' }, [{ name: 'A', type: 'agent' }]),
    );
    expect(buildImportPayload(doc, { timestamp: 1 }).name).toBe('Original');
  });

  test('export and import share one canonicalization (no drift)', () => {
    const doc = JSON.parse(
      serializePipelineJson({ name: 'M' }, [
        {
          id: 's1',
          name: 'R',
          type: 'review',
          criteria: 'check it',
          script: 'make test',
          fallback: 'start',
          timeoutMs: 5000,
          note: 'keep',
        },
      ]),
    );
    const payload = buildImportPayload(doc, { timestamp: 9 });
    const { id, ...body } = payload.stages[0];
    expect(id).toBe('stage-9-0');
    expect(body).toEqual(doc.stages[0]);
  });
});

describe('summarizeImport + filenames', () => {
  test('summarizes stage count and per-type breakdown', () => {
    const doc = JSON.parse(serializePipelineJson({ name: 'Main' }, kitchenSinkStages()));
    expect(summarizeImport(doc)).toEqual({
      stageCount: 5,
      // The legacy deploy stage counts under its normalized type `ci`.
      byType: { agent: 1, human: 1, ci: 2, merge: 1 },
    });
  });

  test('slugifies filenames', () => {
    expect(exportFilename('My Main Pipeline!')).toBe('my-main-pipeline.pipeline.json');
    expect(exportFilename('')).toBe('pipeline.pipeline.json');
    expect(slugifyWorkflowName('  A  B  ')).toBe('a-b');
  });

  test('summarizeImport degrades to an empty summary instead of throwing', () => {
    expect(summarizeImport(null)).toEqual({ stageCount: 0, byType: {} });
    expect(summarizeImport(undefined)).toEqual({ stageCount: 0, byType: {} });
    expect(summarizeImport({})).toEqual({ stageCount: 0, byType: {} });
    expect(summarizeImport({ stages: 'nope' })).toEqual({ stageCount: 0, byType: {} });
    expect(summarizeImport({ stages: null })).toEqual({ stageCount: 0, byType: {} });
  });
});

describe('hostile key hardening', () => {
  test('prototype-polluting stage keys are rejected with a named error, never copied', () => {
    const doc = {
      kainbainPipeline: 1,
      name: 'Hostile',
      stages: [{ name: 'Bad', type: 'agent', __proto__: { poisoned: true } }],
    };
    const plain = JSON.parse(
      JSON.stringify({
        kainbainPipeline: 1,
        name: 'Hostile',
        stages: [{ name: 'Bad', type: 'agent', constructor: 'x' }],
      }),
    );
    const validation = validatePipelineDoc(plain);
    expect(validation.ok).toBe(false);
    expect(
      validation.errors.some(
        (e) => e.includes('prototype-polluting') || e.includes('are not valid stage fields'),
      ),
    ).toBe(true);
    // The JSON.parse-materialized `__proto__` own-property case:
    const hostileText =
      '{"kainbainPipeline":1,"name":"Hostile","stages":[{"name":"Bad","type":"agent","__proto__":{"poisoned":true}}]}';
    const hostileDoc = JSON.parse(hostileText);
    const hostileValidation = validatePipelineDoc(hostileDoc);
    expect(hostileValidation.ok).toBe(false);
    // buildImportPayload never emits a polluted object.
    expect(() => buildImportPayload(hostileDoc)).toThrow(/Invalid pipeline file/i);
  });

  test('serialization never emits unsafe keys even if a stage carries them', () => {
    // Object literal `{ __proto__: ... }` sets the prototype, so simulate a
    // hostile stage via JSON.parse of raw text.
    const stage = JSON.parse('{"name":"Weird","type":"agent","__proto__":{"x":1},"note":"keep"}');
    const doc = JSON.parse(serializePipelineJson({ name: 'Main' }, [stage]));
    expect(Object.keys(doc.stages[0])).not.toContain('__proto__');
    expect(doc.stages[0].note).toBe('keep');
  });
});
