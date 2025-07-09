import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { glob } from 'glob';
import { SyncPlanner } from '../../src/sync/planner.js';
import { WorktreeManager } from '../../src/git/worktree.js';
import { SymlinkManager } from '../../src/sync/symlink.js';
import type { WorktreeInfo, Config, SyncAction } from '../../src/types/index.js';

// Mock dependencies
vi.mock('glob', () => ({
  glob: vi.fn()
}));

vi.mock('../../src/git/worktree.js', () => ({
  WorktreeManager: vi.fn()
}));

vi.mock('../../src/sync/symlink.js', () => ({
  SymlinkManager: vi.fn()
}));

const mockGlob = glob as MockedFunction<typeof glob>;
const mockWorktreeManager = {
  getSourceWorktree: vi.fn(),
  getTargetWorktrees: vi.fn(),
  validateWorktreeAccess: vi.fn()
};
const mockSymlinkManager = {
  createSyncAction: vi.fn()
};

describe('SyncPlanner', () => {
  let syncPlanner: SyncPlanner;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock constructor calls
    (WorktreeManager as any).mockImplementation(() => mockWorktreeManager);
    (SymlinkManager as any).mockImplementation(() => mockSymlinkManager);
    
    syncPlanner = new SyncPlanner();
  });

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
    },
    {
      path: '/repo/develop',
      branch: 'develop',
      head: 'ghi789',
      isMain: false
    }
  ];

  const mockConfig: Config = {
    sharedFiles: ['docker-compose.yml', '*.env', '.vscode/**'],
    sourceWorktree: 'main',
    linkMode: 'relative',
    overwrite: false,
    ignore: ['*.log']
  };

  describe('createSyncPlan', () => {
    it('should create a complete sync plan', async () => {
      // Setup mocks
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      
      mockGlob
        .mockResolvedValueOnce(['docker-compose.yml']) // First pattern
        .mockResolvedValueOnce(['dev.env', 'test.env']) // Second pattern
        .mockResolvedValueOnce(['.vscode/settings.json', '.vscode/launch.json']); // Third pattern
      
      let callCount = 0;
      mockSymlinkManager.createSyncAction.mockImplementation(async (source, target, file) => {
        callCount++;
        return {
          targetWorktree: target.path,
          file,
          sourcePath: `${source.path}/${file}`,
          targetPath: `${target.path}/${file}`,
          linkPath: `../${source.branch}/${file}`,
          action: 'create',
          reason: 'Creating new symlink'
        } as SyncAction;
      });
      
      const result = await syncPlanner.createSyncPlan(mockConfig);
      
      expect(result.sourceWorktree).toEqual(mockSourceWorktree);
      expect(result.targetWorktrees).toEqual(mockTargetWorktrees);
      // 4 unique files (docker-compose.yml, dev.env, test.env, .vscode/settings.json, .vscode/launch.json) = 5 files
      // × 2 target worktrees = 10 sync actions
      expect(result.syncActions).toHaveLength(10);
      
      expect(mockWorktreeManager.getSourceWorktree).toHaveBeenCalledWith('main');
      expect(mockWorktreeManager.getTargetWorktrees).toHaveBeenCalledWith(mockSourceWorktree);
    });

    it('should resolve file patterns correctly', async () => {
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue([]);
      
      mockGlob
        .mockResolvedValueOnce(['docker-compose.yml'])
        .mockResolvedValueOnce(['dev.env'])
        .mockResolvedValueOnce(['.vscode/settings.json']);
      
      await syncPlanner.createSyncPlan(mockConfig);
      
      expect(mockGlob).toHaveBeenCalledWith('docker-compose.yml', {
        cwd: '/repo/main',
        nodir: true,
        dot: true
      });
      expect(mockGlob).toHaveBeenCalledWith('*.env', {
        cwd: '/repo/main',
        nodir: true,
        dot: true
      });
      expect(mockGlob).toHaveBeenCalledWith('.vscode/**', {
        cwd: '/repo/main',
        nodir: true,
        dot: true
      });
    });

    it('should remove duplicate files from patterns', async () => {
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      
      // Return duplicate files from different patterns
      mockGlob
        .mockResolvedValueOnce(['common.txt', 'file1.txt'])
        .mockResolvedValueOnce(['common.txt', 'file2.txt']); // common.txt appears twice
      
      mockSymlinkManager.createSyncAction.mockResolvedValue({
        targetWorktree: '/repo/feature',
        file: 'test.txt',
        sourcePath: '/repo/main/test.txt',
        targetPath: '/repo/feature/test.txt',
        linkPath: '../main/test.txt',
        action: 'create'
      });
      
      const config: Config = {
        ...mockConfig,
        sharedFiles: ['pattern1/*', 'pattern2/*']
      };
      
      await syncPlanner.createSyncPlan(config);
      
      // Should call createSyncAction for 3 unique files × 2 worktrees = 6 times
      expect(mockSymlinkManager.createSyncAction).toHaveBeenCalledTimes(6);
    });

    it('should apply ignore patterns correctly', async () => {
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      
      mockGlob.mockResolvedValue(['app.log', 'config.txt', 'debug.log']);
      
      mockSymlinkManager.createSyncAction.mockResolvedValue({
        targetWorktree: '/repo/feature',
        file: 'config.txt',
        sourcePath: '/repo/main/config.txt',
        targetPath: '/repo/feature/config.txt',
        linkPath: '../main/config.txt',
        action: 'create'
      });
      
      const config: Config = {
        ...mockConfig,
        sharedFiles: ['*'],
        ignore: ['*.log']
      };
      
      await syncPlanner.createSyncPlan(config);
      
      // Should only call createSyncAction for config.txt (logs are ignored)
      expect(mockSymlinkManager.createSyncAction).toHaveBeenCalledTimes(2); // 1 file × 2 worktrees
    });

    it('should sort files alphabetically', async () => {
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue([mockTargetWorktrees[0]]);
      
      mockGlob.mockResolvedValue(['z-file.txt', 'a-file.txt', 'm-file.txt']);
      
      const capturedFiles: string[] = [];
      mockSymlinkManager.createSyncAction.mockImplementation(async (source, target, file) => {
        capturedFiles.push(file);
        return {
          targetWorktree: target.path,
          file,
          sourcePath: `${source.path}/${file}`,
          targetPath: `${target.path}/${file}`,
          linkPath: `../${source.branch}/${file}`,
          action: 'create' as const
        };
      });
      
      await syncPlanner.createSyncPlan({
        ...mockConfig,
        sharedFiles: ['*']
      });
      
      expect(capturedFiles).toEqual(['a-file.txt', 'm-file.txt', 'z-file.txt']);
    });

    it('should handle empty file patterns', async () => {
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      
      mockGlob.mockResolvedValue([]);
      
      const result = await syncPlanner.createSyncPlan({
        ...mockConfig,
        sharedFiles: ['nonexistent/*']
      });
      
      expect(result.syncActions).toHaveLength(0);
    });
  });

  describe('validatePlan', () => {
    const mockPlan = {
      sourceWorktree: mockSourceWorktree,
      targetWorktrees: mockTargetWorktrees,
      syncActions: [
        {
          targetWorktree: '/repo/feature',
          file: 'file1.txt',
          sourcePath: '/repo/main/file1.txt',
          targetPath: '/repo/feature/file1.txt',
          linkPath: '../main/file1.txt',
          action: 'create' as const,
          reason: 'Creating new symlink'
        },
        {
          targetWorktree: '/repo/feature',
          file: 'file2.txt',
          sourcePath: '/repo/main/file2.txt',
          targetPath: '/repo/feature/file2.txt',
          linkPath: '../main/file2.txt',
          action: 'skip' as const,
          reason: 'File already exists'
        },
        {
          targetWorktree: '/repo/develop',
          file: 'file3.txt',
          sourcePath: '/repo/main/file3.txt',
          targetPath: '/repo/develop/file3.txt',
          linkPath: '../main/file3.txt',
          action: 'update' as const,
          reason: 'Updating existing link'
        }
      ]
    };

    it('should validate a valid plan', async () => {
      mockWorktreeManager.validateWorktreeAccess.mockResolvedValue(true);
      
      const result = await syncPlanner.validatePlan(mockPlan);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(2); // 1 skipped + 1 update
    });

    it('should detect inaccessible source worktree', async () => {
      mockWorktreeManager.validateWorktreeAccess
        .mockResolvedValueOnce(false) // source
        .mockResolvedValue(true); // targets
      
      const result = await syncPlanner.validatePlan(mockPlan);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Source worktree is not accessible: /repo/main');
    });

    it('should warn about inaccessible target worktrees', async () => {
      mockWorktreeManager.validateWorktreeAccess
        .mockResolvedValueOnce(true) // source
        .mockResolvedValueOnce(false) // first target
        .mockResolvedValueOnce(true); // second target
      
      const result = await syncPlanner.validatePlan(mockPlan);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Target worktree is not accessible: /repo/feature');
    });

    it('should warn about skipped actions with reasons', async () => {
      mockWorktreeManager.validateWorktreeAccess.mockResolvedValue(true);
      
      const planWithSkips = {
        ...mockPlan,
        syncActions: [
          {
            targetWorktree: '/repo/feature',
            file: 'file1.txt',
            sourcePath: '/repo/main/file1.txt',
            targetPath: '/repo/feature/file1.txt',
            linkPath: '../main/file1.txt',
            action: 'skip' as const,
            reason: 'File already exists'
          },
          {
            targetWorktree: '/repo/feature',
            file: 'file2.txt',
            sourcePath: '/repo/main/file2.txt',
            targetPath: '/repo/feature/file2.txt',
            linkPath: '../main/file2.txt',
            action: 'skip' as const,
            reason: 'File already exists'
          },
          {
            targetWorktree: '/repo/develop',
            file: 'file3.txt',
            sourcePath: '/repo/main/file3.txt',
            targetPath: '/repo/develop/file3.txt',
            linkPath: '../main/file3.txt',
            action: 'skip' as const,
            reason: 'Permission denied'
          }
        ]
      };
      
      const result = await syncPlanner.validatePlan(planWithSkips);
      
      expect(result.warnings).toContain('2 file(s) will be skipped: File already exists');
      expect(result.warnings).toContain('1 file(s) will be skipped: Permission denied');
    });

    it('should warn about update actions', async () => {
      mockWorktreeManager.validateWorktreeAccess.mockResolvedValue(true);
      
      const planWithUpdates = {
        ...mockPlan,
        syncActions: [
          {
            targetWorktree: '/repo/feature',
            file: 'file1.txt',
            sourcePath: '/repo/main/file1.txt',
            targetPath: '/repo/feature/file1.txt',
            linkPath: '../main/file1.txt',
            action: 'update' as const,
            reason: 'Updating existing link'
          },
          {
            targetWorktree: '/repo/develop',
            file: 'file2.txt',
            sourcePath: '/repo/main/file2.txt',
            targetPath: '/repo/develop/file2.txt',
            linkPath: '../main/file2.txt',
            action: 'update' as const,
            reason: 'Updating existing link'
          }
        ]
      };
      
      const result = await syncPlanner.validatePlan(planWithUpdates);
      
      expect(result.warnings).toContain('2 existing file(s)/link(s) will be updated');
    });
  });

  describe('getSyncSummary', () => {
    const mockPlan = {
      sourceWorktree: mockSourceWorktree,
      targetWorktrees: mockTargetWorktrees,
      syncActions: [
        {
          targetWorktree: '/repo/feature',
          file: 'file1.txt',
          sourcePath: '/repo/main/file1.txt',
          targetPath: '/repo/feature/file1.txt',
          linkPath: '../main/file1.txt',
          action: 'create' as const
        },
        {
          targetWorktree: '/repo/feature',
          file: 'file2.txt',
          sourcePath: '/repo/main/file2.txt',
          targetPath: '/repo/feature/file2.txt',
          linkPath: '../main/file2.txt',
          action: 'skip' as const
        },
        {
          targetWorktree: '/repo/develop',
          file: 'file1.txt',
          sourcePath: '/repo/main/file1.txt',
          targetPath: '/repo/develop/file1.txt',
          linkPath: '../main/file1.txt',
          action: 'update' as const
        }
      ]
    };

    it('should generate correct sync summary', () => {
      // Mock process.cwd to return a predictable value
      vi.spyOn(process, 'cwd').mockReturnValue('/repo');
      
      const summary = syncPlanner.getSyncSummary(mockPlan);
      
      expect(summary.totalFiles).toBe(2); // file1.txt and file2.txt
      expect(summary.totalWorktrees).toBe(2);
      expect(summary.actionCounts).toEqual({
        create: 1,
        skip: 1,
        update: 1
      });
      expect(summary.filesByWorktree).toEqual({
        'feature': 2,
        'develop': 1
      });
    });

    it('should handle empty sync plan', () => {
      const emptyPlan = {
        sourceWorktree: mockSourceWorktree,
        targetWorktrees: [],
        syncActions: []
      };
      
      const summary = syncPlanner.getSyncSummary(emptyPlan);
      
      expect(summary.totalFiles).toBe(0);
      expect(summary.totalWorktrees).toBe(0);
      expect(summary.actionCounts).toEqual({});
      expect(summary.filesByWorktree).toEqual({});
    });
  });

  describe('filterPlanByWorktree', () => {
    const mockPlan = {
      sourceWorktree: mockSourceWorktree,
      targetWorktrees: mockTargetWorktrees,
      syncActions: [
        {
          targetWorktree: '/repo/feature',
          file: 'file1.txt',
          sourcePath: '/repo/main/file1.txt',
          targetPath: '/repo/feature/file1.txt',
          linkPath: '../main/file1.txt',
          action: 'create' as const
        },
        {
          targetWorktree: '/repo/develop',
          file: 'file2.txt',
          sourcePath: '/repo/main/file2.txt',
          targetPath: '/repo/develop/file2.txt',
          linkPath: '../main/file2.txt',
          action: 'update' as const
        },
        {
          targetWorktree: '/repo/feature',
          file: 'file3.txt',
          sourcePath: '/repo/main/file3.txt',
          targetPath: '/repo/feature/file3.txt',
          linkPath: '../main/file3.txt',
          action: 'skip' as const
        }
      ]
    };

    it('should filter actions by worktree path', () => {
      const filtered = syncPlanner.filterPlanByWorktree(mockPlan, '/repo/feature');
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].file).toBe('file1.txt');
      expect(filtered[1].file).toBe('file3.txt');
    });

    it('should return empty array for non-existent worktree', () => {
      const filtered = syncPlanner.filterPlanByWorktree(mockPlan, '/repo/nonexistent');
      
      expect(filtered).toHaveLength(0);
    });
  });

  describe('filterPlanByFile', () => {
    const mockPlan = {
      sourceWorktree: mockSourceWorktree,
      targetWorktrees: mockTargetWorktrees,
      syncActions: [
        {
          targetWorktree: '/repo/feature',
          file: 'file1.txt',
          sourcePath: '/repo/main/file1.txt',
          targetPath: '/repo/feature/file1.txt',
          linkPath: '../main/file1.txt',
          action: 'create' as const
        },
        {
          targetWorktree: '/repo/develop',
          file: 'file1.txt',
          sourcePath: '/repo/main/file1.txt',
          targetPath: '/repo/develop/file1.txt',
          linkPath: '../main/file1.txt',
          action: 'update' as const
        },
        {
          targetWorktree: '/repo/feature',
          file: 'file2.txt',
          sourcePath: '/repo/main/file2.txt',
          targetPath: '/repo/feature/file2.txt',
          linkPath: '../main/file2.txt',
          action: 'skip' as const
        }
      ]
    };

    it('should filter actions by file path', () => {
      const filtered = syncPlanner.filterPlanByFile(mockPlan, 'file1.txt');
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].targetWorktree).toBe('/repo/feature');
      expect(filtered[1].targetWorktree).toBe('/repo/develop');
    });

    it('should return empty array for non-existent file', () => {
      const filtered = syncPlanner.filterPlanByFile(mockPlan, 'nonexistent.txt');
      
      expect(filtered).toHaveLength(0);
    });
  });

  describe('optimizePlan', () => {
    it('should remove unnecessary skip actions', async () => {
      const planWithUnnecessarySkips = {
        sourceWorktree: mockSourceWorktree,
        targetWorktrees: mockTargetWorktrees,
        syncActions: [
          {
            targetWorktree: '/repo/feature',
            file: 'file1.txt',
            sourcePath: '/repo/main/file1.txt',
            targetPath: '/repo/feature/file1.txt',
            linkPath: '../main/file1.txt',
            action: 'create' as const,
            reason: 'Creating new symlink'
          },
          {
            targetWorktree: '/repo/feature',
            file: 'file2.txt',
            sourcePath: '/repo/main/file2.txt',
            targetPath: '/repo/feature/file2.txt',
            linkPath: '../main/file2.txt',
            action: 'skip' as const,
            reason: 'Symlink already exists and points to correct source'
          },
          {
            targetWorktree: '/repo/develop',
            file: 'file3.txt',
            sourcePath: '/repo/main/file3.txt',
            targetPath: '/repo/develop/file3.txt',
            linkPath: '../main/file3.txt',
            action: 'skip' as const,
            reason: 'File already exists'
          }
        ]
      };
      
      const optimized = await syncPlanner.optimizePlan(planWithUnnecessarySkips);
      
      expect(optimized.syncActions).toHaveLength(2);
      expect(optimized.syncActions[0].action).toBe('create');
      expect(optimized.syncActions[1].action).toBe('skip');
      expect(optimized.syncActions[1].reason).toBe('File already exists');
    });

    it('should preserve other actions', async () => {
      const plan = {
        sourceWorktree: mockSourceWorktree,
        targetWorktrees: mockTargetWorktrees,
        syncActions: [
          {
            targetWorktree: '/repo/feature',
            file: 'file1.txt',
            sourcePath: '/repo/main/file1.txt',
            targetPath: '/repo/feature/file1.txt',
            linkPath: '../main/file1.txt',
            action: 'create' as const,
            reason: 'Creating new symlink'
          },
          {
            targetWorktree: '/repo/develop',
            file: 'file2.txt',
            sourcePath: '/repo/main/file2.txt',
            targetPath: '/repo/develop/file2.txt',
            linkPath: '../main/file2.txt',
            action: 'update' as const,
            reason: 'Updating existing link'
          }
        ]
      };
      
      const optimized = await syncPlanner.optimizePlan(plan);
      
      expect(optimized.syncActions).toHaveLength(2);
      expect(optimized).toEqual(plan);
    });
  });

  describe('createSyncPlan with selective sync', () => {
    it('should create plan with file pattern filtering', async () => {
      const mockConfig: Config = {
        sharedFiles: ['docker-compose.yml', 'test.txt', '.env'],
        sourceWorktree: 'main',
        linkMode: 'relative',
        overwrite: false,
        ignore: []
      };
      
      const selectiveSync = {
        filePatterns: ['docker-compose.yml', '*.env']
      };
      
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      mockGlob.mockResolvedValue(['docker-compose.yml', '.env']);
      mockSymlinkManager.createSyncAction.mockResolvedValue({
        targetWorktree: '/repo/feature',
        file: 'docker-compose.yml',
        sourcePath: '/repo/main/docker-compose.yml',
        targetPath: '/repo/feature/docker-compose.yml',
        linkPath: '../main/docker-compose.yml',
        action: 'create',
        reason: 'Creating new symlink'
      });
      
      const plan = await syncPlanner.createSyncPlan(mockConfig, selectiveSync);
      
      expect(plan.sourceWorktree).toBe(mockSourceWorktree);
      expect(plan.targetWorktrees).toEqual(mockTargetWorktrees);
      expect(mockGlob).toHaveBeenCalledWith('docker-compose.yml', expect.any(Object));
      expect(mockGlob).toHaveBeenCalledWith('*.env', expect.any(Object));
    });

    it('should create plan with worktree filtering', async () => {
      const mockConfig: Config = {
        sharedFiles: ['docker-compose.yml'],
        sourceWorktree: 'main',
        linkMode: 'relative',
        overwrite: false,
        ignore: []
      };
      
      const selectiveSync = {
        worktreeName: 'feature'
      };
      
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      mockGlob.mockResolvedValue(['docker-compose.yml']);
      mockSymlinkManager.createSyncAction.mockResolvedValue({
        targetWorktree: '/repo/feature',
        file: 'docker-compose.yml',
        sourcePath: '/repo/main/docker-compose.yml',
        targetPath: '/repo/feature/docker-compose.yml',
        linkPath: '../main/docker-compose.yml',
        action: 'create',
        reason: 'Creating new symlink'
      });
      
      const plan = await syncPlanner.createSyncPlan(mockConfig, selectiveSync);
      
      expect(plan.sourceWorktree).toBe(mockSourceWorktree);
      expect(plan.targetWorktrees).toEqual([mockTargetWorktrees[0]]); // Only 'feature' worktree
    });

    it('should create plan with both file and worktree filtering', async () => {
      const mockConfig: Config = {
        sharedFiles: ['docker-compose.yml', 'test.txt'],
        sourceWorktree: 'main',
        linkMode: 'relative',
        overwrite: false,
        ignore: []
      };
      
      const selectiveSync = {
        filePatterns: ['docker-compose.yml'],
        worktreeName: 'feature'
      };
      
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      mockGlob.mockResolvedValue(['docker-compose.yml']);
      mockSymlinkManager.createSyncAction.mockResolvedValue({
        targetWorktree: '/repo/feature',
        file: 'docker-compose.yml',
        sourcePath: '/repo/main/docker-compose.yml',
        targetPath: '/repo/feature/docker-compose.yml',
        linkPath: '../main/docker-compose.yml',
        action: 'create',
        reason: 'Creating new symlink'
      });
      
      const plan = await syncPlanner.createSyncPlan(mockConfig, selectiveSync);
      
      expect(plan.sourceWorktree).toBe(mockSourceWorktree);
      expect(plan.targetWorktrees).toEqual([mockTargetWorktrees[0]]); // Only 'feature' worktree
      expect(mockGlob).toHaveBeenCalledWith('docker-compose.yml', expect.any(Object));
    });

    it('should create plan without selective sync (normal behavior)', async () => {
      const mockConfig: Config = {
        sharedFiles: ['docker-compose.yml'],
        sourceWorktree: 'main',
        linkMode: 'relative',
        overwrite: false,
        ignore: []
      };
      
      mockWorktreeManager.getSourceWorktree.mockResolvedValue(mockSourceWorktree);
      mockWorktreeManager.getTargetWorktrees.mockResolvedValue(mockTargetWorktrees);
      mockGlob.mockResolvedValue(['docker-compose.yml']);
      mockSymlinkManager.createSyncAction.mockResolvedValue({
        targetWorktree: '/repo/feature',
        file: 'docker-compose.yml',
        sourcePath: '/repo/main/docker-compose.yml',
        targetPath: '/repo/feature/docker-compose.yml',
        linkPath: '../main/docker-compose.yml',
        action: 'create',
        reason: 'Creating new symlink'
      });
      
      const plan = await syncPlanner.createSyncPlan(mockConfig);
      
      expect(plan.sourceWorktree).toBe(mockSourceWorktree);
      expect(plan.targetWorktrees).toEqual(mockTargetWorktrees);
      expect(mockGlob).toHaveBeenCalledWith('docker-compose.yml', expect.any(Object));
    });
  });
});