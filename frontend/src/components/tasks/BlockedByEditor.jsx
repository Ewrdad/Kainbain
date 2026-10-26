import { useCallback, useMemo, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { MultiSelectDropdown } from '../common/MultiSelectDropdown';
import { formatTaskKey } from './taskFormatters';
import { filterBlockedByCandidates, matchesBlockedByQuery } from './blockedByCandidates';

/***
 * MARK: BlockedByEditor
 * @description Edits a task's prerequisite list (`blockedBy`): the user picks
 *   any other active, non-complete task from a searchable multi-select
 *   dropdown (tags-style). Typing filters candidates by title (falling back
 *   to `goal`, then `id`) or kb-number (`#KB-XXXX`, with or without the
 *   prefix). Completed tasks and the task itself are never offered. Selected
 *   blockers render as removable chips with live status; saving PATCHes
 *   `{ blockedBy }` and surfaces backend rejections (self-block, unknown
 *   id, dependency cycle) inline.
 * @param {Object} props
 * @param {Object} props.task - The task being edited.
 * @param {boolean} [props.disabled=false] - Disables editing while another mutation runs.
 * @example <BlockedByEditor task={task} disabled={isMutating} />
 ***/
export function BlockedByEditor({ task, disabled = false }) {
  const { tasks = [], activeProjectId, updateTask } = useKainBain();
  const savedBlockedBy = Array.isArray(task?.blockedBy) ? task.blockedBy.map(String) : [];
  const [selected, setSelected] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const candidates = useMemo(() => filterBlockedByCandidates(tasks || [], task?.id), [tasks, task]);
  const candidateById = useMemo(() => {
    const map = new Map();
    for (const candidate of candidates) map.set(String(candidate.id), candidate);
    return map;
  }, [candidates]);

  const options = useMemo(
    () =>
      candidates.map((candidate) => ({
        value: String(candidate.id),
        label: candidate.title || candidate.goal || String(candidate.id),
        secondary: `${candidate.status || 'in_stage'} · ${formatTaskKey(String(candidate.id))}`,
      })),
    [candidates],
  );

  const filterOptions = useCallback(
    (opts, query) =>
      (opts || []).filter((opt) => matchesBlockedByQuery(candidateById.get(opt.value), query)),
    [candidateById],
  );

  const active = selected ?? savedBlockedBy;
  const isDirty =
    active.length !== savedBlockedBy.length || active.some((id) => !savedBlockedBy.includes(id));

  const blockerTask = (blockerId) => (tasks || []).find((t) => String(t.id) === String(blockerId));
  const blockerStatus = (blockerId) => blockerTask(blockerId)?.status || 'unknown';
  const blockerLabel = (blockerId) =>
    blockerTask(blockerId)?.title || blockerTask(blockerId)?.goal || String(blockerId);

  const toggleCandidate = (candidateId) => {
    setSaveError(null);
    const id = String(candidateId);
    setSelected((prev) => {
      const base = prev ?? savedBlockedBy;
      return base.includes(id) ? base.filter((entry) => entry !== id) : [...base, id];
    });
  };

  const handleDropdownChange = (next) => {
    setSaveError(null);
    setSelected((next || []).map(String));
  };

  const handleSave = async () => {
    if (!task?.id || !isDirty || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateTask(activeProjectId, task.id, { blockedBy: active });
      setSelected(null);
    } catch (e) {
      setSaveError(e?.message || 'Could not save dependencies.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!task?.id || savedBlockedBy.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateTask(activeProjectId, task.id, { blockedBy: [] });
      setSelected(null);
    } catch (e) {
      setSaveError(e?.message || 'Could not clear dependencies.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!task?.id) return null;

  return (
    <section aria-label="Task dependencies" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted font-mono">
          Blocked by
        </h2>
        {active.length > 0 && (
          <span className="text-[10px] font-mono text-text-muted">
            Waiting on {active.length} task{active.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {active.length > 0 && (
        <ul aria-label="Selected blockers" className="space-y-1">
          {active.map((blockerId) => (
            <li
              key={blockerId}
              className="flex items-center justify-between gap-2 px-2 py-1 bg-surface-container border border-border-standard rounded text-[11px] font-mono"
            >
              <span className="truncate text-on-surface">{formatTaskKey(blockerId)}</span>
              <span className="shrink-0 text-text-muted">{blockerStatus(blockerId)}</span>
              <button
                type="button"
                onClick={() => toggleCandidate(blockerId)}
                disabled={disabled || isSaving}
                aria-label={`Remove ${blockerLabel(blockerId)}`}
                className="shrink-0 px-1 text-text-muted hover:text-error disabled:opacity-40 cursor-pointer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidates.length === 0 ? (
        <p className="text-[11px] font-mono text-text-muted">No other active tasks to wait on.</p>
      ) : (
        <MultiSelectDropdown
          options={options}
          selected={active}
          onChange={handleDropdownChange}
          filterOptions={filterOptions}
          placeholder="Select tasks to wait on..."
          searchPlaceholder="Search by title or #KB-..."
          disabled={disabled || isSaving}
          emptyText="No other active tasks to wait on."
          noResultsText="No tasks match your search."
          showChips={false}
          ariaLabel="Prerequisite tasks"
        />
      )}

      {saveError && (
        <p role="alert" className="text-[11px] font-mono text-error">
          {saveError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || isSaving || !isDirty}
          className="px-3 py-1.5 min-h-[44px] bg-primary text-on-primary rounded-sm text-[11px] font-bold uppercase font-mono hover:brightness-110 disabled:opacity-40 cursor-pointer"
        >
          {isSaving ? 'Saving...' : 'Save dependencies'}
        </button>
        {savedBlockedBy.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || isSaving}
            className="px-3 py-1.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-[11px] font-mono uppercase text-on-surface cursor-pointer disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>
    </section>
  );
}
