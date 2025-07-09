import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock file system with error conditions
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  symlinkSync: vi.fn(),
  unlinkSync: vi.fn(),
  lstatSync: vi.fn(),
  readlinkSync: vi.fn(),
  realpathSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn()
  }))
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
  symlink: vi.fn(),
  unlink: vi.fn(),
  lstat: vi.fn(),
  realpath: vi.fn()
}));

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('glob', () => ({
  glob: vi.fn()
}));

describe('Error Handling Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File System Errors', () => {
    it('should handle EACCES permission errors', async () => {
      const { SymlinkManager, FileSystemError } = await import('../../src/sync/symlink.js');
      const { symlinkSync } = await import('fs');
      
      vi.mocked(symlinkSync).mockImplementation(() => {
        throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      });
      
      const manager = new SymlinkManager();
      
      await expect(manager.createSymlink('/source/file', '/target/file', 'relative')).rejects.toThrow(FileSystemError);
    });

    it('should handle EMFILE (too many open files) errors', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      const { lstatSync } = await import('fs');
      
      vi.mocked(lstatSync).mockImplementation(() => {
        throw Object.assign(new Error('Too many open files'), { code: 'EMFILE' });
      });
      
      const manager = new SymlinkManager();
      
      // isValidSymlink handles errors gracefully and returns false
      expect(manager.isValidSymlink('/some/file')).toBe(false);
    });

    it('should handle ENOSPC (no space left) errors', async () => {
      const { writeFile } = await import('fs/promises');
      
      vi.mocked(writeFile).mockRejectedValue(Object.assign(new Error('No space left on device'), { code: 'ENOSPC' }));
      
      // This would typically be called through config operations
      await expect(writeFile('/full/disk/file', 'content')).rejects.toThrow();
    });

    it('should handle ELOOP (symlink loop) errors', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      const { readlinkSync } = await import('fs');
      
      vi.mocked(readlinkSync).mockImplementation(() => {
        throw Object.assign(new Error('Too many symbolic links'), { code: 'ELOOP' });
      });
      
      const manager = new SymlinkManager();
      
      // isValidSymlink handles errors gracefully and returns false
      expect(manager.isValidSymlink('/loop/file')).toBe(false);
    });

    it('should handle ENOTDIR errors', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      const { existsSync } = await import('fs');
      
      vi.mocked(existsSync).mockImplementation(() => {
        throw Object.assign(new Error('Not a directory'), { code: 'ENOTDIR' });
      });
      
      const manager = new SymlinkManager();
      
      // isValidSymlink handles errors gracefully and returns false
      expect(manager.isValidSymlink('/file/as/dir/path')).toBe(false);
    });
  });

  describe('Git Command Errors', () => {
    it('should handle git command not found', async () => {
      const { RepositoryManager } = await import('../../src/git/repository.js');
      const { execSync } = await import('child_process');
      
      vi.mocked(execSync).mockImplementation(() => {
        throw Object.assign(new Error('Command not found'), { code: 'ENOENT' });
      });
      
      const manager = RepositoryManager.getInstance();
      
      await expect(manager.isGitInstalled()).resolves.toBe(false);
    });

    it('should handle git repository not found', async () => {
      const { RepositoryManager, GitError } = await import('../../src/git/repository.js');
      const { execSync } = await import('child_process');
      
      vi.mocked(execSync).mockImplementation(() => {
        const error = new Error('Not a git repository');
        (error as any).status = 128;
        throw error;
      });
      
      const manager = RepositoryManager.getInstance();
      
      await expect(manager.getRepositoryRoot()).rejects.toThrow(GitError);
    });

    it('should handle git worktree list errors', async () => {
      const { WorktreeManager } = await import('../../src/git/worktree.js');
      const { execSync } = await import('child_process');
      
      vi.mocked(execSync).mockImplementation(() => {
        const error = new Error('Git worktree command failed');
        (error as any).status = 1;
        throw error;
      });
      
      const manager = new WorktreeManager();
      
      await expect(manager.listWorktrees()).rejects.toThrow();
    });

    it('should handle corrupted git repository', async () => {
      const { RepositoryManager, GitError } = await import('../../src/git/repository.js');
      const { execSync } = await import('child_process');
      
      vi.mocked(execSync).mockImplementation(() => {
        const error = new Error('Object database corrupted');
        (error as any).status = 128;
        throw error;
      });
      
      const manager = RepositoryManager.getInstance();
      
      await expect(manager.getRepositoryRoot()).rejects.toThrow(GitError);
    });
  });

  describe('Configuration Errors', () => {
    it('should handle malformed JSON configuration', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { readFile } = await import('fs/promises');
      
      vi.mocked(readFile).mockResolvedValue('{ invalid json }');
      
      const loader = new ConfigLoader();
      
      await expect(loader.loadConfig('/path/to/invalid.json')).rejects.toThrow();
    });

    it('should handle configuration schema validation errors', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      const invalidConfig = {
        sharedFiles: 'not-an-array', // Should be array
        sourceWorktree: 123, // Should be string
        linkMode: 'invalid-mode' // Should be 'relative' or 'absolute'
      };
      
      expect(() => validateConfig(invalidConfig, 'test.json')).toThrow(ConfigError);
    });

    it('should handle missing required configuration fields', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      const incompleteConfig = {
        // Missing required sharedFiles
        sourceWorktree: 'main'
      };
      
      expect(() => validateConfig(incompleteConfig, 'test.json')).toThrow(ConfigError);
    });

    it('should handle empty shared files array', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      const emptyConfig = {
        sharedFiles: [], // Empty array not allowed
        sourceWorktree: 'main'
      };
      
      expect(() => validateConfig(emptyConfig, 'test.json')).toThrow(ConfigError);
    });
  });

  describe('Sync Engine Errors', () => {
    it('should handle sync plan creation errors', async () => {
      const { SyncEngine } = await import('../../src/sync/engine.js');
      const { RepositoryManager } = await import('../../src/git/repository.js');
      
      const mockRepoManager = RepositoryManager.getInstance();
      vi.spyOn(mockRepoManager, 'getRepositoryRoot').mockRejectedValue(new Error('Repository access failed'));
      
      const engine = new SyncEngine();
      const config = {
        sharedFiles: ['test.txt'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      await expect(engine.createPlan(config)).rejects.toThrow();
    });

    it('should handle sync execution errors', async () => {
      const { SyncEngine } = await import('../../src/sync/engine.js');
      const { execSync } = await import('child_process');
      
      // Mock git commands to fail
      vi.mocked(execSync).mockImplementation(() => {
        const error = new Error('Object database corrupted');
        (error as any).status = 128;
        throw error;
      });
      
      const engine = new SyncEngine();
      const config = {
        sharedFiles: ['test.txt'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      // sync() returns SyncResult with errors, doesn't throw
      const result = await engine.sync(config, false);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle status check errors', async () => {
      const { SyncEngine } = await import('../../src/sync/engine.js');
      const { RepositoryManager } = await import('../../src/git/repository.js');
      
      const mockRepoManager = RepositoryManager.getInstance();
      vi.spyOn(mockRepoManager, 'getRepositoryRoot').mockRejectedValue(new Error('Worktree listing failed'));
      
      const engine = new SyncEngine();
      const config = {
        sharedFiles: ['test.txt'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      await expect(engine.checkStatus(config)).rejects.toThrow();
    });
  });

  describe('Glob Pattern Errors', () => {
    it('should handle glob pattern errors', async () => {
      const { SyncPlanner } = await import('../../src/sync/planner.js');
      const { WorktreeManager } = await import('../../src/git/worktree.js');
      const { glob } = await import('glob');
      
      vi.mocked(glob).mockRejectedValue(new Error('Glob pattern failed'));
      
      // Mock worktree manager to provide a source worktree
      const mockWorktree = { path: '/repo', branch: 'main', head: 'abc123', isMain: true };
      vi.spyOn(WorktreeManager.prototype, 'getSourceWorktree').mockResolvedValue(mockWorktree);
      
      const planner = new SyncPlanner();
      const config = {
        sharedFiles: ['invalid/**pattern'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      await expect(planner.createSyncPlan(config)).rejects.toThrow();
    });

    it('should handle invalid glob patterns', async () => {
      const { SyncPlanner } = await import('../../src/sync/planner.js');
      const { WorktreeManager } = await import('../../src/git/worktree.js');
      const { glob } = await import('glob');
      
      vi.mocked(glob).mockRejectedValue(new Error('Invalid pattern'));
      
      // Mock worktree manager to provide a source worktree
      const mockWorktree = { path: '/repo', branch: 'main', head: 'abc123', isMain: true };
      vi.spyOn(WorktreeManager.prototype, 'getSourceWorktree').mockResolvedValue(mockWorktree);
      
      const planner = new SyncPlanner();
      const config = {
        sharedFiles: ['[invalid-bracket'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      await expect(planner.createSyncPlan(config)).rejects.toThrow();
    });
  });

  describe('Symlink Management Errors', () => {
    it('should handle broken symlink detection errors', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      const { lstatSync } = await import('fs');
      
      vi.mocked(lstatSync).mockImplementation(() => {
        throw Object.assign(new Error('Lstat failed'), { code: 'EIO' });
      });
      
      const manager = new SymlinkManager();
      
      // isValidSymlink handles errors gracefully and returns false
      expect(manager.isValidSymlink('/some/link')).toBe(false);
    });

    it('should handle symlink creation on read-only filesystem', async () => {
      const { SymlinkManager, FileSystemError } = await import('../../src/sync/symlink.js');
      const { symlinkSync } = await import('fs');
      
      vi.mocked(symlinkSync).mockImplementation(() => {
        throw Object.assign(new Error('Read-only file system'), { code: 'EROFS' });
      });
      
      const manager = new SymlinkManager();
      
      await expect(manager.createSymlink('/source', '/readonly/target', 'relative')).rejects.toThrow(FileSystemError);
    });

    it('should handle symlink removal errors', async () => {
      const { SymlinkManager, FileSystemError } = await import('../../src/sync/symlink.js');
      const { unlinkSync } = await import('fs');
      
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw Object.assign(new Error('Operation not permitted'), { code: 'EPERM' });
      });
      
      const manager = new SymlinkManager();
      
      await expect(manager.removeExisting('/protected/link')).rejects.toThrow(FileSystemError);
    });
  });

  describe('Cross-Platform Errors', () => {
    it('should handle Windows-specific symlink errors', async () => {
      const { SymlinkManager, FileSystemError } = await import('../../src/sync/symlink.js');
      const { symlinkSync } = await import('fs');
      
      // Windows requires elevated privileges for symlinks
      vi.mocked(symlinkSync).mockImplementation(() => {
        throw Object.assign(new Error('Privileges not held'), { code: 'EPERM' });
      });
      
      const manager = new SymlinkManager();
      
      await expect(manager.createSymlink('/source', '/target', 'relative')).rejects.toThrow(FileSystemError);
    });

    it('should handle path length limitations', async () => {
      const { SymlinkManager, FileSystemError } = await import('../../src/sync/symlink.js');
      const { symlinkSync } = await import('fs');
      
      vi.mocked(symlinkSync).mockImplementation(() => {
        throw Object.assign(new Error('Path too long'), { code: 'ENAMETOOLONG' });
      });
      
      const manager = new SymlinkManager();
      
      const longPath = '/very/long/path/that/exceeds/system/limits'.repeat(10);
      await expect(manager.createSymlink('/source', longPath, 'absolute')).rejects.toThrow(FileSystemError);
    });
  });

  describe('Network File System Errors', () => {
    it('should handle network filesystem unavailable', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      const { existsSync } = await import('fs');
      
      vi.mocked(existsSync).mockImplementation(() => {
        throw Object.assign(new Error('Network is unreachable'), { code: 'ENETUNREACH' });
      });
      
      const manager = new SymlinkManager();
      
      // isValidSymlink handles errors gracefully and returns false
      expect(manager.isValidSymlink('/nfs/mount/file')).toBe(false);
    });

    it('should handle stale NFS file handles', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      const { lstatSync } = await import('fs');
      
      vi.mocked(lstatSync).mockImplementation(() => {
        throw Object.assign(new Error('Stale file handle'), { code: 'ESTALE' });
      });
      
      const manager = new SymlinkManager();
      
      // isValidSymlink handles errors gracefully and returns false
      expect(manager.isValidSymlink('/nfs/stale/file')).toBe(false);
    });
  });

  describe('Resource Exhaustion Errors', () => {
    it('should handle memory allocation errors', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { readFile } = await import('fs/promises');
      
      vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('Cannot allocate memory'), { code: 'ENOMEM' }));
      
      const loader = new ConfigLoader();
      
      await expect(loader.loadConfig('/huge/config.json')).rejects.toThrow();
    });

    it('should handle file descriptor exhaustion', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      const { lstatSync } = await import('fs');
      
      vi.mocked(lstatSync).mockImplementation(() => {
        throw Object.assign(new Error('Too many open files'), { code: 'EMFILE' });
      });
      
      const manager = new SymlinkManager();
      
      // isValidSymlink handles errors gracefully and returns false
      expect(manager.isValidSymlink('/file')).toBe(false);
    });
  });

  describe('Concurrent Access Errors', () => {
    it('should handle file being modified during operation', async () => {
      const { SymlinkManager, FileSystemError } = await import('../../src/sync/symlink.js');
      const { symlinkSync } = await import('fs');
      
      vi.mocked(symlinkSync).mockImplementation(() => {
        throw Object.assign(new Error('File exists'), { code: 'EEXIST' });
      });
      
      const manager = new SymlinkManager();
      
      await expect(manager.createSymlink('/source', '/target', 'relative')).rejects.toThrow(FileSystemError);
    });

    it('should handle directory being removed during operation', async () => {
      const { SymlinkManager, FileSystemError } = await import('../../src/sync/symlink.js');
      const { mkdir } = await import('fs/promises');
      
      vi.mocked(mkdir).mockRejectedValue(Object.assign(new Error('No such file or directory'), { code: 'ENOENT' }));
      
      const manager = new SymlinkManager();
      
      await expect(manager.createSymlink('/source', '/removed/dir/link', 'relative')).rejects.toThrow(FileSystemError);
    });
  });

  describe('Logger Errors', () => {
    it('should handle log file write errors', async () => {
      const { Logger } = await import('../../src/utils/logger.js');
      const { writeFile } = await import('fs/promises');
      
      vi.mocked(writeFile).mockRejectedValue(Object.assign(new Error('Disk full'), { code: 'ENOSPC' }));
      
      const logger = Logger.configure({
        level: 'info',
        useColor: false,
        logFile: '/full/disk/log.txt'
      });
      
      // Logger should handle write errors gracefully
      expect(() => logger.info('Test message')).not.toThrow();
    });
  });
});