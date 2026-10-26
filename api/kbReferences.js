/***
 * MARK: kbReferences
 * @description Shared resolver/validator for KainBain entity references that appear
 *   in skill keyword configs (e.g. creating-new-tickets `targetProject`,
 *   `targetWorkflow`, `targetStage`). A keyword may declare `kbRef:
 *   "project" | "workflow" | "stage"` metadata in the skill's KB_config; this module
 *   is the one authoritative place that knows how to enumerate KainBain's known
 *   entities and turn any accepted reference (id, human-readable name, or — for
 *   projects — slug) into a canonical `{ id, label }`.
 *
 *   Consumers:
 *   - Save-time validation of `stage.skills[i].config` values that declare `kbRef`
 *     (fail-closed with descriptive, operator-friendly errors).
 *   - UI dropdowns and label rendering ("Name (id)").
 *
 *   Guarantees:
 *   - Pure composition over `projectStore.listProjects()` and
 *     `projectStore.getWorkflows(projectId)` — no HTTP, no filesystem, no persistence.
 *   - Defensive: malformed stores/entities coerce to empty results; the functions
 *     never throw for ordinary bad input (null = unresolvable).
 *
 * @example const entities = listKnownEntities({ projectStore, projectId: 'proj-1' })
 * @example resolveKbReference({ kind: 'workflow', value: 'Feature Pipeline', entities }) => { id: 'wf-default', label: 'Feature Pipeline (wf-default)' }
 ***/

const KB_REF_KINDS = ["project", "workflow", "stage"];
const PROJECT_TEMPLATE_PATTERN = /^\{\{\s*project\s*\}\}$/;

/***
 * MARK: listKnownEntities
 * @description Enumerates the KainBain entities a skill config may reference:
 *   all projects (id/name/slug) plus — when a projectId is given — that
 *   project's workflows with their stages, and the project's active workflow
 *   id. The snapshot also carries `projectId` (the normalized id `workflows`
 *   belongs to, null when none was given) and a `workflowsFor(projectRef)`
 *   accessor that lazily enumerates ANY known project's workflows (resolved
 *   by id, case-insensitive name, or slug; cached per resolved id). The
 *   accessor is what lets save-time validation scope workflow/stage
 *   references to a CROSS-PROJECT target instead of only the edited project.
 *   Pure read-only composition over projectStore. Never throws and never
 *   persists; malformed store output becomes the empty shape. For a
 *   null/unknown projectId, `workflows` is [] and `activeWorkflowId` is null.
 * @example listKnownEntities({ projectStore, projectId: 'proj-1' })
 *   => { projects: [{ id, name, slug }],
 *        workflows: [{ id, name, isDefault, stages: [{ id, name }] }],
 *        activeWorkflowId: 'wf-default',
 *        projectId: 'proj-1',
 *        workflowsFor: projectRef => [{ id, name, isDefault, stages }] }
 * @param {Object} opts
 * @param {Object} opts.projectStore - The project store (listProjects/getWorkflows).
 * @param {string|null} [opts.projectId=null] - Project whose workflows to enumerate.
 * @returns {{ projects: Array<Object>, workflows: Array<Object>, activeWorkflowId: string|null, projectId: string|null, workflowsFor: (projectRef: string) => Array<Object> }}
 ***/
export function listKnownEntities({ projectStore, projectId = null } = {}) {
	if (!isRecord(projectStore)) {
		return emptyEntitySnapshot();
	}
	const normalizedProjectId = toIdOrNull(projectId);
	let rawProjects;
	let rawWorkflows = null;
	try {
		rawProjects = projectStore.listProjects();
		if (normalizedProjectId !== null) {
			rawWorkflows = projectStore.getWorkflows(normalizedProjectId);
		}
	} catch {
		// A broken store must never break callers (e.g. save-time validation).
		return emptyEntitySnapshot();
	}
	const projects = pruneProjects(rawProjects);
	const workflows = pruneWorkflows(rawWorkflows);
	const scopedWorkflowsCache = new Map();
	const workflowsFor = (projectRef) => {
		const needle = toIdOrNull(projectRef);
		if (needle === null) return [];
		const match =
			pickById(projects, needle) ||
			pickByName(projects, needle) ||
			pickBySlug(projects, needle);
		if (!match) return [];
		if (scopedWorkflowsCache.has(match.id)) {
			return scopedWorkflowsCache.get(match.id);
		}
		let scoped = [];
		try {
			scoped = pruneWorkflows(projectStore.getWorkflows(match.id));
		} catch {
			// A broken store must never break callers (e.g. save-time validation).
			scoped = [];
		}
		scopedWorkflowsCache.set(match.id, scoped);
		return scoped;
	};
	return {
		projects,
		workflows,
		activeWorkflowId: pickActiveWorkflowId(
			normalizedProjectId,
			rawProjects,
			workflows,
		),
		projectId: normalizedProjectId,
		workflowsFor,
	};
}

/***
 * MARK: resolveKbReference
 * @description Resolves one reference value to a known entity. Projects match by
 *   exact id, then case-insensitive name, then case-insensitive slug. Workflows
 *   match by exact id, then case-insensitive name within the candidate workflow
 *   set: when `projectScopeId` is given the candidates are THAT project's
 *   workflows (so cross-project targets resolve against the target project,
 *   not the edited one); without a scope the snapshot's own workflow set is
 *   used. Stages match by exact id or case-insensitive name inside a workflow:
 *   when `workflowId` is given and resolves within the candidate set only that
 *   workflow is searched (first match); otherwise every candidate workflow is
 *   searched and the match is returned only when it is UNIQUE (ambiguous or
 *   none => null). Returns null for anything unresolvable (unknown kind,
 *   non-string/empty value, no match).
 * @example resolveKbReference({ kind: 'workflow', value: 'feature pipeline', entities })
 *   => { id: 'wf-default', label: 'Feature Pipeline (wf-default)' }
 * @param {Object} opts
 * @param {'project'|'workflow'|'stage'} opts.kind - Which entity kind to resolve.
 * @param {string} opts.value - The raw reference typed/stored in the config.
 * @param {Object} opts.entities - A listKnownEntities() snapshot.
 * @param {string|null} [opts.workflowId=null] - Workflow scope for stage lookups.
 * @param {string|null} [opts.projectScopeId=null] - Project whose workflows
 *   workflow/stage lookups are scoped to (null = the snapshot's own set).
 * @returns {{ id: string, label: string }|null}
 ***/
export function resolveKbReference({
	kind,
	value,
	entities,
	workflowId = null,
	projectScopeId = null,
} = {}) {
	if (!KB_REF_KINDS.includes(kind)) return null;
	if (typeof value !== "string") return null;
	const needle = value.trim();
	if (needle === "") return null;
	const known = safeEntities(entities);

	if (kind === "project") {
		const match =
			pickById(known.projects, needle) ||
			pickByName(known.projects, needle) ||
			pickBySlug(known.projects, needle);
		return match ? toReference(match) : null;
	}

	if (kind === "workflow") {
		const candidates = workflowsForScope(known, projectScopeId);
		const match = pickById(candidates, needle) || pickByName(candidates, needle);
		return match ? toReference(match) : null;
	}

	// kind === "stage": scope to one workflow when workflowId resolves within
	// the candidate set, otherwise demand a unique match across all of them.
	const candidates = workflowsForScope(known, projectScopeId);
	const scope =
		workflowId === null || workflowId === undefined
			? null
			: pickById(candidates, asText(workflowId));
	const searchScope = scope ? [scope] : candidates;
	const matches = searchScope
		.map((workflow) => pickStageInWorkflow(workflow, needle))
		.filter(Boolean);
	if (matches.length !== 1) return null;
	return toReference(matches[0]);
}

/***
 * MARK: validateSkillConfig
 * @description Validates the keyword overrides of one stage-skill attachment
 *   (`stage.skills[i].config`) against the reference metadata declared in the
 *   skill's KB_config (`kbRef: "project" | "workflow" | "stage"`). Keys without
 *   metadata, unknown keys, and non-string/empty values pass untouched (existing
 *   tolerance). `{{...}}` templates are valid built-ins: exactly `{{project}}`
 *   (optionally padded with spaces inside the braces) additionally records a
 *   resolved entry against `currentProjectId` when that project is known. A plain
 *   string that does not resolve yields a descriptive error.
 *
 *   Cross-key scoping is order-independent — overrides are validated in kind
 *   passes (project keys, then workflow keys, then stage keys):
 *   1. The EFFECTIVE PROJECT is resolved first. An absent, empty, or `{{project}}`
 *      project-type key means the project being edited (`currentProjectId`); a
 *      plain project reference means the resolved known project — this is what
 *      makes CROSS-PROJECT targets (e.g. creating-new-tickets writing tickets
 *      into another project) validate against the TARGET project's workflows.
 *   2. Workflow keys are resolved within the effective project's workflows; a
 *      resolved workflow key scopes the stage keys to that workflow.
 *   3. Stage keys are resolved within the effective project + workflow scope;
 *      without a resolved workflow they must match UNIQUELY across the effective
 *      project's workflows. When no effective project is known at all the
 *      pre-existing fallback applies (the snapshot's own workflow set and the
 *      unique-match rule).
 * @example validateSkillConfig({ config: { targetStage: 'Nope' }, kbConfig, entities })
 *   => { valid: false, errors: [{ key: 'targetStage', value: 'Nope', reason: '...' }], resolved: {} }
 * @param {Object} opts
 * @param {Object} [opts.config] - The attachment's keyword overrides.
 * @param {Object} [opts.kbConfig] - The parsed KB_config (keywords carry kbRef).
 * @param {Object} opts.entities - A listKnownEntities() snapshot.
 * @param {string|null} [opts.currentProjectId=null] - Id of the project being edited.
 * @returns {{ valid: boolean, errors: Array<{ key: string, value: string, reason: string }>, resolved: Object<string, { id: string, label: string }> }}
 ***/
export function validateSkillConfig({
	config,
	kbConfig,
	entities,
	currentProjectId = null,
} = {}) {
	const result = { valid: true, errors: [], resolved: {} };
	const overrides = isRecord(config) ? config : {};
	const keywordMeta =
		isRecord(kbConfig) && isRecord(kbConfig.keywords) ? kbConfig.keywords : {};
	const known = safeEntities(entities);

	// Group the kbRef-declared string overrides by kind so the scoping passes
	// below never depend on the order keys happen to appear in the config.
	/* eslint-disable security/detect-object-injection -- keys come from Object.entries of the caller's plain config object and are only re-grouped by their validated kbRef kind; resolved/errors are plain maps keyed by those same config keys */
	const keysByKind = { project: [], workflow: [], stage: [] };
	for (const [key, rawValue] of Object.entries(overrides)) {
		const kind = isRecord(keywordMeta[key]) ? keywordMeta[key].kbRef : undefined;
		if (!KB_REF_KINDS.includes(kind)) continue; // non-kbRef/unknown keys pass untouched
		if (typeof rawValue !== "string") continue; // non-string values keep existing tolerance
		const trimmed = rawValue.trim();
		if (trimmed === "") continue; // empty overrides mean "use the KB_config default"
		keysByKind[kind].push({ key, rawValue, trimmed });
	}

	// The effective project that workflow/stage references are scoped to.
	// Defaults to the project being edited (the {{project}} built-in); a
	// resolvable project-type key re-scopes it. When the edited project is
	// itself unknown the scope stays null and the unscoped fallback applies.
	let effectiveProjectId = toIdOrNull(currentProjectId);

	// Pass 1 — project keys: resolve the effective project for the passes below.
	for (const { key, rawValue, trimmed } of keysByKind.project) {
		if (trimmed.includes("{{")) {
			const builtin = resolveProjectTemplate(
				trimmed,
				currentProjectId,
				known.projects,
			);
			if (builtin) {
				result.resolved[key] = builtin;
				effectiveProjectId = builtin.id;
			}
			// Any other {{...}} template is a valid built-in, resolved at run time.
			continue;
		}
		const match = resolveKbReference({
			kind: "project",
			value: trimmed,
			entities: known,
		});
		if (match) {
			result.resolved[key] = match;
			effectiveProjectId = match.id;
			continue;
		}
		result.errors.push({
			key,
			value: rawValue,
			reason: describeUnknownReference("project", trimmed, {}),
		});
	}

	// A resolved workflow-type key scopes stage-type keys; null means the
	// unscoped unique-match rule applies.
	let scopedWorkflowId = null;

	// Pass 2 — workflow keys, scoped to the effective project's workflows.
	for (const { key, rawValue, trimmed } of keysByKind.workflow) {
		if (trimmed.includes("{{")) continue; // valid built-in, resolved at run time
		const match = resolveKbReference({
			kind: "workflow",
			value: trimmed,
			entities: known,
			projectScopeId: effectiveProjectId,
		});
		if (match) {
			result.resolved[key] = match;
			scopedWorkflowId = match.id;
			continue;
		}
		scopedWorkflowId = null;
		result.errors.push({
			key,
			value: rawValue,
			reason: describeUnknownReference("workflow", trimmed, {
				projectLabel: projectScopeLabel(known, effectiveProjectId),
			}),
		});
	}

	// Pass 3 — stage keys, scoped to the effective project (+ resolved workflow).
	for (const { key, rawValue, trimmed } of keysByKind.stage) {
		if (trimmed.includes("{{")) continue; // valid built-in, resolved at run time
		const match = resolveKbReference({
			kind: "stage",
			value: trimmed,
			entities: known,
			workflowId: scopedWorkflowId,
			projectScopeId: effectiveProjectId,
		});
		if (match) {
			result.resolved[key] = match;
			continue;
		}
		result.errors.push({
			key,
			value: rawValue,
			reason: describeUnknownReference("stage", trimmed, {
				projectLabel: projectScopeLabel(known, effectiveProjectId),
				workflowId: scopedWorkflowId,
			}),
		});
	}
	/* eslint-enable security/detect-object-injection */

	result.valid = result.errors.length === 0;
	return result;
}

/***
 * MARK: collectInvalidSkillReferences
 * @description Validates every stage-skill attachment's keyword overrides across a
 *   whole incoming `stages` array — the save-time gate behind
 *   `PUT /projects/:id/workflow`. For each attachment whose skill is known to the
 *   registry, runs validateSkillConfig against the skill's KB_config metadata and
 *   aggregates failures as `[{ skill, key, value, reason }]`. Deliberately
 *   tolerant of everything that was valid before this module existed:
 *   attachments without a name, skills missing from the registry, unreadable or
 *   invalid skill descriptors, configs without `kbRef` metadata, unknown keys,
 *   non-string/empty values, and `{{...}}` built-ins all pass untouched. A broken
 *   registry or store degrades to "nothing to validate" rather than blocking a
 *   save (shape tolerance lives in projectStore.normalizeStageSkills).
 * @example collectInvalidSkillReferences({ stages, projectId, projectStore, skillsRegistry })
 *   => [{ skill: 'creating-new-tickets', key: 'targetStage', value: 'Nope', reason: 'Unknown stage reference "Nope" — ...' }]
 * @param {Object} opts
 * @param {Array<Object>} [opts.stages] - Incoming stage payload (each may carry skills[]).
 * @param {Object} [opts.project] - The current project record (its cwd scopes the overlay).
 * @param {string|null} [opts.projectId=null] - Id of the project being saved.
 * @param {Object} [opts.projectStore] - Store used to enumerate known entities.
 * @param {Object} [opts.skillsRegistry] - Registry with getSkill(name, { projectCwd }).
 * @returns {Array<{ skill: string, key: string, value: string, reason: string }>}
 ***/
export function collectInvalidSkillReferences({
	stages,
	project = null,
	projectId = null,
	projectStore,
	skillsRegistry,
} = {}) {
	if (!Array.isArray(stages)) return [];
	if (
		!isRecord(skillsRegistry) ||
		typeof skillsRegistry.getSkill !== "function"
	) {
		return [];
	}
	let entities;
	try {
		entities = listKnownEntities({ projectStore, projectId });
	} catch {
		return [];
	}
	const projectCwd = isRecord(project) ? project.cwd : null;
	const failures = [];
	for (const stage of stages) {
		if (!isRecord(stage) || !Array.isArray(stage.skills)) continue;
		for (const attachment of stage.skills) {
			if (!isRecord(attachment)) continue;
			const name =
				typeof attachment.name === "string" ? attachment.name.trim() : "";
			if (!name) continue; // nameless attachments are reported by the injection engine
			let descriptor;
			try {
				descriptor = skillsRegistry.getSkill(name, { projectCwd });
			} catch {
				continue; // a broken registry entry must never block a save
			}
			if (!isRecord(descriptor) || descriptor.invalid === true) continue;
			const kbConfig = isRecord(descriptor.config) ? descriptor.config : null;
			let result;
			try {
				result = validateSkillConfig({
					config: attachment.config,
					kbConfig,
					entities,
					currentProjectId: projectId,
				});
			} catch {
				continue; // defensive: validation must never block a save on its own errors
			}
			if (!result || !Array.isArray(result.errors)) continue;
			for (const error of result.errors) {
				failures.push({
					skill: name,
					key: error.key,
					value: error.value,
					reason: error.reason,
				});
			}
		}
	}
	return failures;
}

/***
 * MARK: emptyEntitySnapshot
 * @description Builds the canonical empty entities shape used when nothing is
 *   known (no store, or a store that throws). No `workflowsFor` accessor is
 *   attached — there is no store to enumerate from.
 * @example emptyEntitySnapshot()
 *   => { projects: [], workflows: [], activeWorkflowId: null, projectId: null }
 * @returns {{ projects: Array, workflows: Array, activeWorkflowId: null, projectId: null }}
 ***/
function emptyEntitySnapshot() {
	return {
		projects: [],
		workflows: [],
		activeWorkflowId: null,
		projectId: null,
	};
}

/***
 * MARK: workflowsForScope
 * @description Returns the workflow set that workflow/stage references resolve
 *   against for an effective project. A null/empty scope keeps the snapshot's
 *   own workflow set (the unscoped fallback); a scope equal to the snapshot's
 *   project reuses the snapshot set without a store round-trip; otherwise the
 *   snapshot's `workflowsFor` accessor enumerates that project's workflows —
 *   and a snapshot without an accessor (hand-built shape) degrades to the
 *   snapshot set so pre-accessor callers keep their previous behaviour.
 * @param {{ projects: Array<Object>, workflows: Array<Object>, projectId: string|null, workflowsFor: ((projectRef: string) => Array<Object>)|null }} known
 * @param {string|null} projectScopeId
 * @returns {Array<Object>}
 ***/
function workflowsForScope(known, projectScopeId) {
	const scopeId = toIdOrNull(projectScopeId);
	if (scopeId === null) return known.workflows;
	if (known.projectId !== null && known.projectId === scopeId) {
		return known.workflows;
	}
	if (typeof known.workflowsFor === "function") {
		const scoped = known.workflowsFor(scopeId);
		return Array.isArray(scoped) ? scoped : [];
	}
	return known.workflows;
}

/***
 * MARK: projectScopeLabel
 * @description Human-readable label ("Name (id)") for the effective project
 *   scope, used to name the scoping in validation errors. Returns null when the
 *   scope is unset or resolves to no known project (the message then falls back
 *   to the unscoped wording).
 * @param {{ projects: Array<Object> }} known
 * @param {string|null} projectScopeId
 * @returns {string|null}
 ***/
function projectScopeLabel(known, projectScopeId) {
	const scopeId = toIdOrNull(projectScopeId);
	if (scopeId === null) return null;
	const match = pickById(known.projects, scopeId);
	return match ? toReference(match).label : null;
}

/***
 * MARK: toIdOrNull
 * @description Coerces a reference/id-ish value to trimmed text; empty becomes null.
 * @example toIdOrNull('  proj-1 ') => 'proj-1'
 * @param {unknown} value
 * @returns {string|null}
 ***/
function toIdOrNull(value) {
	if (value === null || value === undefined) return null;
	const text = asText(value).trim();
	return text === "" ? null : text;
}

/***
 * MARK: pickActiveWorkflowId
 * @description Determines the active workflow id for a project: the project's
 *   declared activeWorkflowId when it exists among the pruned workflows, else the
 *   default workflow, else the first one, else null (mirrors getActiveWorkflow).
 * @param {string|null} projectId
 * @param {Array<Object>|undefined} rawProjects - Raw listProjects() records.
 * @param {Array<Object>} workflows - Pruned workflows for the project.
 * @returns {string|null}
 ***/
function pickActiveWorkflowId(projectId, rawProjects, workflows) {
	if (workflows.length === 0) return null;
	const declared = findRawProject(rawProjects, projectId)?.activeWorkflowId;
	if (
		declared !== null &&
		declared !== undefined &&
		workflows.some((workflow) => workflow.id === asText(declared))
	) {
		return asText(declared);
	}
	const fallback =
		workflows.find((workflow) => workflow.isDefault === true) || workflows[0];
	return fallback ? fallback.id : null;
}

/***
 * MARK: findRawProject
 * @description Finds the raw project record matching a projectId (exact id text).
 * @param {Array<Object>|undefined} rawProjects
 * @param {string|null} projectId
 * @returns {Object|null}
 ***/
function findRawProject(rawProjects, projectId) {
	if (!Array.isArray(rawProjects)) return null;
	if (projectId === null || projectId === undefined) return null;
	const needle = asText(projectId);
	return rawProjects.find((p) => isRecord(p) && asText(p.id) === needle) || null;
}

/***
 * MARK: pruneProjects
 * @description Prunes raw project records down to { id, name, slug }, coercing
 *   missing fields to "" and dropping non-object entries.
 * @example pruneProjects([{ id: 'p1', name: 'A', slug: 'a', cwd: '/x' }]) => [{ id: 'p1', name: 'A', slug: 'a' }]
 * @param {Array<Object>|undefined} rawProjects
 * @returns {Array<{ id: string, name: string, slug: string }>}
 ***/
function pruneProjects(rawProjects) {
	if (!Array.isArray(rawProjects)) return [];
	return rawProjects
		.filter((project) => isRecord(project))
		.map((project) => ({
			id: asText(project.id),
			name: asText(project.name),
			slug: asText(project.slug),
		}));
}

/***
 * MARK: pruneWorkflows
 * @description Prunes raw workflow records down to { id, name, isDefault, stages }
 *   with stages pruned to { id, name }; drops non-object entries.
 * @param {Array<Object>|undefined} rawWorkflows
 * @returns {Array<{ id: string, name: string, isDefault: boolean, stages: Array<{ id: string, name: string }> }>}
 ***/
function pruneWorkflows(rawWorkflows) {
	if (!Array.isArray(rawWorkflows)) return [];
	return rawWorkflows
		.filter((workflow) => isRecord(workflow))
		.map((workflow) => ({
			id: asText(workflow.id),
			name: asText(workflow.name),
			isDefault: workflow.isDefault === true,
			stages: pruneStages(workflow.stages),
		}));
}

/***
 * MARK: pruneStages
 * @description Prunes raw stage records down to { id, name }.
 * @param {Array<Object>|undefined} rawStages
 * @returns {Array<{ id: string, name: string }>}
 ***/
function pruneStages(rawStages) {
	if (!Array.isArray(rawStages)) return [];
	return rawStages
		.filter((stage) => isRecord(stage))
		.map((stage) => ({ id: asText(stage.id), name: asText(stage.name) }));
}

/***
 * MARK: safeEntities
 * @description Coerces an entities snapshot (listKnownEntities output or any
 *   caller-supplied shape) into one with array-valued projects/workflows plus
 *   the snapshot project id and the optional per-project workflows accessor.
 * @param {Object} [entities]
 * @returns {{ projects: Array<Object>, workflows: Array<Object>, projectId: string|null, workflowsFor: ((projectRef: string) => Array<Object>)|null }}
 ***/
function safeEntities(entities) {
	const source = isRecord(entities) ? entities : {};
	return {
		projects: Array.isArray(source.projects) ? source.projects : [],
		workflows: Array.isArray(source.workflows) ? source.workflows : [],
		projectId: toIdOrNull(source.projectId),
		workflowsFor:
			typeof source.workflowsFor === "function" ? source.workflowsFor : null,
	};
}

/***
 * MARK: pickById
 * @description Finds the first entity whose id text equals the needle exactly.
 *   An empty needle never matches (id-less entities are unusable).
 * @param {Array<Object>} entities
 * @param {string} needle
 * @returns {Object|null}
 ***/
function pickById(entities, needle) {
	if (needle === "") return null;
	return entities.find((entity) => asText(entity?.id) === needle) || null;
}

/***
 * MARK: pickByName
 * @description Finds the first entity whose name matches case-insensitively.
 *   An empty needle never matches.
 * @param {Array<Object>} entities
 * @param {string} needle
 * @returns {Object|null}
 ***/
function pickByName(entities, needle) {
	if (needle === "") return null;
	const lowerNeedle = needle.toLowerCase();
	return (
		entities.find(
			(entity) => asText(entity?.name).toLowerCase() === lowerNeedle,
		) || null
	);
}

/***
 * MARK: pickBySlug
 * @description Finds the first project whose slug matches case-insensitively
 *   (slugs apply to projects only). An empty needle never matches.
 * @param {Array<Object>} projects
 * @param {string} needle
 * @returns {Object|null}
 ***/
function pickBySlug(projects, needle) {
	if (needle === "") return null;
	const lowerNeedle = needle.toLowerCase();
	return (
		projects.find(
			(project) => asText(project?.slug).toLowerCase() === lowerNeedle,
		) || null
	);
}

/***
 * MARK: pickStageInWorkflow
 * @description Finds a stage inside one workflow by exact id, then
 *   case-insensitive name (mirrors resolveStage in api/routes/tasks.js).
 * @param {Object} workflow
 * @param {string} needle
 * @returns {Object|null}
 ***/
function pickStageInWorkflow(workflow, needle) {
	const stages =
		isRecord(workflow) && Array.isArray(workflow.stages) ? workflow.stages : [];
	return pickById(stages, needle) || pickByName(stages, needle);
}

/***
 * MARK: resolveProjectTemplate
 * @description Resolves the exact `{{project}}` built-in token against
 *   currentProjectId when that id exists among the known projects. Any other
 *   template (or an unknown/null currentProjectId) yields null — treated by the
 *   validator as a valid-but-unresolved built-in.
 * @param {string} trimmedValue
 * @param {string|number|null} currentProjectId
 * @param {Array<Object>} knownProjects
 * @returns {{ id: string, label: string }|null}
 ***/
function resolveProjectTemplate(trimmedValue, currentProjectId, knownProjects) {
	if (!PROJECT_TEMPLATE_PATTERN.test(trimmedValue)) return null;
	if (currentProjectId === null || currentProjectId === undefined) return null;
	const match = pickById(knownProjects, asText(currentProjectId));
	return match ? toReference(match) : null;
}

/***
 * MARK: describeUnknownReference
 * @description Builds the operator-friendly reason stored with a validation
 *   error, naming the effective scoping: a resolved project scope is named by
 *   its readable label ("Name (id)") and a workflow scope by its id; without
 *   either the unscoped fallback wording applies.
 * @example describeUnknownReference('workflow', 'wf-bogus', { projectLabel: 'Project B (proj-b)' })
 *   => 'Unknown workflow reference "wf-bogus" — no workflow with a matching id or name exists in project "Project B (proj-b)"'
 * @param {'project'|'workflow'|'stage'} kind
 * @param {string} value
 * @param {Object} [scope]
 * @param {string|null} [scope.projectLabel] - Effective project label (null = unscoped).
 * @param {string|null} [scope.workflowId] - Workflow scope for stage lookups (null = unscoped).
 * @returns {string}
 ***/
function describeUnknownReference(
	kind,
	value,
	{ projectLabel = null, workflowId = null } = {},
) {
	if (kind === "project") {
		return `Unknown project reference "${value}" — no project with a matching id, name, or slug exists`;
	}
	if (kind === "workflow") {
		if (projectLabel) {
			return `Unknown workflow reference "${value}" — no workflow with a matching id or name exists in project "${projectLabel}"`;
		}
		return `Unknown workflow reference "${value}" — no workflow with a matching id or name exists in this project's workflows`;
	}
	if (projectLabel && workflowId) {
		return `Unknown stage reference "${value}" — no unique stage with a matching id or name exists in project "${projectLabel}", workflow "${workflowId}"`;
	}
	if (projectLabel) {
		return `Unknown stage reference "${value}" — no unique stage with a matching id or name exists in project "${projectLabel}"`;
	}
	if (workflowId) {
		return `Unknown stage reference "${value}" — no unique stage with a matching id or name exists in workflow "${workflowId}"`;
	}
	return `Unknown stage reference "${value}" — no unique stage with a matching id or name exists in this project's workflows`;
}

/***
 * MARK: toReference
 * @description Builds the canonical reference shape with a readable label.
 * @example toReference({ id: 'wf-default', name: 'Feature Pipeline' })
 *   => { id: 'wf-default', label: 'Feature Pipeline (wf-default)' }
 * @param {Object} entity
 * @returns {{ id: string, label: string }}
 ***/
function toReference(entity) {
	const id = asText(entity?.id);
	return { id, label: `${asText(entity?.name)} (${id})` };
}

/***
 * MARK: isRecord
 * @description True for plain objects (not null, not arrays).
 * @example isRecord({}) => true
 * @param {unknown} value
 * @returns {boolean}
 ***/
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/***
 * MARK: asText
 * @description Coerces a value to display/storage text; null and undefined become "".
 * @example asText(undefined) => ''
 * @param {unknown} value
 * @returns {string}
 ***/
function asText(value) {
	return value === null || value === undefined ? "" : String(value);
}
