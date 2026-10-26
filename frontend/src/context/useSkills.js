import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';

/***
 * MARK: useSkills
 * @description Owns the stage-skills library state for the workflow editor.
 * Skills are fetched LAZILY (fetchSkills) when the workflow editor opens — not on
 * app boot — to keep the initial payload lean. The list is the merged global +
 * project-overlay library as returned by GET /skills (project overlay shadows
 * global by name). Per-skill raw content (markdown + KB_config) is fetched on
 * demand for previews via getSkillByName.
 * @param {Object} [opts]
 * @param {string} [opts.activeProjectId] - Current project id (project overlay scope).
 * @example const { skills, skillsLoading, fetchSkills, getSkillByName } = useSkills({ activeProjectId })
 ***/
export function useSkills({ activeProjectId } = {}) {
  const [skills, setSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState(null);
  const activeProjectIdRef = useRef(activeProjectId);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  /***
   * MARK: fetchSkills
   * @description Loads the available stage skills for the current project scope.
   * @example await fetchSkills('proj-1')
   * @param {string} [projectId]
   * @returns {Promise<Array>} The skill descriptors.
   ***/
  const fetchSkills = useCallback(async (projectId) => {
    const targetProjectId = projectId ?? activeProjectIdRef.current;
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const list = await api.getSkills(targetProjectId || undefined);
      const normalized = Array.isArray(list) ? list : [];
      setSkills(normalized);
      return normalized;
    } catch (err) {
      logger.error('Failed to fetch skills', err);
      setSkillsError(err.message || 'Failed to fetch skills');
      return [];
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  /***
   * MARK: getSkillByName
   * @description Fetches one skill's raw content (markdown + parsed KB_config) for preview.
   * @example await getSkillByName('creating-new-tickets', 'proj-1')
   * @param {string} name
   * @param {string} [projectId]
   * @returns {Promise<Object|null>} The skill content, or null when unavailable.
   ***/
  const getSkillByName = useCallback(async (name, projectId) => {
    try {
      const targetProjectId = projectId ?? activeProjectIdRef.current;
      return await api.getSkill(name, targetProjectId || undefined);
    } catch (err) {
      logger.error(`Failed to fetch skill ${name}`, err);
      return null;
    }
  }, []);

  return {
    skills,
    skillsLoading,
    skillsError,
    fetchSkills,
    getSkillByName,
  };
}

export default useSkills;
