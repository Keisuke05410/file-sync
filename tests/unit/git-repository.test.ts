import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { GitError, RepositoryManager } from '../../src/git/repository.js';

// Mock child_process and fs modules
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn()
}));

const mockExecSync = execSync as MockedFunction<typeof execSync>;
const mockExistsSync = existsSync as MockedFunction<typeof existsSync>;

describe('GitError', () => {
  it('should create GitError with all properties', () => {
    const error = new GitError(
      'Git command failed',
      'git status',
      128,
      'not a git repository'
    );
    
    expect(error.name).toBe('GitError');
    expect(error.message).toBe('Git command failed');
    expect(error.command).toBe('git status');
    expect(error.exitCode).toBe(128);
    expect(error.stderr).toBe('not a git repository');
  });

  it('should be instance of Error', () => {
    const error = new GitError('Test error', 'git test', 1);
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GitError);
  });
});

describe('RepositoryManager', () => {
  let repositoryManager: RepositoryManager;
  
  beforeEach(() => {
    // Reset singleton instance
    (RepositoryManager as any).instance = undefined;
    repositoryManager = RepositoryManager.getInstance();
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    repositoryManager.clearCache();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = RepositoryManager.getInstance();
      const instance2 = RepositoryManager.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(RepositoryManager);
    });
  });

  describe('getRepositoryRoot', () => {
    it('should return repository root path', async () => {
      mockExecSync.mockReturnValue('/path/to/repo\n');
      
      const result = await repositoryManager.getRepositoryRoot();
      
      expect(result).toBe('/path/to/repo');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --show-toplevel', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should cache repository root on subsequent calls', async () => {
      mockExecSync.mockReturnValue('/path/to/repo\n');
      
      const result1 = await repositoryManager.getRepositoryRoot();
      const result2 = await repositoryManager.getRepositoryRoot();
      
      expect(result1).toBe('/path/to/repo');
      expect(result2).toBe('/path/to/repo');
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('should throw GitError for non-git directory (exit code 128)', async () => {
      const error = new Error('Command failed');
      (error as any).status = 128;
      (error as any).stderr = Buffer.from('not a git repository');
      mockExecSync.mockImplementation(() => { throw error; });
      
      await expect(repositoryManager.getRepositoryRoot()).rejects.toThrow(GitError);
      await expect(repositoryManager.getRepositoryRoot()).rejects.toThrow(
        'Not inside a Git repository'
      );
    });

    it('should throw GitError for other git command failures', async () => {
      const error = new Error('Command failed');
      (error as any).status = 1;
      (error as any).stderr = Buffer.from('permission denied');
      mockExecSync.mockImplementation(() => { throw error; });
      
      await expect(repositoryManager.getRepositoryRoot()).rejects.toThrow(GitError);
      await expect(repositoryManager.getRepositoryRoot()).rejects.toThrow(
        'Failed to get repository root'
      );
    });

    it('should handle execSync error without status', async () => {
      const error = new Error('Unknown error');
      mockExecSync.mockImplementation(() => { throw error; });
      
      await expect(repositoryManager.getRepositoryRoot()).rejects.toThrow(GitError);
    });
  });

  describe('isGitRepository', () => {
    it('should return true when .git directory exists', async () => {
      mockExistsSync.mockReturnValue(true);
      
      const result = await repositoryManager.isGitRepository('/path/to/repo');
      
      expect(result).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith('/path/to/repo/.git');
    });

    it('should return false when .git directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      
      const result = await repositoryManager.isGitRepository('/path/to/repo');
      
      expect(result).toBe(false);
    });

    it('should return false when existsSync throws error', async () => {
      mockExistsSync.mockImplementation(() => { throw new Error('Access denied'); });
      
      const result = await repositoryManager.isGitRepository('/path/to/repo');
      
      expect(result).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      mockExecSync.mockReturnValue('main\n');
      
      const result = await repositoryManager.getCurrentBranch();
      
      expect(result).toBe('main');
      expect(mockExecSync).toHaveBeenCalledWith('git branch --show-current', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should throw GitError when git command fails', async () => {
      const error = new Error('Command failed');
      (error as any).status = 1;
      (error as any).stderr = Buffer.from('not in a repository');
      mockExecSync.mockImplementation(() => { throw error; });
      
      await expect(repositoryManager.getCurrentBranch()).rejects.toThrow(GitError);
      await expect(repositoryManager.getCurrentBranch()).rejects.toThrow(
        'Failed to get current branch'
      );
    });

    it('should handle branch name with whitespace', async () => {
      mockExecSync.mockReturnValue('  feature/test-branch  \n');
      
      const result = await repositoryManager.getCurrentBranch();
      
      expect(result).toBe('feature/test-branch');
    });
  });

  describe('getCommitHash', () => {
    it('should return commit hash for HEAD by default', async () => {
      mockExecSync.mockReturnValue('abc123def456\n');
      
      const result = await repositoryManager.getCommitHash();
      
      expect(result).toBe('abc123def456');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse HEAD', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should return commit hash for specified ref', async () => {
      mockExecSync.mockReturnValue('xyz789abc123\n');
      
      const result = await repositoryManager.getCommitHash('main');
      
      expect(result).toBe('xyz789abc123');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse main', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should throw GitError when ref does not exist', async () => {
      const error = new Error('Command failed');
      (error as any).status = 128;
      (error as any).stderr = Buffer.from('unknown revision');
      mockExecSync.mockImplementation(() => { throw error; });
      
      await expect(repositoryManager.getCommitHash('nonexistent')).rejects.toThrow(GitError);
      await expect(repositoryManager.getCommitHash('nonexistent')).rejects.toThrow(
        'Failed to get commit hash for nonexistent'
      );
    });
  });

  describe('isGitInstalled', () => {
    it('should return true when git is installed', async () => {
      mockExecSync.mockReturnValue('git version 2.30.0');
      
      const result = await repositoryManager.isGitInstalled();
      
      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git --version', {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should return false when git is not installed', async () => {
      mockExecSync.mockImplementation(() => { throw new Error('Command not found'); });
      
      const result = await repositoryManager.isGitInstalled();
      
      expect(result).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cached repository root', async () => {
      mockExecSync.mockReturnValue('/path/to/repo\n');
      
      // Get repository root to cache it
      await repositoryManager.getRepositoryRoot();
      expect(mockExecSync).toHaveBeenCalledTimes(1);
      
      // Clear cache
      repositoryManager.clearCache();
      
      // Get repository root again should call execSync again
      await repositoryManager.getRepositoryRoot();
      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });
  });
});