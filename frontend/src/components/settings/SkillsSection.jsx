import { useEffect, useMemo, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { Modal } from '../Modal';
import { MarkdownViewer } from '../common/MarkdownViewer';

/***
 * MARK: serverErrorMessage
 * @description Extracts the operator-facing message from a failed `request()`:
 *   the JSON `{ error }` body the API sends, falling back to the raw error
 *   text. Exported for tests.
 * @example serverErrorMessage({ body: '{"error":"Taken"}' }) => 'Taken'
 * @param {Error} err - Rejection from the shared request helper.
 * @param {string} [fallback] - Message when nothing usable is attached.
 * @returns {string}
 ***/
export function serverErrorMessage(err, fallback = 'Request failed') {
  const raw = err?.body;
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string' && parsed.error) {
        return parsed.error;
      }
    } catch {
      return raw;
    }
  }
  return err?.message || fallback;
}

/***
 * MARK: isSkillFile
 * @description Whether a File looks like an importable skill upload (`.md` or
 *   `.zip`) by extension. The server re-validates; this only short-circuits
 *   the round trip with a clear message.
 * @example isSkillFile(new File([], 'guide.md')) => true
 * @param {File} file
 * @returns {boolean}
 ***/
export function isSkillFile(file) {
  if (!file || typeof file.name !== 'string') return false;
  return /\.(md|zip)$/i.test(file.name);
}

/***
 * MARK: keywordsOf
 * @description The KB_config keyword map for a library skill row: the list
 *   payload's `config.keywords` verbatim (GET /skills keeps it), falling back
 *   to detail content fetched on expand when the list entry carries none.
 * @param {Object} [skill] - Library descriptor (GET /skills entry).
 * @param {Object} [detailKeywords] - Keywords from GET /skills/:name, if fetched.
 * @returns {Object} Keyword key -> { value, description } entry map.
 ***/
export function keywordsOf(skill, detailKeywords) {
  const fromList = skill?.config?.keywords;
  if (fromList && typeof fromList === 'object' && !Array.isArray(fromList)) return fromList;
  if (detailKeywords && typeof detailKeywords === 'object' && !Array.isArray(detailKeywords)) {
    return detailKeywords;
  }
  return {};
}

/***
 * MARK: SkillRow
 * @description One skill row in the settings library list: name, description,
 *   invalid/shadow badges, an expandable read-only view of the skill's
 *   KB_config keywords (name, default value, description), Preview, and
 *   (custom skills only) Delete. Keyword defaults are read-only here —
 *   per-stage values are set in the workflow editor's Skills panel.
 ***/
function SkillRow({
  skill,
  shadowsDefault,
  configOpen,
  configKeywords,
  configLoading,
  onToggleConfig,
  onPreview,
  onDelete,
}) {
  const isCustom = skill.source === 'project';
  const keywordEntries = Object.entries(configKeywords || {});
  const showConfigToggle = Boolean(
    skill.hasConfig || keywordEntries.length > 0 || configOpen,
  );
  return (
    <li className="flex flex-wrap items-center gap-2 p-3 bg-surface-deep border border-border-standard rounded-sm">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-on-surface">{skill.name}</span>
          {skill.invalid && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm bg-red-500/15 text-red-500 border border-red-500/30">
              Invalid
            </span>
          )}
          {shadowsDefault && (
            <span
              className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm bg-ochre/15 text-ochre border border-ochre/30"
              title="This custom skill overrides a KainBain default of the same name"
            >
              Shadows default
            </span>
          )}
          {skill.hasConfig && (
            <span className="px-1.5 py-0.5 text-[9px] font-mono rounded-sm bg-surface-container border border-border-standard text-text-muted">
              config
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-muted mt-1 truncate">
          {skill.description || 'No description'}
        </p>
        {skill.invalid && skill.error && (
          <p className="text-[10px] text-red-500 mt-1 font-mono">{skill.error}</p>
        )}
        {showConfigToggle && (
          <div className="mt-1">
            <button
              type="button"
              aria-label={`Toggle config for ${skill.name}`}
              aria-expanded={Boolean(configOpen)}
              onClick={() => onToggleConfig(skill.name)}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono text-text-muted hover:text-on-surface border border-border-standard cursor-pointer"
            >
              {configOpen ? '▲' : '▼'} config
              {keywordEntries.length > 0 ? ` (${keywordEntries.length})` : ''}
            </button>
          </div>
        )}
        {configOpen && (
          <div
            className="mt-2 p-2 rounded-sm bg-surface-container border border-border-standard space-y-1"
            data-testid={`skill-config-${skill.name}`}
          >
            {configLoading ? (
              <p className="text-[10px] text-text-muted italic font-mono">Loading config…</p>
            ) : keywordEntries.length === 0 ? (
              <p className="text-[10px] text-text-muted italic">
                No KB_config keywords for this skill.
              </p>
            ) : (
              <dl className="space-y-1.5">
                {keywordEntries.map(([key, entry]) => {
                  const entryObject =
                    entry && typeof entry === 'object' && !Array.isArray(entry);
                  const value = entryObject ? (entry.value ?? '') : (entry ?? '');
                  const description = entryObject ? (entry.description || '') : '';
                  return (
                    <div key={key} className="space-y-0.5">
                      <dt className="font-mono text-[10px] font-bold text-on-surface">{key}</dt>
                      <dd className="font-mono text-[10px] text-text-muted break-all">
                        default: {String(value) === '' ? '—' : String(value)}
                      </dd>
                      {description ? (
                        <dd className="text-[10px] text-text-muted">{description}</dd>
                      ) : null}
                    </div>
                  );
                })}
              </dl>
            )}
            <p className="text-[9px] text-text-muted italic">
              Defaults are read-only here — set per-stage values in the workflow
              editor&apos;s Skills panel (Keywords › config).
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPreview(skill.name)}
          className="px-2.5 py-1 text-text-muted hover:text-on-surface text-[10px] font-bold uppercase border border-border-standard rounded-sm cursor-pointer"
        >
          Preview
        </button>
        {isCustom && (
          <button
            type="button"
            onClick={() => onDelete(skill.name)}
            aria-label={`Delete custom skill ${skill.name}`}
            className="px-2.5 py-1 text-error hover:bg-error/10 text-[10px] font-bold uppercase border border-error/30 rounded-sm transition-colors cursor-pointer"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

/***
 * MARK: SkillsSection
 * @description Settings › Skills: the stage-skills library for the active
 *   project. Lists the read-only KainBain defaults plus this project's custom
 *   overlay, shows each skill's KB_config keywords (name, default, description)
 *   in an expandable read-only config view, imports new custom skills from a
 *   `.md` file or single-skill `.zip`, previews raw skill content, and deletes
 *   custom skills. Imported skills flow into the stage editor's skill picker
 *   (same GET /skills) and inject via the existing direct/option modes —
 *   attach them in any stage's Skills panel, where per-stage keyword values
 *   (e.g. question-me's outputFile/minQuestions) are edited.
 * @param {Object} props
 * @param {string} props.activeProjectId - Project owning the custom overlay.
 * @example <SkillsSection activeProjectId="proj-1" />
 ***/
export function SkillsSection({ activeProjectId }) {
  const {
    skills = [],
    skillsLoading = false,
    skillsError = null,
    fetchSkills,
    getSkillByName,
    notifySuccess,
    notifyError,
  } = useKainBain();

  const [importFile, setImportFile] = useState(null);
  const [importName, setImportName] = useState('');
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importConflict, setImportConflict] = useState(false);
  const [importWarnings, setImportWarnings] = useState([]);
  const [importSuccess, setImportSuccess] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [deleteError, setDeleteError] = useState('');
  const [deletingName, setDeletingName] = useState(null);
  const [previewName, setPreviewName] = useState(null);
  const [previewMarkdown, setPreviewMarkdown] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [openConfigName, setOpenConfigName] = useState(null);
  const [configDetails, setConfigDetails] = useState({});
  const [configLoadingName, setConfigLoadingName] = useState(null);

  // Load the library when the tab opens (lazy like the stage picker — the
  // shared context cache means the stage editor sees imports immediately
  // after this tab's post-import refresh).
  useEffect(() => {
    if (activeProjectId && typeof fetchSkills === 'function') {
      fetchSkills(activeProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per project tab open
  }, [activeProjectId]);

  const { defaults, customs } = useMemo(() => {
    const list = Array.isArray(skills) ? skills : [];
    return {
      defaults: list.filter((skill) => skill.source !== 'project'),
      customs: list.filter((skill) => skill.source === 'project'),
    };
  }, [skills]);
  const defaultNames = useMemo(
    () => new Set(defaults.map((skill) => skill.name)),
    [defaults],
  );

  /***
   * MARK: handleImport
   * @description Uploads the picked file (`.md`/`.zip`) with the optional
   *   name override + overwrite consent, surfaces server warnings, and
   *   refreshes the shared library on success. A 409 names the clash and
   *   points at the overwrite checkbox instead of failing silently.
   ***/
  const handleImport = async (event) => {
    event.preventDefault();
    setImportError('');
    setImportConflict(false);
    setImportWarnings([]);
    setImportSuccess('');
    if (!activeProjectId) {
      setImportError('Select a project before importing skills.');
      return;
    }
    if (!importFile) {
      setImportError('Choose a .md or .zip file to import.');
      return;
    }
    if (!isSkillFile(importFile)) {
      setImportError(`Only .md and .zip files can be imported (got '${importFile.name}').`);
      return;
    }
    setImporting(true);
    try {
      const result = await api.importSkill(activeProjectId, {
        file: importFile,
        name: importName.trim() || undefined,
        overwrite: importOverwrite,
      });
      const imported = Array.isArray(result?.skills) ? result.skills : [];
      const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
      setImportWarnings(warnings);
      const label = imported.map((skill) => skill.name).join(', ') || 'Skill';
      setImportSuccess(`Imported ${label}. Attach it in any stage's Skills panel.`);
      notifySuccess?.(`Imported skill ${label}`, 'Skill Imported');
      setImportFile(null);
      setImportName('');
      setImportOverwrite(false);
      setFileInputKey((key) => key + 1);
      await fetchSkills?.(activeProjectId);
    } catch (err) {
      logger.error('Failed to import skill', err);
      const message = serverErrorMessage(err, 'Failed to import skill');
      setImportError(message);
      if (err?.status === 409) {
        setImportConflict(true);
      } else {
        notifyError?.(message, 'Import Failed');
      }
    } finally {
      setImporting(false);
    }
  };

  /***
   * MARK: handleDelete
   * @description Confirms, then deletes one custom skill and refreshes the
   *   shared library. Global defaults never render a Delete button.
   ***/
  const handleDelete = async (name) => {
    setDeleteError('');
    if (!window.confirm(`Delete custom skill "${name}"? Stages using it will keep the name but resolve nothing.`)) {
      return;
    }
    setDeletingName(name);
    try {
      await api.deleteSkill(activeProjectId, name);
      notifySuccess?.(`Deleted skill ${name}`, 'Skill Deleted');
      await fetchSkills?.(activeProjectId);
    } catch (err) {
      logger.error(`Failed to delete skill ${name}`, err);
      const message = serverErrorMessage(err, `Failed to delete skill ${name}`);
      setDeleteError(message);
      notifyError?.(message, 'Delete Failed');
    } finally {
      setDeletingName(null);
    }
  };

  /***
   * MARK: toggleConfig
   * @description Expands/collapses one skill's read-only KB_config keyword
   *   view. Keywords render immediately from the list payload's
   *   `config.keywords`; when the list entry carries none, the detail payload
   *   (GET /skills/:name) is fetched once and cached for the session.
   ***/
  const toggleConfig = async (name) => {
    if (openConfigName === name) {
      setOpenConfigName(null);
      return;
    }
    setOpenConfigName(name);
    const list = Array.isArray(skills) ? skills : [];
    const skill = list.find((s) => s && s.name === name);
    // eslint-disable-next-line security/detect-object-injection -- name is the rendered row's skill slug
    const cached = configDetails[name];
    if (Object.keys(keywordsOf(skill, undefined)).length > 0 || cached !== undefined) return;
    if (typeof getSkillByName !== 'function') return;
    setConfigLoadingName(name);
    try {
      const raw = await getSkillByName(name, activeProjectId);
      const keywords = raw?.config?.keywords;
      setConfigDetails((prev) => ({ ...prev, [name]: keywords && typeof keywords === 'object' ? keywords : {} }));
    } catch (err) {
      logger.error(`Failed to fetch skill config ${name}`, err);
      setConfigDetails((prev) => ({ ...prev, [name]: {} }));
    } finally {
      setConfigLoadingName((current) => (current === name ? null : current));
    }
  };

  /***
   * MARK: openPreview
   * @description Loads one skill's raw markdown and opens the preview modal
   *   (same Modal + MarkdownViewer pattern as the stage skill picker).
   ***/
  const openPreview = async (name) => {
    setPreviewName(name);
    setPreviewLoading(true);
    const raw =
      typeof getSkillByName === 'function'
        ? await getSkillByName(name, activeProjectId)
        : null;
    setPreviewMarkdown(raw?.markdown || `*Skill "${name}" not available.*`);
    setPreviewLoading(false);
  };

  if (!activeProjectId) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-bold uppercase tracking-tight text-text-high flex items-center gap-2 font-headline-md">
          <span className="text-primary">🧩</span> Skills
        </h2>
        <p className="text-xs text-text-muted">Select a project to manage its skills.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold uppercase tracking-tight text-text-high mb-1 flex items-center gap-2 font-headline-md">
          <span className="text-primary">🧩</span> Skills
        </h2>
        <p className="text-xs text-text-muted">
          KainBain default skills plus this project&apos;s custom skills. Import a{' '}
          <code className="font-mono text-primary">.md</code> file or a single-skill{' '}
          <code className="font-mono text-primary">.zip</code>, then attach skills to
          stages in the workflow editor&apos;s Skills panel.
        </p>
      </div>

      {/* Import card */}
      <form
        onSubmit={handleImport}
        className="bg-surface-container border border-border-standard rounded-sm p-4 space-y-4 max-w-3xl"
      >
        <h3 className="text-xs font-bold uppercase text-text-high tracking-wider flex items-center gap-1.5">
          <span>➕</span> Import Custom Skill
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="skill-import-file"
              className="text-[10px] font-bold uppercase text-text-muted"
            >
              Skill file (.md or .zip)
            </label>
            <input
              key={fileInputKey}
              id="skill-import-file"
              type="file"
              accept=".md,.zip"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="text-xs text-on-surface file:mr-3 file:px-3 file:py-1.5 file:bg-surface-deep file:border file:border-border-standard file:rounded-sm file:text-[10px] file:font-bold file:uppercase file:text-text-muted hover:file:text-on-surface file:cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="skill-import-name"
              className="text-[10px] font-bold uppercase text-text-muted"
            >
              Name override (optional)
            </label>
            <input
              id="skill-import-name"
              type="text"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder="e.g. my-guide"
              className="p-2 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono outline-none focus:border-primary"
            />
          </div>
        </div>
        <label
          htmlFor="skill-import-overwrite"
          className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none"
        >
          <input
            id="skill-import-overwrite"
            type="checkbox"
            checked={importOverwrite}
            onChange={(e) => setImportOverwrite(e.target.checked)}
            className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
          />
          <span>
            Overwrite an existing custom skill of the same name
            {importConflict && (
              <span className="text-ochre font-bold"> — needed to retry the clash above</span>
            )}
          </span>
        </label>
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={importing || !importFile}
            className="px-4 py-2 bg-primary text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            {importing ? 'Importing…' : 'Import Skill'}
          </button>
        </div>
        {importError && (
          <p role="alert" className="text-[11px] font-bold text-red-500">
            {importError}
          </p>
        )}
        {importSuccess && (
          <p role="status" className="text-[11px] font-bold text-primary">
            {importSuccess}
          </p>
        )}
        {importWarnings.length > 0 && (
          <ul aria-label="Import warnings" className="space-y-1">
            {importWarnings.map((warning, idx) => (
              <li key={idx} className="text-[11px] text-ochre font-mono">
                ⚠ {warning}
              </li>
            ))}
          </ul>
        )}
      </form>

      {/* Library lists */}
      {skillsLoading && skills.length === 0 ? (
        <p className="text-xs text-text-muted">Loading skills…</p>
      ) : skillsError ? (
        <div className="space-y-2 max-w-3xl">
          <p role="alert" className="text-[11px] font-bold text-red-500">
            Failed to load skills: {skillsError}
          </p>
          <button
            type="button"
            onClick={() => fetchSkills?.(activeProjectId)}
            className="px-3 py-1.5 bg-surface-container hover:bg-surface-container-high border border-border-standard text-xs font-bold uppercase rounded-sm transition-colors cursor-pointer text-text-muted hover:text-on-surface"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6 max-w-3xl">
          {deleteError && (
            <p role="alert" className="text-[11px] font-bold text-red-500">
              {deleteError}
            </p>
          )}
          <section aria-label="Custom skills">
            <h3 className="text-xs font-bold uppercase text-text-high tracking-wider mb-2">
              Custom skills ({customs.length})
            </h3>
            {customs.length === 0 ? (
              <p className="text-xs text-text-muted p-3 bg-surface-container border border-border-standard rounded-sm">
                No custom skills yet — import one above to extend this project.
              </p>
            ) : (
              <ul className="space-y-2">
                {customs.map((skill) => (
                  <SkillRow
                    key={skill.name}
                    skill={skill}
                    shadowsDefault={defaultNames.has(skill.name)}
                    configOpen={openConfigName === skill.name}
                    configKeywords={keywordsOf(skill, configDetails[skill.name])}
                    configLoading={configLoadingName === skill.name}
                    onToggleConfig={toggleConfig}
                    onPreview={openPreview}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </section>
          <section aria-label="KainBain default skills">
            <h3 className="text-xs font-bold uppercase text-text-high tracking-wider mb-2">
              KainBain defaults ({defaults.length})
            </h3>
            <p className="text-[10px] text-text-muted mb-2">
              Shipped with KainBain — read-only here. Import a custom skill of the
              same name to override one for this project.
            </p>
            <ul className="space-y-2">
              {defaults.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  shadowsDefault={false}
                  configOpen={openConfigName === skill.name}
                  configKeywords={keywordsOf(skill, configDetails[skill.name])}
                  configLoading={configLoadingName === skill.name}
                  onToggleConfig={toggleConfig}
                  onPreview={openPreview}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          </section>
        </div>
      )}
      {deletingName && <span className="sr-only" role="status">Deleting {deletingName}…</span>}

      {/* Preview modal (same pattern as the stage skill picker) */}
      {previewName && (
        <Modal onClose={() => setPreviewName(null)} labelledBy="skill-preview-title">
          <div className="p-4 space-y-3 max-w-2xl">
            <h3 id="skill-preview-title" className="font-mono text-sm font-bold text-on-surface">
              {previewName}
            </h3>
            {previewLoading ? (
              <p className="text-xs text-text-muted">Loading…</p>
            ) : (
              <MarkdownViewer content={previewMarkdown} />
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewName(null)}
                className="px-3 py-1.5 bg-surface-deep hover:bg-primary hover:text-on-primary border border-border-standard text-xs font-bold uppercase rounded-sm transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default SkillsSection;
