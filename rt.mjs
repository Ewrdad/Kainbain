import { saveTaskMarkdown, parseTaskMarkdown } from './work/taskPersistence.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-rt-'));
const store = { _resolveProjectCwd: (_p, c) => c, docsProjectFor: (s,p) => null };
const goal = `# Fix retry loop

## Context
details

\`\`\`md
# History
fake section
# Goal
another
\`\`\`

## Steps
1. x
`;
const task = { id:'rt-1', projectId:'proj-1', title:'Fix retry loop', goal, status:'in_stage', createdAt:'2026-10-01T00:00:00.000Z', updatedAt:'2026-10-01T00:00:00.000Z', history:[], reports:[] };
saveTaskMarkdown(store, dir, task);
const content = fs.readFileSync(path.join(dir,'docs','tasks','rt-1','task.md'),'utf8');
const re = parseTaskMarkdown(store, content, 'rt-1','proj-1');
console.log('MATCH:', re.goal === goal.trim());
console.log('REHYDRATED:\n'+re.goal);
console.log('ORIGINAL:\n'+goal.trim());
