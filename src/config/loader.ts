import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { validateConfig, ConfigError, type ConfigSchema } from './schema.js';
import { RepositoryManager } from '../git/repository.js';

export class ConfigLoader {
  private repositoryManager: RepositoryManager;
  private static readonly DEFAULT_CONFIG_FILE = '.worktreesync.json';

  constructor() {
    this.repositoryManager = RepositoryManager.getInstance();
  }

  async loadConfig(configPath?: string): Promise<ConfigSchema> {
    const resolvedPath = await this.resolveConfigPath(configPath);
    
    if (!existsSync(resolvedPath)) {
      if (configPath) {
        throw new ConfigError(
          `Configuration file not found: ${resolvedPath}`,
          resolvedPath
        );
      } else {
        throw new ConfigError(
          `No configuration file found. Create ${ConfigLoader.DEFAULT_CONFIG_FILE} in your repository root.`,
          resolvedPath
        );
      }
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      const data = JSON.parse(content);
      return validateConfig(data, resolvedPath);
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      
      if (error instanceof SyntaxError) {
        throw new ConfigError(
          `Invalid JSON in configuration file: ${error.message}`,
          resolvedPath,
          error
        );
      }
      
      throw new ConfigError(
        `Failed to read configuration file: ${error}`,
        resolvedPath,
        error
      );
    }
  }

  private async resolveConfigPath(configPath?: string): Promise<string> {
    const repositoryRoot = await this.repositoryManager.getRepositoryRoot();
    
    if (configPath) {
      // If path is absolute, use as-is, otherwise resolve relative to repository root
      return resolve(repositoryRoot, configPath);
    }
    
    return resolve(repositoryRoot, ConfigLoader.DEFAULT_CONFIG_FILE);
  }

  async generateSampleConfig(): Promise<string> {
    const sampleConfig: ConfigSchema = {
      $schema: 'https://unpkg.com/worktree-sync/schema.json',
      sharedFiles: [
        'docker-compose.yml',
        '.env.local',
        '.vscode/settings.json'
      ],
      sourceWorktree: 'main',
      linkMode: 'relative',
      overwrite: false,
      ignore: [
        '*.log',
        'node_modules/**'
      ],
      hooks: {
        beforeSync: 'echo "Starting sync..."',
        afterSync: 'echo "Sync completed!"'
      }
    };

    return JSON.stringify(sampleConfig, null, 2);
  }

  async createSampleConfigFile(configPath?: string): Promise<string> {
    const resolvedPath = await this.resolveConfigPath(configPath);
    const sampleContent = await this.generateSampleConfig();
    
    if (existsSync(resolvedPath)) {
      throw new ConfigError(
        `Configuration file already exists: ${resolvedPath}`,
        resolvedPath
      );
    }

    try {
      const fs = await import('fs/promises');
      await fs.writeFile(resolvedPath, sampleContent, 'utf-8');
      return resolvedPath;
    } catch (error) {
      throw new ConfigError(
        `Failed to create configuration file: ${error}`,
        resolvedPath,
        error
      );
    }
  }

  async validateConfigFile(configPath?: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      await this.loadConfig(configPath);
      return { valid: true, errors: [] };
    } catch (error) {
      const errorMessage = error instanceof ConfigError 
        ? error.message 
        : `Unexpected error: ${error}`;
      
      return { valid: false, errors: [errorMessage] };
    }
  }

  static getDefaultConfigFileName(): string {
    return ConfigLoader.DEFAULT_CONFIG_FILE;
  }
}