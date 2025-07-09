import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, symlinkSync, readlinkSync } from 'fs';
import { join } from 'path';
import { SyncEngine } from '../../src/sync/engine.js';
import { ConfigLoader } from '../../src/config/loader.js';
import type { Config } from '../../src/types/index.js';

describe('Unlink Integration Tests', () => {
  const testDir = '/tmp/worktree-sync-test';
  const sourceDir = join(testDir, 'main');
  const targetDir = join(testDir, 'feature');
  
  beforeEach(() => {
    // Clean up and create test directories
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    
    mkdirSync(testDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    
    // Create test files
    writeFileSync(join(sourceDir, 'test.txt'), 'test content');
    writeFileSync(join(sourceDir, 'config.json'), '{"test": true}');
    
    // Create symlinks
    symlinkSync(
      join(sourceDir, 'test.txt'),
      join(targetDir, 'test.txt')
    );
    symlinkSync(
      join(sourceDir, 'config.json'),
      join(targetDir, 'config.json')
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should remove symlinks when called', async () => {
    const config: Config = {
      sharedFiles: ['test.txt', 'config.json'],
      sourceWorktree: 'main',
      linkMode: 'absolute',
      overwrite: false,
      ignore: []
    };

    const engine = new SyncEngine();
    
    // Mock the planner to return our test setup
    const mockCreateSyncPlan = vi.fn().mockResolvedValue({
      sourceWorktree: {
        path: sourceDir,
        branch: 'main',
        head: 'abc123',
        isMain: true
      },
      targetWorktrees: [{
        path: targetDir,
        branch: 'feature',
        head: 'def456',
        isMain: false
      }],
      syncActions: [
        {
          targetWorktree: targetDir,
          file: 'test.txt',
          sourcePath: join(sourceDir, 'test.txt'),
          targetPath: join(targetDir, 'test.txt'),
          linkPath: join(sourceDir, 'test.txt'),
          action: 'create',
          reason: 'Creating new symlink'
        },
        {
          targetWorktree: targetDir,
          file: 'config.json',
          sourcePath: join(sourceDir, 'config.json'),
          targetPath: join(targetDir, 'config.json'),
          linkPath: join(sourceDir, 'config.json'),
          action: 'create',
          reason: 'Creating new symlink'
        }
      ]
    });

    const mockCheckStatus = vi.fn().mockResolvedValue({
      sourceWorktree: sourceDir,
      targetWorktrees: [targetDir],
      syncedFiles: {
        [targetDir]: {
          valid: ['test.txt', 'config.json'],
          broken: [],
          missing: []
        }
      }
    });

    vi.spyOn(engine, 'checkStatus').mockImplementation(mockCheckStatus);
    vi.spyOn(engine as any, 'planner', 'get').mockReturnValue({
      createSyncPlan: mockCreateSyncPlan
    });

    // Mock current working directory to be source (all mode)
    const originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue(sourceDir);

    // Verify symlinks exist before unlink
    expect(existsSync(join(targetDir, 'test.txt'))).toBe(true);
    expect(existsSync(join(targetDir, 'config.json'))).toBe(true);

    // Execute unlink
    const result = await engine.unlinkSymlinks(config);

    // Verify results
    expect(result.mode).toBe('all');
    expect(result.unlinked).toContain('test.txt');
    expect(result.unlinked).toContain('config.json');
    expect(result.errors).toHaveLength(0);

    // Verify symlinks were actually removed
    expect(existsSync(join(targetDir, 'test.txt'))).toBe(false);
    expect(existsSync(join(targetDir, 'config.json'))).toBe(false);

    // Verify source files still exist
    expect(existsSync(join(sourceDir, 'test.txt'))).toBe(true);
    expect(existsSync(join(sourceDir, 'config.json'))).toBe(true);

    // Restore original cwd
    process.cwd = originalCwd;
  });

  it('should handle dry run mode correctly', async () => {
    const config: Config = {
      sharedFiles: ['test.txt'],
      sourceWorktree: 'main',
      linkMode: 'absolute',
      overwrite: false,
      ignore: []
    };

    const engine = new SyncEngine();
    
    // Mock the planner
    const mockCreateSyncPlan = vi.fn().mockResolvedValue({
      sourceWorktree: {
        path: sourceDir,
        branch: 'main',
        head: 'abc123',
        isMain: true
      },
      targetWorktrees: [{
        path: targetDir,
        branch: 'feature',
        head: 'def456',
        isMain: false
      }],
      syncActions: [
        {
          targetWorktree: targetDir,
          file: 'test.txt',
          sourcePath: join(sourceDir, 'test.txt'),
          targetPath: join(targetDir, 'test.txt'),
          linkPath: join(sourceDir, 'test.txt'),
          action: 'create',
          reason: 'Creating new symlink'
        }
      ]
    });

    const mockCheckStatus = vi.fn().mockResolvedValue({
      sourceWorktree: sourceDir,
      targetWorktrees: [targetDir],
      syncedFiles: {
        [targetDir]: {
          valid: ['test.txt'],
          broken: [],
          missing: []
        }
      }
    });

    vi.spyOn(engine, 'checkStatus').mockImplementation(mockCheckStatus);
    vi.spyOn(engine as any, 'planner', 'get').mockReturnValue({
      createSyncPlan: mockCreateSyncPlan
    });

    // Mock current working directory to be source (all mode)
    const originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue(sourceDir);

    // Verify symlink exists before dry run
    expect(existsSync(join(targetDir, 'test.txt'))).toBe(true);

    // Execute dry run
    const result = await engine.unlinkSymlinks(config, true);

    // Verify results
    expect(result.mode).toBe('all');
    expect(result.unlinked).toContain('test.txt');
    expect(result.errors).toHaveLength(0);

    // Verify symlink still exists (dry run didn't actually remove it)
    expect(existsSync(join(targetDir, 'test.txt'))).toBe(true);

    // Restore original cwd
    process.cwd = originalCwd;
  });
});