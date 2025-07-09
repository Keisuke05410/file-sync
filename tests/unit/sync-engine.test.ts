import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { execSync } from 'child_process';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { SyncEngine } from '../../src/sync/engine.js';
import { SyncPlanner } from '../../src/sync/planner.js';
import { SymlinkManager, FileSystemError } from '../../src/sync/symlink.js';
import type { Config, SyncPlan, SyncAction, WorktreeInfo } from '../../src/types/index.js';

// Mock dependencies
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  unlinkSync: vi.fn()
}));

vi.mock('path', () => ({
  join: vi.fn()
}));

vi.mock('../../src/sync/planner.js', () => ({
  SyncPlanner: vi.fn()
}));

vi.mock('../../src/sync/symlink.js', () => ({
  SymlinkManager: vi.fn(),
  FileSystemError: class extends Error {
    constructor(message: string, path: string, operation: string, code?: string) {
      super(message);
      this.name = 'FileSystemError';
      this.path = path;
      this.operation = operation;
      this.code = code;
    }
  }
}));

const mockExecSync = execSync as MockedFunction<typeof execSync>;
const mockUnlinkSync = unlinkSync as MockedFunction<typeof unlinkSync>;
const mockJoin = join as MockedFunction<typeof join>;

const mockPlanner = {
  createSyncPlan: vi.fn(),
  validatePlan: vi.fn(),
  getSyncSummary: vi.fn()
};

const mockSymlinkManager = {
  executeAction: vi.fn(),
  validateSymlinks: vi.fn()
};

describe('SyncEngine', () => {
  let syncEngine: SyncEngine;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock constructor calls
    (SyncPlanner as any).mockImplementation(() => mockPlanner);
    (SymlinkManager as any).mockImplementation(() => mockSymlinkManager);
    
    syncEngine = new SyncEngine();
  });

  const mockConfig: Config = {
    sharedFiles: ['docker-compose.yml', '.env'],
    sourceWorktree: 'main',
    linkMode: 'relative',
    overwrite: false,
    ignore: [],
    hooks: {
      beforeSync: 'echo "Starting sync"',
      afterSync: 'echo "Sync completed"'
    }
  };

  const mockSourceWorktree: WorktreeInfo = {
    path: '/repo/main',
    branch: 'main',
    head: 'abc123',
    isMain: true
  };

  const mockTargetWorktrees: WorktreeInfo[] = [
    {
      path: '/repo/feature',
      branch: 'feature/test',
      head: 'def456',
      isMain: false
    }
  ];

  const mockSyncPlan: SyncPlan = {
    sourceWorktree: mockSourceWorktree,
    targetWorktrees: mockTargetWorktrees,
    syncActions: [
      {
        targetWorktree: '/repo/feature',
        file: 'docker-compose.yml',
        sourcePath: '/repo/main/docker-compose.yml',
        targetPath: '/repo/feature/docker-compose.yml',
        linkPath: '../main/docker-compose.yml',
        action: 'create',
        reason: 'Creating new symlink'
      },
      {
        targetWorktree: '/repo/feature',
        file: '.env',
        sourcePath: '/repo/main/.env',
        targetPath: '/repo/feature/.env',
        linkPath: '../main/.env',
        action: 'skip',
        reason: 'File already exists'
      }
    ]
  };

  describe('sync', () => {
    it('should execute successful sync with hooks', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });
      mockSymlinkManager.executeAction.mockResolvedValue(undefined);
      mockExecSync.mockImplementation(() => {});
      
      const result = await syncEngine.sync(mockConfig);
      
      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
      
      expect(mockExecSync).toHaveBeenCalledWith('echo "Starting sync"', {
        stdio: 'inherit',
        encoding: 'utf-8'
      });
      expect(mockExecSync).toHaveBeenCalledWith('echo "Sync completed"', {
        stdio: 'inherit',
        encoding: 'utf-8'
      });
      expect(mockSymlinkManager.executeAction).toHaveBeenCalledTimes(2);
    });

    it('should execute dry run without making changes', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });
      
      const result = await syncEngine.sync(mockConfig, true);
      
      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(mockSymlinkManager.executeAction).not.toHaveBeenCalled();
      expect(mockExecSync).not.toHaveBeenCalled(); // No hooks in dry run
    });

    it('should handle validation errors', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: false,
        errors: ['Source worktree not accessible'],
        warnings: []
      });
      
      const result = await syncEngine.sync(mockConfig);
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Source worktree not accessible');
      expect(result.errors[0].code).toBe('VALIDATION_ERROR');
      expect(mockSymlinkManager.executeAction).not.toHaveBeenCalled();
    });

    it('should handle FileSystemError during sync', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });
      
      const fsError = new FileSystemError(
        'Permission denied',
        '/repo/feature/docker-compose.yml',
        'createSymlink',
        'EACCES'
      );
      
      mockSymlinkManager.executeAction
        .mockRejectedValueOnce(fsError)
        .mockResolvedValueOnce(undefined);
      
      const result = await syncEngine.sync(mockConfig);
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        file: 'docker-compose.yml',
        worktree: '/repo/feature',
        error: 'Permission denied',
        code: 'EACCES'
      });
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('should handle hook execution errors', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });
      
      mockExecSync.mockImplementation((command) => {
        if (command === 'echo "Starting sync"') {
          throw new Error('Hook failed');
        }
      });
      
      const result = await syncEngine.sync(mockConfig);
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Hook \'beforeSync\' failed');
    });

    it('should handle general sync errors', async () => {
      const configWithoutHooks: Config = {
        ...mockConfig,
        hooks: undefined
      };
      
      mockPlanner.createSyncPlan.mockRejectedValue(new Error('Plan creation failed'));
      
      const result = await syncEngine.sync(configWithoutHooks);
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Sync failed: Error: Plan creation failed');
      expect(result.errors[0].code).toBe('SYNC_ERROR');
    });

    it('should skip hooks in dry run mode', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });
      
      await syncEngine.sync(mockConfig, true);
      
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should work without hooks defined', async () => {
      const configWithoutHooks: Config = {
        ...mockConfig,
        hooks: undefined
      };
      
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });
      mockSymlinkManager.executeAction.mockResolvedValue(undefined);
      
      const result = await syncEngine.sync(configWithoutHooks);
      
      expect(result.success).toBe(true);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should count update actions correctly', async () => {
      const planWithUpdates: SyncPlan = {
        ...mockSyncPlan,
        syncActions: [
          {
            targetWorktree: '/repo/feature',
            file: 'file1.txt',
            sourcePath: '/repo/main/file1.txt',
            targetPath: '/repo/feature/file1.txt',
            linkPath: '../main/file1.txt',
            action: 'update',
            reason: 'Updating existing link'
          },
          {
            targetWorktree: '/repo/feature',
            file: 'file2.txt',
            sourcePath: '/repo/main/file2.txt',
            targetPath: '/repo/feature/file2.txt',
            linkPath: '../main/file2.txt',
            action: 'create',
            reason: 'Creating new symlink'
          }
        ]
      };
      
      mockPlanner.createSyncPlan.mockResolvedValue(planWithUpdates);
      mockPlanner.validatePlan.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });
      mockSymlinkManager.executeAction.mockResolvedValue(undefined);
      
      const result = await syncEngine.sync({
        ...mockConfig,
        hooks: undefined
      });
      
      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe('createPlan', () => {
    it('should delegate to planner', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      
      const result = await syncEngine.createPlan(mockConfig);
      
      expect(result).toBe(mockSyncPlan);
      expect(mockPlanner.createSyncPlan).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('validatePlan', () => {
    it('should delegate to planner', async () => {
      const validation = {
        valid: true,
        errors: [],
        warnings: ['1 file will be skipped']
      };
      
      mockPlanner.validatePlan.mockResolvedValue(validation);
      
      const result = await syncEngine.validatePlan(mockSyncPlan);
      
      expect(result).toBe(validation);
      expect(mockPlanner.validatePlan).toHaveBeenCalledWith(mockSyncPlan);
    });
  });

  describe('getSyncSummary', () => {
    it('should delegate to planner', () => {
      const summary = {
        totalFiles: 2,
        totalWorktrees: 1,
        actionCounts: { create: 1, skip: 1 },
        filesByWorktree: { '/repo/feature': 2 }
      };
      
      mockPlanner.getSyncSummary.mockReturnValue(summary);
      
      const result = syncEngine.getSyncSummary(mockSyncPlan);
      
      expect(result).toBe(summary);
      expect(mockPlanner.getSyncSummary).toHaveBeenCalledWith(mockSyncPlan);
    });
  });

  describe('checkStatus', () => {
    it('should check status of all synced files', async () => {
      mockPlanner.createSyncPlan.mockResolvedValue(mockSyncPlan);
      mockSymlinkManager.validateSymlinks.mockResolvedValue({
        valid: ['docker-compose.yml'],
        broken: [],
        missing: ['.env']
      });
      
      const result = await syncEngine.checkStatus(mockConfig);
      
      expect(result.sourceWorktree).toBe('/repo/main');
      expect(result.targetWorktrees).toEqual(['/repo/feature']);
      expect(result.syncedFiles['/repo/feature']).toEqual({
        valid: ['docker-compose.yml'],
        broken: [],
        missing: ['.env']
      });
      
      expect(mockSymlinkManager.validateSymlinks).toHaveBeenCalledWith(
        mockTargetWorktrees[0],
        ['docker-compose.yml', '.env']
      );
    });

    it('should handle multiple worktrees', async () => {
      const planWithMultipleWorktrees: SyncPlan = {
        ...mockSyncPlan,
        targetWorktrees: [
          ...mockTargetWorktrees,
          {
            path: '/repo/develop',
            branch: 'develop',
            head: 'xyz789',
            isMain: false
          }
        ]
      };
      
      mockPlanner.createSyncPlan.mockResolvedValue(planWithMultipleWorktrees);
      mockSymlinkManager.validateSymlinks
        .mockResolvedValueOnce({
          valid: ['docker-compose.yml'],
          broken: [],
          missing: ['.env']
        })
        .mockResolvedValueOnce({
          valid: [],
          broken: ['docker-compose.yml'],
          missing: ['.env']
        });
      
      const result = await syncEngine.checkStatus(mockConfig);
      
      expect(result.targetWorktrees).toEqual(['/repo/feature', '/repo/develop']);
      expect(result.syncedFiles['/repo/feature'].valid).toEqual(['docker-compose.yml']);
      expect(result.syncedFiles['/repo/develop'].broken).toEqual(['docker-compose.yml']);
    });

    it('should handle duplicate files in actions', async () => {
      const planWithDuplicates: SyncPlan = {
        ...mockSyncPlan,
        syncActions: [
          ...mockSyncPlan.syncActions,
          {
            targetWorktree: '/repo/feature',
            file: 'docker-compose.yml', // Duplicate file
            sourcePath: '/repo/main/docker-compose.yml',
            targetPath: '/repo/feature/docker-compose.yml',
            linkPath: '../main/docker-compose.yml',
            action: 'update',
            reason: 'Updating existing link'
          }
        ]
      };
      
      mockPlanner.createSyncPlan.mockResolvedValue(planWithDuplicates);
      mockSymlinkManager.validateSymlinks.mockResolvedValue({
        valid: [],
        broken: [],
        missing: []
      });
      
      await syncEngine.checkStatus(mockConfig);
      
      // Should validate unique files only
      expect(mockSymlinkManager.validateSymlinks).toHaveBeenCalledWith(
        mockTargetWorktrees[0],
        ['docker-compose.yml', '.env']
      );
    });
  });

  describe('cleanBrokenLinks', () => {
    beforeEach(() => {
      mockJoin.mockImplementation((path, file) => `${path}/${file}`);
    });

    it('should clean broken links', async () => {
      // Mock checkStatus to return broken links
      vi.spyOn(syncEngine, 'checkStatus').mockResolvedValue({
        sourceWorktree: '/repo/main',
        targetWorktrees: ['/repo/feature'],
        syncedFiles: {
          '/repo/feature': {
            valid: ['docker-compose.yml'],
            broken: ['broken-link.txt', 'another-broken.txt'],
            missing: ['.env']
          }
        }
      });
      
      mockUnlinkSync.mockImplementation(() => {});
      
      const result = await syncEngine.cleanBrokenLinks(mockConfig);
      
      expect(result.cleaned).toEqual([
        '/repo/feature:broken-link.txt',
        '/repo/feature:another-broken.txt'
      ]);
      expect(result.errors).toHaveLength(0);
      
      expect(mockUnlinkSync).toHaveBeenCalledWith('/repo/feature/broken-link.txt');
      expect(mockUnlinkSync).toHaveBeenCalledWith('/repo/feature/another-broken.txt');
    });

    it('should handle dry run mode', async () => {
      vi.spyOn(syncEngine, 'checkStatus').mockResolvedValue({
        sourceWorktree: '/repo/main',
        targetWorktrees: ['/repo/feature'],
        syncedFiles: {
          '/repo/feature': {
            valid: [],
            broken: ['broken-link.txt'],
            missing: []
          }
        }
      });
      
      const result = await syncEngine.cleanBrokenLinks(mockConfig, true);
      
      expect(result.cleaned).toEqual(['/repo/feature:broken-link.txt']);
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('should handle errors during cleaning', async () => {
      vi.spyOn(syncEngine, 'checkStatus').mockResolvedValue({
        sourceWorktree: '/repo/main',
        targetWorktrees: ['/repo/feature'],
        syncedFiles: {
          '/repo/feature': {
            valid: [],
            broken: ['protected-file.txt', 'deletable-file.txt'],
            missing: []
          }
        }
      });
      
      mockUnlinkSync
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        })
        .mockImplementationOnce(() => {}); // Second call succeeds
      
      const result = await syncEngine.cleanBrokenLinks(mockConfig);
      
      expect(result.cleaned).toEqual(['/repo/feature:deletable-file.txt']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        file: 'protected-file.txt',
        worktree: '/repo/feature',
        error: 'Permission denied',
        code: 'CLEAN_ERROR'
      });
    });

    it('should handle multiple worktrees', async () => {
      vi.spyOn(syncEngine, 'checkStatus').mockResolvedValue({
        sourceWorktree: '/repo/main',
        targetWorktrees: ['/repo/feature', '/repo/develop'],
        syncedFiles: {
          '/repo/feature': {
            valid: [],
            broken: ['broken1.txt'],
            missing: []
          },
          '/repo/develop': {
            valid: [],
            broken: ['broken2.txt'],
            missing: []
          }
        }
      });
      
      mockUnlinkSync.mockImplementation(() => {});
      
      const result = await syncEngine.cleanBrokenLinks(mockConfig);
      
      expect(result.cleaned).toEqual([
        '/repo/feature:broken1.txt',
        '/repo/develop:broken2.txt'
      ]);
      expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should handle empty broken links', async () => {
      vi.spyOn(syncEngine, 'checkStatus').mockResolvedValue({
        sourceWorktree: '/repo/main',
        targetWorktrees: ['/repo/feature'],
        syncedFiles: {
          '/repo/feature': {
            valid: ['file1.txt'],
            broken: [],
            missing: ['file2.txt']
          }
        }
      });
      
      const result = await syncEngine.cleanBrokenLinks(mockConfig);
      
      expect(result.cleaned).toEqual([]);
      expect(result.errors).toHaveLength(0);
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});