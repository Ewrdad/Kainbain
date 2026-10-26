import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { MarkdownViewer } from '../common/MarkdownViewer';
import { InfoTooltip } from '../common/InfoTooltip';
import { useKbReferenceData, resolveReference } from '../../hooks/useKbReferenceData';
import { KBReferenceSelect } from './KBReferenceSelect';

/***
 * MARK: STAGE_SKILLS_MAX_CHARS
 * @description Client-side mirror of the server injection cap
 *   (KAINBAIN_STAGE_SKILLS_MAX_CHARS, default 16000). Used only for the live
 *   context-budget readout; the authoritative cap is enforced server-side when
 *   the prompt is curated.
 ***/
export const STAGE_SKILLS_MAX_CHARS = 16000;

/***
 * MARK: estimateSkillsChars
 * @description Client-side estimate of the injected skill chars for a stage:
 *   direct skills contribute KB_config context + body; option skills contribute a
 *   compact manifest entry (~200 chars). Mirrors api/skills/skillInjection.js
 *   accounting closely enough for the UI budget bar.
 * @param {Array<Object>} [skills] - stage.skills attachments.
 * @param {Map<string, Object>} [skillContent] - name -> raw skill (markdown/config).
 * @returns {number} Estimated injected char count.
 ***/
export function estimateSkillsChars(skills = [], skillContent = new Map()) {
  let total = 0;
  for (const attachment of skills) {
    if (!attachment || !attachment.name) continue;
    const raw = skillContent.get(attachment.name);
    const mode = attachment.mode || 'direct';
    if (mode === 'option') {
      total += 120 + (raw?.description || '').length;
    } else {
      const body = raw?.body ?? raw?.markdown ?? '';
      const context = raw?.config?.context || '';
      total += (`## ${attachment.name}\n` + (context ? `${context}\n\n` : '') + body).length;
    }
  }
  return total;
}

/***
 * MARK: findKeyByKbRef
 * @description First keyword key in a KB_config keywords map whose entry
 *   declares the given kbRef kind (undefined when none does).
 * @param {Object} [kbKeywords] - Raw KB_config keywords map.
 * @param {'project'|'workflow'|'stage'} kind
 * @returns {string|undefined}
 ***/
export function findKeyByKbRef(kbKeywords, kind) {
  if (!kbKeywords || typeof kbKeywords !== 'object') return undefined;
  return Object.keys(kbKeywords).find(
    (key) =>
      kbKeywords[key] && typeof kbKeywords[key] === 'object' && kbKeywords[key].kbRef === kind,
  );
}

/***
 * MARK: hasKbRefKind
 * @description True when any keyword in the map declares one of the given
 *   kbRef kinds (used to decide whether KB reference data is needed at all).
 ***/
export function hasKbRefKind(kbKeywords, kinds) {
  if (!kbKeywords || typeof kbKeywords !== 'object') return false;
  return Object.keys(kbKeywords).some((key) => {
    const entry = kbKeywords[key];
    return entry && typeof entry === 'object' && kinds.includes(entry.kbRef);
  });
}

/***
 * MARK: storedOrDefault
 * @description The effective value of a keyword for cascade resolution: the
 *   stage's stored override when it is a non-empty string, otherwise the
 *   KB_config default value, otherwise ''.
 ***/
export function storedOrDefault(attachment, kbKeywords, key) {
  if (!key) return '';
  const override = attachment?.config?.[key];
  if (typeof override === 'string' && override.trim() !== '') return override;
  const entry = kbKeywords?.[key];
  return entry && typeof entry === 'object' && typeof entry.value === 'string' ? entry.value : '';
}

/***
 * MARK: keywordDefaultValue
 * @description Display default for one KB_config keyword entry in the
 *   free-text config editor. Tolerates every entry shape the registry
 *   accepts (plain string, finite number, boolean, or `{ value }`), mirroring
 *   the engine's `normalizeSkillKeywords` coercion so the input shows the
 *   same default the agent prompt receives. Anything else (objects without a
 *   scalar value, arrays, null) yields '' instead of leaking
 *   "[object Object]" into the input.
 * @param {*} entry - One `config.keywords[key]` value.
 * @returns {string}
 ***/
export function keywordDefaultValue(entry) {
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'number' && Number.isFinite(entry)) return String(entry);
  if (typeof entry === 'boolean') return String(entry);
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return keywordDefaultValue(entry.value);
  }
  return '';
}

/***
 * MARK: keywordStoredText
 * @description The stage's stored text override for one keyword when it is a
 *   string, otherwise undefined so the caller falls back to
 *   `keywordDefaultValue`. Non-string stored values (numbers/objects via the
 *   raw JSON editor) never reach the text input, which would warn or render
 *   "[object Object]".
 * @param {Object} [attachment] - stage.skills[i] attachment.
 * @param {string} key - Keyword key.
 * @returns {string|undefined}
 ***/
export function keywordStoredText(attachment, key) {
  const stored = attachment?.config?.[key];
  return typeof stored === 'string' ? stored : undefined;
}

/**
 * MARK: resolveProjectIdForCascade
 * @description Resolves the effective target project id for the workflow/stage
 *   cascade: '' and the {{project}} built-in mean "the project being edited"
 *   (activeProjectId); anything else must resolve against the known projects
 *   (id, case-insensitive name, or slug) — an unresolvable stored value yields
 *   null so dependent dropdowns can be disabled with an explanation instead of
 *   silently misfiring.
 * @param {Object} opts
 * @param {string} [opts.parentValue] - Stored/KB default of the project keyword.
 * @param {Array<Object>} [opts.projects] - Known projects.
 * @param {string|null} [opts.activeProjectId] - Project being edited.
 * @returns {string|null}
 ***/
export function resolveProjectIdForCascade({
  parentValue = '',
  projects = [],
  activeProjectId = null,
} = {}) {
  const value = typeof parentValue === 'string' ? parentValue.trim() : '';
  if (value === '' || value === '{{project}}') return activeProjectId || null;
  const match = resolveReference({ kind: 'project', value, entities: { projects, workflows: [] } });
  return match ? match.id : null;
}

/***
 * MARK: resolveWorkflowIdForCascade
 * @description Resolves the effective target workflow id for the stage
 *   cascade from the workflow keyword's effective value (exact id, then
 *   case-insensitive name) against the known workflows of the resolved
 *   project. Templates and unresolvable values yield null.
 ***/
export function resolveWorkflowIdForCascade({ parentValue = '', workflows = [] } = {}) {
  const value = typeof parentValue === 'string' ? parentValue.trim() : '';
  if (value === '' || value.includes('{{')) return null;
  const match = resolveReference({
    kind: 'workflow',
    value,
    entities: { projects: [], workflows },
  });
  return match ? match.id : null;
}

/***
 * MARK: dependentKeys
 * @description Transitive keys whose `dependsOn` chain reaches changedKey —
 *   cleared when a parent selector changes so stale child overrides never
 *   survive a parent switch (e.g. changing targetProject resets
 *   targetWorkflow and targetStage).
 * @param {Object} [kbKeywords] - Raw KB_config keywords map.
 * @param {string} changedKey
 * @returns {Array<string>}
 ***/
export function dependentKeys(kbKeywords, changedKey) {
  if (!kbKeywords || typeof kbKeywords !== 'object') return [];
  const byDependsOn = {};
  for (const [key, entry] of Object.entries(kbKeywords)) {
    const parent = entry && typeof entry === 'object' ? entry.dependsOn : undefined;
    if (typeof parent === 'string' && parent) {
      if (!Array.isArray(byDependsOn[parent])) byDependsOn[parent] = [];
      byDependsOn[parent].push(key);
    }
  }
  const result = [];
  const queue = Array.isArray(byDependsOn[changedKey]) ? [...byDependsOn[changedKey]] : [];
  while (queue.length > 0) {
    const key = queue.shift();
    if (!result.includes(key)) {
      result.push(key);
      if (Array.isArray(byDependsOn[key])) queue.push(...byDependsOn[key]);
    }
  }
  return result;
}

/***
 * MARK: resolveSkillTargets
 * @description Resolves every kbRef-declared keyword of one attachment against
 *   known entities for the preview's "Resolved targets" summary. Values come
 *   from the stage override, falling back to the KB_config default; the
 *   {{project}} built-in resolves against activeProjectId (marked builtin);
 *   anything else uses the shared resolver (workflows must already be scoped
 *   to the effective project by the caller). Unresolvable values are returned
 *   with resolved: null so the UI can warn instead of silently misfiring.
 * @param {Object} opts
 * @param {Object} [opts.attachment] - stage.skills[i] attachment.
 * @param {Object} [opts.kbKeywords] - Raw KB_config keywords (with kbRef metadata).
 * @param {Array<Object>} [opts.projects] - Known projects.
 * @param {Array<Object>} [opts.workflows] - Workflows of the effective project (with stages).
 * @param {string|null} [opts.activeProjectId]
 * @param {string|null} [opts.projectId] - Pre-resolved effective project id.
 * @returns {Array<{ key: string, kind: string, value: string, resolved: {id,label}|null, builtin: boolean }>}
 ***/
export function resolveSkillTargets({
  attachment,
  kbKeywords = {},
  projects = [],
  workflows = [],
  activeProjectId = null,
  projectId = null,
} = {}) {
  if (!kbKeywords || typeof kbKeywords !== 'object') return [];
  const config = attachment?.config || {};
  const workflowKey = findKeyByKbRef(kbKeywords, 'workflow');
  const targets = [];
  for (const [key, entry] of Object.entries(kbKeywords)) {
    const kind = entry && typeof entry === 'object' ? entry.kbRef : undefined;
    if (kind !== 'project' && kind !== 'workflow' && kind !== 'stage') continue;
    const value = storedOrDefault({ config }, kbKeywords, key);
    if (value.trim() === '') continue;
    let resolved = null;
    let builtin = false;
    if (value.trim() === '{{project}}') {
      builtin = true;
      const match = projects.find((p) => p && p.id === activeProjectId) || null;
      resolved = match ? { id: match.id, label: `${match.name ?? match.id} (${match.id})` } : null;
    } else {
      const workflowId =
        kind === 'stage'
          ? resolveWorkflowIdForCascade({
              parentValue: storedOrDefault({ config }, kbKeywords, workflowKey),
              workflows,
            })
          : null;
      resolved = resolveReference({ kind, value, entities: { projects, workflows }, workflowId });
    }
    targets.push({ key, kind, value, resolved, builtin, projectId });
  }
  return targets;
}

/***
 * @description The per-stage Skills panel in the stage editor. Lets an operator:
 *   - pick one or more skills from the library (GET /skills, searchable, multi-add),
 *   - choose the delivery mode per skill: OPTION (agent may self-read the skill file)
 *     or DIRECT (skill body is injected into the curated prompt, always visible),
 *   - override KB_config keyword values per stage (e.g. targetStage: "Intake");
 *     keywords that declare kbRef metadata (project/workflow/stage) render as
 *     cascading KB-entity dropdowns populated from KainBain's known data
 *     (canonical ids are stored; a manual-entry fallback and legacy-value
 *     tolerance keep every legacy config working),
 *   - plus a free-form JSON escape hatch for unknown config fields,
 *   - preview the resolved skill (Modal + MarkdownViewer),
 *   - see a live context-size readout against the injection budget.
 * Mutations flow through `onChange` (handleUpdateStage) so saves ride the existing
 * debounced saveStages path — no new persistence route.
 *
 * @example <StageSkillsPanel stage={stage} skills={skills} onChange={(u) => handleUpdateStage(stage.id, u)} />
 ***/

/***
 * MARK: PreviewTargetRow
 * @description One line of the preview modal's "Resolved targets" summary:
 *   the keyword, its resolved "Name (id)" (with a note for the {{project}}
 *   built-in), or an unresolvable-value warning when no known entity matches.
 ***/
function PreviewTargetRow({ target }) {
  return (
    <li className="text-[9px] font-mono flex items-center gap-2">
      <span className="text-text-muted w-28 shrink-0 truncate">{target.key}</span>
      {target.resolved ? (
        <span className="text-on-surface">
          {target.resolved.label}
          {target.builtin && <span className="text-text-muted"> (current project)</span>}
        </span>
      ) : (
        <span
          className="text-ochre"
          title="No matching known entity — the value is kept verbatim and resolved at run time"
        >
          ⚠ unresolvable value: {target.value}
        </span>
      )}
    </li>
  );
}

export function StageSkillsPanel({
  stage,
  skills = [],
  skillsLoading = false,
  skillsError = null,
  fetchSkills,
  getSkillByName,
  activeProjectId,
  onChange,
  maxChars = STAGE_SKILLS_MAX_CHARS,
}) {
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedConfig, setExpandedConfig] = useState({});
  const [jsonEditorOpen, setJsonEditorOpen] = useState({});
  const [previewName, setPreviewName] = useState(null);
  const [previewMarkdown, setPreviewMarkdown] = useState('');
  const [previewConfig, setPreviewConfig] = useState({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rawConfigDraft, setRawConfigDraft] = useState('');
  const [rawConfigError, setRawConfigError] = useState(null);

  // KB known data behind the cascading reference selectors (projects once,
  // workflows lazily per project). See useKbReferenceData.
  const {
    projects,
    projectsLoading,
    projectsError,
    reloadProjects,
    loadWorkflows,
    workflowsFor,
    stagesFor,
    workflowsLoadingFor,
    workflowsErrorFor,
  } = useKbReferenceData({ activeProjectId });

  const attachments = useMemo(
    () => (Array.isArray(stage.skills) ? stage.skills : []),
    [stage.skills],
  );
  const attachedNames = useMemo(() => new Set(attachments.map((s) => s.name)), [attachments]);

  // Content cache for char estimation: lazily fetch raw skill content for each
  // attached skill (body size feeds the budget readout).
  const [skillContent, setSkillContent] = useState(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const attachment of attachments) {
        if (skillContent.has(attachment.name)) continue;
        if (typeof getSkillByName !== 'function') continue;
        const raw = await getSkillByName(attachment.name, activeProjectId);
        if (cancelled) return;
        if (raw) {
          setSkillContent((prev) => {
            const next = new Map(prev);
            next.set(attachment.name, raw);
            return next;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the attachment set changes
  }, [attachments.map((a) => `${a.name}:${a.mode}`).join('|')]);

  // Lazily fetch workflows for every project referenced by a workflow/stage
  // kbRef keyword (loadWorkflows is idempotent + cached per project). Stages
  // ride the workflows payload.
  const neededWorkflowProjectIds = useMemo(() => {
    const ids = new Set();
    for (const attachment of attachments) {
      const kbKeywords = skillContent.get(attachment.name)?.config?.keywords || {};
      if (!hasKbRefKind(kbKeywords, ['workflow', 'stage'])) continue;
      const projectKey = findKeyByKbRef(kbKeywords, 'project');
      const pid = resolveProjectIdForCascade({
        parentValue: storedOrDefault(attachment, kbKeywords, projectKey),
        projects,
        activeProjectId,
      });
      if (pid) ids.add(pid);
    }
    return [...ids];
  }, [attachments, skillContent, projects, activeProjectId]);

  useEffect(() => {
    for (const pid of neededWorkflowProjectIds) {
      loadWorkflows(pid);
    }
  }, [neededWorkflowProjectIds, loadWorkflows]);

  const usedChars = useMemo(
    () => estimateSkillsChars(attachments, skillContent),
    [attachments, skillContent],
  );
  const usagePct = maxChars > 0 ? Math.min(100, Math.round((usedChars / maxChars) * 100)) : 0;
  const overBudget = maxChars > 0 && usedChars > maxChars;
  let barColorClass = 'bg-primary';
  if (overBudget) {
    barColorClass = 'bg-red-500';
  } else if (usagePct > 80) {
    barColorClass = 'bg-ochre';
  }

  const availableSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter(
      (s) =>
        !attachedNames.has(s.name) &&
        (!q || s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)),
    );
  }, [skills, search, attachedNames]);

  /***
   * MARK: updateAttachments
   * @description Writes a new skills array for this stage through onChange.
   ***/
  const updateAttachments = (next) => onChange?.({ skills: next });

  /***
   * MARK: addSkill
   * @description Attaches a skill from the library with its default mode.
   ***/
  const addSkill = (descriptor) => {
    if (attachedNames.has(descriptor.name)) return;
    const defaultsMode = descriptor.config?.defaults?.mode === 'option' ? 'option' : 'direct';
    updateAttachments([...attachments, { name: descriptor.name, mode: defaultsMode, config: {} }]);
  };

  /***
   * MARK: removeSkill
   ***/
  const removeSkill = (name) => {
    updateAttachments(attachments.filter((a) => a.name !== name));
  };

  /***
   * MARK: setSkillMode
   ***/
  const setSkillMode = (name, mode) => {
    updateAttachments(attachments.map((a) => (a.name === name ? { ...a, mode } : a)));
  };

  /***
   * MARK: setSkillConfigValue
   * @description Sets one keyword override while preserving unknown config
   *   fields. For kbRef-declared keywords with dependents, changing a parent
   *   value also clears the stored overrides of every transitive dependent
   *   (targetProject → targetWorkflow → targetStage) so stale child values
   *   never survive a parent switch; cleared children fall back to their
   *   KB_config defaults.
   ***/
  const setSkillConfigValue = (name, key, value) => {
    updateAttachments(
      attachments.map((a) => {
        if (a.name !== name) return a;
        const nextConfig = { ...(a.config || {}), [key]: value };
        const oldValue = (a.config || {})[key];
        if (oldValue !== value) {
          const kbKeywords = skillContent.get(name)?.config?.keywords || {};
          for (const dependent of dependentKeys(kbKeywords, key)) {
            delete nextConfig[dependent];
          }
        }
        return { ...a, config: nextConfig };
      }),
    );
  };

  /***
   * MARK: openRawConfigEditor
   ***/
  const openRawConfigEditor = (attachment) => {
    setRawConfigDraft(JSON.stringify(attachment.config || {}, null, 2));
    setRawConfigError(null);
    setJsonEditorOpen((prev) => ({ ...prev, [attachment.name]: true }));
  };

  /***
   * MARK: applyRawConfig
   ***/
  const applyRawConfig = (name) => {
    try {
      const parsed = JSON.parse(rawConfigDraft);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setRawConfigError('Config must be a JSON object');
        return;
      }
      setRawConfigError(null);
      setJsonEditorOpen((prev) => ({ ...prev, [name]: false }));
      updateAttachments(attachments.map((a) => (a.name === name ? { ...a, config: parsed } : a)));
    } catch (err) {
      setRawConfigError(err.message);
    }
  };

  /***
   * MARK: openPreview
   * @description Loads the raw skill (markdown + config) and opens the preview
   *   modal. Also prefetches the workflow data needed by the "Resolved
   *   targets" summary when the skill declares workflow/stage kbRef keywords.
   ***/
  const openPreview = async (name) => {
    setPreviewName(name);
    setPreviewLoading(true);
    const raw =
      typeof getSkillByName === 'function' ? await getSkillByName(name, activeProjectId) : null;
    setPreviewMarkdown(raw?.markdown || `*Skill "${name}" not available.*`);
    setPreviewConfig(raw?.config || {});
    setPreviewLoading(false);
    const kbKeywords = raw?.config?.keywords || {};
    if (hasKbRefKind(kbKeywords, ['workflow', 'stage'])) {
      const projectKey = findKeyByKbRef(kbKeywords, 'project');
      const pid = resolveProjectIdForCascade({
        parentValue: storedOrDefault(
          attachments.find((a) => a.name === name),
          kbKeywords,
          projectKey,
        ),
        projects,
        activeProjectId,
      });
      if (pid) loadWorkflows(pid);
    }
  };

  /***
   * MARK: previewResolvedText
   * @description Applies the KB_config keywords + stage overrides to the preview
   *   body (mirrors the engine's layered substitution; built-ins resolve via the
   *   stage/project context shown below the preview).
   ***/
  const previewResolvedText = useMemo(() => {
    const attachment = attachments.find((a) => a.name === previewName);
    const keywordMap = {
      ...(previewConfig.keywords || {}),
    };
    /* eslint-disable security/detect-object-injection -- keys come from Object.entries of the parsed KB_config */
    for (const [key, entry] of Object.entries(previewConfig.keywords || {})) {
      keywordMap[key] = keywordDefaultValue(entry);
    }
    /* eslint-enable security/detect-object-injection */
    const overrides = attachment?.config || {};
    const merged = { ...keywordMap, ...overrides };
    const context = previewConfig.context || '';
    let text = context ? `${context}\n\n${previewMarkdown}` : previewMarkdown;
    for (const [key, value] of Object.entries(merged)) {
      text = text.split(`{{${key}}}`).join(String(value));
    }
    return text;
  }, [previewName, previewMarkdown, previewConfig, attachments]);

  const previewSkill = skills.find((s) => s.name === previewName);

  // "Resolved targets" summary data for the preview modal (kbRef keys only).
  const previewTargets = useMemo(() => {
    if (!previewName) return [];
    const attachment = attachments.find((a) => a.name === previewName);
    const kbKeywords = previewConfig.keywords || {};
    if (!hasKbRefKind(kbKeywords, ['project', 'workflow', 'stage'])) return [];
    const projectKey = findKeyByKbRef(kbKeywords, 'project');
    const cascadeProjectId = resolveProjectIdForCascade({
      parentValue: storedOrDefault(attachment, kbKeywords, projectKey),
      projects,
      activeProjectId,
    });
    const workflows = cascadeProjectId ? workflowsFor(cascadeProjectId) : [];
    return resolveSkillTargets({
      attachment,
      kbKeywords,
      projects,
      workflows,
      activeProjectId,
      projectId: cascadeProjectId,
    });
  }, [previewName, previewConfig, attachments, projects, activeProjectId, workflowsFor]);

  return (
    <div className="space-y-1" data-testid={`stage-skills-panel-${stage.id}`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
          Stage Skills
        </span>
        <InfoTooltip
          title="Stage Skills"
          description="Attach reusable skill instructions to this stage. Option mode injects only a manifest (the agent may read the skill file itself); Direct mode injects the full skill body into the prompt."
          behindTheScenes="Delivered by the Prompt Curation Engine; direct bodies capped by KAINBAIN_STAGE_SKILLS_MAX_CHARS (16k chars)"
          position="left"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-mono text-text-muted">{attachments.length} attached</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Refresh skills library for ${stage.name}`}
            onClick={() => typeof fetchSkills === 'function' && fetchSkills(activeProjectId)}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono text-text-muted hover:text-on-surface border border-border-standard hover:border-primary transition-colors cursor-pointer"
          >
            ⟳
          </button>
          <button
            type="button"
            aria-label={`Add skills to ${stage.name}`}
            onClick={() => {
              setPickerOpen((prev) => !prev);
              if (!pickerOpen && typeof fetchSkills === 'function') {
                fetchSkills(activeProjectId);
              }
            }}
            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-on-surface bg-surface-container border border-border-standard hover:border-primary transition-colors cursor-pointer"
          >
            + Add Skill
          </button>
        </div>
      </div>

      {/* Live context budget readout */}
      <div className="flex items-center gap-2" data-testid="skills-budget-readout">
        <div className="flex-1 h-1.5 rounded bg-surface-container overflow-hidden border border-border-standard">
          <div
            className={`h-full transition-all ${barColorClass}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <span
          className={`text-[8px] font-mono whitespace-nowrap ${overBudget ? 'text-red-500 font-bold' : 'text-text-muted'}`}
        >
          {usedChars}/{maxChars} chars
        </span>
      </div>

      {/* Attachment list */}
      {attachments.length === 0 && (
        <p className="text-[9px] text-text-muted italic">
          No skills attached. The stage prompt runs without skill injection.
        </p>
      )}
      {attachments.map((attachment) => {
        // Prefer the fully loaded skill content (markdown + KB_config) when it
        // has been fetched; fall back to the library descriptor (which already
        // carries `config.keywords`) so configured settings such as
        // outputFile/minQuestions are visible immediately on attach.
        const librarySkill = (Array.isArray(skills) ? skills : []).find(
          (s) => s && s.name === attachment.name,
        );
        const raw = skillContent.get(attachment.name) || librarySkill || null;
        const keywordEntries = Object.entries(raw?.config?.keywords || {});
        // Cascade context for this attachment's kbRef keywords: effective
        // project/workflow ids resolved from the stored overrides (falling
        // back to KB_config defaults, then the current project).
        const kbKeywords = raw?.config?.keywords || {};
        const projectKey = findKeyByKbRef(kbKeywords, 'project');
        const cascadeProjectId = resolveProjectIdForCascade({
          parentValue: storedOrDefault(attachment, kbKeywords, projectKey),
          projects,
          activeProjectId,
        });
        const cascadeWorkflows = cascadeProjectId ? workflowsFor(cascadeProjectId) : [];
        const cascadeWorkflowId = resolveWorkflowIdForCascade({
          parentValue: storedOrDefault(
            attachment,
            kbKeywords,
            findKeyByKbRef(kbKeywords, 'workflow'),
          ),
          workflows: cascadeWorkflows,
        });
        const cascadeLoading =
          projectsLoading || (cascadeProjectId ? workflowsLoadingFor(cascadeProjectId) : false);
        const cascadeError =
          projectsError || (cascadeProjectId ? workflowsErrorFor(cascadeProjectId) : null);
        const retryCascade = () => {
          reloadProjects();
          if (cascadeProjectId) loadWorkflows(cascadeProjectId);
        };
        return (
          <div
            key={attachment.name}
            data-testid={`skill-attachment-${attachment.name}`}
            className="p-2 rounded bg-surface-container border border-border-standard space-y-1.5"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono font-bold text-on-surface truncate">
                {attachment.name}
              </span>
              <button
                type="button"
                aria-label={`Remove skill ${attachment.name}`}
                onClick={() => removeSkill(attachment.name)}
                className="px-1 rounded text-[9px] text-text-muted hover:text-red-400 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mode toggle: Option / Direct */}
            <div
              className="flex rounded overflow-hidden border border-border-standard"
              role="radiogroup"
              aria-label={`Delivery mode for ${attachment.name}`}
            >
              {[
                {
                  value: 'option',
                  label: 'Option',
                  hint: 'Injects a manifest entry; the agent may read the skill file itself when relevant.',
                },
                {
                  value: 'direct',
                  hint: 'Injects the full skill body into the stage prompt so the agent always sees it.',
                  label: 'Direct',
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={(attachment.mode || 'direct') === opt.value}
                  title={opt.hint}
                  onClick={() => setSkillMode(attachment.name, opt.value)}
                  className={`flex-1 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    (attachment.mode || 'direct') === opt.value
                      ? 'bg-primary text-surface'
                      : 'bg-surface-container text-text-muted hover:text-on-surface'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Config editor: KB_config keyword overrides + JSON escape hatch */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-bold uppercase tracking-wider text-text-muted font-mono">
                  Keywords ({keywordEntries.length})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Toggle config editor for ${attachment.name}`}
                    onClick={() =>
                      setExpandedConfig((prev) => ({
                        ...prev,
                        [attachment.name]: !prev[attachment.name],
                      }))
                    }
                    className="px-1 rounded text-[8px] font-mono text-text-muted hover:text-on-surface cursor-pointer border border-border-standard"
                  >
                    {expandedConfig[attachment.name] ? '▲' : '▼'} config
                  </button>
                  <button
                    type="button"
                    aria-label={`Preview skill ${attachment.name}`}
                    onClick={() => openPreview(attachment.name)}
                    className="px-1 rounded text-[8px] font-mono text-text-muted hover:text-on-surface cursor-pointer border border-border-standard"
                  >
                    preview
                  </button>
                </div>
              </div>

              {expandedConfig[attachment.name] && (
                <div
                  className="space-y-1 pl-1 border-l border-border-standard"
                  data-testid={`skill-config-${attachment.name}`}
                >
                  {keywordEntries.length === 0 && (
                    <p className="text-[8px] text-text-muted italic">
                      No KB_config keywords for this skill.
                    </p>
                  )}
                  {keywordEntries.map(([key, entry]) => {
                    const kbRef = entry && typeof entry === 'object' ? entry.kbRef : undefined;
                    if (kbRef === 'project' || kbRef === 'workflow' || kbRef === 'stage') {
                      // Metadata-declared entity reference: render the cascading
                      // KB selector instead of the free-text input. Values are
                      // written as canonical ids via setSkillConfigValue.
                      const storedValue =
                        typeof attachment.config?.[key] === 'string' ? attachment.config[key] : '';
                      const defaultValue =
                        entry && typeof entry === 'object' && typeof entry.value === 'string'
                          ? entry.value
                          : '';
                      const rowProps = {
                        value: storedValue,
                        defaultValue,
                        onChange: (next) => setSkillConfigValue(attachment.name, key, next),
                        ariaLabel: `Keyword ${key} for ${attachment.name}`,
                      };
                      if (kbRef === 'project') {
                        Object.assign(rowProps, {
                          entities: { projects },
                          allowBuiltin: true,
                          loading: projectsLoading,
                          error: projectsError,
                          onRetry: reloadProjects,
                        });
                      } else if (kbRef === 'workflow') {
                        Object.assign(rowProps, {
                          entities: { workflows: cascadeWorkflows },
                          loading: cascadeLoading,
                          error: cascadeError,
                          onRetry: retryCascade,
                          disabled: !cascadeProjectId,
                          disabledReason:
                            'Parent target project does not match a known project — fix or clear it first',
                        });
                      } else {
                        Object.assign(rowProps, {
                          entities: { stages: stagesFor(cascadeProjectId, cascadeWorkflowId) },
                          loading: cascadeLoading,
                          error: cascadeError,
                          onRetry: retryCascade,
                          disabled: !cascadeProjectId || !cascadeWorkflowId,
                          disabledReason: !cascadeProjectId
                            ? 'Parent target project does not match a known project — fix or clear it first'
                            : 'Parent target workflow does not match a known workflow — select one first',
                        });
                      }
                      return (
                        <div key={key} className="flex items-start gap-1">
                          <span
                            className="text-[8px] font-mono text-text-muted whitespace-nowrap pt-1.5"
                            title={entry?.description || key}
                          >
                            {key}
                          </span>
                          <div className="flex-1 min-w-0">
                            <KBReferenceSelect kind={kbRef} {...rowProps} />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <label key={key} className="flex items-center gap-1">
                        <span
                          className="text-[8px] font-mono text-text-muted whitespace-nowrap"
                          title={entry?.description || key}
                        >
                          {key}
                        </span>
                        <input
                          type="text"
                          aria-label={`Keyword ${key} for ${attachment.name}`}
                          value={keywordStoredText(attachment, key) ?? keywordDefaultValue(entry)}
                          onChange={(e) =>
                            setSkillConfigValue(attachment.name, key, e.target.value)
                          }
                          className="flex-1 p-1 bg-surface border border-border-standard rounded-sm text-[9px] font-mono text-on-surface outline-none focus:border-primary"
                        />
                      </label>
                    );
                  })}
                  {jsonEditorOpen[attachment.name] ? (
                    <div className="space-y-1">
                      <textarea
                        rows={4}
                        aria-label={`Raw config JSON for ${attachment.name}`}
                        value={rawConfigDraft}
                        onChange={(e) => setRawConfigDraft(e.target.value)}
                        className="w-full p-1 bg-surface border border-border-standard rounded-sm text-[9px] font-mono text-on-surface outline-none focus:border-primary"
                      />
                      {rawConfigError && (
                        <p className="text-[8px] text-red-400 font-mono">{rawConfigError}</p>
                      )}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => applyRawConfig(attachment.name)}
                          className="px-2 py-0.5 rounded text-[8px] font-bold uppercase bg-primary text-surface cursor-pointer"
                        >
                          Apply JSON
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setJsonEditorOpen((prev) => ({ ...prev, [attachment.name]: false }))
                          }
                          className="px-2 py-0.5 rounded text-[8px] font-bold uppercase text-text-muted border border-border-standard cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openRawConfigEditor(attachment)}
                      className="px-1.5 py-0.5 rounded text-[8px] font-mono text-text-muted border border-border-standard hover:border-primary hover:text-on-surface cursor-pointer"
                    >
                      {'{ }'} raw JSON
                    </button>
                  )}
                </div>
              )}
            </div>

            {raw?.invalid && (
              <p
                className="text-[8px] text-red-400 font-mono"
                data-testid={`skill-invalid-${attachment.name}`}
              >
                ⚠ {raw.error || 'Skill is invalid'}
              </p>
            )}
          </div>
        );
      })}

      {/* Searchable picker */}
      {pickerOpen && (
        <div
          className="p-2 rounded bg-surface-container border border-border-standard space-y-1"
          data-testid="skills-picker"
        >
          <input
            type="text"
            aria-label="Search skills"
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-1.5 bg-surface border border-border-standard rounded-sm text-[10px] text-on-surface outline-none focus:border-primary"
          />
          {skillsLoading && (
            <p className="text-[9px] text-text-muted italic font-mono">Loading library…</p>
          )}
          {!skillsLoading && skillsError && (
            <p className="text-[9px] text-red-400 font-mono" data-testid="skills-error">
              ⚠ {skillsError}
            </p>
          )}
          {!skillsLoading && availableSkills.length === 0 && !skillsError && (
            <p className="text-[9px] text-text-muted italic">
              {search ? 'No skills match your search.' : 'Library is empty or unavailable.'}
            </p>
          )}
          <ul className="max-h-40 overflow-y-auto custom-scrollbar space-y-0.5">
            {availableSkills.map((skill) => (
              <li key={`${skill.source}:${skill.name}`}>
                <button
                  type="button"
                  aria-label={`Attach skill ${skill.name}`}
                  onClick={() => addSkill(skill)}
                  className="w-full text-left p-1.5 rounded bg-surface border border-border-standard hover:border-primary transition-colors cursor-pointer"
                >
                  <span className="block text-[10px] font-mono font-bold text-on-surface">
                    {skill.name}
                    <span className="ml-1 text-[8px] text-text-muted font-normal">
                      ({skill.source})
                    </span>
                  </span>
                  {skill.description && (
                    <span className="block text-[9px] text-text-muted line-clamp-2">
                      {skill.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview modal */}
      {previewName && (
        <Modal onClose={() => setPreviewName(null)} labelledBy="skill-preview-title">
          <div className="bg-surface border border-border-standard rounded p-4 max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <h2 id="skill-preview-title" className="text-sm font-bold text-on-surface font-mono">
                {previewName}
                {previewSkill && (
                  <span className="ml-2 text-[10px] text-text-muted font-normal">
                    ({previewSkill.source} · {previewSkill.markdownChars} chars)
                  </span>
                )}
              </h2>
              <button
                type="button"
                aria-label="Close skill preview"
                onClick={() => setPreviewName(null)}
                className="px-2 rounded text-text-muted hover:text-on-surface border border-border-standard cursor-pointer"
              >
                ✕
              </button>
            </div>
            {previewLoading ? (
              <p className="text-xs text-text-muted italic">Loading…</p>
            ) : (
              <>
                <MarkdownViewer content={previewResolvedText} />
                {previewTargets.length > 0 && (
                  <div
                    className="mt-3 pt-2 border-t border-border-standard"
                    data-testid="preview-resolved-targets"
                  >
                    <p className="text-[8px] font-bold uppercase tracking-wider text-text-muted font-mono mb-1">
                      Resolved targets
                    </p>
                    <ul className="space-y-0.5">
                      {previewTargets.map((target) => (
                        <PreviewTargetRow key={target.key} target={target} />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default StageSkillsPanel;
