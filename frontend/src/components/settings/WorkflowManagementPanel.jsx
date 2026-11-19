import React, { useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { SelectDropdown } from '../common/SelectDropdown';
import { TruncatedText } from '../common/TruncatedText';

/***
 * MARK: WorkflowManagementPanel
 * @description Manages named workflows for the active project, allowing creating,
 * editing, switching, setting default, and deleting workflows.
 * @param {Object} props
 * @param {string} props.projectId
 * @example <WorkflowManagementPanel projectId="proj-1" />
 ***/
export function WorkflowManagementPanel({ projectId }) {
  const {
    projectWorkflows = [],
    activeWorkflowId,
    switchWorkflow,
    createWorkflow,
    updateWorkflowDetails,
    deleteWorkflow,
  } = useKainBain();

  const [newWfName, setNewWfName] = useState('');
  const [newWfIsDefault, setNewWfIsDefault] = useState(false);
  const [newWfBaseBranch, setNewWfBaseBranch] = useState('');
  const [template, setTemplate] = useState('standard');
  const [isCreating, setIsCreating] = useState(false);
  const [editingWfId, setEditingWfId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editingBaseWfId, setEditingBaseWfId] = useState(null);
  const [editBaseBranch, setEditBaseBranch] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  // Obvious-mistake hint only (the server owns full git-name validation
  // and its 400 surfaces as the status error below).
  const baseBranchHint = (value) => {
    if (!value) return '';
    if (/\s/.test(value)) return 'Branch names cannot contain spaces.';
    if (value.startsWith('-') || value.startsWith('/') || value.startsWith('.')) {
      return 'Branch names cannot start with -, / or .';
    }
    return '';
  };

  const getTemplateStages = (tpl) => {
    if (tpl === 'fast') {
      return [
        { id: '1', name: 'Task Spec', type: 'human', prompt: 'Define requirement' },
        { id: '2', name: 'Implementation', type: 'agent', prompt: 'Execute code changes' },
        { id: '3', name: 'Verification', type: 'ci', command: 'npm test' },
        { id: '4', name: 'Deploy', type: 'ci', command: './deploy.sh --prod' },
      ];
    }
    if (tpl === 'ci') {
      return [
        { id: '1', name: 'Lint & Audit', type: 'ci', command: 'npm run lint' },
        { id: '2', name: 'Unit Tests', type: 'ci', command: 'npm test' },
        { id: '3', name: 'Approval Gate', type: 'human', prompt: 'Approve deployment' },
        { id: '4', name: 'Deploy', type: 'ci', command: './deploy.sh --prod' },
      ];
    }
    // Standard 6-stage
    return [
      { id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas' },
      { id: '2', name: 'Technical Elab', type: 'agent', prompt: 'Elaborate specs' },
      { id: '3', name: 'Plan', type: 'agent', prompt: 'Create plan' },
      { id: '4', name: 'Review Plan', type: 'human', prompt: 'Review plan' },
      { id: '5', name: 'In Progress', type: 'agent', prompt: 'Execute task' },
      { id: '6', name: 'Deploy', type: 'ci', command: './deploy.sh --prod' },
    ];
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newWfName.trim() || !projectId) return;
    const hint = baseBranchHint(newWfBaseBranch.trim());
    if (hint) {
      setStatusMsg({ type: 'error', text: hint });
      return;
    }
    setIsCreating(true);
    try {
      const stages = getTemplateStages(template);
      await createWorkflow(projectId, {
        name: newWfName.trim(),
        stages,
        isDefault: newWfIsDefault,
        baseBranch: newWfBaseBranch.trim() || undefined,
      });
      setNewWfName('');
      setNewWfIsDefault(false);
      setNewWfBaseBranch('');
      setStatusMsg({ type: 'success', text: 'Workflow created successfully' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to create workflow' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEdit = async (wfId) => {
    if (!editName.trim() || !projectId) return;
    try {
      await updateWorkflowDetails(projectId, wfId, { name: editName.trim() });
      setEditingWfId(null);
      setEditName('');
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update workflow' });
    }
  };

  const handleSaveBaseEdit = async (wfId) => {
    if (!projectId) return;
    const hint = baseBranchHint(editBaseBranch.trim());
    if (hint) {
      setStatusMsg({ type: 'error', text: hint });
      return;
    }
    try {
      // Blank clears the override back to the repo default.
      await updateWorkflowDetails(projectId, wfId, { baseBranch: editBaseBranch.trim() });
      setEditingBaseWfId(null);
      setEditBaseBranch('');
      setStatusMsg({
        type: 'success',
        text: 'Base branch updated — in-flight tasks keep the base branch they were created with.',
      });
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update base branch' });
    }
  };

  const handleDelete = async (wfId, wfName) => {
    if (!projectId) return;
    if (projectWorkflows.length <= 1) {
      setStatusMsg({ type: 'error', text: 'Cannot delete the only workflow in a project' });
      return;
    }
    if (!window.confirm(`Are you sure you want to delete workflow "${wfName}"?`)) return;
    try {
      await deleteWorkflow(projectId, wfId);
      setStatusMsg({ type: 'success', text: `Deleted workflow "${wfName}"` });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to delete workflow' });
    }
  };

  const stageTypeColor = (type) => {
    if (type === 'agent') return 'text-primary border-primary/30 bg-primary/10';
    if (type === 'human') return 'text-[#9acbff] border-[#9acbff]/30 bg-[#9acbff]/10';
    if (type === 'ci') return 'text-[#ffb77f] border-[#ffb77f]/30 bg-[#ffb77f]/10';
    return 'text-text-muted border-border-standard bg-surface-deep';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold uppercase tracking-tight text-text-high mb-1 flex items-center gap-2 font-headline-md">
          <span className="text-primary">🔀</span> Named Workflows & Pipelines
        </h2>
        <p className="text-xs text-text-muted">
          Manage multiple named workflows per project. Switch pipelines for different task tracks
          (e.g. Features, Hotfixes, Fast-Track).
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-3 text-xs rounded-sm border break-words ${
            statusMsg.type === 'error'
              ? 'bg-error/10 border-error text-error'
              : 'bg-primary/10 border-primary text-primary'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Create Workflow Card */}
      <div className="bg-surface-container border border-border-standard rounded-sm p-4 space-y-4 max-w-3xl">
        <h3 className="text-xs font-bold uppercase text-text-high tracking-wider flex items-center gap-1.5">
          <span>➕</span> Create New Named Workflow
        </h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-wf-name"
                className="block text-[10px] font-bold uppercase text-text-muted mb-1"
              >
                Workflow Name
              </label>
              <input
                id="new-wf-name"
                type="text"
                value={newWfName}
                onChange={(e) => setNewWfName(e.target.value)}
                placeholder="e.g. Hotfix Pipeline, Release Track..."
                className="w-full p-2 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label
                htmlFor="new-wf-template"
                className="block text-[10px] font-bold uppercase text-text-muted mb-1"
              >
                Initial Pipeline Template
              </label>
              <SelectDropdown
                id="new-wf-template"
                ariaLabel="Initial Pipeline Template"
                className="block w-full min-w-0"
                value={template}
                onChange={setTemplate}
                options={[
                  {
                    value: 'standard',
                    label: 'Standard (5 Stages: Idea → Elab → Plan → Review → Exec)',
                  },
                  { value: 'fast', label: 'Fast Track (3 Stages: Spec → Implement → CI)' },
                  { value: 'ci', label: 'CI Verification (3 Stages: Lint → Test → Signoff)' },
                ]}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-wf-base-branch"
              className="block text-[10px] font-bold uppercase text-text-muted mb-1"
            >
              Base branch
            </label>
            <input
              id="new-wf-base-branch"
              type="text"
              value={newWfBaseBranch}
              onChange={(e) => setNewWfBaseBranch(e.target.value)}
              placeholder="Repo default (e.g. main) — or a feature branch"
              className="w-full p-2 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono outline-none focus:border-primary"
            />
            <p className="mt-1 text-[10px] text-text-muted">
              New tasks branch off this branch and merge back into it. Blank means the
              repo&apos;s default branch.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newWfIsDefault}
                onChange={(e) => setNewWfIsDefault(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0"
              />
              <span>Set as project default workflow</span>
            </label>

            <button
              type="submit"
              disabled={isCreating || !newWfName.trim()}
              className="px-4 py-2 bg-primary text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isCreating ? 'Creating...' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>

      {/* Workflows List */}
      <div className="space-y-3 max-w-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-text-high tracking-wider">
            Existing Workflows ({projectWorkflows.length})
          </h3>
        </div>

        {projectWorkflows.map((wf) => {
          const isActive = activeWorkflowId === wf.id;
          const isEditing = editingWfId === wf.id;
          const isEditingBase = editingBaseWfId === wf.id;

          return (
            <div
              key={wf.id}
              className={`p-4 rounded-sm border transition-all min-w-0 ${
                isActive
                  ? 'bg-surface-container-high border-primary shadow-sm'
                  : 'bg-surface-container border-border-standard'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {isEditing ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="min-w-0 flex-1 px-2 py-1 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono outline-none focus:border-primary"
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- editor appears from the user's explicit rename action
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(wf.id)}
                        className="shrink-0 px-2 py-1 bg-primary text-on-primary text-[10px] font-bold uppercase rounded-sm cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingWfId(null)}
                        className="shrink-0 px-2 py-1 bg-surface-deep text-text-muted text-[10px] font-bold uppercase rounded-sm cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <TruncatedText
                        text={wf.name}
                        className="font-bold text-sm text-text-high"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingWfId(wf.id);
                          setEditName(wf.name);
                        }}
                        className="shrink-0 text-text-muted hover:text-on-surface text-xs cursor-pointer"
                        title="Rename workflow"
                        aria-label={`Rename workflow ${wf.name}`}
                      >
                        ✏️
                      </button>
                    </div>
                  )}

                  {isActive && (
                    <span className="shrink-0 px-2 py-0.5 text-[9px] font-bold uppercase rounded-sm bg-primary text-on-primary font-mono">
                      Active
                    </span>
                  )}
                  {wf.isDefault && (
                    <span className="shrink-0 px-2 py-0.5 text-[9px] font-bold uppercase rounded-sm bg-surface-deep border border-border-standard text-text-muted font-mono">
                      Default
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap max-w-full shrink-0 items-center gap-2">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => switchWorkflow(projectId, wf.id)}
                      className="px-3 py-1 bg-surface-deep hover:bg-primary hover:text-on-primary border border-border-standard text-xs font-bold uppercase rounded-sm transition-colors cursor-pointer"
                    >
                      Switch to Active
                    </button>
                  )}
                  {!wf.isDefault && (
                    <button
                      type="button"
                      onClick={() => updateWorkflowDetails(projectId, wf.id, { isDefault: true })}
                      className="px-2.5 py-1 text-text-muted hover:text-on-surface text-[10px] font-bold uppercase border border-border-standard rounded-sm cursor-pointer"
                    >
                      Make Default
                    </button>
                  )}
                  {projectWorkflows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(wf.id, wf.name)}
                      className="px-2.5 py-1 text-error hover:bg-error/10 text-[10px] font-bold uppercase border border-error/30 rounded-sm transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Base branch row */}
              <div className="flex min-w-0 flex-wrap items-center gap-2 pb-1">
                {isEditingBase ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={editBaseBranch}
                      onChange={(e) => setEditBaseBranch(e.target.value)}
                      placeholder="Repo default (blank)"
                      aria-label={`Base branch for ${wf.name}`}
                      className="min-w-0 flex-1 px-2 py-1 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono outline-none focus:border-primary"
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- editor appears from the user's explicit edit action
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveBaseEdit(wf.id)}
                      className="shrink-0 px-2 py-1 bg-primary text-on-primary text-[10px] font-bold uppercase rounded-sm cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBaseWfId(null)}
                      className="shrink-0 px-2 py-1 bg-surface-deep text-text-muted text-[10px] font-bold uppercase rounded-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[11px] text-text-muted font-mono">
                      Base branch:{' '}
                      <span className="text-on-surface font-bold">
                        {wf.baseBranch || 'repo default'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBaseWfId(wf.id);
                        setEditBaseBranch(wf.baseBranch || '');
                      }}
                      className="shrink-0 text-text-muted hover:text-on-surface text-xs cursor-pointer"
                      title="Edit base branch"
                      aria-label={`Edit base branch for ${wf.name}`}
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>

              {/* Stages Pill Strip */}
              <div className="flex flex-wrap min-w-0 items-center gap-1.5 pt-1">
                {wf.stages?.map((stage, idx) => (
                  <React.Fragment key={stage.id || idx}>
                    <div
                      className={`px-2 py-0.5 text-[10px] font-mono rounded-sm border flex min-w-0 max-w-full items-center gap-1 ${stageTypeColor(
                        stage.type,
                      )}`}
                    >
                      <span className="shrink-0 opacity-60">{idx + 1}.</span>
                      <TruncatedText text={stage.name} className="font-medium" />
                      <span className="shrink-0 text-[8px] uppercase tracking-wider opacity-75">
                        ({stage.type})
                      </span>
                    </div>
                    {idx < wf.stages.length - 1 && (
                      <span className="text-text-muted text-[10px]">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
