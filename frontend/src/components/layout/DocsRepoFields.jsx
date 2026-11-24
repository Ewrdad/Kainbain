import React from 'react';

/***
 * MARK: DocsRepoFields
 * @description The "Advanced" docs-repo inputs shared by the Create New
 *   Project and Add Existing Project dialogs: an optional separate git
 *   repository that stores ALL KainBain-specific information (task docs,
 *   plans, reports, and the KainBain state folder) so the main repo stays
 *   free of KainBain traces. Blank URL = feature off (default, legacy
 *   behaviour). `showLocalPath` (both dialogs) adds the optional local
 *   checkout path; when blank the backend provisions a sibling
 *   `<project>-kainbain-docs` directory. Auth reuses the same login as the
 *   main repo (ambient git credentials).
 * @example <DocsRepoFields docsRepoUrl={url} setDocsRepoUrl={setUrl} docsRepoLocalPath={p} setDocsRepoLocalPath={setP} showLocalPath />
 * @param {Object} props
 * @param {string} props.docsRepoUrl - Draft docs-repo remote URL.
 * @param {Function} props.setDocsRepoUrl - URL setter.
 * @param {string} [props.docsRepoLocalPath] - Draft local checkout path.
 * @param {Function} [props.setDocsRepoLocalPath] - Local path setter.
 * @param {boolean} [props.showLocalPath] - Show the local checkout path field.
 ***/
export function DocsRepoFields({
  docsRepoUrl,
  setDocsRepoUrl,
  docsRepoLocalPath = '',
  setDocsRepoLocalPath = null,
  showLocalPath = false,
}) {
  return (
    <div className="space-y-4 border border-border-standard rounded-sm bg-surface-deep p-4">
      <div>
        <label
          htmlFor="docs-repo-url-input"
          className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
        >
          Docs Repository URL (optional)
        </label>
        <input
          id="docs-repo-url-input"
          type="text"
          value={docsRepoUrl}
          onChange={(e) => setDocsRepoUrl(e.target.value)}
          placeholder="e.g. git@github.com:me/my-repo-kainbain-docs.git"
          className="w-full p-2.5 bg-surface border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors font-mono"
        />
        <p className="mt-1 text-[11px] text-text-muted">
          A separate private repo for all KainBain docs and state. The main project repo then
          stays completely free of KainBain files. Uses the same login as the main repo. Task
          branches stay in sync across both repos.
        </p>
      </div>
      {showLocalPath && typeof setDocsRepoLocalPath === 'function' && (
        <div>
          <label
            htmlFor="docs-repo-local-path-input"
            className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
          >
            Docs Repo Local Path (optional)
          </label>
          <input
            id="docs-repo-local-path-input"
            type="text"
            value={docsRepoLocalPath}
            onChange={(e) => setDocsRepoLocalPath(e.target.value)}
            placeholder="Defaults to <project-dir>-kainbain-docs"
            className="w-full p-2.5 bg-surface border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors font-mono"
          />
          <p className="mt-1 text-[11px] text-text-muted">
            Absolute path where the docs repo is (or will be) checked out on this machine.
          </p>
        </div>
      )}
    </div>
  );
}
