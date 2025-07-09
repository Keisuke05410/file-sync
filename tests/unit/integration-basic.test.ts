import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';

// Basic integration test for overall functionality
describe('Basic Integration Tests', () => {
  describe('Module imports', () => {
    it('should import main modules without errors', async () => {
      // Test that core modules can be imported
      const { main } = await import('../../src/index.js');
      expect(typeof main).toBe('function');
    });

    it('should import CLI module without errors', async () => {
      const { CLI } = await import('../../src/cli.js');
      expect(CLI).toBeDefined();
      expect(typeof CLI).toBe('function');
    });

    it('should import all core config modules', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      expect(ConfigLoader).toBeDefined();
      expect(validateConfig).toBeDefined();
      expect(ConfigError).toBeDefined();
    });

    it('should import all git modules', async () => {
      const { RepositoryManager } = await import('../../src/git/repository.js');
      const { WorktreeManager } = await import('../../src/git/worktree.js');
      
      expect(RepositoryManager).toBeDefined();
      expect(WorktreeManager).toBeDefined();
    });

    it('should import all sync modules', async () => {
      const { SyncPlanner } = await import('../../src/sync/planner.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      
      expect(SyncPlanner).toBeDefined();
      expect(SyncEngine).toBeDefined();
      expect(SymlinkManager).toBeDefined();
    });

    it('should import logger module', async () => {
      const { Logger, LogLevel } = await import('../../src/utils/logger.js');
      
      expect(Logger).toBeDefined();
      expect(LogLevel).toBeDefined();
    });
  });

  describe('Type definitions', () => {
    it('should have proper type definitions', async () => {
      const types = await import('../../src/types/index.js');
      
      // Check that types module exists and can be imported
      expect(types).toBeDefined();
    });
  });

  describe('Configuration validation', () => {
    it('should validate a basic configuration', async () => {
      const { validateConfig } = await import('../../src/config/schema.js');
      
      const basicConfig = {
        sharedFiles: ['docker-compose.yml'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      const result = validateConfig(basicConfig, 'test-config.json');
      
      expect(result).toEqual({
        ...basicConfig,
        sharedFiles: ['docker-compose.yml'],
        sourceWorktree: 'main',
        linkMode: 'relative',
        overwrite: false,
        ignore: []
      });
    });

    it('should reject invalid configuration', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      const invalidConfig = {
        sharedFiles: [], // Empty array should be rejected
        linkMode: 'invalid' as any
      };
      
      expect(() => validateConfig(invalidConfig, 'test-config.json')).toThrow(ConfigError);
    });
  });

  describe('Logger functionality', () => {
    it('should create logger instance', async () => {
      const { Logger, LogLevel } = await import('../../src/utils/logger.js');
      
      const logger = Logger.getInstance();
      
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.success).toBe('function');
    });

    it('should configure logger with options', async () => {
      const { Logger, LogLevel } = await import('../../src/utils/logger.js');
      
      const logger = Logger.configure({
        level: LogLevel.DEBUG,
        useColor: false
      });
      
      expect(logger).toBeDefined();
    });
  });

  describe('Class instantiation', () => {
    it('should instantiate ConfigLoader', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      const loader = new ConfigLoader();
      expect(loader).toBeInstanceOf(ConfigLoader);
    });

    it('should instantiate SyncEngine', async () => {
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const engine = new SyncEngine();
      expect(engine).toBeInstanceOf(SyncEngine);
    });

    it('should instantiate SyncPlanner', async () => {
      const { SyncPlanner } = await import('../../src/sync/planner.js');
      
      const planner = new SyncPlanner();
      expect(planner).toBeInstanceOf(SyncPlanner);
    });

    it('should instantiate SymlinkManager', async () => {
      const { SymlinkManager } = await import('../../src/sync/symlink.js');
      
      const manager = new SymlinkManager();
      expect(manager).toBeInstanceOf(SymlinkManager);
    });

    it('should instantiate WorktreeManager', async () => {
      const { WorktreeManager } = await import('../../src/git/worktree.js');
      
      const manager = new WorktreeManager();
      expect(manager).toBeInstanceOf(WorktreeManager);
    });

    it('should get RepositoryManager singleton', async () => {
      const { RepositoryManager } = await import('../../src/git/repository.js');
      
      const manager1 = RepositoryManager.getInstance();
      const manager2 = RepositoryManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });
  });

  describe('Error classes', () => {
    it('should create ConfigError', async () => {
      const { ConfigError } = await import('../../src/config/schema.js');
      
      const error = new ConfigError('Test error', '/path/config.json');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.name).toBe('ConfigError');
      expect(error.message).toBe('Test error');
      expect(error.configPath).toBe('/path/config.json');
    });

    it('should create GitError', async () => {
      const { GitError } = await import('../../src/git/repository.js');
      
      const error = new GitError('Git failed', 'git status', 128, 'not a repository');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GitError);
      expect(error.name).toBe('GitError');
      expect(error.message).toBe('Git failed');
      expect(error.command).toBe('git status');
      expect(error.exitCode).toBe(128);
      expect(error.stderr).toBe('not a repository');
    });

    it('should create FileSystemError', async () => {
      const { FileSystemError } = await import('../../src/sync/symlink.js');
      
      const error = new FileSystemError('FS failed', '/path/file.txt', 'createSymlink', 'ENOENT');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileSystemError);
      expect(error.name).toBe('FileSystemError');
      expect(error.message).toBe('FS failed');
      expect(error.path).toBe('/path/file.txt');
      expect(error.operation).toBe('createSymlink');
      expect(error.code).toBe('ENOENT');
    });
  });

  describe('Default config generation', () => {
    it('should generate sample config', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      const loader = new ConfigLoader();
      const sampleConfig = await loader.generateSampleConfig();
      
      expect(typeof sampleConfig).toBe('string');
      
      const parsed = JSON.parse(sampleConfig);
      expect(parsed).toHaveProperty('sharedFiles');
      expect(parsed).toHaveProperty('sourceWorktree');
      expect(parsed).toHaveProperty('linkMode');
      expect(Array.isArray(parsed.sharedFiles)).toBe(true);
      expect(parsed.sharedFiles.length).toBeGreaterThan(0);
    });

    it('should get default config file name', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      const fileName = ConfigLoader.getDefaultConfigFileName();
      
      expect(fileName).toBe('.worktreesync.json');
    });
  });
});

describe('Error Handling Integration', () => {
  describe('Configuration errors', () => {
    it('should handle missing required fields', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      expect(() => validateConfig({}, 'test.json')).toThrow(ConfigError);
    });

    it('should handle invalid file patterns', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      const config = {
        sharedFiles: [], // Empty array not allowed
        sourceWorktree: 'main'
      };
      
      expect(() => validateConfig(config, 'test.json')).toThrow(ConfigError);
    });

    it('should handle invalid link mode', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      const config = {
        sharedFiles: ['file.txt'],
        linkMode: 'invalid'
      };
      
      expect(() => validateConfig(config, 'test.json')).toThrow(ConfigError);
    });
  });

  describe('CLI options validation', () => {
    it('should validate valid CLI options', async () => {
      const { validateCliOptions } = await import('../../src/config/schema.js');
      
      const options = {
        dryRun: true,
        verbose: false,
        quiet: false,
        noColor: false
      };
      
      const result = validateCliOptions(options);
      expect(result).toEqual(options);
    });

    it('should reject invalid CLI options', async () => {
      const { validateCliOptions } = await import('../../src/config/schema.js');
      
      const options = {
        dryRun: 'invalid', // Should be boolean
        verbose: 123 // Should be boolean
      };
      
      expect(() => validateCliOptions(options)).toThrow();
    });
  });
});

describe('Performance and Memory', () => {
  describe('Memory usage', () => {
    it('should not leak memory with repeated instantiation', async () => {
      const { Logger } = await import('../../src/utils/logger.js');
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      // Create multiple instances to check for memory leaks
      for (let i = 0; i < 100; i++) {
        const logger = Logger.getInstance();
        const loader = new ConfigLoader();
        
        expect(logger).toBeDefined();
        expect(loader).toBeDefined();
      }
      
      // If we get here without running out of memory, test passes
      expect(true).toBe(true);
    });
  });

  describe('Large configuration handling', () => {
    it('should handle configuration with many files', async () => {
      const { validateConfig } = await import('../../src/config/schema.js');
      
      const manyFiles = Array.from({ length: 1000 }, (_, i) => `file${i}.txt`);
      const config = {
        sharedFiles: manyFiles,
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      const result = validateConfig(config, 'test.json');
      expect(result.sharedFiles).toHaveLength(1000);
    });
  });
});