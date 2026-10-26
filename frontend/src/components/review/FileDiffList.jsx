import { useMemo } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';

/***
 * MARK: FileDiffList
 * @description Changed-file sidebar for the MR-style review: one row per file
 *   with status chip, path, +/- counts and viewed state; filter/search box;
 *   click scrolls to the file's diff in the Files Changed tab.
 *
 * @param {Object} props
 * @param {Array} props.files - Review files per plan §4.2.
 * @param {Set} props.viewedFiles
 * @param {Function} [props.onSelectFile] - (path) => void (scroll into view).
 * @param {Function} [props.onToggleViewed] - (path) => void
 ***/
export function FileDiffList({ files = [], viewedFiles, onSelectFile, onToggleViewed }) {
  const [query, setQuery] = usePersistentState('kainbain:review:fileFilter', '', {
    validate: (v) => typeof v === 'string' && v.length <= 500,
    debounceMs: 800,
  });

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, query]);

  const totals = useMemo(
    () =>
      files.reduce(
        (acc, f) => ({
          additions: acc.additions + (f.additions || 0),
          deletions: acc.deletions + (f.deletions || 0),
        }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  );

  return (
    <div className="space-y-2" data-testid="file-diff-list">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono uppercase text-text-muted">
          {files.length} files changed
        </span>
        <span className="text-[11px] font-mono">
          <span className="text-green-400">+{totals.additions}</span>{' '}
          <span className="text-red-400">−{totals.deletions}</span>
        </span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter files…"
        aria-label="Filter changed files"
        className="w-full bg-surface-deep border border-border-standard rounded px-2 py-1.5 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
      />
      <ul className="space-y-1">
        {filtered.map((file) => {
          const viewed = viewedFiles?.has?.(file.path) || false;
          const chip =
            {
              added: 'text-green-300',
              deleted: 'text-red-300',
              renamed: 'text-amber-200',
              modified: 'text-text-muted',
            }[file.status] || 'text-text-muted';
          return (
            <li key={file.path}>
              <div
                className={`flex items-center gap-2 px-2 py-1.5 rounded-sm border text-xs font-mono cursor-pointer hover:bg-surface-deep ${
                  viewed ? 'opacity-60 border-border-standard/50' : 'border-border-standard'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectFile?.(file.path)}
                  className="flex-1 text-left truncate hover:text-primary cursor-pointer text-on-surface"
                  title={file.path}
                >
                  <span className="text-text-muted">{file.status.slice(0, 1).toUpperCase()}</span>{' '}
                  {file.path}
                  {file.binary && <span className="text-text-muted"> (binary)</span>}
                  {file.tooLarge && <span className="text-warning"> (large)</span>}
                </button>
                <span className="text-[10px] text-green-400">+{file.additions}</span>
                <span className="text-[10px] text-red-400">−{file.deletions}</span>
                <input
                  type="checkbox"
                  checked={viewed}
                  onChange={() => onToggleViewed?.(file.path)}
                  aria-label={`Mark ${file.path} as viewed`}
                  className="accent-secondary cursor-pointer"
                />
              </div>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && (
        <div className="text-[11px] font-mono text-text-muted px-2 py-2">
          No files match “{query}”.
        </div>
      )}
    </div>
  );
}
