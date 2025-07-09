import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { lstatSync, existsSync, symlinkSync, unlinkSync, readlinkSync } from 'fs';
import { mkdir } from 'fs/promises';
import { FileSystemError, SymlinkManager } from '../../src/sync/symlink.js';
import type { WorktreeInfo } from '../../src/types/index.js';

// Mock fs modules
vi.mock('fs', () => ({
  lstatSync: vi.fn(),
  existsSync: vi.fn(),
  symlinkSync: vi.fn(),
  unlinkSync: vi.fn(),
  readlinkSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn()
}));

const mockLstatSync = lstatSync as MockedFunction<typeof lstatSync>;
const mockExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockSymlinkSync = symlinkSync as MockedFunction<typeof symlinkSync>;
const mockUnlinkSync = unlinkSync as MockedFunction<typeof unlinkSync>;
const mockReadlinkSync = readlinkSync as MockedFunction<typeof readlinkSync>;
const mockMkdir = mkdir as MockedFunction<typeof mkdir>;

describe('FileSystemError', () => {
  it('should create FileSystemError with all properties', () => {
    const error = new FileSystemError(
      'File operation failed',
      '/path/to/file',
      'createSymlink',
      'ENOENT'
    );
    
    expect(error.name).toBe('FileSystemError');
    expect(error.message).toBe('File operation failed');
    expect(error.path).toBe('/path/to/file');
    expect(error.operation).toBe('createSymlink');
    expect(error.code).toBe('ENOENT');
  });

  it('should be instance of Error', () => {
    const error = new FileSystemError('Test error', '/path', 'test');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FileSystemError);
  });
});

describe('SymlinkManager', () => {
  let symlinkManager: SymlinkManager;
  
  beforeEach(() => {
    symlinkManager = new SymlinkManager();
    vi.clearAllMocks();
  });

  describe('createSymlink', () => {
    it('should create relative symlink successfully', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(false);
      
      await symlinkManager.createSymlink(
        '/source/file.txt',
        '/target/file.txt',
        'relative'
      );
      
      expect(mockMkdir).toHaveBeenCalledWith('/target', { recursive: true });
      expect(mockSymlinkSync).toHaveBeenCalledWith('../source/file.txt', '/target/file.txt');
    });

    it('should create absolute symlink successfully', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(false);
      
      await symlinkManager.createSymlink(
        '/source/file.txt',
        '/target/file.txt',
        'absolute'
      );
      
      expect(mockSymlinkSync).toHaveBeenCalledWith('/source/file.txt', '/target/file.txt');
    });

    it('should remove existing file before creating symlink', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      
      await symlinkManager.createSymlink(
        '/source/file.txt',
        '/target/file.txt'
      );
      
      expect(mockUnlinkSync).toHaveBeenCalledWith('/target/file.txt');
      expect(mockSymlinkSync).toHaveBeenCalled();
    });

    it('should throw FileSystemError when symlink creation fails', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(false);
      
      const error = new Error('Permission denied');
      (error as any).code = 'EACCES';
      mockSymlinkSync.mockImplementation(() => { throw error; });
      
      await expect(symlinkManager.createSymlink('/source/file.txt', '/target/file.txt'))
        .rejects.toThrow(FileSystemError);
    });
  });

  describe('removeExisting', () => {
    it('should remove existing symlink', async () => {
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true, isFile: () => false } as any);
      
      await symlinkManager.removeExisting('/path/to/symlink');
      
      expect(mockUnlinkSync).toHaveBeenCalledWith('/path/to/symlink');
    });

    it('should throw error for regular file without overwrite', async () => {
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => false, isFile: () => true } as any);
      
      await expect(symlinkManager.removeExisting('/path/to/file'))
        .rejects.toThrow(FileSystemError);
      
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('should ignore ENOENT errors', async () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      mockLstatSync.mockImplementation(() => { throw error; });
      
      await expect(symlinkManager.removeExisting('/nonexistent/file'))
        .resolves.toBeUndefined();
    });

    it('should throw FileSystemError for other errors', async () => {
      const error = new Error('Permission denied');
      (error as any).code = 'EACCES';
      mockLstatSync.mockImplementation(() => { throw error; });
      
      await expect(symlinkManager.removeExisting('/restricted/file'))
        .rejects.toThrow(FileSystemError);
    });
  });

  describe('isValidSymlink', () => {
    it('should return true for valid symlink', () => {
      mockExistsSync
        .mockReturnValueOnce(true)  // symlink exists
        .mockReturnValueOnce(true); // target exists
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      mockReadlinkSync.mockReturnValue('../source/file.txt');
      
      const result = symlinkManager.isValidSymlink('/path/to/symlink');
      
      expect(result).toBe(true);
    });

    it('should return false when symlink does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      
      const result = symlinkManager.isValidSymlink('/nonexistent/symlink');
      
      expect(result).toBe(false);
    });

    it('should return false when file is not a symlink', () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as any);
      
      const result = symlinkManager.isValidSymlink('/path/to/file');
      
      expect(result).toBe(false);
    });

    it('should return false when symlink target does not exist', () => {
      mockExistsSync
        .mockReturnValueOnce(true)   // symlink exists
        .mockReturnValueOnce(false); // target does not exist
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      mockReadlinkSync.mockReturnValue('../nonexistent/file.txt');
      
      const result = symlinkManager.isValidSymlink('/path/to/symlink');
      
      expect(result).toBe(false);
    });

    it('should return false on any error', () => {
      mockExistsSync.mockImplementation(() => { throw new Error('Error'); });
      
      const result = symlinkManager.isValidSymlink('/path/to/symlink');
      
      expect(result).toBe(false);
    });
  });

  describe('isSymlinkPointingTo', () => {
    it('should return true when symlink points to expected target', () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      mockReadlinkSync.mockReturnValue('../source/file.txt');
      
      const result = symlinkManager.isSymlinkPointingTo(
        '/target/file.txt',
        '/source/file.txt'
      );
      
      expect(result).toBe(true);
    });

    it('should return false when symlink does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      
      const result = symlinkManager.isSymlinkPointingTo(
        '/nonexistent/symlink',
        '/source/file.txt'
      );
      
      expect(result).toBe(false);
    });

    it('should return false when file is not a symlink', () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as any);
      
      const result = symlinkManager.isSymlinkPointingTo(
        '/path/to/file',
        '/source/file.txt'
      );
      
      expect(result).toBe(false);
    });

    it('should return false when symlink points to different target', () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      mockReadlinkSync.mockReturnValue('../other/file.txt');
      
      const result = symlinkManager.isSymlinkPointingTo(
        '/target/file.txt',
        '/source/file.txt'
      );
      
      expect(result).toBe(false);
    });

    it('should return false on any error', () => {
      mockExistsSync.mockImplementation(() => { throw new Error('Error'); });
      
      const result = symlinkManager.isSymlinkPointingTo(
        '/path/to/symlink',
        '/source/file.txt'
      );
      
      expect(result).toBe(false);
    });
  });

  describe('createSyncAction', () => {
    const sourceWorktree: WorktreeInfo = {
      path: '/source',
      branch: 'main',
      head: 'abc123',
      isMain: true
    };

    const targetWorktree: WorktreeInfo = {
      path: '/target',
      branch: 'feature',
      head: 'def456',
      isMain: false
    };

    it('should create action to create new symlink', async () => {
      mockExistsSync
        .mockReturnValueOnce(true)  // source exists
        .mockReturnValueOnce(false); // target doesn't exist
      
      const action = await symlinkManager.createSyncAction(
        sourceWorktree,
        targetWorktree,
        'file.txt',
        'relative',
        false
      );
      
      expect(action).toEqual({
        targetWorktree: '/target',
        file: 'file.txt',
        sourcePath: '/source/file.txt',
        targetPath: '/target/file.txt',
        linkPath: '../source/file.txt',
        action: 'create',
        reason: 'Creating new symlink'
      });
    });

    it('should skip when source file does not exist', async () => {
      mockExistsSync.mockReturnValue(false); // source doesn't exist
      
      const action = await symlinkManager.createSyncAction(
        sourceWorktree,
        targetWorktree,
        'nonexistent.txt',
        'relative',
        false
      );
      
      expect(action).toEqual({
        targetWorktree: '/target',
        file: 'nonexistent.txt',
        sourcePath: '/source/nonexistent.txt',
        targetPath: '/target/nonexistent.txt',
        linkPath: '',
        action: 'skip',
        reason: 'Source file does not exist'
      });
    });

    it('should skip when correct symlink already exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      mockReadlinkSync.mockReturnValue('../source/file.txt');
      
      // Mock the isSymlinkPointingTo method to return true
      vi.spyOn(symlinkManager, 'isSymlinkPointingTo').mockReturnValue(true);
      
      const action = await symlinkManager.createSyncAction(
        sourceWorktree,
        targetWorktree,
        'file.txt',
        'relative',
        false
      );
      
      expect(action.action).toBe('skip');
      expect(action.reason).toBe('Symlink already exists and points to correct source');
    });

    it('should update when symlink points to wrong target', async () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      
      // Mock the isSymlinkPointingTo method to return false
      vi.spyOn(symlinkManager, 'isSymlinkPointingTo').mockReturnValue(false);
      
      const action = await symlinkManager.createSyncAction(
        sourceWorktree,
        targetWorktree,
        'file.txt',
        'relative',
        false
      );
      
      expect(action.action).toBe('update');
      expect(action.reason).toBe('Symlink exists but points to different source');
    });

    it('should skip when regular file exists and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as any);
      
      const action = await symlinkManager.createSyncAction(
        sourceWorktree,
        targetWorktree,
        'file.txt',
        'relative',
        false
      );
      
      expect(action.action).toBe('skip');
      expect(action.reason).toBe('Target file exists and overwrite is disabled');
    });

    it('should update when regular file exists and overwrite is true', async () => {
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as any);
      
      const action = await symlinkManager.createSyncAction(
        sourceWorktree,
        targetWorktree,
        'file.txt',
        'relative',
        true
      );
      
      expect(action.action).toBe('update');
      expect(action.reason).toBe('Overwriting existing file');
    });

    it('should use absolute path when linkMode is absolute', async () => {
      mockExistsSync
        .mockReturnValueOnce(true)  // source exists
        .mockReturnValueOnce(false); // target doesn't exist
      
      const action = await symlinkManager.createSyncAction(
        sourceWorktree,
        targetWorktree,
        'file.txt',
        'absolute',
        false
      );
      
      expect(action.linkPath).toBe('/source/file.txt');
    });
  });

  describe('executeAction', () => {
    it('should skip action when action is skip', async () => {
      const action = {
        targetWorktree: '/target',
        file: 'file.txt',
        sourcePath: '/source/file.txt',
        targetPath: '/target/file.txt',
        linkPath: '../source/file.txt',
        action: 'skip' as const,
        reason: 'Already exists'
      };
      
      await symlinkManager.executeAction(action, false);
      
      expect(mockSymlinkSync).not.toHaveBeenCalled();
    });

    it('should create symlink for create action', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(false);
      mockSymlinkSync.mockImplementation(() => {}); // Mock successful symlink creation
      
      const action = {
        targetWorktree: '/target',
        file: 'file.txt',
        sourcePath: '/source/file.txt',
        targetPath: '/target/file.txt',
        linkPath: '../source/file.txt',
        action: 'create' as const,
        reason: 'Creating new symlink'
      };
      
      await symlinkManager.executeAction(action, false);
      
      expect(mockSymlinkSync).toHaveBeenCalledWith('../source/file.txt', '/target/file.txt');
    });

    it('should remove existing and create symlink for update action with overwrite', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(true);
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);
      mockSymlinkSync.mockImplementation(() => {}); // Mock successful symlink creation
      
      const action = {
        targetWorktree: '/target',
        file: 'file.txt',
        sourcePath: '/source/file.txt',
        targetPath: '/target/file.txt',
        linkPath: '../source/file.txt',
        action: 'update' as const,
        reason: 'Updating symlink'
      };
      
      await symlinkManager.executeAction(action, true);
      
      expect(mockUnlinkSync).toHaveBeenCalledWith('/target/file.txt');
      expect(mockSymlinkSync).toHaveBeenCalledWith('../source/file.txt', '/target/file.txt');
    });

    it('should throw error for update action without overwrite', async () => {
      mockExistsSync.mockReturnValue(true);
      
      const action = {
        targetWorktree: '/target',
        file: 'file.txt',
        sourcePath: '/source/file.txt',
        targetPath: '/target/file.txt',
        linkPath: '../source/file.txt',
        action: 'update' as const,
        reason: 'Updating symlink'
      };
      
      await expect(symlinkManager.executeAction(action, false))
        .rejects.toThrow(FileSystemError);
    });

    it('should detect absolute linkPath correctly', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(false);
      mockSymlinkSync.mockImplementation(() => {}); // Mock successful symlink creation
      
      const action = {
        targetWorktree: '/target',
        file: 'file.txt',
        sourcePath: '/source/file.txt',
        targetPath: '/target/file.txt',
        linkPath: '/source/file.txt', // absolute path
        action: 'create' as const,
        reason: 'Creating new symlink'
      };
      
      await symlinkManager.executeAction(action, false);
      
      expect(mockSymlinkSync).toHaveBeenCalledWith('/source/file.txt', '/target/file.txt');
    });
  });

  describe('validateSymlinks', () => {
    const worktree: WorktreeInfo = {
      path: '/worktree',
      branch: 'main',
      head: 'abc123',
      isMain: false
    };

    it('should categorize symlinks correctly', async () => {
      const files = ['valid.txt', 'broken.txt', 'missing.txt'];
      
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('missing')) return false;
        return true;
      });
      
      mockLstatSync.mockImplementation((path: string) => {
        if (path.includes('broken')) {
          return { isSymbolicLink: () => true } as any;
        }
        return { isSymbolicLink: () => true } as any;
      });
      
      // Mock isValidSymlink method
      vi.spyOn(symlinkManager, 'isValidSymlink').mockImplementation((path: string) => {
        return !path.includes('broken');
      });
      
      const result = await symlinkManager.validateSymlinks(worktree, files);
      
      expect(result.valid).toEqual(['valid.txt']);
      expect(result.broken).toEqual(['broken.txt']);
      expect(result.missing).toEqual(['missing.txt']);
    });

    it('should handle empty file list', async () => {
      const result = await symlinkManager.validateSymlinks(worktree, []);
      
      expect(result.valid).toEqual([]);
      expect(result.broken).toEqual([]);
      expect(result.missing).toEqual([]);
    });
  });
});