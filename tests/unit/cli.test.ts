import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Mock dependencies
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}));

vi.mock('path', () => ({
  resolve: vi.fn(),
  dirname: vi.fn()
}));

vi.mock('url', () => ({
  fileURLToPath: vi.fn()
}));

vi.mock('../../src/config/loader.js', () => ({
  ConfigLoader: vi.fn().mockImplementation(() => ({
    loadConfig: vi.fn().mockResolvedValue({
      sharedFiles: ['test.txt'],
      sourceWorktree: 'main',
      linkMode: 'relative',
      overwrite: false,
      ignore: []
    }),
    createSampleConfigFile: vi.fn().mockResolvedValue('/path/to/config.json'),
    generateSampleConfig: vi.fn().mockReturnValue({})
  }))
}));

vi.mock('../../src/sync/engine.js', () => ({
  SyncEngine: vi.fn().mockImplementation(() => ({
    createPlan: vi.fn().mockResolvedValue({
      sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
      targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
      syncActions: []
    }),
    sync: vi.fn().mockResolvedValue({ success: true, created: 1, updated: 0, skipped: 0, errors: [] }),
    checkStatus: vi.fn().mockResolvedValue({
      sourceWorktree: '/repo',
      targetWorktrees: ['/repo-feature'],
      syncedFiles: { '/repo-feature': { valid: [], broken: [], missing: [] } }
    }),
    cleanBrokenLinks: vi.fn().mockResolvedValue({ cleaned: [], errors: [] }),
    getSyncSummary: vi.fn().mockReturnValue({
      totalWorktrees: 1,
      totalFiles: 1,
      actionCounts: { create: 1, update: 0, skip: 0 },
      filesByWorktree: { '/repo-feature': 1 }
    }),
    doctor: vi.fn().mockResolvedValue({
      configValid: true,
      sourceWorktreeExists: true,
      targetWorktreesAccessible: true,
      missingFiles: [],
      brokenSymlinks: [],
      permissionIssues: [],
      recommendations: []
    })
  }))
}));

vi.mock('../../src/utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      failure: vi.fn(),
      warning: vi.fn(),
      progress: vi.fn(),
      raw: vi.fn(),
      close: vi.fn()
    }),
    configure: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      failure: vi.fn(),
      warning: vi.fn(),
      progress: vi.fn(),
      raw: vi.fn(),
      close: vi.fn()
    })
  },
  LogLevel: {
    ERROR: 'error',
    INFO: 'info',
    DEBUG: 'debug'
  }
}));

// Mock commander module completely
const mockCommand = {
  name: vi.fn().mockReturnThis(),
  description: vi.fn().mockReturnThis(),
  version: vi.fn().mockReturnThis(),
  argument: vi.fn().mockReturnThis(),
  option: vi.fn().mockReturnThis(),
  action: vi.fn().mockReturnThis(),
  command: vi.fn().mockReturnThis(),
  parseAsync: vi.fn().mockResolvedValue(undefined)
};

// Ensure all methods return the mock for chaining
Object.keys(mockCommand).forEach(key => {
  if (key !== 'parseAsync' && typeof mockCommand[key] === 'function') {
    mockCommand[key].mockReturnValue(mockCommand);
  }
});

vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => mockCommand)
}));

vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text)
  }
}));

describe('CLI', () => {
  let mockReadFileSync: MockedFunction<typeof readFileSync>;
  let mockResolve: MockedFunction<typeof resolve>;
  let mockDirname: MockedFunction<typeof dirname>;
  let mockFileURLToPath: MockedFunction<typeof fileURLToPath>;
  let mockProcessExit: any;
  let CLI: any;

  beforeEach(async () => {
    // Setup mocks
    mockReadFileSync = vi.mocked(readFileSync);
    mockResolve = vi.mocked(resolve);
    mockDirname = vi.mocked(dirname);
    mockFileURLToPath = vi.mocked(fileURLToPath);
    
    // Reset mock call counts but keep implementations
    mockReadFileSync.mockClear();
    mockResolve.mockClear();
    mockDirname.mockClear();
    mockFileURLToPath.mockClear();
    
    // Mock process.exit to not actually exit but still be testable
    if (mockProcessExit) {
      mockProcessExit.mockRestore();
    }
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    // Setup default mock returns
    mockFileURLToPath.mockReturnValue('/path/to/cli.js');
    mockDirname.mockReturnValue('/path/to');
    mockResolve.mockReturnValue('/path/to/package.json');
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'sync-worktrees',
      version: '1.0.0'
    }));
    
    // Re-setup commander mock to ensure chaining works
    Object.keys(mockCommand).forEach(key => {
      if (key !== 'parseAsync' && typeof mockCommand[key] === 'function') {
        mockCommand[key].mockReturnValue(mockCommand);
      }
    });

    // Import CLI after mocks are set up
    const { CLI: CLIClass } = await import('../../src/cli.js');
    CLI = CLIClass;
  });

  afterEach(() => {
    // Don't restore module mocks - only restore spies
    mockProcessExit?.mockRestore();
  });

  describe('Mock Verification', () => {
    it('should verify commander mock is working', async () => {
      const { Command } = await import('commander');
      const program = new Command();
      
      // Test that our mock methods exist and can be called
      expect(program.name).toBeDefined();
      expect(typeof program.name).toBe('function');
      
      // Test method chaining
      const result = program.name('test').description('test desc');
      expect(result).toBe(program);
      expect(program.name).toHaveBeenCalledWith('test');
      expect(program.description).toHaveBeenCalledWith('test desc');
    });
  });

  describe('Constructor', () => {
    it('should create CLI instance successfully', () => {
      expect(() => new CLI()).not.toThrow();
    });

    it('should setup commander program with correct configuration', () => {
      new CLI();
      
      // The CLI constructor calls setupCommands() which reads package.json
      expect(mockReadFileSync).toHaveBeenCalled();
    });

    it('should handle package.json reading error', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      expect(() => new CLI()).toThrow();
    });
  });

  describe('Logger Configuration', () => {
    it('should configure logger with ERROR level when quiet option is true', async () => {
      const cli = new CLI();
      const { Logger } = await import('../../src/utils/logger.js');
      
      await cli.handleSyncCommand(undefined, { quiet: true, verbose: false, dryRun: false, noColor: false });
      
      expect(Logger.configure).toHaveBeenCalledWith({
        level: 'error',
        useColor: true
      });
    });

    it('should configure logger with DEBUG level when verbose option is true', async () => {
      const cli = new CLI();
      const { Logger } = await import('../../src/utils/logger.js');
      
      await cli.handleSyncCommand(undefined, { quiet: false, verbose: true, dryRun: false, noColor: false });
      
      expect(Logger.configure).toHaveBeenCalledWith({
        level: 'debug',
        useColor: true
      });
    });

    it('should configure logger with INFO level by default', async () => {
      const cli = new CLI();
      const { Logger } = await import('../../src/utils/logger.js');
      
      await cli.handleSyncCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(Logger.configure).toHaveBeenCalledWith({
        level: 'info',
        useColor: true
      });
    });

    it('should disable colors when noColor option is true', async () => {
      const cli = new CLI();
      const { Logger } = await import('../../src/utils/logger.js');
      
      await cli.handleSyncCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: true });
      
      expect(Logger.configure).toHaveBeenCalledWith({
        level: 'info',
        useColor: false
      });
    });
  });

  describe('Sync Command', () => {
    it('should handle sync command successfully', async () => {
      const cli = new CLI();
      
      // The command should complete without throwing
      await expect(cli.handleSyncCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false }))
        .resolves.toBeUndefined();
    });

    it('should handle dry run mode correctly', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
        syncActions: []
      };
      
      const mockConfigLoader = new ConfigLoader();
      const mockSyncEngine = new SyncEngine();
      
      vi.mocked(mockConfigLoader.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(mockSyncEngine.createPlan).mockResolvedValue(mockPlan);
      vi.mocked(mockSyncEngine.getSyncSummary).mockReturnValue({ 
        totalWorktrees: 1, 
        totalFiles: 1,
        actionCounts: { create: 1, update: 0, skip: 0 },
        filesByWorktree: { '/repo-feature': 1 }
      });
      
      await cli.handleSyncCommand(undefined, { quiet: false, verbose: false, dryRun: true, noColor: false });
      
      expect(mockSyncEngine.sync).not.toHaveBeenCalled();
    });

    it('should handle sync command errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      // Mock the ConfigLoader constructor to return an instance with a failing loadConfig method
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockRejectedValue(new Error('Config error')),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      await expect(async () => {
        await cli.handleSyncCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle sync result with errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
        syncActions: []
      };
      const mockResult = { 
        success: false, 
        created: 0, 
        updated: 0, 
        skipped: 0, 
        errors: [{ file: 'test.txt', worktree: '/repo-feature', error: 'Permission denied' }] 
      };
      
      // Mock the constructors to return instances with the appropriate methods
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn().mockResolvedValue(mockPlan),
        sync: vi.fn().mockResolvedValue(mockResult),
        getSyncSummary: vi.fn().mockReturnValue({ 
          totalWorktrees: 1, 
          totalFiles: 1,
          actionCounts: { create: 1, update: 0, skip: 0 },
          filesByWorktree: { '/repo-feature': 1 }
        }),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn()
      }) as any);
      
      await expect(async () => {
        await cli.handleSyncCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Init Command', () => {
    it('should handle init command successfully', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      const mockCreateSampleConfigFile = vi.fn().mockResolvedValue('/path/to/config.json');
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn(),
        createSampleConfigFile: mockCreateSampleConfigFile,
        generateSampleConfig: vi.fn()
      }) as any);
      
      await cli.handleInitCommand(undefined);
      
      expect(mockCreateSampleConfigFile).toHaveBeenCalledWith(undefined);
    });

    it('should handle init command with custom config path', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      const mockCreateSampleConfigFile = vi.fn().mockResolvedValue('/custom/path/config.json');
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn(),
        createSampleConfigFile: mockCreateSampleConfigFile,
        generateSampleConfig: vi.fn()
      }) as any);
      
      await cli.handleInitCommand('/custom/path/config.json');
      
      expect(mockCreateSampleConfigFile).toHaveBeenCalledWith('/custom/path/config.json');
    });

    it('should handle init command errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn(),
        createSampleConfigFile: vi.fn().mockRejectedValue(new Error('Write error')),
        generateSampleConfig: vi.fn()
      }) as any);
      
      await expect(async () => {
        await cli.handleInitCommand(undefined);
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Status Command', () => {
    it('should handle status command successfully', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockStatus = {
        sourceWorktree: '/repo',
        targetWorktrees: ['/repo-feature'],
        syncedFiles: {
          '/repo-feature': {
            valid: ['test.txt'],
            broken: [],
            missing: []
          }
        }
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCheckStatus = vi.fn().mockResolvedValue(mockStatus);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: mockCheckStatus,
        cleanBrokenLinks: vi.fn()
      }) as any);
      
      await cli.handleStatusCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCheckStatus).toHaveBeenCalledWith(mockConfig);
    });

    it('should handle status command with broken links', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockStatus = {
        sourceWorktree: '/repo',
        targetWorktrees: ['/repo-feature'],
        syncedFiles: {
          '/repo-feature': {
            valid: [],
            broken: ['test.txt'],
            missing: ['missing.txt']
          }
        }
      };
      
      const mockCheckStatus = vi.fn().mockResolvedValue(mockStatus);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: mockCheckStatus,
        cleanBrokenLinks: vi.fn()
      }) as any);
      
      await cli.handleStatusCommand(undefined, { quiet: false, verbose: true, dryRun: false, noColor: false });
      
      expect(mockCheckStatus).toHaveBeenCalledWith(mockConfig);
    });

    it('should handle status command errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockRejectedValue(new Error('Config error')),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      await expect(async () => {
        await cli.handleStatusCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Clean Command', () => {
    it('should handle clean command successfully', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        cleaned: ['broken-link.txt'],
        errors: []
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCleanBrokenLinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: mockCleanBrokenLinks
      }) as any);
      
      await cli.handleCleanCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCleanBrokenLinks).toHaveBeenCalledWith(mockConfig, false);
    });

    it('should handle clean command in dry run mode', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        cleaned: ['broken-link.txt'],
        errors: []
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCleanBrokenLinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: mockCleanBrokenLinks
      }) as any);
      
      await cli.handleCleanCommand(undefined, { quiet: false, verbose: false, dryRun: true, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCleanBrokenLinks).toHaveBeenCalledWith(mockConfig, true);
    });

    it('should handle clean command with no broken links', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        cleaned: [],
        errors: []
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCleanBrokenLinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: mockCleanBrokenLinks
      }) as any);
      
      await cli.handleCleanCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCleanBrokenLinks).toHaveBeenCalledWith(mockConfig, false);
    });

    it('should handle clean command with errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        cleaned: ['cleaned-file.txt'],
        errors: [{ file: 'error-file.txt', worktree: '/repo-feature', error: 'Permission denied' }]
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCleanBrokenLinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: mockCleanBrokenLinks
      }) as any);
      
      await cli.handleCleanCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCleanBrokenLinks).toHaveBeenCalledWith(mockConfig, false);
    });

    it('should handle clean command errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockRejectedValue(new Error('Config error')),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      await expect(async () => {
        await cli.handleCleanCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Unlink Command', () => {
    it('should handle unlink command successfully in source worktree', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        unlinked: ['test.txt'],
        errors: [],
        mode: 'all' as const
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockUnlinkSymlinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: mockUnlinkSymlinks
      }) as any);
      
      await cli.handleUnlinkCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockUnlinkSymlinks).toHaveBeenCalledWith(mockConfig, false);
    });

    it('should handle unlink command successfully in target worktree', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        unlinked: ['test.txt'],
        errors: [],
        mode: 'current' as const
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockUnlinkSymlinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: mockUnlinkSymlinks
      }) as any);
      
      await cli.handleUnlinkCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockUnlinkSymlinks).toHaveBeenCalledWith(mockConfig, false);
    });

    it('should handle unlink command in dry run mode', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        unlinked: ['test.txt'],
        errors: [],
        mode: 'all' as const
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockUnlinkSymlinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: mockUnlinkSymlinks
      }) as any);
      
      await cli.handleUnlinkCommand(undefined, { quiet: false, verbose: false, dryRun: true, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockUnlinkSymlinks).toHaveBeenCalledWith(mockConfig, true);
    });

    it('should handle unlink command with no symlinks found', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        unlinked: [],
        errors: [],
        mode: 'all' as const
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockUnlinkSymlinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: mockUnlinkSymlinks
      }) as any);
      
      await cli.handleUnlinkCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockUnlinkSymlinks).toHaveBeenCalledWith(mockConfig, false);
    });

    it('should handle unlink command with errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockResult = {
        unlinked: ['test.txt'],
        errors: [{ file: 'error.txt', worktree: '/repo-feature', error: 'Permission denied' }],
        mode: 'all' as const
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockUnlinkSymlinks = vi.fn().mockResolvedValue(mockResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: mockUnlinkSymlinks
      }) as any);
      
      await cli.handleUnlinkCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockUnlinkSymlinks).toHaveBeenCalledWith(mockConfig, false);
    });

    it('should handle unlink command errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockRejectedValue(new Error('Config error')),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      await expect(async () => {
        await cli.handleUnlinkCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false });
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Run Method', () => {
    it('should run CLI successfully', async () => {
      const cli = new CLI();
      const { Command } = await import('commander');
      
      const mockProgram = new Command();
      (cli as any).program = mockProgram;
      
      vi.mocked(mockProgram.parseAsync).mockResolvedValue(mockProgram as any);
      
      await cli.run(['node', 'script.js', 'sync']);
      
      expect(mockProgram.parseAsync).toHaveBeenCalledWith(['node', 'script.js', 'sync']);
    });

    it('should handle CLI run errors', async () => {
      const cli = new CLI();
      const { Command } = await import('commander');
      
      const mockProgram = new Command();
      (cli as any).program = mockProgram;
      
      vi.mocked(mockProgram.parseAsync).mockRejectedValue(new Error('Parse error'));
      
      await expect(async () => {
        await cli.run(['node', 'script.js', 'invalid']);
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Sync Actions Display', () => {
    it('should display sync actions correctly', () => {
      const cli = new CLI();
      const mockActions = [
        {
          targetWorktree: '/repo/feature',
          file: 'test.txt',
          linkPath: '/repo/test.txt',
          action: 'create'
        },
        {
          targetWorktree: '/repo/feature',
          file: 'skip.txt',
          action: 'skip',
          reason: 'file exists'
        }
      ];
      
      expect(() => {
        cli.showSyncActions(mockActions, false);
      }).not.toThrow();
    });

    it('should display sync actions in dry run mode', () => {
      const cli = new CLI();
      const mockActions = [
        {
          targetWorktree: '/repo/feature',
          file: 'test.txt',
          linkPath: '/repo/test.txt',
          action: 'create'
        }
      ];
      
      expect(() => {
        cli.showSyncActions(mockActions, true);
      }).not.toThrow();
    });

    it('should handle empty sync actions', () => {
      const cli = new CLI();
      const mockActions: any[] = [];
      
      expect(() => {
        cli.showSyncActions(mockActions, false);
      }).not.toThrow();
    });

    it('should group actions by multiple worktrees', () => {
      const cli = new CLI();
      const mockActions = [
        {
          targetWorktree: '/repo/feature-a',
          file: 'test1.txt',
          linkPath: '/repo/test1.txt',
          action: 'create'
        },
        {
          targetWorktree: '/repo/feature-b',
          file: 'test2.txt',
          linkPath: '/repo/test2.txt',
          action: 'create'
        },
        {
          targetWorktree: '/repo/feature-a',
          file: 'test3.txt',
          linkPath: '/repo/test3.txt',
          action: 'update'
        }
      ];
      
      expect(() => {
        cli.showSyncActions(mockActions, false);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed package.json', () => {
      mockReadFileSync.mockReturnValue('invalid json');
      
      expect(() => new CLI()).toThrow();
    });

    it('should handle missing version in package.json', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'sync-worktrees'
        // version field missing
      }));
      
      expect(() => new CLI()).not.toThrow();
    });

    it('should handle logger configuration priority when both quiet and verbose are true', async () => {
      const cli = new CLI();
      const { Logger } = await import('../../src/utils/logger.js');
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
        syncActions: []
      };
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn().mockResolvedValue(mockPlan),
        sync: vi.fn().mockResolvedValue({ success: true, created: 1, updated: 0, skipped: 0, errors: [] }),
        getSyncSummary: vi.fn().mockReturnValue({ 
          totalWorktrees: 1, 
          totalFiles: 1,
          actionCounts: { create: 1, update: 0, skip: 0 },
          filesByWorktree: { '/repo-feature': 1 }
        }),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn()
      }) as any);
      
      // quiet should take priority over verbose
      await cli.handleSyncCommand(undefined, { quiet: true, verbose: true, dryRun: false, noColor: false });
      
      expect(Logger.configure).toHaveBeenCalledWith({
        level: 'error',
        useColor: true
      });
    });

    it('should handle sync command with empty plan', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: [], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [],
        syncActions: []
      };
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn().mockResolvedValue(mockPlan),
        sync: vi.fn().mockResolvedValue({ success: true, created: 0, updated: 0, skipped: 0, errors: [] }),
        getSyncSummary: vi.fn().mockReturnValue({ 
          totalWorktrees: 0, 
          totalFiles: 0,
          actionCounts: { create: 0, update: 0, skip: 0 },
          filesByWorktree: {}
        }),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn()
      }) as any);
      
      await expect(cli.handleSyncCommand(undefined, { quiet: false, verbose: false, dryRun: false, noColor: false }))
        .resolves.toBeUndefined();
    });
  });

  describe('Doctor Command', () => {
    it('should handle doctor command successfully with all checks passing', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockDoctorResult = {
        configValid: true,
        sourceWorktreeExists: true,
        targetWorktreesAccessible: true,
        missingFiles: [],
        brokenSymlinks: [],
        permissionIssues: [],
        recommendations: []
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockDoctor = vi.fn().mockResolvedValue(mockDoctorResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: vi.fn(),
        doctor: mockDoctor
      }) as any);
      
      await cli.handleDoctorCommand(undefined, { quiet: false, verbose: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockDoctor).toHaveBeenCalledWith(mockConfig);
    });

    it('should handle doctor command with issues found', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt', 'missing.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockDoctorResult = {
        configValid: true,
        sourceWorktreeExists: true,
        targetWorktreesAccessible: false,
        missingFiles: ['missing.txt'],
        brokenSymlinks: ['broken-link.txt'],
        permissionIssues: ['permission-denied.txt'],
        recommendations: [
          'Remove missing.txt from sharedFiles or create the file',
          'Run sync-worktrees clean to remove broken symlinks',
          'Check file permissions for permission-denied.txt'
        ]
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockDoctor = vi.fn().mockResolvedValue(mockDoctorResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: vi.fn(),
        doctor: mockDoctor
      }) as any);
      
      await cli.handleDoctorCommand(undefined, { quiet: false, verbose: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockDoctor).toHaveBeenCalledWith(mockConfig);
    });

    it('should handle doctor command with config validation error', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockDoctorResult = {
        configValid: false,
        sourceWorktreeExists: true,
        targetWorktreesAccessible: true,
        missingFiles: [],
        brokenSymlinks: [],
        permissionIssues: [],
        recommendations: ['Fix configuration validation errors']
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockDoctor = vi.fn().mockResolvedValue(mockDoctorResult);
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: vi.fn(),
        sync: vi.fn(),
        getSyncSummary: vi.fn(),
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: vi.fn(),
        doctor: mockDoctor
      }) as any);
      
      await cli.handleDoctorCommand(undefined, { quiet: false, verbose: false, noColor: false });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockDoctor).toHaveBeenCalledWith(mockConfig);
    });

    it('should handle doctor command errors', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: vi.fn().mockRejectedValue(new Error('Config error')),
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      await expect(async () => {
        await cli.handleDoctorCommand(undefined, { quiet: false, verbose: false, noColor: false });
      }).rejects.toThrow('process.exit called');
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Selective Sync', () => {
    it('should handle selective sync with files option', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['docker-compose.yml', 'test.txt', '.env'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
        syncActions: [
          {
            targetWorktree: '/repo-feature',
            file: 'docker-compose.yml',
            sourcePath: '/repo/docker-compose.yml',
            targetPath: '/repo-feature/docker-compose.yml',
            linkPath: '../docker-compose.yml',
            action: 'create'
          }
        ]
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCreatePlan = vi.fn().mockResolvedValue(mockPlan);
      const mockSync = vi.fn().mockResolvedValue({ success: true, created: 1, updated: 0, skipped: 0, errors: [] });
      const mockGetSyncSummary = vi.fn().mockReturnValue({ 
        totalWorktrees: 1, 
        totalFiles: 1,
        actionCounts: { create: 1, update: 0, skip: 0 },
        filesByWorktree: { '/repo-feature': 1 }
      });
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: mockCreatePlan,
        sync: mockSync,
        getSyncSummary: mockGetSyncSummary,
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: vi.fn(),
        doctor: vi.fn()
      }) as any);
      
      await cli.handleSyncCommand(undefined, { 
        quiet: false, 
        verbose: false, 
        dryRun: false, 
        noColor: false, 
        files: 'docker-compose.yml,*.env' 
      });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCreatePlan).toHaveBeenCalledWith(mockConfig, { filePatterns: ['docker-compose.yml', '*.env'] });
    });

    it('should handle selective sync with worktree option', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['docker-compose.yml'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
        syncActions: [
          {
            targetWorktree: '/repo-feature',
            file: 'docker-compose.yml',
            sourcePath: '/repo/docker-compose.yml',
            targetPath: '/repo-feature/docker-compose.yml',
            linkPath: '../docker-compose.yml',
            action: 'create'
          }
        ]
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCreatePlan = vi.fn().mockResolvedValue(mockPlan);
      const mockSync = vi.fn().mockResolvedValue({ success: true, created: 1, updated: 0, skipped: 0, errors: [] });
      const mockGetSyncSummary = vi.fn().mockReturnValue({ 
        totalWorktrees: 1, 
        totalFiles: 1,
        actionCounts: { create: 1, update: 0, skip: 0 },
        filesByWorktree: { '/repo-feature': 1 }
      });
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: mockCreatePlan,
        sync: mockSync,
        getSyncSummary: mockGetSyncSummary,
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: vi.fn(),
        doctor: vi.fn()
      }) as any);
      
      await cli.handleSyncCommand(undefined, { 
        quiet: false, 
        verbose: false, 
        dryRun: false, 
        noColor: false, 
        worktree: 'feature' 
      });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCreatePlan).toHaveBeenCalledWith(mockConfig, { worktreeName: 'feature' });
    });

    it('should handle selective sync with both files and worktree options', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['docker-compose.yml', 'test.txt'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
        syncActions: [
          {
            targetWorktree: '/repo-feature',
            file: 'docker-compose.yml',
            sourcePath: '/repo/docker-compose.yml',
            targetPath: '/repo-feature/docker-compose.yml',
            linkPath: '../docker-compose.yml',
            action: 'create'
          }
        ]
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCreatePlan = vi.fn().mockResolvedValue(mockPlan);
      const mockSync = vi.fn().mockResolvedValue({ success: true, created: 1, updated: 0, skipped: 0, errors: [] });
      const mockGetSyncSummary = vi.fn().mockReturnValue({ 
        totalWorktrees: 1, 
        totalFiles: 1,
        actionCounts: { create: 1, update: 0, skip: 0 },
        filesByWorktree: { '/repo-feature': 1 }
      });
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: mockCreatePlan,
        sync: mockSync,
        getSyncSummary: mockGetSyncSummary,
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: vi.fn(),
        doctor: vi.fn()
      }) as any);
      
      await cli.handleSyncCommand(undefined, { 
        quiet: false, 
        verbose: false, 
        dryRun: false, 
        noColor: false, 
        files: 'docker-compose.yml',
        worktree: 'feature' 
      });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCreatePlan).toHaveBeenCalledWith(mockConfig, { 
        filePatterns: ['docker-compose.yml'],
        worktreeName: 'feature' 
      });
    });

    it('should handle selective sync without options (normal sync)', async () => {
      const cli = new CLI();
      const { ConfigLoader } = await import('../../src/config/loader.js');
      const { SyncEngine } = await import('../../src/sync/engine.js');
      
      const mockConfig = { 
        sharedFiles: ['docker-compose.yml'], 
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      const mockPlan = {
        sourceWorktree: { path: '/repo', branch: 'main', head: 'abc123', isMain: true },
        targetWorktrees: [{ path: '/repo-feature', branch: 'feature', head: 'def456', isMain: false }],
        syncActions: [
          {
            targetWorktree: '/repo-feature',
            file: 'docker-compose.yml',
            sourcePath: '/repo/docker-compose.yml',
            targetPath: '/repo-feature/docker-compose.yml',
            linkPath: '../docker-compose.yml',
            action: 'create'
          }
        ]
      };
      
      const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);
      const mockCreatePlan = vi.fn().mockResolvedValue(mockPlan);
      const mockSync = vi.fn().mockResolvedValue({ success: true, created: 1, updated: 0, skipped: 0, errors: [] });
      const mockGetSyncSummary = vi.fn().mockReturnValue({ 
        totalWorktrees: 1, 
        totalFiles: 1,
        actionCounts: { create: 1, update: 0, skip: 0 },
        filesByWorktree: { '/repo-feature': 1 }
      });
      
      vi.mocked(ConfigLoader).mockImplementation(() => ({
        loadConfig: mockLoadConfig,
        createSampleConfigFile: vi.fn(),
        generateSampleConfig: vi.fn()
      }) as any);
      
      vi.mocked(SyncEngine).mockImplementation(() => ({
        createPlan: mockCreatePlan,
        sync: mockSync,
        getSyncSummary: mockGetSyncSummary,
        checkStatus: vi.fn(),
        cleanBrokenLinks: vi.fn(),
        unlinkSymlinks: vi.fn(),
        doctor: vi.fn()
      }) as any);
      
      await cli.handleSyncCommand(undefined, { 
        quiet: false, 
        verbose: false, 
        dryRun: false, 
        noColor: false
      });
      
      expect(mockLoadConfig).toHaveBeenCalledWith(undefined);
      expect(mockCreatePlan).toHaveBeenCalledWith(mockConfig, undefined);
    });
  });
});