import React, { useState, useEffect, useCallback } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { Icon } from '../Icon';
import { BrandMark } from '../BrandMark';
import { getSilverBulletUrl, isSilverBulletPath } from '../tasks/taskFormatters';
import { getRepoHostFileUrl } from '../../services/repoHost';
import { InfoTooltip } from '../common/InfoTooltip';
import { ResponsiveLabel } from '../common/ResponsiveLabel';
import { GoToAppLink } from '../common/GoToAppLink';
import { CreateTaskFromFileModal } from './CreateTaskFromFileModal';
import { FilePreview } from './FilePreview';
import { extensionOf, formatFileSize, getFileIcon, getFileKind } from './fileKind';

export { formatFileSize, getFileIcon };

/***
 * MARK: ProjectExplorer
 * @description In-app project file and document explorer with folder tree navigation and markdown/code content previewer.
 * Enforces server-authoritative read-only browsing within project boundaries.
 * @example <ProjectExplorer />
 ***/
export function ProjectExplorer() {
  const {
    activeProjectId,
    projects,
    tasks = [],
    setSelectedTask,
    setView,
    updateProjectInState,
  } = useKainBain();
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [searchQuery, setSearchQuery] = usePersistentState('kainbain:explorer:search', '', {
    validate: (v) => typeof v === 'string' && v.length <= 500,
    debounceMs: 800,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [error, setError] = useState(null);
  const [contentError, setContentError] = useState(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  const [copiedClone, setCopiedClone] = useState(false);
  const [copiedCwd, setCopiedCwd] = useState(false);
  const [previewMode, setPreviewMode] = useState('rendered'); // 'rendered' | 'raw'
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  /***
   * MARK: fetchDirectory
   * @description Loads directory entries for the current path in the active project.
   * @example fetchDirectory('docs/tasks')
   ***/
  const fetchDirectory = useCallback(
    async (subpath = '') => {
      if (!activeProjectId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.listFiles(activeProjectId, subpath);
        setEntries(data.entries || []);
        setCurrentPath(data.currentPath || subpath);
      } catch (err) {
        logger.error('Failed to list files', err);
        setError(err.message || 'Failed to list directory contents');
      } finally {
        setIsLoading(false);
      }
    },
    [activeProjectId],
  );

  /***
   * MARK: loadFileContent
   * @description Prepares the preview panel for a file: images and binary
   *   files describe themselves from the listing entry (no text fetch — the
   *   image pane loads raw bytes directly), while text fetches as before. A
   *   415 refusal from the text endpoint also falls back to the visual path
   *   so old backends without listing kinds keep working.
   * @example loadFileContent('docs/tasks/task-1/task.md')
   * @example loadFileContent('docs/logo.png', { name: 'logo.png', size: 512 })
   ***/
  const loadFileContent = useCallback(
    async (filePath, entry = null) => {
      if (!activeProjectId || !filePath) return;
      const source = entry || {};
      const fallbackName = String(filePath).split('/').pop() || filePath;
      const describeWithoutText = (kind) => ({
        name: source.name || fallbackName,
        path: filePath,
        content: null,
        size: typeof source.size === 'number' ? source.size : 0,
        extension: (source.extension || extensionOf(source.name || filePath) || '').toLowerCase(),
        kind,
        mime: source.mime || null,
      });
      const entryKind = getFileKind(entry || { path: filePath });
      if (entryKind === 'image' || entryKind === 'unsupported-binary') {
        setIsLoadingContent(false);
        setContentError(null);
        setFileContent(describeWithoutText(entryKind));
        return;
      }
      setIsLoadingContent(true);
      setContentError(null);
      try {
        const data = await api.getFileContent(activeProjectId, filePath);
        setFileContent(data);
      } catch (err) {
        if (/API 415\b/.test(err?.message || '')) {
          const refusedKind = getFileKind(entry || { path: filePath });
          setFileContent(
            describeWithoutText(refusedKind === 'image' ? 'image' : 'unsupported-binary'),
          );
          return;
        }
        logger.error('Failed to load file content', err);
        setContentError(err.message || 'Failed to load file content');
      } finally {
        setIsLoadingContent(false);
      }
    },
    [activeProjectId],
  );

  useEffect(() => {
    if (!activeProjectId) return;
    let isCancelled = false;
    api
      .listFiles(activeProjectId, '')
      .then((data) => {
        if (!isCancelled) {
          setEntries(data.entries || []);
          setCurrentPath(data.currentPath || '');
          setSelectedFile(null);
          setFileContent(null);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          logger.error('Failed to list files', err);
          setError(err.message || 'Failed to list directory contents');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [activeProjectId]);

  const handleEntryClick = (entry) => {
    if (entry.isDirectory) {
      fetchDirectory(entry.path);
    } else {
      setSelectedFile(entry);
      loadFileContent(entry.path, entry);
    }
  };

  const handleNavigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    fetchDirectory(parentPath);
  };

  const handleBreadcrumbClick = (targetPath) => {
    fetchDirectory(targetPath);
  };

  const handleCopyPath = (pathText) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(pathText);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleCopyContent = () => {
    if (fileContent?.content && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(fileContent.content);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    }
  };

  const handleCopyClone = () => {
    const cloneCmd = `git clone ${activeProject?.gitUrl || activeProject?.gitRepo || ''}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(cloneCmd);
      setCopiedClone(true);
      setTimeout(() => setCopiedClone(false), 2000);
    }
  };

  const handleCopyCwd = () => {
    if (activeProject?.cwd && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(activeProject.cwd);
      setCopiedCwd(true);
      setTimeout(() => setCopiedCwd(false), 2000);
    }
  };

  // Build breadcrumb segments
  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];
  const breadcrumbs = [
    { label: activeProject?.name || 'Project Root', path: '' },
    ...pathSegments.map((seg, idx) => ({
      label: seg,
      path: pathSegments.slice(0, idx + 1).join('/'),
    })),
  ];

  // Filter entries based on search query
  const filteredEntries = entries.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const gitUrl = activeProject?.gitUrl || activeProject?.gitRepo || '';
  // Web view of the configured remote (D13: derived from the git remote in
  // any form — https, ssh://, scp-like — never fabricated: hidden when
  // absent or unparseable). Prefers the server-derived repoUrl, falls back
  // to the stored git URL.
  const gitRemoteWebUrl = getRepoHostFileUrl(activeProject?.repoUrl || gitUrl) || '';
  const lines = fileContent?.content ? fileContent.content.split('\n') : [];
  const previewKind = getFileKind(fileContent ?? selectedFile ?? {});
  const isVisualPreview = previewKind === 'image' || previewKind === 'unsupported-binary';
  // Optional call: test doubles of the api client predate the raw endpoint.
  const rawPreviewUrl =
    selectedFile && isVisualPreview
      ? (api.getFileRawUrl?.(activeProjectId, selectedFile.path) ?? null)
      : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-deep text-on-surface">
      {/* Top Repository & Project Overview Bar */}
      <header className="px-4 py-2.5 bg-surface border-b border-border-standard flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-primary text-base">📦</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-high font-mono">
                  {activeProject?.name || 'Repository & Files'}
                </h2>
                {activeProject?.defaultModel && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface-container border border-border-standard font-mono text-primary">
                    AI: {activeProject.defaultModel}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-mono text-text-muted truncate max-w-md sm:max-w-xl">
                {activeProject?.cwd || 'Workspace'}
              </p>
            </div>
          </div>
        </div>

        {/* Top Header Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap max-w-full overflow-x-auto custom-scrollbar py-0.5">
          {/* Quick folder shortcuts */}
          <button
            type="button"
            onClick={() => fetchDirectory('')}
            className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-text-muted hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap"
            title="Go to project root"
          >
            📁 Root /
          </button>
          <button
            type="button"
            onClick={() => fetchDirectory('docs/tasks')}
            className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-primary hover:text-primary transition-colors cursor-pointer whitespace-nowrap"
            title="Browse task execution markdown reports"
          >
            📋 Task Reports
          </button>

          {/* Open git remote link (#24) — rendered only when a remote is configured */}
          {gitRemoteWebUrl && (
            <a
              href={gitRemoteWebUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open git remote"
              className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-on-surface hover:text-primary transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
              title="Open project repository in the git web interface"
            >
              <span>🐙</span>
              <span>Open git remote</span>
            </a>
          )}

          {gitUrl && (
            <button
              type="button"
              onClick={handleCopyClone}
              className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-on-surface transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
              title="Copy git clone command"
            >
              <span>{copiedClone ? '✓' : '🐙'}</span>
              <span>{copiedClone ? 'Copied' : 'Git Clone'}</span>
            </button>
          )}

          {activeProject?.cwd && (
            <button
              type="button"
              onClick={handleCopyCwd}
              className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-on-surface transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
              title="Copy working directory path"
            >
              <span>{copiedCwd ? '✓' : '📁'}</span>
              <span>{copiedCwd ? 'Copied' : 'Copy CWD'}</span>
            </button>
          )}

          {/* Go to App link — rendered only when the project has a stored app link */}
          <GoToAppLink
            projectId={activeProjectId}
            appStatus={activeProject?.appStatus}
            variant="action"
            onHealthChange={(fresh) =>
              updateProjectInState?.({ id: activeProjectId, appStatus: fresh })
            }
          />
        </div>
      </header>

      {/* Main Two-Column Split View (Master-Detail on mobile screens) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Panel: Directory Tree & Browser */}
        <section
          aria-label="Project Files"
          className={`w-full md:w-80 lg:w-96 border-r border-border-standard flex flex-col bg-surface shrink-0 h-full overflow-hidden ${
            selectedFile ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header & Search */}
          <div className="p-3 border-b border-border-standard bg-surface-container flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-primary text-sm" aria-hidden="true">
                  📁
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-high font-headline-sm">
                  Files & Documents
                </h3>
              </div>
              <button
                type="button"
                onClick={() => fetchDirectory(currentPath)}
                className="p-1 text-text-muted hover:text-on-surface rounded transition-colors cursor-pointer text-xs flex items-center gap-1"
                title="Refresh directory"
                aria-label="Refresh directory"
              >
                <span>🔄</span>
              </button>
            </div>

            {/* Search Filter */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter files..."
                aria-label="Filter files"
                className="w-full pl-7 pr-2.5 py-1.5 bg-surface-deep border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary"
              />
              <span
                className="absolute left-2 top-2 text-[10px] text-text-muted"
                aria-hidden="true"
              >
                🔍
              </span>
            </div>
          </div>

          {/* Breadcrumb Navigation Bar */}
          <nav
            aria-label="Folder Breadcrumbs"
            className="px-3 py-2 bg-surface-container-high border-b border-border-standard flex items-center gap-1 overflow-x-auto custom-scrollbar text-[11px] font-mono shrink-0"
          >
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.path}>
                  {idx > 0 && <span className="text-text-muted select-none">/</span>}
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(crumb.path)}
                    className={`truncate max-w-[120px] transition-colors cursor-pointer ${
                      isLast
                        ? 'text-primary font-bold'
                        : 'text-text-muted hover:text-on-surface hover:underline'
                    }`}
                    title={crumb.label}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>

          {/* Directory Entry List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
            {isLoading && (
              <div className="p-4 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                <span className="animate-spin text-primary">⏳</span>
                <span>Loading files...</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-error/10 border border-error/30 rounded-sm text-xs text-error">
                <p className="font-bold">Error loading folder</p>
                <p className="text-[10px] mt-0.5">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchDirectory(currentPath)}
                  className="mt-2 text-[10px] underline font-bold"
                >
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !error && currentPath && (
              <button
                type="button"
                onClick={handleNavigateUp}
                className="w-full text-left px-2.5 py-1.5 rounded-sm hover:bg-surface-container-high text-xs font-mono flex items-center gap-2 text-text-muted hover:text-on-surface transition-colors cursor-pointer"
              >
                <span>⬆️</span>
                <span className="font-bold">.. (up one level)</span>
              </button>
            )}

            {!isLoading && !error && filteredEntries.length === 0 && (
              <div className="p-6 text-center text-xs text-text-muted">
                <p>No files or folders found.</p>
              </div>
            )}

            {!isLoading &&
              !error &&
              filteredEntries.map((entry) => {
                const isSelected = selectedFile?.path === entry.path;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => handleEntryClick(entry)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-sm text-xs font-mono flex items-center justify-between group transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-on-primary font-bold shadow-sm'
                        : 'hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span aria-hidden="true">{getFileIcon(entry)}</span>
                      <span className="truncate">{entry.name}</span>
                    </div>
                    {!entry.isDirectory && (
                      <span
                        className={`text-[10px] shrink-0 font-mono ${
                          isSelected
                            ? 'text-on-primary/80'
                            : 'text-text-muted group-hover:text-on-surface'
                        }`}
                      >
                        {formatFileSize(entry.size)}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </section>

        {/* Right Panel: File & Document Previewer */}
        <div
          aria-label="Document Viewer"
          className={`flex-1 flex flex-col h-full overflow-hidden bg-surface-deep ${
            selectedFile ? 'flex' : 'hidden md:flex'
          }`}
        >
          {selectedFile ? (
            <>
              {/* File Details Toolbar */}
              <header className="p-3 sm:p-3.5 border-b border-border-standard bg-surface-container flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 shrink-0">
                <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0 sm:min-w-[12rem]">
                  {/* Back button for mobile view */}
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="md:hidden px-2.5 py-1 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded-sm text-xs font-mono text-primary flex items-center gap-1 cursor-pointer shrink-0"
                    aria-label="Back to file list"
                  >
                    <span>←</span>
                    <span className="font-bold">Files</span>
                  </button>

                  <span className="text-lg sm:text-xl shrink-0" aria-hidden="true">
                    {getFileIcon(selectedFile)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-on-surface font-mono truncate">
                      {selectedFile.name}
                    </h3>
                    <p className="text-[10px] font-mono text-text-muted truncate">
                      {selectedFile.path}
                    </p>
                  </div>
                </div>

                {/* Action strip. It must never trap its buttons: it owns a full
                    row below sm (compact labels) and flows back inline from sm up,
                    wrapping as many lines as the width needs. It deliberately does
                    NOT create an inner scroll container — wrapping already makes
                    every button reachable, and overflow-x-auto would clip the 3px
                    :focus-visible ring of the first control in each row (WCAG
                    2.4.13), which is the a11y bug this fix exists to avoid. */}
                <div
                  data-testid="viewer-actions"
                  className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full min-w-0 sm:w-auto py-0.5"
                >
                  {/* Open in Notes — docs/ only (deep link 404s outside the notes space) */}
                  {isSilverBulletPath(selectedFile?.path) && (
                    <InfoTooltip
                      title="Notes Space"
                      description="Open and edit this markdown document in your connected notes workspace."
                      position="bottom"
                    >
                      <a
                        href={getSilverBulletUrl(activeProject?.name, selectedFile.path)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Notes"
                        className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded-sm text-[10px] font-mono text-primary hover:text-primary transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      >
                        <span aria-hidden="true">📝</span>
                        <ResponsiveLabel full="Open in Notes" compact="Notes" />
                      </a>
                    </InfoTooltip>
                  )}

                  {/* Open in Inspector for task files */}
                  {selectedFile?.path?.includes('docs/tasks/') && (
                    <InfoTooltip
                      title="Open Task Inspector"
                      description="Navigates to the Orchestrator tab and opens this task in the Slide-over Inspector."
                      position="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const match = selectedFile.path.match(/docs\/tasks\/([^/]+)/);
                          const tId = match ? match[1] : null;
                          const found = tId ? tasks.find((t) => t.id === tId) : null;
                          if (setSelectedTask) {
                            setSelectedTask(found || { id: tId });
                          }
                          if (setView) setView('orchestrator');
                        }}
                        aria-label="Open in Inspector"
                        className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-primary/40 rounded-sm text-[10px] font-mono text-primary hover:brightness-110 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      >
                        <span aria-hidden="true">📋</span>
                        <ResponsiveLabel full="Open in Inspector" compact="Inspector" />
                      </button>
                    </InfoTooltip>
                  )}

                  {/* Markdown Render / Raw toggle */}
                  {(fileContent?.extension === '.md' || fileContent?.extension === '.markdown') && (
                    <div className="flex bg-surface-deep rounded-sm border border-border-standard p-0.5 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('rendered')}
                        className={`px-2 py-0.5 rounded-sm uppercase font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          previewMode === 'rendered'
                            ? 'bg-primary text-on-primary'
                            : 'text-text-muted hover:text-on-surface'
                        }`}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('raw')}
                        className={`px-2 py-0.5 rounded-sm uppercase font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          previewMode === 'raw'
                            ? 'bg-primary text-on-primary'
                            : 'text-text-muted hover:text-on-surface'
                        }`}
                      >
                        Raw
                      </button>
                    </div>
                  )}

                  <span className="text-[10px] font-mono text-text-muted hidden sm:inline">
                    {formatFileSize(fileContent?.size ?? selectedFile.size)}
                    {!isVisualPreview && ` • ${lines.length} lines`}
                  </span>

                  {!isVisualPreview && (
                    <button
                      type="button"
                      onClick={handleCopyContent}
                      aria-label="Copy content"
                      className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded-sm text-[10px] font-mono text-on-surface transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      title="Copy entire file contents"
                    >
                      <span aria-hidden="true">{copiedContent ? '✓' : '📋'}</span>
                      <ResponsiveLabel
                        full={copiedContent ? 'Copied' : 'Copy Content'}
                        compact={copiedContent ? 'Copied' : 'Content'}
                      />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopyPath(selectedFile.path)}
                    aria-label="Copy path"
                    className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded-sm text-[10px] font-mono text-on-surface transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                    title="Copy relative path"
                  >
                    <span aria-hidden="true">{copiedPath ? '✓' : '📁'}</span>
                    <ResponsiveLabel
                      full={copiedPath ? 'Copied' : 'Copy Path'}
                      compact={copiedPath ? 'Copied' : 'Path'}
                    />
                  </button>

                  <InfoTooltip
                    title="Create task from here"
                    description="File a cleanup or refactor task that references this file, without leaving the file viewer."
                    position="bottom"
                  >
                    <button
                      type="button"
                      onClick={() => setIsCreateTaskOpen(true)}
                      aria-label="New task: create task from here"
                      className="px-2.5 py-1 bg-primary hover:brightness-110 border border-primary rounded-sm text-[10px] font-mono font-bold text-on-primary transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      title="Create a task referencing this file"
                    >
                      <span aria-hidden="true">➕</span>
                      <ResponsiveLabel full="Create task from here" compact="New Task" />
                    </button>
                  </InfoTooltip>
                </div>
              </header>

              {/* Content Display Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {isLoadingContent && (
                  <div className="p-8 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                    <span className="animate-spin text-primary">⏳</span>
                    <span>Reading document content...</span>
                  </div>
                )}

                {contentError && (
                  <div className="p-4 bg-error/10 border border-error/30 rounded-sm text-xs text-error">
                    <p className="font-bold">Error reading file</p>
                    <p className="text-[11px] mt-1">{contentError}</p>
                  </div>
                )}

                {!isLoadingContent && !contentError && fileContent && (
                  <FilePreview
                    fileContent={fileContent}
                    selectedFile={selectedFile}
                    previewMode={previewMode}
                    lines={lines}
                    rawUrl={rawPreviewUrl}
                  />
                )}
              </div>

              {isCreateTaskOpen && (
                <CreateTaskFromFileModal
                  filePath={selectedFile.path}
                  onClose={() => setIsCreateTaskOpen(false)}
                />
              )}
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
              <BrandMark className="w-16 h-16 mb-4" tile />
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-high mb-1 font-headline-sm">
                Document & Code Viewer
              </h3>
              <p className="text-xs max-w-sm">
                Select a Markdown report, specification document, source code file, or image from
                the left to inspect its contents.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
