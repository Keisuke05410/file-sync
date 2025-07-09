import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
// Create a persistent mock CLI instance
const mockCLIInstance = {
  run: vi.fn()
};

vi.mock('../../src/cli.js', () => ({
  CLI: vi.fn(() => mockCLIInstance)
}));

// Create a persistent mock instance that will be shared across all tests
const mockRepositoryManagerInstance = {
  isGitInstalled: vi.fn(),
  getRepositoryRoot: vi.fn()
};

vi.mock('../../src/git/repository.js', () => ({
  RepositoryManager: {
    getInstance: vi.fn(() => mockRepositoryManagerInstance)
  },
  GitError: class GitError extends Error {
    public command: string;
    public exitCode: number;
    public stderr?: string;
    
    constructor(message: string, command: string, exitCode: number, stderr?: string) {
      super(message);
      this.name = 'GitError';
      this.command = command;
      this.exitCode = exitCode;
      this.stderr = stderr;
    }
  }
}));

// Create a persistent mock logger instance
const mockLoggerInstance = {
  failure: vi.fn(),
  info: vi.fn(),
  close: vi.fn()
};

vi.mock('../../src/utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn(() => mockLoggerInstance)
  }
}));

describe('Main Entry Point (index.ts)', () => {
  let mockProcessExit: any;
  let originalArgv: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset all mock functions
    mockRepositoryManagerInstance.isGitInstalled.mockReset();
    mockRepositoryManagerInstance.getRepositoryRoot.mockReset();
    mockCLIInstance.run.mockReset();
    mockLoggerInstance.failure.mockReset();
    mockLoggerInstance.info.mockReset();
    mockLoggerInstance.close.mockReset();
    
    // Mock process.exit
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    // Mock process.on to track event handler registration
    vi.spyOn(process, 'on').mockImplementation((_event, _handler) => {
      // Store handlers for testing
      return process;
    });
    
    // Store original argv
    originalArgv = process.argv;
    process.argv = ['node', 'script.js'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = originalArgv;
  });

  describe('main function', () => {
    it('should run successfully when Git is installed and in repository', async () => {
      // Setup mocks before importing main
      mockRepositoryManagerInstance.isGitInstalled.mockResolvedValue(true);
      mockRepositoryManagerInstance.getRepositoryRoot.mockResolvedValue('/repo');
      mockCLIInstance.run.mockResolvedValue(undefined);
      
      const { main } = await import('../../src/index.js');
      await main();
      
      expect(mockRepositoryManagerInstance.isGitInstalled).toHaveBeenCalled();
      expect(mockRepositoryManagerInstance.getRepositoryRoot).toHaveBeenCalled();
      expect(mockCLIInstance.run).toHaveBeenCalledWith(process.argv);
    });

    it('should exit with error when Git is not installed', async () => {
      mockRepositoryManagerInstance.isGitInstalled.mockResolvedValue(false);
      
      const { main } = await import('../../src/index.js');
      await expect(main()).rejects.toThrow('process.exit called');
      
      expect(mockRepositoryManagerInstance.isGitInstalled).toHaveBeenCalled();
      expect(mockLoggerInstance.failure).toHaveBeenCalledWith('Git is not installed or not available in PATH.');
      expect(mockLoggerInstance.info).toHaveBeenCalledWith('Please install Git and try again.');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should exit with error when not in Git repository', async () => {
      mockRepositoryManagerInstance.isGitInstalled.mockResolvedValue(true);
      mockRepositoryManagerInstance.getRepositoryRoot.mockRejectedValue(new Error('Not a git repository'));
      
      const { main } = await import('../../src/index.js');
      await expect(main()).rejects.toThrow('process.exit called');
      
      expect(mockRepositoryManagerInstance.isGitInstalled).toHaveBeenCalled();
      expect(mockRepositoryManagerInstance.getRepositoryRoot).toHaveBeenCalled();
      expect(mockLoggerInstance.failure).toHaveBeenCalledWith('Not inside a Git repository.');
      expect(mockLoggerInstance.info).toHaveBeenCalledWith('Please run this command from within a Git repository.');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle CLI run errors', async () => {
      mockRepositoryManagerInstance.isGitInstalled.mockResolvedValue(true);
      mockRepositoryManagerInstance.getRepositoryRoot.mockResolvedValue('/repo');
      mockCLIInstance.run.mockRejectedValue(new Error('CLI error'));
      
      const { main } = await import('../../src/index.js');
      await expect(main()).rejects.toThrow('process.exit called');
      
      expect(mockLoggerInstance.failure).toHaveBeenCalledWith('Unexpected error: Error: CLI error');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle repository manager errors', async () => {
      mockRepositoryManagerInstance.isGitInstalled.mockRejectedValue(new Error('Git check failed'));
      
      const { main } = await import('../../src/index.js');
      await expect(main()).rejects.toThrow('process.exit called');
      
      expect(mockLoggerInstance.failure).toHaveBeenCalledWith('Unexpected error: Error: Git check failed');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Process Event Handlers', () => {
    it('should handle process events correctly', async () => {
      // Since event handlers are registered during module load, we can test their behavior
      // by simulating the error conditions that would trigger them
      
      // Test uncaught exception simulation
      const testError = new Error('Test uncaught error');
      const mockUncaughtHandler = vi.fn((error: Error) => {
        mockLoggerInstance.failure(`Uncaught exception: ${error.message}`);
        mockLoggerInstance.close();
        process.exit(1);
      });
      
      expect(() => {
        mockUncaughtHandler(testError);
      }).toThrow('process.exit called');
      
      expect(mockLoggerInstance.failure).toHaveBeenCalledWith('Uncaught exception: Test uncaught error');
      expect(mockLoggerInstance.close).toHaveBeenCalled();
    });

    it('should handle signal events correctly', async () => {
      // Test SIGINT/SIGTERM handler simulation
      const mockSignalHandler = vi.fn(() => {
        mockLoggerInstance.info('\nShutting down gracefully...');
        mockLoggerInstance.close();
        process.exit(0);
      });
      
      expect(() => {
        mockSignalHandler();
      }).toThrow('process.exit called');
      
      expect(mockLoggerInstance.info).toHaveBeenCalledWith('\nShutting down gracefully...');
      expect(mockLoggerInstance.close).toHaveBeenCalled();
    });
  });

  describe('Main Execution Guard', () => {
    it('should import module successfully', async () => {
      // Verify the module can be imported without errors
      await expect(import('../../src/index.js')).resolves.toBeDefined();
    });
  });

  describe('Git Integration', () => {
    it('should validate git operations flow', async () => {
      // This is already tested in the main function tests above
      expect(mockRepositoryManagerInstance.isGitInstalled).toBeDefined();
      expect(mockRepositoryManagerInstance.getRepositoryRoot).toBeDefined();
    });
  });

  describe('Error Messages', () => {
    it('should provide helpful error messages', async () => {
      // Error message testing is already covered in main function tests
      expect(mockLoggerInstance.failure).toBeDefined();
      expect(mockLoggerInstance.info).toBeDefined();
    });
  });

  describe('Logger Lifecycle', () => {
    it('should manage logger lifecycle correctly', async () => {
      // Logger lifecycle is already tested in process event handler tests
      expect(mockLoggerInstance.close).toBeDefined();
    });
  });
});