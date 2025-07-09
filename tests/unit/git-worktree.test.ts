import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { WorktreeManager } from '../../src/git/worktree.js';
import { GitError, RepositoryManager } from '../../src/git/repository.js';
import type { WorktreeInfo } from '../../src/types/index.js';

// Mock dependencies
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn()
}));

vi.mock('../../src/git/repository.js', () => ({
  GitError: class extends Error {
    constructor(message: string, command: string, exitCode: number, stderr?: string) {
      super(message);
      this.name = 'GitError';
      this.command = command;
      this.exitCode = exitCode;
      this.stderr = stderr;
    }
  },
  RepositoryManager: {
    getInstance: vi.fn()
  }
}));

const mockExecSync = execSync as MockedFunction<typeof execSync>;
const mockExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockRepositoryManager = {
  getRepositoryRoot: vi.fn()
};

describe('WorktreeManager', () => {
  let worktreeManager: WorktreeManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock RepositoryManager.getInstance
    (RepositoryManager.getInstance as MockedFunction<typeof RepositoryManager.getInstance>)
      .mockReturnValue(mockRepositoryManager as any);
    
    worktreeManager = new WorktreeManager();
  });

  describe('listWorktrees', () => {
    it('should parse worktree list output correctly', async () => {
      const gitOutput = `worktree /path/to/main
HEAD abc123def456
branch refs/heads/main

worktree /path/to/feature
HEAD def456abc123
branch refs/heads/feature/test

worktree /path/to/detached
HEAD xyz789ghi012
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
      
      const result = await worktreeManager.listWorktrees();
      
      expect(result).toHaveLength(3);
      
      // Main worktree
      expect(result[0]).toEqual({
        path: '/path/to/main',
        branch: 'main',
        head: 'abc123def456',
        isMain: true
      });
      
      // Feature worktree
      expect(result[1]).toEqual({
        path: '/path/to/feature',
        branch: 'feature/test',
        head: 'def456abc123',
        isMain: false
      });
      
      // Detached worktree
      expect(result[2]).toEqual({
        path: '/path/to/detached',
        branch: 'detached',
        head: 'xyz789ghi012',
        isMain: false
      });
    });

    it('should handle empty worktree list', async () => {
      mockExecSync.mockReturnValue('');
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/repo');
      
      const result = await worktreeManager.listWorktrees();
      
      expect(result).toHaveLength(0);
    });

    it('should skip bare repositories', async () => {
      const gitOutput = `worktree /path/to/bare
bare

worktree /path/to/main
HEAD abc123def456
branch refs/heads/main
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
      
      const result = await worktreeManager.listWorktrees();
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/path/to/main');
    });

    it('should throw GitError when git command fails', async () => {
      const error = new Error('Command failed');
      (error as any).status = 128;
      (error as any).stderr = Buffer.from('not a git repository');
      mockExecSync.mockImplementation(() => { throw error; });
      
      await expect(worktreeManager.listWorktrees()).rejects.toThrow(GitError);
    });

    it('should handle worktrees without branch (detached HEAD)', async () => {
      const gitOutput = `worktree /path/to/detached
HEAD abc123def456
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
      
      const result = await worktreeManager.listWorktrees();
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: '/path/to/detached',
        branch: 'detached',
        head: 'abc123def456',
        isMain: false
      });
    });
  });

  describe('findWorktreeByBranch', () => {
    beforeEach(() => {
      const gitOutput = `worktree /path/to/main
HEAD abc123def456
branch refs/heads/main

worktree /path/to/feature
HEAD def456abc123
branch refs/heads/feature/test
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
    });

    it('should find worktree by branch name', async () => {
      const result = await worktreeManager.findWorktreeByBranch('feature/test');
      
      expect(result).toEqual({
        path: '/path/to/feature',
        branch: 'feature/test',
        head: 'def456abc123',
        isMain: false
      });
    });

    it('should return null when branch not found', async () => {
      const result = await worktreeManager.findWorktreeByBranch('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should find main branch', async () => {
      const result = await worktreeManager.findWorktreeByBranch('main');
      
      expect(result).toEqual({
        path: '/path/to/main',
        branch: 'main',
        head: 'abc123def456',
        isMain: true
      });
    });
  });

  describe('getMainWorktree', () => {
    it('should return main worktree', async () => {
      const gitOutput = `worktree /path/to/main
HEAD abc123def456
branch refs/heads/main

worktree /path/to/feature
HEAD def456abc123
branch refs/heads/feature/test
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
      
      const result = await worktreeManager.getMainWorktree();
      
      expect(result).toEqual({
        path: '/path/to/main',
        branch: 'main',
        head: 'abc123def456',
        isMain: true
      });
    });

    it('should return null when no main worktree found', async () => {
      const gitOutput = `worktree /path/to/feature
HEAD def456abc123
branch refs/heads/feature/test
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/somewhere/else');
      
      const result = await worktreeManager.getMainWorktree();
      
      expect(result).toBeNull();
    });
  });

  describe('getSourceWorktree', () => {
    beforeEach(() => {
      const gitOutput = `worktree /path/to/main
HEAD abc123def456
branch refs/heads/main

worktree /path/to/feature-branch
HEAD def456abc123
branch refs/heads/feature/test

worktree /path/to/develop
HEAD xyz789abc123
branch refs/heads/develop
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
    });

    it('should find source worktree by branch name', async () => {
      const result = await worktreeManager.getSourceWorktree('develop');
      
      expect(result).toEqual({
        path: '/path/to/develop',
        branch: 'develop',
        head: 'xyz789abc123',
        isMain: false
      });
    });

    it('should find source worktree by directory name', async () => {
      const result = await worktreeManager.getSourceWorktree('feature-branch');
      
      expect(result).toEqual({
        path: '/path/to/feature-branch',
        branch: 'feature/test',
        head: 'def456abc123',
        isMain: false
      });
    });

    it('should fall back to main worktree if source not found', async () => {
      const result = await worktreeManager.getSourceWorktree('nonexistent');
      
      expect(result).toEqual({
        path: '/path/to/main',
        branch: 'main',
        head: 'abc123def456',
        isMain: true
      });
    });

    it('should throw error if no worktrees found at all', async () => {
      mockExecSync.mockReturnValue('');
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
      
      await expect(worktreeManager.getSourceWorktree('main')).rejects.toThrow(
        'Source worktree \'main\' not found'
      );
    });
  });

  describe('getTargetWorktrees', () => {
    it('should return all worktrees except source', async () => {
      const gitOutput = `worktree /path/to/main
HEAD abc123def456
branch refs/heads/main

worktree /path/to/feature
HEAD def456abc123
branch refs/heads/feature/test

worktree /path/to/develop
HEAD xyz789abc123
branch refs/heads/develop
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
      
      const sourceWorktree: WorktreeInfo = {
        path: '/path/to/main',
        branch: 'main',
        head: 'abc123def456',
        isMain: true
      };
      
      const result = await worktreeManager.getTargetWorktrees(sourceWorktree);
      
      expect(result).toHaveLength(2);
      expect(result.find(wt => wt.path === '/path/to/main')).toBeUndefined();
      expect(result.find(wt => wt.path === '/path/to/feature')).toBeDefined();
      expect(result.find(wt => wt.path === '/path/to/develop')).toBeDefined();
    });

    it('should return empty array when only source worktree exists', async () => {
      const gitOutput = `worktree /path/to/main
HEAD abc123def456
branch refs/heads/main
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/main');
      
      const sourceWorktree: WorktreeInfo = {
        path: '/path/to/main',
        branch: 'main',
        head: 'abc123def456',
        isMain: true
      };
      
      const result = await worktreeManager.getTargetWorktrees(sourceWorktree);
      
      expect(result).toHaveLength(0);
    });
  });

  describe('validateWorktreeAccess', () => {
    it('should return true when worktree path exists', async () => {
      mockExistsSync.mockReturnValue(true);
      
      const worktree: WorktreeInfo = {
        path: '/path/to/worktree',
        branch: 'main',
        head: 'abc123',
        isMain: false
      };
      
      const result = await worktreeManager.validateWorktreeAccess(worktree);
      
      expect(result).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith('/path/to/worktree');
    });

    it('should return false when worktree path does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      
      const worktree: WorktreeInfo = {
        path: '/path/to/nonexistent',
        branch: 'main',
        head: 'abc123',
        isMain: false
      };
      
      const result = await worktreeManager.validateWorktreeAccess(worktree);
      
      expect(result).toBe(false);
    });

    it('should return false when existsSync throws error', async () => {
      mockExistsSync.mockImplementation(() => { throw new Error('Access denied'); });
      
      const worktree: WorktreeInfo = {
        path: '/path/to/restricted',
        branch: 'main',
        head: 'abc123',
        isMain: false
      };
      
      const result = await worktreeManager.validateWorktreeAccess(worktree);
      
      expect(result).toBe(false);
    });
  });

  describe('validateAllWorktrees', () => {
    beforeEach(() => {
      const gitOutput = `worktree /path/to/valid1
HEAD abc123def456
branch refs/heads/main

worktree /path/to/invalid
HEAD def456abc123
branch refs/heads/feature

worktree /path/to/valid2
HEAD xyz789abc123
branch refs/heads/develop
`;
      
      mockExecSync.mockReturnValue(gitOutput);
      mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/path/to/valid1');
    });

    it('should separate valid and invalid worktrees', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/path/to/valid1' || path === '/path/to/valid2';
      });
      
      const result = await worktreeManager.validateAllWorktrees();
      
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(1);
      
      expect(result.valid.find(wt => wt.path === '/path/to/valid1')).toBeDefined();
      expect(result.valid.find(wt => wt.path === '/path/to/valid2')).toBeDefined();
      expect(result.invalid.find(wt => wt.path === '/path/to/invalid')).toBeDefined();
    });

    it('should handle all worktrees being valid', async () => {
      mockExistsSync.mockReturnValue(true);
      
      const result = await worktreeManager.validateAllWorktrees();
      
      expect(result.valid).toHaveLength(3);
      expect(result.invalid).toHaveLength(0);
    });

    it('should handle all worktrees being invalid', async () => {
      mockExistsSync.mockReturnValue(false);
      
      const result = await worktreeManager.validateAllWorktrees();
      
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(3);
    });
  });
});