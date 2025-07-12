import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { ConfigLoader } from '../../src/config/loader.js';
import { ConfigError, validateConfig } from '../../src/config/schema.js';
import { RepositoryManager } from '../../src/git/repository.js';

// Mock dependencies
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn()
}));

vi.mock('path', () => ({
  resolve: vi.fn()
}));

vi.mock('../../src/config/schema.js', () => ({
  validateConfig: vi.fn(),
  ConfigError: class extends Error {
    constructor(message: string, configPath: string, details?: any) {
      super(message);
      this.name = 'ConfigError';
      this.configPath = configPath;
      this.details = details;
    }
  }
}));

vi.mock('../../src/git/repository.js', () => ({
  RepositoryManager: {
    getInstance: vi.fn()
  }
}));

const mockReadFileSync = readFileSync as MockedFunction<typeof readFileSync>;
const mockExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockWriteFile = writeFile as MockedFunction<typeof writeFile>;
const mockResolve = resolve as MockedFunction<typeof resolve>;
const mockValidateConfig = validateConfig as MockedFunction<typeof validateConfig>;

const mockRepositoryManager = {
  getRepositoryRoot: vi.fn()
};

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock RepositoryManager.getInstance
    (RepositoryManager.getInstance as MockedFunction<typeof RepositoryManager.getInstance>)
      .mockReturnValue(mockRepositoryManager as any);
    
    mockRepositoryManager.getRepositoryRoot.mockResolvedValue('/repo/root');
    mockResolve.mockImplementation((base, path) => `${base}/${path}`);
    
    configLoader = new ConfigLoader();
  });

  describe('loadConfig', () => {
    const mockValidConfig = {
      sharedFiles: ['docker-compose.yml'],
      sourceWorktree: 'main',
      linkMode: 'relative' as const,
      overwrite: false,
      ignore: []
    };

    it('should load config from default path', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockValidConfig));
      mockValidateConfig.mockReturnValue(mockValidConfig);
      
      const result = await configLoader.loadConfig();
      
      expect(mockRepositoryManager.getRepositoryRoot).toHaveBeenCalled();
      expect(mockResolve).toHaveBeenCalledWith('/repo/root', '.worktreesync.json');
      expect(mockExistsSync).toHaveBeenCalledWith('/repo/root/.worktreesync.json');
      expect(mockReadFileSync).toHaveBeenCalledWith('/repo/root/.worktreesync.json', 'utf-8');
      expect(mockValidateConfig).toHaveBeenCalledWith(mockValidConfig, '/repo/root/.worktreesync.json');
      expect(result).toEqual(mockValidConfig);
    });

    it('should load config from custom path', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockValidConfig));
      mockValidateConfig.mockReturnValue(mockValidConfig);
      
      const result = await configLoader.loadConfig('custom-config.json');
      
      expect(mockResolve).toHaveBeenCalledWith('/repo/root', 'custom-config.json');
      expect(mockExistsSync).toHaveBeenCalledWith('/repo/root/custom-config.json');
      expect(result).toEqual(mockValidConfig);
    });

    it('should handle absolute config path', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockValidConfig));
      mockValidateConfig.mockReturnValue(mockValidConfig);
      
      await configLoader.loadConfig('/absolute/path/config.json');
      
      expect(mockResolve).toHaveBeenCalledWith('/repo/root', '/absolute/path/config.json');
    });

    it('should throw ConfigError when default config file not found', async () => {
      mockExistsSync.mockReturnValue(false);
      
      await expect(configLoader.loadConfig()).rejects.toThrow(ConfigError);
      await expect(configLoader.loadConfig()).rejects.toThrow(
        'No configuration file found. Create .worktreesync.json in your repository root.'
      );
    });

    it('should throw ConfigError when custom config file not found', async () => {
      mockExistsSync.mockReturnValue(false);
      
      await expect(configLoader.loadConfig('custom.json')).rejects.toThrow(ConfigError);
      await expect(configLoader.loadConfig('custom.json')).rejects.toThrow(
        'Configuration file not found: /repo/root/custom.json'
      );
    });

    it('should throw ConfigError for invalid JSON', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json }');
      
      await expect(configLoader.loadConfig()).rejects.toThrow(ConfigError);
      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid JSON in configuration file'
      );
    });

    it('should throw ConfigError for validation errors', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ invalid: 'config' }));
      mockValidateConfig.mockImplementation(() => {
        throw new ConfigError('Validation failed', '/repo/root/.worktreesync.json');
      });
      
      await expect(configLoader.loadConfig()).rejects.toThrow(ConfigError);
      await expect(configLoader.loadConfig()).rejects.toThrow('Validation failed');
    });

    it('should throw ConfigError for file read errors', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      await expect(configLoader.loadConfig()).rejects.toThrow(ConfigError);
      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Failed to read configuration file: Error: Permission denied'
      );
    });

    it('should handle complex nested config structure', async () => {
      const complexConfig = {
        $schema: 'https://unpkg.com/worktree-sync/schema.json',
        sharedFiles: ['**/*.yml', '.env.*', '.vscode/**'],
        sourceWorktree: 'develop',
        linkMode: 'absolute' as const,
        overwrite: true,
        ignore: ['*.log', 'tmp/**', 'node_modules/**'],
        hooks: {
          beforeSync: 'npm run prepare',
          afterSync: 'npm run post-sync'
        }
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(complexConfig));
      mockValidateConfig.mockReturnValue(complexConfig);
      
      const result = await configLoader.loadConfig();
      
      expect(result).toEqual(complexConfig);
      expect(mockValidateConfig).toHaveBeenCalledWith(complexConfig, '/repo/root/.worktreesync.json');
    });

    it('should preserve original error details in ConfigError', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ "syntax": error }');
      
      try {
        await configLoader.loadConfig();
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect((error as ConfigError).configPath).toBe('/repo/root/.worktreesync.json');
        expect((error as ConfigError).details).toBeInstanceOf(SyntaxError);
      }
    });
  });

  describe('generateSampleConfig', () => {
    it('should generate sample config with correct structure', async () => {
      const sampleConfig = await configLoader.generateSampleConfig();
      const parsed = JSON.parse(sampleConfig);
      
      expect(parsed).toHaveProperty('$schema');
      expect(parsed).toHaveProperty('sharedFiles');
      expect(parsed).toHaveProperty('sourceWorktree', process.cwd());
      expect(parsed).toHaveProperty('linkMode', 'relative');
      expect(parsed).toHaveProperty('overwrite', false);
      expect(parsed).toHaveProperty('ignore');
      expect(parsed).toHaveProperty('hooks');
      
      expect(Array.isArray(parsed.sharedFiles)).toBe(true);
      expect(Array.isArray(parsed.ignore)).toBe(true);
      expect(typeof parsed.hooks).toBe('object');
    });

    it('should generate valid JSON', async () => {
      const sampleConfig = await configLoader.generateSampleConfig();
      
      expect(() => JSON.parse(sampleConfig)).not.toThrow();
    });

    it('should include common file patterns', async () => {
      const sampleConfig = await configLoader.generateSampleConfig();
      const parsed = JSON.parse(sampleConfig);
      
      expect(parsed.sharedFiles).toContain('docker-compose.yml');
      expect(parsed.sharedFiles).toContain('.env.local');
      expect(parsed.sharedFiles).toContain('.vscode/settings.json');
    });

    it('should include common ignore patterns', async () => {
      const sampleConfig = await configLoader.generateSampleConfig();
      const parsed = JSON.parse(sampleConfig);
      
      expect(parsed.ignore).toContain('*.log');
      expect(parsed.ignore).toContain('node_modules/**');
    });

    it('should include hook examples', async () => {
      const sampleConfig = await configLoader.generateSampleConfig();
      const parsed = JSON.parse(sampleConfig);
      
      expect(parsed.hooks.beforeSync).toBe('echo "Starting sync..."');
      expect(parsed.hooks.afterSync).toBe('echo "Sync completed!"');
    });

    it('should format JSON with proper indentation', async () => {
      const sampleConfig = await configLoader.generateSampleConfig();
      
      // Check that it's formatted with 2-space indentation
      expect(sampleConfig).toMatch(/\n  "/);
      expect(sampleConfig).toMatch(/\n    "/);
    });
  });

  describe('createSampleConfigFile', () => {
    it('should create sample config file at default path', async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFile.mockResolvedValue(undefined);
      
      const result = await configLoader.createSampleConfigFile();
      
      expect(mockExistsSync).toHaveBeenCalledWith('/repo/root/.worktreesync.json');
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/repo/root/.worktreesync.json',
        expect.stringContaining('"sharedFiles"'),
        'utf-8'
      );
      expect(result).toBe('/repo/root/.worktreesync.json');
    });

    it('should create sample config file at custom path', async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFile.mockResolvedValue(undefined);
      
      const result = await configLoader.createSampleConfigFile('custom.json');
      
      expect(mockExistsSync).toHaveBeenCalledWith('/repo/root/custom.json');
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/repo/root/custom.json',
        expect.stringContaining('"sharedFiles"'),
        'utf-8'
      );
      expect(result).toBe('/repo/root/custom.json');
    });

    it('should throw ConfigError when file already exists', async () => {
      mockExistsSync.mockReturnValue(true);
      
      await expect(configLoader.createSampleConfigFile()).rejects.toThrow(ConfigError);
      await expect(configLoader.createSampleConfigFile()).rejects.toThrow(
        'Configuration file already exists: /repo/root/.worktreesync.json'
      );
      
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should throw ConfigError when file creation fails', async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFile.mockRejectedValue(new Error('Permission denied'));
      
      await expect(configLoader.createSampleConfigFile()).rejects.toThrow(ConfigError);
      await expect(configLoader.createSampleConfigFile()).rejects.toThrow(
        'Failed to create configuration file: Error: Permission denied'
      );
    });

    it('should write valid JSON content', async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFile.mockResolvedValue(undefined);
      
      await configLoader.createSampleConfigFile();
      
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(() => JSON.parse(writtenContent)).not.toThrow();
    });
  });

  describe('validateConfigFile', () => {
    it('should return valid for correct config file', async () => {
      const mockConfig = {
        sharedFiles: ['docker-compose.yml'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      mockValidateConfig.mockReturnValue(mockConfig);
      
      const result = await configLoader.validateConfigFile();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return invalid for missing config file', async () => {
      mockExistsSync.mockReturnValue(false);
      
      const result = await configLoader.validateConfigFile();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No configuration file found');
    });

    it('should return invalid for invalid JSON', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json }');
      
      const result = await configLoader.validateConfigFile();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid JSON in configuration file');
    });

    it('should return invalid for validation errors', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ invalid: 'config' }));
      mockValidateConfig.mockImplementation(() => {
        throw new ConfigError('Missing required field: sharedFiles', '/path/config.json');
      });
      
      const result = await configLoader.validateConfigFile();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe('Missing required field: sharedFiles');
    });

    it('should handle custom config path', async () => {
      const mockConfig = {
        sharedFiles: ['docker-compose.yml'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      mockValidateConfig.mockReturnValue(mockConfig);
      
      const result = await configLoader.validateConfigFile('custom.json');
      
      expect(result.valid).toBe(true);
      expect(mockResolve).toHaveBeenCalledWith('/repo/root', 'custom.json');
    });

    it('should handle unexpected errors', async () => {
      mockRepositoryManager.getRepositoryRoot.mockRejectedValue(new Error('Git error'));
      
      const result = await configLoader.validateConfigFile();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unexpected error: Error: Git error');
    });
  });

  describe('getDefaultConfigFileName', () => {
    it('should return default config file name', () => {
      const fileName = ConfigLoader.getDefaultConfigFileName();
      
      expect(fileName).toBe('.worktreesync.json');
    });
  });

  describe('resolveConfigPath', () => {
    it('should resolve relative path against repository root', async () => {
      // Use reflection to access private method for testing
      const resolveConfigPath = (configLoader as any).resolveConfigPath.bind(configLoader);
      
      const result = await resolveConfigPath('custom.json');
      
      expect(mockRepositoryManager.getRepositoryRoot).toHaveBeenCalled();
      expect(mockResolve).toHaveBeenCalledWith('/repo/root', 'custom.json');
      expect(result).toBe('/repo/root/custom.json');
    });

    it('should resolve absolute path correctly', async () => {
      const resolveConfigPath = (configLoader as any).resolveConfigPath.bind(configLoader);
      
      const result = await resolveConfigPath('/absolute/path/config.json');
      
      expect(mockResolve).toHaveBeenCalledWith('/repo/root', '/absolute/path/config.json');
      expect(result).toBe('/repo/root//absolute/path/config.json');
    });

    it('should use default file name when no path provided', async () => {
      const resolveConfigPath = (configLoader as any).resolveConfigPath.bind(configLoader);
      
      const result = await resolveConfigPath();
      
      expect(mockResolve).toHaveBeenCalledWith('/repo/root', '.worktreesync.json');
      expect(result).toBe('/repo/root/.worktreesync.json');
    });
  });
});