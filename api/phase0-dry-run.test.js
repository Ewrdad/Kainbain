import { describe, it, expect, beforeAll } from 'vitest';
import { ProjectStore } from '../api/projectStore.js';
import { TaskStore } from '../api/taskStore.js';
import { git, defaultBranch } from '../api/git.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Phase 0: Git Branch Foundation Dry-Run', () => {
    const testRoot = path.join(os.tmpdir(), `kb-phase0-${Date.now()}`);
    let projectStore, taskStore;
    let projectCwd, projectId;
    let testTaskId;
    let mainBranch;

    beforeAll(async () => {
        if (fs.existsSync(testRoot)) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
        fs.mkdirSync(testRoot, { recursive: true });
        projectCwd = testRoot;
        
        spawnSync('git', ['init', '-b', 'main'], { cwd: projectCwd });
        
        // IMPORTANT: ignore docs/tasks/ in the git repo so they don't block checkouts
        fs.writeFileSync(path.join(projectCwd, '.gitignore'), 'docs/tasks/\n.kainbain/');
        
        fs.writeFileSync(path.join(projectCwd, 'README.md'), '# Test Project');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: projectCwd });

        mainBranch = await defaultBranch(projectCwd);

        projectStore = new ProjectStore();
        taskStore = new TaskStore({ projectStore });
        
        projectId = 'test-proj';
        projectStore.projects[projectId] = {
            id: projectId,
            name: 'Test Project',
            cwd: projectCwd,
            useBranches: true,
            pipeline: [
                { id: 'plan', type: 'agent', name: 'Planning' },
                { id: 'review', type: 'human', name: 'Human Review' },
                { id: 'merge', type: 'merge', name: 'Merge to Main' }
            ]
        };
    });

    it('should create task branch and commit work', async () => {
        const taskInput = {
            title: 'Modify README',
            goal: 'Modify README',
            stageId: 'plan',
            status: 'in_progress',
            projectCwd: projectCwd
        };
        
        const createdTask = taskStore.createTask(projectId, taskInput);
        testTaskId = createdTask.id;
        expect(createdTask).toBeDefined();

        await taskStore.ensureTaskBranch(createdTask, projectCwd);
        const branch = createdTask.branch;
        expect(branch).toBeDefined();
        
        fs.writeFileSync(path.join(projectCwd, 'README.md'), '# Test Project\nModified by agent');
        
        const { stdout: current } = await git(projectCwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
        expect(current.trim()).toBe(branch);

        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'agent work'], { cwd: projectCwd });
        
        const { stdout: logAfter } = await git(projectCwd, ['log', '--oneline', `${mainBranch}..${branch}`]);
        expect(logAfter).toContain('agent work');
    });

    it('should handle human review and failback', async () => {
        const task = taskStore.getTask(projectId, testTaskId);
        const branch = task.branch;
        
        task.status = 'waiting_human';
        task.currentStageId = 'review';

        const feedback = 'Please add more details to README';
        const stages = projectStore.projects[projectId].pipeline;
        await taskStore.rejectTask(projectId, testTaskId, stages, feedback);

        expect(task.status).toBe('in_stage');
        expect(task.currentStageId).toBe('plan');

        const { stdout: current } = await git(projectCwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
        expect(current.trim()).toBe(branch);

        fs.writeFileSync(path.join(projectCwd, 'README.md'), '# Test Project\nModified by agent\nFixed by agent');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'agent fix'], { cwd: projectCwd });

        const { stdout: log } = await git(projectCwd, ['log', '--oneline', `${mainBranch}..${branch}`]);
        expect(log).toContain('agent fix');
    });

    it('should merge to main in merge stage', async () => {
        const task = taskStore.getTask(projectId, testTaskId);
        
        task.status = 'in_progress';
        task.currentStageId = 'merge';

        const project = projectStore.projects[projectId];
        const stage = project.pipeline.find(s => s.id === 'merge');
        
        await taskStore._executeMergeStage({
            projectId,
            taskId: task.id,
            task,
            stage,
            stages: project.pipeline,
            cwd: projectCwd
        });

        await git(projectCwd, ['checkout', mainBranch]);
        const content = fs.readFileSync(path.join(projectCwd, 'README.md'), 'utf8');
        expect(content).toContain('Fixed by agent');
    });
});
