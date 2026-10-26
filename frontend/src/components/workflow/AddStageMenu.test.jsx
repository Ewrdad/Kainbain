import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, render, waitFor, within } from '@testing-library/react';
import { AddStageMenu } from './AddStageMenu';
import { MAX_IMPORT_BYTES, serializePipelineJson } from './pipelineTransfer';
import '@testing-library/jest-dom';

/***
 * MARK: AddStageMenu tests
 * @description Colocated tests for the split add-stage / export-import
 *   affordance: primary add path intact, menu open/close, export download,
 *   and the safety-critical import paths (invalid files write nothing).
 ***/

const stages = [
  { id: 's-1', name: 'Idea', type: 'agent', prompt: 'think' },
  { id: 's-2', name: 'Review', type: 'human', prompt: 'check' },
];

function baseProps(overrides = {}) {
  return {
    variant: 'column',
    onAdd: vi.fn(),
    projectId: 'p1',
    workflowName: 'Main',
    stages,
    onImportWorkflow: vi.fn().mockResolvedValue({ id: 'wf-new' }),
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
    ...overrides,
  };
}

function openMenu(props) {
  render(<AddStageMenu {...baseProps(props)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  return screen.getByRole('menu', { name: 'Pipeline transfer' });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

test('column primary action keeps the add-stage accessible name and path', () => {
  const onAdd = vi.fn();
  render(<AddStageMenu variant="column" {...baseProps({ onAdd })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add new pipeline stage' }));
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test('tab primary action keeps the add-stage accessible name and path', () => {
  const onAdd = vi.fn();
  render(<AddStageMenu variant="tab" {...baseProps({ onAdd })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add new pipeline stage' }));
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test('menu opens on chevron and closes on Escape with focus return', () => {
  render(<AddStageMenu {...baseProps()} />);
  const chevron = screen.getByRole('button', { name: 'Pipeline transfer options' });
  expect(chevron).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(chevron);
  expect(screen.getByRole('menu', { name: 'Pipeline transfer' })).toBeInTheDocument();
  expect(chevron).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(document.activeElement).toBe(chevron);
});

test('menu closes on outside click', () => {
  render(
    <div>
      <button type="button">outside</button>
      <AddStageMenu {...baseProps()} />
    </div>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('programmatic focus-scroll right after open keeps the menu open, a later scroll closes it', () => {
  vi.useFakeTimers();
  try {
    render(<AddStageMenu {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // The strip's programmatic focus-scroll fires a captured scroll event in
    // the same tick as the opening click (happy-dom shows this via the event;
    // real mobile browsers scroll on focus). The menu must survive it.
    fireEvent.scroll(window);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // A genuinely user-initiated scroll after the grace window still closes.
    vi.advanceTimersByTime(200);
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('export downloads a .pipeline.json blob with the serialized pipeline', async () => {
  const blobs = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob);
    return 'blob:fake';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const anchors = [];
  const realAppendChild = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, 'appendChild').mockImplementation(function (node) {
    // Call through so the test renderer can still mount; only track downloads.
    if (node.tagName === 'A') anchors.push(node);
    return realAppendChild(node);
  });
  const clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clicks.push(this);
  });
  const notifySuccess = vi.fn();

  openMenu({ notifySuccess });
  fireEvent.click(screen.getByRole('menuitem', { name: /export pipeline/i }));

  expect(blobs).toHaveLength(1);
  const doc = JSON.parse(await blobs[0].text());
  expect(doc.kainbainPipeline).toBe(1);
  expect(doc.name).toBe('Main');
  expect(doc.stages).toHaveLength(2);
  expect(anchors[0].download).toBe('main.pipeline.json');
  expect(clicks).toHaveLength(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  expect(notifySuccess).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('export with no stages notifies instead of downloading', () => {
  const notifyError = vi.fn();
  const createSpy = vi.spyOn(URL, 'createObjectURL');
  openMenu({ stages: [], notifyError });
  fireEvent.click(screen.getByRole('menuitem', { name: /export pipeline/i }));
  expect(createSpy).not.toHaveBeenCalled();
  expect(notifyError).toHaveBeenCalledWith(expect.stringMatching(/nothing to export/i), expect.anything());
});

test('export of unserializable stages notifies and downloads nothing', () => {
  const notifyError = vi.fn();
  const notifySuccess = vi.fn();
  const createSpy = vi.spyOn(URL, 'createObjectURL');
  const circular = { name: 'Loop', type: 'agent' };
  circular.self = circular;
  openMenu({ stages: [circular], notifyError, notifySuccess });
  fireEvent.click(screen.getByRole('menuitem', { name: /export pipeline/i }));
  expect(createSpy).not.toHaveBeenCalled();
  expect(notifySuccess).not.toHaveBeenCalled();
  expect(notifyError).toHaveBeenCalledWith(
    expect.stringMatching(/could not serialize/i),
    'Export failed',
  );
});

test('import of truncated JSON notifies and writes nothing', async () => {
  const notifyError = vi.fn();
  const onImportWorkflow = vi.fn();
  render(<AddStageMenu {...baseProps({ notifyError, onImportWorkflow })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  const menu = screen.getByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: /import pipeline/i }));
  const file = new File(['{"kainbainPipeline": 1, "name": "Main", "stages": ['], 'bad.pipeline.json', {
    type: 'application/json',
  });
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);

  await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
  expect(notifyError.mock.calls[0][0]).toMatch(/invalid json/i);
  expect(onImportWorkflow).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('import of unknown stage type names the problem and writes nothing', async () => {
  const notifyError = vi.fn();
  const onImportWorkflow = vi.fn();
  render(<AddStageMenu {...baseProps({ notifyError, onImportWorkflow })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  const menu = screen.getByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: /import pipeline/i }));
  const text = JSON.stringify({
    kainbainPipeline: 1,
    name: 'Odd',
    stages: [{ name: 'Weird', type: 'sorcery' }],
  });
  const file = new File([text], 'odd.pipeline.json', { type: 'application/json' });
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);

  await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
  expect(notifyError.mock.calls[0][0]).toMatch(/Weird/);
  expect(onImportWorkflow).not.toHaveBeenCalled();
});

test('oversize file is rejected before reading and writes nothing', async () => {
  const notifyError = vi.fn();
  const onImportWorkflow = vi.fn();
  const readSpy = vi.spyOn(File.prototype, 'text');
  render(<AddStageMenu {...baseProps({ notifyError, onImportWorkflow })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  const menu = screen.getByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: /import pipeline/i }));
  // Small body but a declared size over the cap: the pre-read guard must bail
  // without ever buffering the file.
  const file = new File(['tiny'], 'huge.pipeline.json', { type: 'application/json' });
  Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1, configurable: true });
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);

  await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
  expect(notifyError.mock.calls[0][0]).toMatch(/larger than/i);
  expect(readSpy).not.toHaveBeenCalled();
  expect(onImportWorkflow).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('valid import opens a confirmation and creates exactly one new pipeline', async () => {
  const notifyError = vi.fn();
  const onImportWorkflow = vi.fn().mockResolvedValue({ id: 'wf-new' });
  render(<AddStageMenu {...baseProps({ notifyError, onImportWorkflow })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  const menu = screen.getByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: /import pipeline/i }));
  const text = serializePipelineJson({ name: 'Main' }, stages);
  const file = new File([text], 'main.pipeline.json', { type: 'application/json' });
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);

  const dialog = await screen.findByRole('dialog', { name: 'Import pipeline' });
  expect(screen.getByLabelText('New pipeline name')).toHaveValue('Main (imported)');
  expect(within(dialog).getByText(/2 stage\(s\): 1 agent · 1 human/)).toBeInTheDocument();
  expect(
    within(dialog).getByText(/creates a new pipeline; nothing existing is changed/i),
  ).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Import pipeline' }));
  await waitFor(() => expect(onImportWorkflow).toHaveBeenCalledTimes(1));
  const payload = onImportWorkflow.mock.calls[0][0];
  expect(payload.name).toBe('Main (imported)');
  expect(payload.stages.map((s) => s.name)).toEqual(['Idea', 'Review']);
  // Ids remapped, never the originals.
  expect(payload.stages.map((s) => s.id)).not.toContain('s-1');
  expect(new Set(payload.stages.map((s) => s.id)).size).toBe(2);
  expect(notifyError).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Import pipeline' })).not.toBeInTheDocument(),
  );
});

test('import cancel writes nothing', async () => {
  const onImportWorkflow = vi.fn();
  render(<AddStageMenu {...baseProps({ onImportWorkflow })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  const menu = screen.getByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: /import pipeline/i }));
  const text = serializePipelineJson({ name: 'Main' }, stages);
  const file = new File([text], 'main.pipeline.json', { type: 'application/json' });
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);

  const dialog = await screen.findByRole('dialog', { name: 'Import pipeline' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(onImportWorkflow).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Import pipeline' })).not.toBeInTheDocument();
});

async function openImportDialog(props) {
  render(<AddStageMenu {...baseProps(props)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  const menu = screen.getByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: /import pipeline/i }));
  const text = serializePipelineJson({ name: 'Main' }, stages);
  const file = new File([text], 'main.pipeline.json', { type: 'application/json' });
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
  return screen.findByRole('dialog', { name: 'Import pipeline' });
}

test('Escape during the create call keeps the dialog open', async () => {
  let resolveImport;
  const onImportWorkflow = vi.fn(() => new Promise((resolve) => { resolveImport = resolve; }));
  const dialog = await openImportDialog({ onImportWorkflow });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import pipeline' }));
  await waitFor(() => expect(onImportWorkflow).toHaveBeenCalledTimes(1));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog', { name: 'Import pipeline' })).toBeInTheDocument();
  resolveImport({ id: 'wf-new' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Import pipeline' })).not.toBeInTheDocument(),
  );
});

test('missing import wiring notifies and writes nothing', async () => {
  const notifyError = vi.fn();
  const dialog = await openImportDialog({ notifyError, onImportWorkflow: undefined });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import pipeline' }));
  await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
  expect(notifyError.mock.calls[0][0]).toMatch(/not wired up|nothing was written/i);
  expect(screen.getByRole('dialog', { name: 'Import pipeline' })).toBeInTheDocument();
});

test('import server failure surfaces the error and keeps the dialog', async () => {
  const notifyError = vi.fn();
  const onImportWorkflow = vi.fn().mockRejectedValue(new Error('name taken'));
  render(<AddStageMenu {...baseProps({ notifyError, onImportWorkflow })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline transfer options' }));
  const menu = screen.getByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: /import pipeline/i }));
  const text = serializePipelineJson({ name: 'Main' }, stages);
  const file = new File([text], 'main.pipeline.json', { type: 'application/json' });
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);

  const dialog = await screen.findByRole('dialog', { name: 'Import pipeline' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import pipeline' }));
  await waitFor(() => expect(notifyError).toHaveBeenCalledWith('name taken', 'Import failed'));
  expect(screen.getByRole('dialog', { name: 'Import pipeline' })).toBeInTheDocument();
});

afterEach(() => {
  vi.restoreAllMocks();
});
