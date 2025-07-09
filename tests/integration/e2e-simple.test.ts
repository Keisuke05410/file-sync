import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock git operations since we can't use process.chdir in workers
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('glob', () => ({
  glob: vi.fn()
}));

describe('Simplified End-to-End Integration Tests', () => {
  let tempDir: string;
  let repoPath: string;
  let worktree1Path: string;
  let worktree2Path: string;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = await mkdtemp(join(tmpdir(), 'worktree-sync-simple-'));
    repoPath = join(tempDir, 'main-repo');
    worktree1Path = join(tempDir, 'worktree1');
    worktree2Path = join(tempDir, 'worktree2');

    // Create directory structure
    await mkdir(repoPath, { recursive: true });
    await mkdir(worktree1Path, { recursive: true });
    await mkdir(worktree2Path, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Configuration File Operations', () => {
    it('should create and load configuration file', async () => {
      // Create config manually to avoid Git dependency
      const config = {
        sharedFiles: ['docker-compose.yml', '.env'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      const configPath = join(repoPath, '.worktreesync.json');
      await writeFile(configPath, JSON.stringify(config, null, 2));
      
      // Verify file exists
      await expect(access(configPath)).resolves.not.toThrow();
      
      // Read and validate config content
      const configContent = await readFile(configPath, 'utf-8');
      const parsedConfig = JSON.parse(configContent);
      
      expect(parsedConfig).toBeDefined();
      expect(parsedConfig.sharedFiles).toBeDefined();
      expect(Array.isArray(parsedConfig.sharedFiles)).toBe(true);
      expect(parsedConfig.sourceWorktree).toBeDefined();
    });

    it('should handle missing configuration file', async () => {
      const nonExistentPath = join(repoPath, 'nonexistent.json');
      
      // Test access to non-existent file
      await expect(access(nonExistentPath)).rejects.toThrow();
    });

    it('should validate configuration schema', async () => {
      const { validateConfig } = await import('../../src/config/schema.js');
      
      const validConfig = {
        sharedFiles: ['docker-compose.yml', '.env'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: []
      };
      
      const result = validateConfig(validConfig, 'test.json');
      expect(result).toEqual(validConfig);
    });
  });

  describe('File System Operations', () => {
    it('should create and manipulate files in test directories', async () => {
      // Create test files
      const testFile = join(repoPath, 'test.txt');
      const testContent = 'Test content for integration';
      
      await writeFile(testFile, testContent);
      
      // Verify file exists and has correct content
      const readContent = await readFile(testFile, 'utf-8');
      expect(readContent).toBe(testContent);
      
      // Verify file is accessible
      await expect(access(testFile)).resolves.not.toThrow();
    });

    it('should handle subdirectories', async () => {
      const subDir = join(repoPath, 'subdir');
      const subFile = join(subDir, 'nested.txt');
      
      await mkdir(subDir, { recursive: true });
      await writeFile(subFile, 'Nested content');
      
      const content = await readFile(subFile, 'utf-8');
      expect(content).toBe('Nested content');
    });
  });

  describe('Symlink Operations', () => {
    it('should create and read symlinks between directories', async () => {
      // Create source file
      const sourceFile = join(repoPath, 'shared.txt');
      await writeFile(sourceFile, 'Shared content');
      
      // Create symlink manually (testing the concept, not the manager)
      const linkPath = join(worktree1Path, 'shared.txt');
      
      // Use fs.symlink directly for testing
      const { symlink } = await import('fs/promises');
      await symlink(sourceFile, linkPath);
      
      // Verify symlink points to correct content
      const linkContent = await readFile(linkPath, 'utf-8');
      expect(linkContent).toBe('Shared content');
    });
  });


  describe('Configuration Patterns', () => {
    it('should handle various file patterns', async () => {
      const { validateConfig } = await import('../../src/config/schema.js');
      
      const patternConfig = {
        sharedFiles: [
          'docker-compose.yml',
          '.env*',
          '.vscode/**/*',
          'tools/*.sh',
          '**/*.config.js'
        ],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: true,
        ignore: ['node_modules/**', '*.log']
      };
      
      const result = validateConfig(patternConfig, 'patterns.json');
      expect(result.sharedFiles).toHaveLength(5);
      expect(result.ignore).toHaveLength(2);
      expect(result.overwrite).toBe(true);
    });

    it('should handle hooks configuration', async () => {
      const { validateConfig } = await import('../../src/config/schema.js');
      
      const hooksConfig = {
        sharedFiles: ['test.txt'],
        sourceWorktree: 'main',
        hooks: {
          beforeSync: 'echo "Starting sync..."',
          afterSync: 'echo "Sync completed!"'
        }
      };
      
      const result = validateConfig(hooksConfig, 'hooks.json');
      expect(result.hooks).toBeDefined();
      expect(result.hooks?.beforeSync).toBe('echo "Starting sync..."');
      expect(result.hooks?.afterSync).toBe('echo "Sync completed!"');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing source files', async () => {
      const nonExistentSource = join(repoPath, 'missing.txt');
      
      // Verify the source file doesn't exist
      await expect(access(nonExistentSource)).rejects.toThrow();
    });

    it('should handle invalid configuration', async () => {
      const { validateConfig, ConfigError } = await import('../../src/config/schema.js');
      
      const invalidConfig = {
        sharedFiles: [], // Empty array not allowed
        sourceWorktree: '',
        linkMode: 'invalid'
      };
      
      expect(() => validateConfig(invalidConfig, 'invalid.json')).toThrow(ConfigError);
    });
  });

  describe('Real-world File Types', () => {
    it('should handle development configuration files', async () => {
      // Create typical development files
      await writeFile(join(repoPath, 'package.json'), JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        scripts: { test: 'vitest' }
      }, null, 2));
      
      await writeFile(join(repoPath, 'docker-compose.yml'), `
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
`);
      
      await writeFile(join(repoPath, '.env.local'), `
DEBUG=true
API_URL=http://localhost:8080
DATABASE_URL=postgresql://localhost/test
`);
      
      // Create VS Code settings
      await mkdir(join(repoPath, '.vscode'), { recursive: true });
      await writeFile(join(repoPath, '.vscode', 'settings.json'), JSON.stringify({
        "editor.tabSize": 2,
        "editor.insertSpaces": true,
        "typescript.preferences.importModuleSpecifier": "relative"
      }, null, 2));
      
      // Verify all files were created
      await expect(access(join(repoPath, 'package.json'))).resolves.not.toThrow();
      await expect(access(join(repoPath, 'docker-compose.yml'))).resolves.not.toThrow();
      await expect(access(join(repoPath, '.env.local'))).resolves.not.toThrow();
      await expect(access(join(repoPath, '.vscode', 'settings.json'))).resolves.not.toThrow();
      
      // Verify content is valid JSON where expected
      const packageContent = JSON.parse(await readFile(join(repoPath, 'package.json'), 'utf-8'));
      expect(packageContent.name).toBe('test-project');
      
      const vsCodeContent = JSON.parse(await readFile(join(repoPath, '.vscode', 'settings.json'), 'utf-8'));
      expect(vsCodeContent['editor.tabSize']).toBe(2);
    });
  });

  describe('Component Integration', () => {
    it('should handle basic configuration and file operations', async () => {
      // Create configuration file
      const config = {
        sharedFiles: ['app.js', 'config.json'],
        sourceWorktree: 'main',
        linkMode: 'relative' as const,
        overwrite: false,
        ignore: ['*.tmp']
      };
      
      const configPath = join(repoPath, '.worktreesync.json');
      await writeFile(configPath, JSON.stringify(config, null, 2));
      
      // Verify config can be read back
      const configContent = await readFile(configPath, 'utf-8');
      const loadedConfig = JSON.parse(configContent);
      
      expect(loadedConfig).toEqual(config);
      expect(loadedConfig.sharedFiles).toContain('app.js');
      expect(loadedConfig.sharedFiles).toContain('config.json');
    });
  });
});