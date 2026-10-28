import { describe, it, expect } from 'vitest';

import {
  WIDGET_CATALOG,
  DEFAULT_LAYOUT,
  PRESET_LAYOUTS,
  LAYOUT_SCHEMA_VERSION,
  cloneLayout,
  createWidgetInstance,
  nextInstanceId,
  normalizeLayout,
} from './widgetRegistry';

/***
 * MARK: widgetRegistry tests
 * @description Proves the instance model that lets the monitor place the same
 *   widget type several times: unique ids, catalog defaults, and the single
 *   migration/validation point used by load, presets and import.
 ***/

describe('LAYOUT_SCHEMA_VERSION', () => {
  it('is 2 for the instance-based layout shape', () => {
    expect(LAYOUT_SCHEMA_VERSION).toBe(2);
  });
});

describe('WIDGET_CATALOG', () => {
  it('lets every widget be added more than once', () => {
    expect(WIDGET_CATALOG.length).toBeGreaterThan(0);
    for (const widget of WIDGET_CATALOG) {
      expect(widget.allowMultiple, `${widget.id} should allow multiple instances`).toBe(true);
    }
  });

  it('exposes one atomic entry per KPI and per subsystem, plus the composites', () => {
    const ids = WIDGET_CATALOG.map((widget) => widget.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'kpi-successes',
        'kpi-failures',
        'kpi-queue',
        'kpi-checkpoints',
        'kpi-engine',
        'kpis',
        'health-litellm',
        'health-device',
        'health-ollama',
        'health-websocket',
        'health-harness',
        'health',
      ]),
    );
  });
});

describe('DEFAULT_LAYOUT and PRESET_LAYOUTS', () => {
  it('keys every default entry by a unique instanceId', () => {
    const ids = DEFAULT_LAYOUT.map((entry) => entry.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('kpis');
  });

  it('keeps every preset entry valid and uniquely keyed', () => {
    const catalogIds = new Set(WIDGET_CATALOG.map((widget) => widget.id));
    for (const preset of PRESET_LAYOUTS) {
      const ids = preset.layout.map((entry) => entry.instanceId);
      expect(new Set(ids).size, `${preset.id} has duplicate instanceIds`).toBe(ids.length);
      for (const entry of preset.layout) {
        expect(catalogIds.has(entry.id), `${preset.id} references unknown ${entry.id}`).toBe(true);
      }
    }
  });

  it('normalizes every default and preset entry unchanged', () => {
    expect(normalizeLayout(DEFAULT_LAYOUT)).toEqual(cloneLayout(DEFAULT_LAYOUT));
    for (const preset of PRESET_LAYOUTS) {
      expect(normalizeLayout(preset.layout)).toEqual(cloneLayout(preset.layout));
    }
  });
});

describe('nextInstanceId', () => {
  it('uses the widget type itself for the first copy', () => {
    expect(nextInstanceId('kpi-queue', [])).toBe('kpi-queue');
  });

  it('uses the smallest unused suffix for further copies', () => {
    expect(nextInstanceId('queue', [{ instanceId: 'queue' }])).toBe('queue-2');
    expect(nextInstanceId('queue', [{ instanceId: 'queue' }, { instanceId: 'queue-3' }])).toBe(
      'queue-2',
    );
    expect(nextInstanceId('queue', [{ instanceId: 'queue' }, { instanceId: 'queue-2' }])).toBe(
      'queue-3',
    );
  });

  it('ignores entries of other widget types', () => {
    expect(nextInstanceId('queue', [{ instanceId: 'kpis' }])).toBe('queue');
  });

  it('never mints an undefined-based id for a missing type', () => {
    expect(nextInstanceId(undefined, [])).toBe('widget');
    expect(nextInstanceId('', [])).toBe('widget');
    expect(nextInstanceId(null, [{ instanceId: 'widget' }])).toBe('widget-2');
  });
});

describe('createWidgetInstance', () => {
  it('builds an enabled entry from catalog defaults', () => {
    expect(createWidgetInstance('kpi-queue')).toEqual({
      instanceId: 'kpi-queue',
      id: 'kpi-queue',
      colSpan: 3,
      height: 'compact',
      enabled: true,
      config: {},
    });
  });

  it('allocates a fresh unique instanceId when the type is already placed', () => {
    const existing = [{ instanceId: 'kpi-queue' }];
    expect(createWidgetInstance('kpi-queue', existing).instanceId).toBe('kpi-queue-2');
  });

  it('returns null for an unknown widget type', () => {
    expect(createWidgetInstance('does-not-exist')).toBeNull();
  });
});

describe('normalizeLayout', () => {
  it('migrates version 1 entries that have no instanceId', () => {
    const migrated = normalizeLayout([
      { id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
      { id: 'queue', colSpan: 4, height: 'tall', enabled: false },
    ]);

    expect(migrated).toEqual([
      { instanceId: 'kpis', id: 'kpis', colSpan: 12, height: 'compact', enabled: true, config: {} },
      { instanceId: 'queue', id: 'queue', colSpan: 4, height: 'tall', enabled: false, config: {} },
    ]);
  });

  it('distinguishes two version 1 copies of the same widget type', () => {
    const migrated = normalizeLayout([
      { id: 'queue', colSpan: 6, height: 'normal', enabled: true },
      { id: 'queue', colSpan: 4, height: 'tall', enabled: true },
    ]);

    expect(migrated.map((entry) => entry.instanceId)).toEqual(['queue', 'queue-2']);
  });

  it('drops entries for widgets that no longer exist in the catalog', () => {
    const migrated = normalizeLayout([
      { id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
      { id: 'removedWidget', colSpan: 6, height: 'normal', enabled: true },
    ]);

    expect(migrated).toHaveLength(1);
    expect(migrated[0].id).toBe('kpis');
  });

  it('fills missing or invalid size and enabled fields from catalog defaults', () => {
    const migrated = normalizeLayout([{ id: 'health-litellm' }]);

    expect(migrated).toEqual([
      {
        instanceId: 'health-litellm',
        id: 'health-litellm',
        colSpan: 3,
        height: 'compact',
        enabled: true,
        config: {},
      },
    ]);
  });

  it('reassigns a duplicated instanceId instead of rendering colliding widgets', () => {
    const migrated = normalizeLayout([
      { instanceId: 'queue', id: 'queue', colSpan: 6, height: 'normal', enabled: true },
      { instanceId: 'queue', id: 'queue', colSpan: 4, height: 'tall', enabled: true },
    ]);

    expect(migrated.map((entry) => entry.instanceId)).toEqual(['queue', 'queue-2']);
  });

  it('preserves a per-instance config object and copies it', () => {
    const source = {
      instanceId: 'reliability-2',
      id: 'reliability',
      colSpan: 6,
      height: 'normal',
      enabled: true,
      config: { harness: 'pi', title: 'Reliability (prod)' },
    };
    const migrated = normalizeLayout([source]);

    expect(migrated[0].config).toEqual({ harness: 'pi', title: 'Reliability (prod)' });
    expect(migrated[0].config).not.toBe(source.config);
  });

  it('round-trips an already-versioned layout unchanged but for fresh config objects', () => {
    const saved = cloneLayout(DEFAULT_LAYOUT);
    const migrated = normalizeLayout(saved);

    expect(migrated).toEqual(saved);
    expect(migrated[0]).not.toBe(saved[0]);
  });

  it('falls back to the default layout for a non-array or empty input', () => {
    expect(normalizeLayout(null)).toEqual(cloneLayout(DEFAULT_LAYOUT));
    expect(normalizeLayout([])).toEqual(cloneLayout(DEFAULT_LAYOUT));
    expect(normalizeLayout([{ id: 'unknown-only' }])).toEqual(cloneLayout(DEFAULT_LAYOUT));
  });
});

describe('cloneLayout', () => {
  it('returns independent copies so mutating one layout cannot leak into another', () => {
    const original = cloneLayout(DEFAULT_LAYOUT);
    const copy = cloneLayout(original);
    copy[0].enabled = false;
    copy[0].config.title = 'changed';

    expect(original[0].enabled).toBe(true);
    expect(original[0].config.title).toBeUndefined();
  });
});
