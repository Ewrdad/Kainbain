import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { diffFiles, diffFilePatch, diffCommitList, revCount, resolveSha } from './reviewDiff.js';

describe('reviewDiff Integration Tests', () => {
    let testRoot;
    let projectCwd;

    beforeEach(async () => {
        testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-reviewdiff-int-'));
        projectCwd = testRoot;

        spawnSync('git', ['init', '-b', 'main'], { cwd: projectCwd });
        
        fs.writeFileSync(path.join(projectCwd, 'file1.txt'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n');
        fs.writeFileSync(path.join(projectCwd, 'file2.txt'), 'Original file 2\n');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: projectCwd });
    });

    it('detects modified, added, and deleted files', async () => {
        spawnSync('git', ['checkout', '-b', 'feat/test'], { cwd: projectCwd });
        fs.writeFileSync(path.join(projectCwd, 'file1.txt'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n');
        fs.writeFileSync(path.join(projectCwd, 'file3.txt'), 'New file\n');
        fs.unlinkSync(path.join(projectCwd, 'file2.txt'));
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'work'], { cwd: projectCwd });

        const files = await diffFiles(projectCwd, 'main', 'feat/test');
        const f1 = files.find(f => f.path === 'file1.txt');
        expect(f1.status).toBe('modified');
        expect(f1.additions).toBe(1);
        expect(f1.deletions).toBe(0);
        const f2 = files.find(f => f.path === 'file2.txt');
        expect(f2.status).toBe('deleted');
        const f3 = files.find(f => f.path === 'file3.txt');
        expect(f3.status).toBe('added');
    });

    it('detects renamed files', async () => {
        spawnSync('git', ['checkout', '-b', 'feat/rename'], { cwd: projectCwd });
        fs.renameSync(path.join(projectCwd, 'file1.txt'), path.join(projectCwd, 'file1_new.txt'));
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'rename'], { cwd: projectCwd });

        // Debug git output
        const status = spawnSync('git', ['diff', '--name-status', '--find-renames', 'main...feat/rename'], { cwd: projectCwd, encoding: 'utf8' });
        console.log('Git status output:', status.stdout);

        const files = await diffFiles(projectCwd, 'main', 'feat/rename');
        const f1 = files.find(f => f.path === 'file1_new.txt');
        expect(f1).toBeDefined();
        expect(f1.status).toBe('renamed');
        expect(f1.oldPath).toBe('file1.txt');
    });

    it('handles binary files', async () => {
        spawnSync('git', ['checkout', '-b', 'feat/binary'], { cwd: projectCwd });
        fs.writeFileSync(path.join(projectCwd, 'binary.bin'), Buffer.from([0x00, 0xFF, 0x00]));
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'binary'], { cwd: projectCwd });

        const files = await diffFiles(projectCwd, 'main', 'feat/binary');
        const bin = files.find(f => f.path === 'binary.bin');
        expect(bin.binary).toBe(true);
    });

    it('returns correct patch for modified file', async () => {
        spawnSync('git', ['checkout', '-b', 'feat/patch'], { cwd: projectCwd });
        fs.writeFileSync(path.join(projectCwd, 'file1.txt'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'patch'], { cwd: projectCwd });

        const patch = await diffFilePatch(projectCwd, 'main', 'feat/patch', 'file1.txt');
        expect(patch).toContain('+++ b/file1.txt');
        expect(patch).toContain('+Line 6');
    });

    it('returns correct commit list', async () => {
        spawnSync('git', ['checkout', '-b', 'feat/commits'], { cwd: projectCwd });
        fs.writeFileSync(path.join(projectCwd, 'file1.txt'), 'v2\n');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'commit 1'], { cwd: projectCwd });
        fs.writeFileSync(path.join(projectCwd, 'file1.txt'), 'v3\n');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'commit 2'], { cwd: projectCwd });

        const commits = await diffCommitList(projectCwd, 'main', 'feat/commits');
		const firstCommit = commits[0];
        expect(commits).toHaveLength(2);
        expect(commits[0].message).toBe('commit 2');
        expect(commits[1].message).toBe('commit 1');
    });

    it('returns correct ahead/behind counts', async () => {
        spawnSync('git', ['checkout', '-b', 'b1'], { cwd: projectCwd });
        fs.writeFileSync(path.join(projectCwd, 'b1.txt'), '1\n');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'b1-1'], { cwd: projectCwd });
        spawnSync('git', ['checkout', 'main'], { cwd: projectCwd });
        spawnSync('git', ['checkout', '-b', 'b2'], { cwd: projectCwd });
        fs.writeFileSync(path.join(projectCwd, 'b2.txt'), '2\n');
        spawnSync('git', ['add', '.'], { cwd: projectCwd });
        spawnSync('git', ['commit', '-m', 'b2-1'], { cwd: projectCwd });

        const counts = await revCount(projectCwd, 'b1', 'b2');
        expect(counts.ahead).toBe(1);
        expect(counts.behind).toBe(1);
    });

    it('resolves shas correctly', async () => {
        const sha = await resolveSha(projectCwd, 'main');
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });
});
