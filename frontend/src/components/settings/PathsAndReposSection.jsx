/***
 * MARK: PathsAndReposSection
 * @description Files & Repositories block of the project settings form:
 *   working directory, notes symlink, docs/KainBain folder names, the
 *   centralised docs toggle, git repo URL, task-branch and review-diff
 *   options. Pure presentational section — all state lives in
 *   `ProjectSettingsForm`.
 * @example <PathsAndReposSection cwd="/p/a" setCwd={fn} notesDir="" setNotesDir={fn} docsDirName="" setDocsDirName={fn} kainbainDirName="" setKainbainDirName={fn} centralizedDocs={true} setCentralizedDocs={fn} gitRepo="" setGitRepo={fn} useBranches={false} setUseBranches={fn} preserveReviewDiff={false} setPreserveReviewDiff={fn} resetReviewBaseline={true} setResetReviewBaseline={fn} clearValidationError={fn} project={{}} projectId="p1" updateProjectInState={fn} />
 * @param {Object} props
 * @param {string} props.cwd - Draft working directory.
 * @param {Function} props.setCwd - Working directory setter.
 * @param {string} props.notesDir - Draft notes directory.
 * @param {Function} props.setNotesDir - Notes directory setter.
 * @param {string} props.docsDirName - Draft docs folder name.
 * @param {Function} props.setDocsDirName - Docs folder name setter.
 * @param {string} props.kainbainDirName - Draft KainBain folder name.
 * @param {Function} props.setKainbainDirName - KainBain folder name setter.
 * @param {boolean} props.centralizedDocs - Centralised docs opt-in.
 * @param {Function} props.setCentralizedDocs - Centralised docs setter.
 * @param {string} props.gitRepo - Draft git repo URL.
 * @param {Function} props.setGitRepo - Git repo setter.
 * @param {boolean} props.useBranches - Task-branch opt-in.
 * @param {Function} props.setUseBranches - Task-branch setter.
 * @param {boolean} props.preserveReviewDiff - Preserved review-diff opt-in.
 * @param {Function} props.setPreserveReviewDiff - Review-diff setter.
 * @param {boolean} props.resetReviewBaseline - Baseline-reset flag.
 * @param {Function} props.setResetReviewBaseline - Baseline-reset setter.
 * @param {Function} props.clearValidationError - Clears the form-level validation message.
 * @param {Object} props.project - The current project object.
 * @param {string} props.projectId - Active project identifier.
 * @param {Function} props.updateProjectInState - Merges an updated project into state.
 ***/
export function PathsAndReposSection({
  cwd,
  setCwd,
  notesDir,
  setNotesDir,
  docsDirName,
  setDocsDirName,
  kainbainDirName,
  setKainbainDirName,
  centralizedDocs,
  setCentralizedDocs,
  gitRepo,
  setGitRepo,
  useBranches,
  setUseBranches,
  preserveReviewDiff,
  setPreserveReviewDiff,
  resetReviewBaseline,
  setResetReviewBaseline,
  clearValidationError,
  _project,
  _projectId,
  _updateProjectInState,
}) {
  return (
    <div className="space-y-8">
      {/* Multi-Location Paths & Repositories */}
      <div className="border-t border-border-standard pt-8">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-high mb-4 flex items-center gap-2">
          <span className="text-primary">📂</span> Multi-Location Paths & Repositories
        </h3>
        <div className="space-y-4 max-w-2xl">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-cwd-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Working Directory (Root)
            </label>
            <input
              id="project-cwd-input"
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder="/path/to/projects/YourProject"
            />
            <p className="text-[10px] text-text-muted">
              Project source code directory (a direct child of the configured projects root)
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-notes-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Notes Space Symlink Directory
            </label>
            <input
              id="project-notes-input"
              type="text"
              value={notesDir}
              onChange={(e) => setNotesDir(e.target.value)}
              disabled={!centralizedDocs}
              className={`p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface ${
                !centralizedDocs ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              placeholder="/path/to/notes/YourProject"
            />
            <p className="text-[10px] text-text-muted">
              Knowledge store symlinked to{' '}
              <code className="font-mono text-primary">
                &lt;projectRoot&gt;/{docsDirName?.trim() || 'docs'}
              </code>
            </p>
          </div>

          {/* Documentation Folder Name & Centralized Docs Opt-out */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-docs-dir-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Documentation Folder Name
            </label>
            <input
              id="project-docs-dir-input"
              type="text"
              value={docsDirName}
              onChange={(e) => {
                setDocsDirName(e.target.value);
                clearValidationError();
              }}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder="docs"
            />
            <p className="text-[10px] text-text-muted">
              Folder in the project root used for task storage and docs (default:{' '}
              <code className="font-mono text-primary">docs</code>). Change to e.g.{' '}
              <code className="font-mono text-primary">kainbain-docs</code> if this project already
              uses a <code className="font-mono text-primary">docs/</code> directory.
            </p>
          </div>

          {/* KainBain State Folder Name */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-kainbain-dir-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              KainBain Folder Name
            </label>
            <input
              id="project-kainbain-dir-input"
              type="text"
              value={kainbainDirName}
              onChange={(e) => {
                setKainbainDirName(e.target.value);
                clearValidationError();
              }}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder=".kainbain"
            />
            <p className="text-[10px] text-text-muted">
              Folder in the project root used for KainBain internal state, sessions, and worktrees
              (default: <code className="font-mono text-primary">.kainbain</code>). Changing this
              writes the new config and removes the old one, but never moves existing state — move{' '}
              <code className="font-mono text-primary">sessions/</code>,{' '}
              <code className="font-mono text-primary">worktrees/</code> and{' '}
              <code className="font-mono text-primary">quarantine/</code> across by hand, or stop
              the API, rename the folder on disk, and restart.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-centralized-docs-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-centralized-docs-input"
                type="checkbox"
                checked={centralizedDocs}
                onChange={(e) => setCentralizedDocs(e.target.checked)}
                className="w-4 h-4 rounded border-border-standard text-primary focus:ring-primary focus:ring-offset-surface bg-surface-container"
              />
              Link to Centralised Documentation
            </label>
            <p className="text-[10px] text-text-muted pl-6">
              When checked, symlinks the docs folder to the central notes space. Uncheck to opt out
              and store docs strictly in a local directory without symlinks.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-git-input"
              className="text-xs font-bold uppercase text-text-muted tracking-wider"
            >
              Git Repository URL
            </label>
            <input
              id="project-git-input"
              type="text"
              value={gitRepo}
              onChange={(e) => setGitRepo(e.target.value)}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
              placeholder="https://git.example.com/team/repo.git"
            />
            <p className="text-[10px] text-text-muted">
              Origin remote for automated branch sync, git checkpoints, and pushes
            </p>
          </div>

          {/* Per-task branch support (opt-in): kb/<taskId> branches + merge stage */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-use-branches-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-use-branches-input"
                type="checkbox"
                checked={useBranches}
                onChange={(e) => setUseBranches(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
              />
              Use Task Branches (kb/&lt;taskId&gt; per-task branches)
            </label>
            <p className="text-[10px] text-text-muted">
              When enabled, each task creates and works on its own git branch ({'kb/<taskId>'}); add
              a <strong>Merge</strong> stage to your pipeline to integrate it into main (add a
              <strong>Deploy</strong> CI stage with the deploy command after it to deploy). Branch
              changes are refused on a dirty working tree; merge conflicts fail the stage with a
              clear message and standard failback. Human review stages gain an MR-style{' '}
              <strong>PR review</strong> view with per-line commenting; without task branches there
              is nothing to review and merge stages fail with a clear message.
            </p>
          </div>

          {/* Preserved PR-review diff (opt-in): keeps the merged change visible
              after merge + deploy instead of an empty diff */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-preserve-review-diff-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-preserve-review-diff-input"
                type="checkbox"
                checked={preserveReviewDiff}
                onChange={(e) => setPreserveReviewDiff(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
              />
              Preserve PR Review Diff After Merge
            </label>
            <p className="text-[10px] text-text-muted">
              When enabled, the final human review still shows the merged change after the task
              branch is merged and deployed (normally that diff goes empty). For rapid iteration:
              merge, deploy, then review what actually shipped.
            </p>
          </div>

          {/* Baseline reset per merge (default on): re-scopes the preserved
              review to the latest pass after a fail-back */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="project-reset-review-baseline-input"
              className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-wider cursor-pointer select-none"
            >
              <input
                id="project-reset-review-baseline-input"
                type="checkbox"
                checked={resetReviewBaseline}
                onChange={(e) => setResetReviewBaseline(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
              />
              Reset Review Baseline On Each Merge
            </label>
            <p className="text-[10px] text-text-muted">
              When enabled, every merge + deploy pass starts a fresh review baseline, so after a
              fail-back the review shows only the code changed in response to the failure. Turn it
              off to keep a cumulative view of every pass since the first merge instead.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
