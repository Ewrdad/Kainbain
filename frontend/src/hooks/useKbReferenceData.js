import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';

/***
 * MARK: useKbReferenceData
 * @description Shared frontend hook for the KainBain entity data behind the
 *   cascading reference dropdowns (Project -> Workflow -> Stage) in the stage
 *   skills panel. Projects are fetched once on mount; a project's workflows
 *   (which already carry their stages) are fetched LAZILY per project via
 *   loadWorkflows and cached — stages are never fetched separately, they ride
 *   the workflows payload. Pure label/resolution helpers (formatEntityLabel,
 *   resolveReference) live in this same module as a small frontend mirror of
 *   the authoritative API resolver (api/kbReferences.js).
 *
 *   Defensive by design: non-array/non-object API payloads degrade to empty
 *   results, per-level loading/error state is kept per project id, and no state
 *   is written after unmount (cancelled-flag pattern).
 *
 * @example const { projects, workflowsFor, stagesFor, loadWorkflows } = useKbReferenceData({ activeProjectId })
 * @example await loadWorkflows('proj-1'); stagesFor('proj-1', 'wf-default') => [{ id, name }, ...]
 *
 * @param {Object} [opts]
 * @param {string} [opts.activeProjectId] - Current project id; the default
 *   target for loadWorkflows when no explicit projectId is passed.
 * @returns {{
 *   projects: Array<Object>,
 *   projectsLoading: boolean,
 *   projectsError: string|null,
 *   workflowsByProject: Object<string, Array<Object>>,
 *   loadProjects: () => Promise<Array>,
 *   reloadProjects: () => Promise<Array>,
 *   loadWorkflows: (projectId?: string) => Promise<Array>,
 *   workflowsFor: (projectId: string) => Array<Object>,
 *   stagesFor: (projectId: string, workflowId: string) => Array<Object>,
 *   workflowsLoadingFor: (projectId: string) => boolean,
 *   workflowsErrorFor: (projectId: string) => string|null,
 * }}
 ***/
export function useKbReferenceData({ activeProjectId } = {}) {
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState(null);

  const [workflowsByProject, setWorkflowsByProject] = useState({});
  const [workflowsLoadingByProject, setWorkflowsLoadingByProject] = useState({});
  const [workflowsErrorByProject, setWorkflowsErrorByProject] = useState({});

  const activeProjectIdRef = useRef(activeProjectId);
  // Cancelled-flag pattern (see StageSkillsPanel content cache): every async
  // step checks this before setState so a late promise resolution after
  // unmount never touches state.
  const isMountedRef = useRef(true);
  // Holds the last successfully fetched project list (truthy = already loaded).
  const projectsCacheRef = useRef(null);
  const projectsInFlightRef = useRef(null);
  // Per-project caches: workflows arrays + in-flight promises, keyed by projectId.
  const workflowsCacheRef = useRef(new Map());
  const workflowsInFlightRef = useRef(new Map());

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /***
   * MARK: fetchProjects
   * @description Shared projects fetch used by both loadProjects (idempotent,
   *   deduped, skips when already loaded) and reloadProjects (forces a refetch).
   *   Odd payloads degrade to []; errors surface in projectsError while the
   *   previously loaded list (if any) is kept.
   * @param {Object} [opts]
   * @param {boolean} [opts.force=false] - Bypass the loaded/in-flight guards.
   * @returns {Promise<Array>} The projects list ([] on failure).
   ***/
  const fetchProjects = useCallback(async ({ force = false } = {}) => {
    if (!force) {
      if (projectsCacheRef.current) return projectsCacheRef.current;
      if (projectsInFlightRef.current) return projectsInFlightRef.current;
    }
    const promise = (async () => {
      if (isMountedRef.current) {
        setProjectsLoading(true);
        setProjectsError(null);
      }
      try {
        const response = await api.listProjects();
        const list = Array.isArray(response) ? response : [];
        projectsCacheRef.current = list;
        if (isMountedRef.current) {
          setProjects(list);
          setProjectsError(null);
        }
        return list;
      } catch (err) {
        logger.error('Failed to fetch projects', err);
        if (isMountedRef.current) {
          setProjectsError(err?.message || 'Failed to fetch projects');
        }
        return [];
      } finally {
        projectsInFlightRef.current = null;
        if (isMountedRef.current) {
          setProjectsLoading(false);
        }
      }
    })();
    projectsInFlightRef.current = promise;
    return promise;
  }, []);

  /***
   * MARK: loadProjects
   * @description Idempotent projects fetch: auto-invoked once on mount, safe to
   *   call again (no-ops while loaded or in flight). Use reloadProjects to force.
   * @example await loadProjects()
   * @returns {Promise<Array>} The projects list ([] on failure).
   ***/
  const loadProjects = useCallback(() => fetchProjects({ force: false }), [fetchProjects]);

  /***
   * MARK: reloadProjects
   * @description Forces a fresh projects fetch, clearing any previous error.
   * @example await reloadProjects()
   * @returns {Promise<Array>} The freshly fetched projects list ([] on failure).
   ***/
  const reloadProjects = useCallback(() => fetchProjects({ force: true }), [fetchProjects]);

  /***
   * MARK: loadWorkflows
   * @description Idempotent lazy fetch of one project's workflows (each workflow
   *   already carries its stages). No-ops when the project is already cached or
   *   its fetch is in flight; caches the result under workflowsByProject; keeps
   *   per-id loading/error state. Failures are NOT cached, so a later call
   *   retries and clears the error.
   * @example await loadWorkflows('proj-1')
   * @param {string} [projectId] - Defaults to the active project.
   * @returns {Promise<Array>} The workflows list ([] on failure).
   ***/
  const loadWorkflows = useCallback(async (projectId) => {
    const targetProjectId = projectId ?? activeProjectIdRef.current;
    if (!targetProjectId) return [];
    if (workflowsCacheRef.current.has(targetProjectId)) {
      return workflowsCacheRef.current.get(targetProjectId);
    }
    if (workflowsInFlightRef.current.has(targetProjectId)) {
      return workflowsInFlightRef.current.get(targetProjectId);
    }
    const promise = (async () => {
      if (isMountedRef.current) {
        setWorkflowsLoadingByProject((prev) => withProjectEntry(prev, targetProjectId, true));
        setWorkflowsErrorByProject((prev) => withProjectEntry(prev, targetProjectId, null));
      }
      try {
        const response = await api.getWorkflows(targetProjectId);
        const payload = response && typeof response === 'object' ? response : {};
        const list = Array.isArray(payload.workflows) ? payload.workflows : [];
        workflowsCacheRef.current.set(targetProjectId, list);
        if (isMountedRef.current) {
          setWorkflowsByProject((prev) => withProjectEntry(prev, targetProjectId, list));
          setWorkflowsErrorByProject((prev) => withProjectEntry(prev, targetProjectId, null));
        }
        return list;
      } catch (err) {
        logger.error(`Failed to fetch workflows for project ${targetProjectId}`, err);
        if (isMountedRef.current) {
          setWorkflowsErrorByProject((prev) =>
            withProjectEntry(prev, targetProjectId, err?.message || 'Failed to fetch workflows'),
          );
        }
        return [];
      } finally {
        workflowsInFlightRef.current.delete(targetProjectId);
        if (isMountedRef.current) {
          setWorkflowsLoadingByProject((prev) => withProjectEntry(prev, targetProjectId, false));
        }
      }
    })();
    workflowsInFlightRef.current.set(targetProjectId, promise);
    return promise;
  }, []);

  /***
   * MARK: workflowsFor
   * @description Pure read of the cached workflows for a project ([] default).
   *   Never fetches.
   * @example workflowsFor('proj-1') => [{ id: 'wf-default', name: 'Feature Pipeline', stages: [...] }]
   * @param {string} projectId
   * @returns {Array<Object>}
   ***/
  const workflowsFor = useCallback(
    (projectId) => projectEntry(workflowsByProject, projectId, []),
    [workflowsByProject],
  );

  /***
   * MARK: stagesFor
   * @description Pure read of one workflow's stages from the cache ([] default).
   *   Stages ride the workflows payload, so this NEVER fetches — the workflow
   *   must have been loaded via loadWorkflows first.
   * @example stagesFor('proj-1', 'wf-default') => [{ id: 'stage-idea', name: 'Idea' }]
   * @param {string} projectId
   * @param {string} workflowId
   * @returns {Array<Object>}
   ***/
  const stagesFor = useCallback(
    (projectId, workflowId) => {
      if (!workflowId) return [];
      const workflow = workflowsFor(projectId).find((entry) => entry?.id === workflowId);
      return Array.isArray(workflow?.stages) ? workflow.stages : [];
    },
    [workflowsFor],
  );

  /***
   * MARK: workflowsLoadingFor
   * @description Pure read of the per-project workflows loading flag.
   * @param {string} projectId
   * @returns {boolean}
   ***/
  const workflowsLoadingFor = useCallback(
    (projectId) => projectEntry(workflowsLoadingByProject, projectId, false),
    [workflowsLoadingByProject],
  );

  /***
   * MARK: workflowsErrorFor
   * @description Pure read of the per-project workflows error message.
   * @param {string} projectId
   * @returns {string|null}
   ***/
  const workflowsErrorFor = useCallback(
    (projectId) => projectEntry(workflowsErrorByProject, projectId, null),
    [workflowsErrorByProject],
  );

  // Auto-fetch projects once on mount; workflows stay lazy (fetched only when a
  // parent dropdown value is selected).
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    projectsLoading,
    projectsError,
    workflowsByProject,
    loadProjects,
    reloadProjects,
    loadWorkflows,
    workflowsFor,
    stagesFor,
    workflowsLoadingFor,
    workflowsErrorFor,
  };
}

/***
 * MARK: formatEntityLabel
 * @description Renders the human-readable dropdown/label form of a KB entity:
 *   "Name (id)". Degrades gracefully: missing name renders the bare id, missing
 *   id the bare name, a useless entity renders ''.
 * @example formatEntityLabel({ id: 'wf-default', name: 'Feature Pipeline' }) => 'Feature Pipeline (wf-default)'
 * @example formatEntityLabel(null) => ''
 * @param {Object|null} [entity] - Any KB entity ({ id, name, ... }).
 * @returns {string}
 ***/
export function formatEntityLabel(entity) {
  if (!entity || typeof entity !== 'object') return '';
  const name = asText(entity.name);
  const id = asText(entity.id);
  if (name && id) return `${name} (${id})`;
  return name || id;
}

/***
 * MARK: resolveReference
 * @description Resolves one stored/typed reference value to a known KB entity —
 *   a small frontend mirror of the API resolver (api/kbReferences.js). Projects
 *   match by exact id, then case-insensitive name, then case-insensitive slug.
 *   Workflows match by exact id, then case-insensitive name. Stages match by
 *   exact id or case-insensitive name: scoped to the workflow when `workflowId`
 *   resolves to a known workflow, otherwise the match must be UNIQUE across all
 *   workflows (ambiguous or none => null). Returns null for anything
 *   unresolvable (unknown kind, non-string/empty value, no match).
 * @example resolveReference({ kind: 'workflow', value: 'feature pipeline', entities })
 *   => { id: 'wf-default', label: 'Feature Pipeline (wf-default)', entity: {...} }
 * @param {Object} opts
 * @param {'project'|'workflow'|'stage'} opts.kind - Which entity kind to resolve.
 * @param {string} opts.value - The raw reference value.
 * @param {Object} [opts.entities] - Known entities: { projects: [...], workflows: [...] }
 *   (raw api.listProjects()/getWorkflows() records; malformed shapes are tolerated).
 * @param {string|null} [opts.workflowId=null] - Workflow scope for stage lookups.
 * @returns {{ id: string, label: string, entity: Object }|null}
 ***/
export function resolveReference({ kind, value, entities, workflowId = null } = {}) {
  if (kind !== 'project' && kind !== 'workflow' && kind !== 'stage') return null;
  if (typeof value !== 'string') return null;
  const needle = value.trim();
  if (needle === '') return null;
  const known = knownEntities(entities);

  if (kind === 'project') {
    const match =
      matchById(known.projects, needle) ||
      matchByName(known.projects, needle) ||
      matchBySlug(known.projects, needle);
    return match ? toReference(match) : null;
  }

  if (kind === 'workflow') {
    const match = matchById(known.workflows, needle) || matchByName(known.workflows, needle);
    return match ? toReference(match) : null;
  }

  // kind === 'stage': scope to one workflow when workflowId resolves there,
  // otherwise demand a unique match across every known workflow.
  const scope = workflowId ? known.workflows.find((entry) => entry?.id === workflowId) : null;
  const candidates = scope ? [scope] : known.workflows;
  const matches = candidates
    .map((workflow) => matchStageInWorkflow(workflow, needle))
    .filter(Boolean);
  if (matches.length !== 1) return null;
  return toReference(matches[0]);
}

/***
 * MARK: knownEntities
 * @description Coerces any caller-supplied entities shape into one with
 *   array-valued projects/workflows (malformed input degrades to empty).
 * @param {Object} [entities]
 * @returns {{ projects: Array<Object>, workflows: Array<Object> }}
 ***/
function knownEntities(entities) {
  const source = entities && typeof entities === 'object' ? entities : {};
  return {
    projects: Array.isArray(source.projects) ? source.projects : [],
    workflows: Array.isArray(source.workflows) ? source.workflows : [],
  };
}

/***
 * MARK: matchById
 * @description First entity whose id equals the needle exactly (empty never matches).
 * @param {Array<Object>} entities
 * @param {string} needle
 * @returns {Object|null}
 ***/
function matchById(entities, needle) {
  if (needle === '') return null;
  return entities.find((entity) => asText(entity?.id) === needle) || null;
}

/***
 * MARK: matchByName
 * @description First entity whose name matches case-insensitively.
 * @param {Array<Object>} entities
 * @param {string} needle
 * @returns {Object|null}
 ***/
function matchByName(entities, needle) {
  if (needle === '') return null;
  const lowerNeedle = needle.toLowerCase();
  return entities.find((entity) => asText(entity?.name).toLowerCase() === lowerNeedle) || null;
}

/***
 * MARK: matchBySlug
 * @description First project whose slug matches case-insensitively (projects only).
 * @param {Array<Object>} projects
 * @param {string} needle
 * @returns {Object|null}
 ***/
function matchBySlug(projects, needle) {
  if (needle === '') return null;
  const lowerNeedle = needle.toLowerCase();
  return projects.find((project) => asText(project?.slug).toLowerCase() === lowerNeedle) || null;
}

/***
 * MARK: matchStageInWorkflow
 * @description Finds a stage inside one workflow by exact id, then
 *   case-insensitive name (mirrors resolveStage in api/routes/tasks.js).
 * @param {Object} workflow
 * @param {string} needle
 * @returns {Object|null}
 ***/
function matchStageInWorkflow(workflow, needle) {
  const stages =
    workflow && typeof workflow === 'object' && Array.isArray(workflow.stages)
      ? workflow.stages
      : [];
  return matchById(stages, needle) || matchByName(stages, needle);
}

/***
 * MARK: toReference
 * @description Builds the canonical reference shape: id, readable label and the
 *   raw matched entity (kept so callers can read extra fields like isDefault).
 * @example toReference({ id: 'wf-default', name: 'Feature Pipeline' })
 *   => { id: 'wf-default', label: 'Feature Pipeline (wf-default)', entity: {...} }
 * @param {Object} entity
 * @returns {{ id: string, label: string, entity: Object }}
 ***/
function toReference(entity) {
  const id = asText(entity?.id);
  return { id, label: formatEntityLabel(entity), entity };
}

/***
 * MARK: asText
 * @description Coerces a value to display/storage text; null and undefined become ''.
 * @example asText(undefined) => ''
 * @param {unknown} value
 * @returns {string}
 ***/
function asText(value) {
  return value === null || value === undefined ? '' : String(value);
}

/***
 * MARK: withProjectEntry
 * @description Immutably sets one projectId key on a per-project state map
 *   (used by the workflows loading/error/workflows maps).
 * @param {Object} map - Current per-project state map.
 * @param {string} projectId
 * @param {unknown} value
 * @returns {Object} New map with the entry set.
 ***/
function withProjectEntry(map, projectId, value) {
  return { ...map, [projectId]: value };
}

/***
 * MARK: projectEntry
 * @description Pure read of one projectId key from a per-project state map with
 *   a fallback (the read-side counterpart of withProjectEntry).
 * @param {Object} map
 * @param {string} projectId
 * @param {unknown} fallback
 * @returns {unknown}
 ***/
function projectEntry(map, projectId, fallback) {
  /* eslint-disable-next-line security/detect-object-injection -- keys are project ids from our own fetch/cache layer, never raw user input */
  return map[projectId] ?? fallback;
}
