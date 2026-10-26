import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';

const STORAGE_ACTIVE_PROJECT = 'kainbain:activeProjectId';
const STORAGE_HIDDEN_PROJECTS = 'kainbain:hiddenProjectIds';
const STORAGE_SHOW_ARCHIVED = 'kainbain:showArchivedProjects';

/***
 * MARK: getInitialStoredValue
 * @description Safely reads and parses a JSON or string value from localStorage in browser environments.
 * @example getInitialStoredValue('kainbain:showArchivedProjects', false) => false
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 ***/
function getInitialStoredValue(key, fallback) {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const item = window.localStorage.getItem(key);
    if (item === null || item === undefined) return fallback;
    try {
      return JSON.parse(item);
    } catch {
      return item;
    }
  } catch {
    return fallback;
  }
}

/***
 * MARK: setStoredValue
 * @description Safely serializes and saves a value to localStorage in browser environments.
 * @example setStoredValue('kainbain:activeProjectId', 'proj-1')
 * @param {string} key
 * @param {*} value
 ***/
function setStoredValue(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
  } catch (err) {
    logger.warn('Failed to persist to localStorage', err);
  }
}

/***
 * MARK: useProjects
 * @description Owns the project list, active project id persistence, hidden/archived project management,
 * and selector dropdown state, plus project selection / creation and notification dispatch.
 * @example const { projects, activeProjectId, selectProject, createProject, hiddenProjectIds, toggleHideProject, showArchived, setShowArchived } = useProjects()
 * @param {Object} [opts]
 * @param {Function} [opts.onSelectProject] - Called after a project is activated so the provider can connect WebSocket and load data.
 * @param {Function} [opts.onNotification] - Notification callback.
 ***/
export function useProjects({ onSelectProject, onNotification } = {}) {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectIdState] = useState(() =>
    getInitialStoredValue(STORAGE_ACTIVE_PROJECT, null),
  );
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [hiddenProjectIds, setHiddenProjectIds] = useState(() =>
    getInitialStoredValue(STORAGE_HIDDEN_PROJECTS, []),
  );
  const [showArchived, setShowArchivedState] = useState(() =>
    Boolean(getInitialStoredValue(STORAGE_SHOW_ARCHIVED, false)),
  );

  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  /***
   * MARK: setActiveProjectId
   * @description Sets the active project ID and persists it to localStorage.
   * @example setActiveProjectId('proj-1')
   * @param {string} id
   ***/
  const setActiveProjectId = useCallback((id) => {
    setActiveProjectIdState(id);
    if (id) {
      setStoredValue(STORAGE_ACTIVE_PROJECT, id);
      setStoredValue('activeProjectId', id);
    }
  }, []);

  /***
   * MARK: setShowArchived
   * @description Toggles the show/hide archived projects filter and persists state to localStorage.
   * @example setShowArchived(true)
   * @param {boolean|Function} valOrFn
   ***/
  const setShowArchived = useCallback((valOrFn) => {
    setShowArchivedState((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : Boolean(valOrFn);
      setStoredValue(STORAGE_SHOW_ARCHIVED, next);
      return next;
    });
  }, []);

  /***
   * MARK: toggleHideProject
   * @description Toggles the hidden/archived state for a given project ID and persists list to localStorage.
   * @example toggleHideProject('proj-1')
   * @param {string} projectId
   ***/
  const toggleHideProject = useCallback((projectId) => {
    if (!projectId) return;
    setHiddenProjectIds((prev) => {
      const exists = prev.includes(projectId);
      const next = exists ? prev.filter((id) => id !== projectId) : [...prev, projectId];
      setStoredValue(STORAGE_HIDDEN_PROJECTS, next);
      return next;
    });
  }, []);

  /***
   * MARK: fetchProjects
   * @description Fetches all available projects from the API and restores or sets the active project.
   * @example await fetchProjects()
   ***/
  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.listProjects();
      setProjects(data);
      if (data && data.length > 0) {
        const storedId =
          getInitialStoredValue(STORAGE_ACTIVE_PROJECT, null) ||
          getInitialStoredValue('activeProjectId', null);
        const validStored = storedId && data.some((p) => p.id === storedId);
        if (validStored) {
          setActiveProjectIdState(storedId);
        } else if (!activeProjectId || !data.some((p) => p.id === activeProjectId)) {
          const fallbackId = data[0].id;
          setActiveProjectIdState(fallbackId);
          setStoredValue(STORAGE_ACTIVE_PROJECT, fallbackId);
        }
      }
    } catch (e) {
      logger.error('Failed to fetch projects', e);
    }
  }, [activeProjectId]);

  /***
   * MARK: selectProject
   * @description Activates a project by ID, updates active state, closes dropdown, and notifies listeners.
   * @example await selectProject('proj-1')
   * @param {string} projectId
   ***/
  const selectProject = useCallback(
    async (projectId) => {
      setActiveProjectId(projectId);
      setIsProjectDropdownOpen(false);
      try {
        await api.activateProject(projectId);
        await onSelectProject?.(projectId);
      } catch (e) {
        logger.error('Failed to activate project', e);
      }
    },
    [onSelectProject, setActiveProjectId],
  );

  /***
   * MARK: createProject
   * @description Creates a new project, adds it to the project list, and activates it.
   * @example await createProject('New Project')
   * @param {string} name
   * @returns {Promise<Object|null>}
   ***/
  const createProject = useCallback(
    async (name) => {
      try {
        const project = await api.createProject({ name });
        setProjects((prev) => [...prev, project]);
        await selectProject(project.id);
        onNotificationRef.current?.({
          type: 'success',
          title: 'Project Created',
          message: `Project "${project.name || name}" initialized with git repository`,
        });
        return project;
      } catch (e) {
        logger.error('Failed to create project', e);
        return null;
      }
    },
    [selectProject],
  );

  /***
   * MARK: updateProjectInState
   * @description Merges an updated project object into the in-memory projects
   * array by id (used after a save so the applied accent/name/etc. survives
   * view/tab switches without a full re-fetch). No-op for an unknown id.
   * @example updateProjectInState({ id: 'p1', accentColor: '#38bdf8' })
   * @param {Object} updatedProject
   ***/
  const updateProjectInState = useCallback((updatedProject) => {
    if (!updatedProject?.id) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? { ...p, ...updatedProject } : p)),
    );
  }, []);

  /***
   * MARK: visibleProjects
   * @description Filtered list of projects respecting the hidden/archived toggle.
   ***/
  const visibleProjects = useMemo(() => {
    if (showArchived) return projects;
    const filtered = projects.filter((p) => !hiddenProjectIds.includes(p.id));
    // If all projects are hidden, fallback to showing all so the user is never stuck
    return filtered.length > 0 ? filtered : projects;
  }, [projects, hiddenProjectIds, showArchived]);

  /***
   * MARK: activeProject
   * @description The active project entity (or null while loading/unknown).
   *   Consumers needing per-project settings (harness, default model) read
   *   them here instead of re-fetching the project.
   ***/
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId],
  );

  /***
   * MARK: registerProject
   * @description Adopts/registers an existing project directory, updates project list, and activates it.
   * @example await registerProject({ path: '/repos/foo', name: 'Foo' })
   * @param {Object} payload
   * @param {string} payload.path
   * @param {string} [payload.name]
   * @param {string} [payload.kainbainDirName]
   * @returns {Promise<Object|null>}
   ***/
  const registerProject = useCallback(
    async (payload) => {
      try {
        const project = await api.registerProject(payload);
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === project.id);
          return exists ? prev.map((p) => (p.id === project.id ? project : p)) : [...prev, project];
        });
        await selectProject(project.id);
        onNotificationRef.current?.({
          type: 'success',
          title: 'Project Adopted',
          message: `Project "${project.name || payload.path}" registered successfully`,
        });
        return project;
      } catch (e) {
        logger.error('Failed to register project', e);
        throw e;
      }
    },
    [selectProject],
  );

  return {
    projects,
    setProjects,
    visibleProjects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    isProjectDropdownOpen,
    setIsProjectDropdownOpen,
    hiddenProjectIds,
    setHiddenProjectIds,
    toggleHideProject,
    showArchived,
    setShowArchived,
    fetchProjects,
    selectProject,
    createProject,
    registerProject,
    updateProjectInState,
  };
}
