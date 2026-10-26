// Domain: House Setup — repeatable, read-only evidence for planning smaller tasks.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const parser = require('../frontend/node_modules/@babel/parser');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const files = git('ls-files').trim().split('\n');
const targets = ['api/taskStore.js', 'frontend/src/components/workflow/WorkflowCanvas.jsx', 'frontend/src/components/tasks/TaskDetailOverlay.jsx', 'api/sessionStore.js', 'api/routes/compute.js', 'api/index.js', 'frontend/src/services/api.js', 'api/routes/tasks.js', 'frontend/src/context/KainBainContext.jsx', 'api/agentRunner.js', 'api/models.js'];
const end = git('show', '-s', '--format=%cI', 'HEAD').trim();
const since = new Date(new Date(end).getTime() - 60 * 86400000).toISOString();
const commits = git('log', `--since=${since}`, '--no-merges', '--format=%H').trim().split('\n').filter(Boolean);
const touches = new Map();
const taskFiles = new Map();
for (const commit of commits) {
  const subject = git('show', '-s', '--format=%s', commit);
  const task = subject.match(/(?:task |kb\/)([a-f0-9-]{36})/)?.[1];
  const changed = git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', commit).trim().split('\n');
  for (const file of changed) {
    touches.set(file, (touches.get(file) || 0) + 1);
    if (task) {
      if (!taskFiles.has(task)) taskFiles.set(task, new Set());
      taskFiles.get(task).add(file);
    }
  }
}
const merges = git('log', `--since=${since}`, '--merges', '--format=%h %s').trim().split('\n').filter(line => /conflict/i.test(line));
const mergeFiles = merges.map(line => ({ line, files: new Set(git('diff-tree', '--cc', '--name-only', '--no-commit-id', line.split(' ')[0]).trim().split('\n')) }));
const domains = ['Work / Flow / Watch', 'Flow', 'Work / Watch', 'Crew', 'Crew', 'House Setup', 'All five domains', 'Work / Flow', 'All five domains', 'Crew', 'Crew'];
let report = `# Collision and dependency baseline\n\nSource: HEAD ${git('rev-parse', '--short', 'HEAD').trim()}; window ${since} through ${end} (60 days, anchored to commit date). Read-only Git history and tracked source; no production endpoints, agent sessions, or deployed files inspected.\n\n## Measurement limits\n\nTouches count non-merge commits once per path, including formatting and auto-commits. Task attribution uses UUIDs in commit subjects and is incomplete. Conflict-message merges are evidence of reported resolution, not a count of all conflicts. The combined diff identifies files changed relative to both parents; it is a proxy, not proof of textual conflict. No merge replay or checkout was performed.\n\n| Hotspot | Lines | Touches | Conflict-message combined diffs | Owner business area |\n|---|---:|---:|---:|---|\n`;
for (const [i, file] of targets.entries()) report += `| ${file} | ${fs.readFileSync(file, 'utf8').split('\n').length - 1} | ${touches.get(file) || 0} | ${mergeFiles.filter(m => m.files.has(file)).length} | ${domains[i]} |\n`;
report += '\n## Reported conflict merges\n\n' + merges.map(line => `- ${line}`).join('\n');
report += '\n\n## Ranked source churn\n\n' + [...touches].filter(([f]) => /^(api|frontend\/src|shared)\/.*\.(js|jsx)$/.test(f) && !f.includes('.test.')).sort((a,b) => b[1]-a[1]).slice(0,15).map(([f,n]) => `- ${f}: ${n}`).join('\n');
const tasks = [...taskFiles];
const pairs = [];
for (let i=0; i<tasks.length; i++) for (let j=i+1; j<tasks.length; j++) {
  const common = targets.filter(file => tasks[i][1].has(file) && tasks[j][1].has(file));
  if (common.length) pairs.push({ a: tasks[i][0], b: tasks[j][0], common });
}
report += '\n\n## Task-pair overlap (top 12 by hotspot count)\n\n';
for (const pair of pairs.sort((a,b) => b.common.length-a.common.length).slice(0,12)) report += `- ${pair.a} / ${pair.b}: ${pair.common.join(', ')}\n`;
report += '\n## Dependency appendix\n\nStatic ESM imports/re-exports parsed with the existing Babel parser; relative paths resolved against tracked files (extensionless JSX/JS and index files included). Dynamic computed imports and runtime injection are not inferred. The TaskStore singleton remains at its original path; extracted modules must never import it.\n';
const edges = [];
for (const file of files.filter(f => /\.(js|jsx|mjs)$/.test(f) && /^(api|frontend\/src|shared)\//.test(f))) {
  const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  for (const node of ast.program.body) {
    if (!node.source?.value?.startsWith('.')) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), node.source.value));
    const target = [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`].find(p => files.includes(p));
    edges.push({ file, target, names: (node.specifiers || []).map(s => s.imported?.name || s.local?.name || '*').join(', ') || '*' });
  }
}
for (const target of targets) {
  report += `\n### ${target}\n\nImports:\n`;
  report += edges.filter(e => e.file === target).map(e => `- ${e.target}: ${e.names}`).join('\n') || '- None';
  report += '\n\nImported by:\n';
  report += edges.filter(e => e.target === target).map(e => `- ${e.file}: ${e.names}`).join('\n') || '- None (entry point or injected)';
  report += '\n';
}
process.stdout.write(report);
