import { expect, test } from 'vitest';
import { resolveMobileModelDetails } from './mobileModelDetails';

test('agent stage with a canonical model key shows harness and model pills', () => {
  const details = resolveMobileModelDetails(
    {
      id: 't1',
      title: 'Build auth',
      stageType: 'agent',
      harness: 'pi',
      model: 'pi::ollama-cloud::gemma4:31b-cloud',
    },
    { status: 'running', activeStageType: 'agent' },
  );

  expect(details.isIdle).toBe(false);
  expect(details.isScripted).toBe(false);
  expect(details.showHarness).toBe(true);
  expect(details.showModel).toBe(true);
  expect(details.harness).toBe('pi');
  expect(details.model.label).toBe('gemma4:31b-cloud');
  expect(details.provider).toBe('ollama-cloud');
});

test('harness falls back to the model key when the task carries none', () => {
  const details = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', model: 'pi::ollama-cloud::gemma4:31b-cloud' },
    {},
  );

  expect(details.showHarness).toBe(true);
  expect(details.harness).toBe('pi');
});

test.each(['ci', 'deploy', 'merge'])(
  'scripted stage type %s shows the automated pill instead of harness/model',
  (stageType) => {
    const details = resolveMobileModelDetails(
      { id: 't1', stageType, model: 'pi::ollama-cloud::gemma4:31b-cloud' },
      {},
    );

    expect(details.isScripted).toBe(true);
    expect(details.showHarness).toBe(false);
    expect(details.showModel).toBe(false);
  },
);

test('backend isAutomatedStage flag wins over the stage type', () => {
  const forced = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', isAutomatedStage: true },
    {},
  );
  expect(forced.isScripted).toBe(true);
  expect(forced.showModel).toBe(false);

  // Fail-visible: an explicit false keeps the pills even on a scripted type.
  const unforced = resolveMobileModelDetails(
    { id: 't1', stageType: 'ci', isAutomatedStage: false },
    {},
  );
  expect(unforced.isScripted).toBe(false);
  expect(unforced.showModel).toBe(true);
});

test('engine activeStageType resolves scripted stages when the task omits it', () => {
  const details = resolveMobileModelDetails(
    { id: 't1', model: 'pi::ollama-cloud::m' },
    { activeStageType: 'deploy' },
  );

  expect(details.isScripted).toBe(true);
  expect(details.showModel).toBe(false);
});

test("harness-managed stage (modelSelection 'none') hides only the model pill", () => {
  const details = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', harness: 'muse', modelSelection: 'none' },
    {},
  );

  expect(details.isScripted).toBe(false);
  expect(details.showHarness).toBe(true);
  expect(details.harness).toBe('muse');
  expect(details.showModel).toBe(false);
  expect(details.showProviderLine).toBe(false);
});

test("harness-managed alias run hides the model pill even when a stale model field leaks through", () => {
  const details = resolveMobileModelDetails(
    {
      id: 't1',
      stageType: 'agent',
      harness: 'muse',
      model: 'antigravity::google::gemini-2.5-flash',
      modelSelection: 'none',
      modelDetails: { provider: 'google', id: 'gemini-2.5-flash', key: 'antigravity::google::gemini-2.5-flash', source: 'stage' },
      alias: { name: 'worker' },
      aliasMissing: null,
    },
    {},
  );

  expect(details.showHarness).toBe(true);
  expect(details.showModel).toBe(false);
  expect(details.showProviderLine).toBe(false);
  expect(details.showAlias).toBe(true);
  expect(details.aliasName).toBe('worker');
});

test('missing modelSelection defaults to list (model shown)', () => {
  const details = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', model: 'pi::ollama-cloud::m' },
    {},
  );

  expect(details.modelSelection).toBe('list');
  expect(details.showModel).toBe(true);
});

test('modelDetails key wins over the legacy model field', () => {
  const details = resolveMobileModelDetails(
    {
      id: 't1',
      stageType: 'agent',
      model: 'stale::provider::old-model',
      modelDetails: {
        key: 'pi::ollama-cloud::gemma4:31b-cloud',
        provider: 'ollama-cloud',
        source: 'stage-override',
      },
    },
    {},
  );

  expect(details.modelRef).toBe('pi::ollama-cloud::gemma4:31b-cloud');
  expect(details.model.label).toBe('gemma4:31b-cloud');
  expect(details.provider).toBe('ollama-cloud');
  expect(details.source).toBe('stage-override');
  expect(details.showProviderLine).toBe(true);
});

test('provider line hides when neither provider nor source is known', () => {
  const details = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', model: 'bare-model-id' },
    {},
  );

  expect(details.showModel).toBe(true);
  expect(details.showProviderLine).toBe(false);
});

test.each([[null], [undefined], [{}]])('idle task %s renders the idle fallback', (task) => {
  const details = resolveMobileModelDetails(task, { status: 'idle' });

  expect(details.isIdle).toBe(true);
  expect(details.showHarness).toBe(false);
  expect(details.showModel).toBe(false);
  expect(details.showAlias).toBe(false);
  expect(details.showProviderLine).toBe(false);
});

test('malformed model refs stay opaque labels and never crash', () => {
  const details = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', model: 'bad::::key' },
    {},
  );

  expect(details.showModel).toBe(true);
  expect(details.model.label).toBe('bad::::key');
});

test('sentinel and missing models fall back to Unknown without crashing', () => {
  const sentinel = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', model: 'default' },
    {},
  );
  expect(sentinel.model.label).toBe('Unknown');

  const missing = resolveMobileModelDetails({ id: 't1', stageType: 'agent' }, {});
  expect(missing.model.label).toBe('Unknown');
  expect(missing.harness).toBe('Unknown');
  expect(missing.showModel).toBe(true);
  expect(missing.showHarness).toBe(true);
});

test('resolved alias shows with a target tooltip; missing alias stays fail-visible', () => {
  const resolved = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', alias: { name: 'fast', targetIndex: 1 } },
    {},
  );
  expect(resolved.showAlias).toBe(true);
  expect(resolved.aliasName).toBe('fast');
  expect(resolved.aliasTitle).toBe('alias fast, target 2');

  const missing = resolveMobileModelDetails(
    { id: 't1', stageType: 'agent', aliasMissing: 'gone' },
    {},
  );
  expect(missing.showAlias).toBe(true);
  expect(missing.aliasMissing).toBe('gone');
});

test('alias hides on scripted stages', () => {
  const details = resolveMobileModelDetails(
    { id: 't1', stageType: 'ci', alias: { name: 'fast', targetIndex: 0 } },
    {},
  );

  expect(details.showAlias).toBe(false);
});
