import { describe, it, expect } from 'vitest';
import { 
  configSchema, 
  cliOptionsSchema, 
  validateConfig, 
  validateCliOptions, 
  ConfigError 
} from '../../src/config/schema.js';

describe('Config Schema Validation', () => {
  describe('configSchema', () => {
    it('should validate minimal valid config', () => {
      const config = {
        sharedFiles: ['docker-compose.yml']
      };
      
      const result = configSchema.parse(config);
      
      expect(result).toEqual({
        sharedFiles: ['docker-compose.yml'],
        sourceWorktree: 'main',
        linkMode: 'relative',
        overwrite: false,
        ignore: []
      });
    });

    it('should validate complete valid config', () => {
      const config = {
        $schema: 'https://unpkg.com/worktree-sync/schema.json',
        sharedFiles: ['docker-compose.yml', '.env.local', '.vscode/settings.json'],
        sourceWorktree: 'develop',
        linkMode: 'absolute' as const,
        overwrite: true,
        ignore: ['*.log', 'node_modules/**'],
        hooks: {
          beforeSync: 'echo "Starting sync..."',
          afterSync: 'echo "Sync completed!"'
        }
      };
      
      const result = configSchema.parse(config);
      
      expect(result).toEqual(config);
    });

    it('should fail validation when sharedFiles is empty', () => {
      const config = {
        sharedFiles: []
      };
      
      expect(() => configSchema.parse(config)).toThrow();
    });

    it('should fail validation when sharedFiles is missing', () => {
      const config = {};
      
      expect(() => configSchema.parse(config)).toThrow();
    });

    it('should fail validation with invalid linkMode', () => {
      const config = {
        sharedFiles: ['docker-compose.yml'],
        linkMode: 'invalid'
      };
      
      expect(() => configSchema.parse(config)).toThrow();
    });

    it('should accept only relative and absolute linkMode values', () => {
      const validModes = ['relative', 'absolute'];
      
      validModes.forEach(mode => {
        const config = {
          sharedFiles: ['docker-compose.yml'],
          linkMode: mode
        };
        
        expect(() => configSchema.parse(config)).not.toThrow();
      });
    });

    it('should validate hooks structure', () => {
      const config = {
        sharedFiles: ['docker-compose.yml'],
        hooks: {
          beforeSync: 'echo "before"'
        }
      };
      
      const result = configSchema.parse(config);
      
      expect(result.hooks).toEqual({
        beforeSync: 'echo "before"'
      });
    });
  });

  describe('cliOptionsSchema', () => {
    it('should validate empty CLI options with defaults', () => {
      const options = {};
      
      const result = cliOptionsSchema.parse(options);
      
      expect(result).toEqual({
        dryRun: false,
        verbose: false,
        quiet: false,
        noColor: false
      });
    });

    it('should validate complete CLI options', () => {
      const options = {
        config: './custom-config.json',
        dryRun: true,
        verbose: true,
        quiet: false,
        noColor: true
      };
      
      const result = cliOptionsSchema.parse(options);
      
      expect(result).toEqual(options);
    });

    it('should validate boolean flags correctly', () => {
      const options = {
        dryRun: 'true',
        verbose: false
      };
      
      expect(() => cliOptionsSchema.parse(options)).toThrow();
    });
  });

  describe('validateConfig', () => {
    it('should return parsed config for valid data', () => {
      const data = {
        sharedFiles: ['docker-compose.yml']
      };
      
      const result = validateConfig(data, '/path/to/config.json');
      
      expect(result.sharedFiles).toEqual(['docker-compose.yml']);
      expect(result.sourceWorktree).toBe('main');
    });

    it('should throw ConfigError for invalid data', () => {
      const data = {
        sharedFiles: []
      };
      
      expect(() => validateConfig(data, '/path/to/config.json')).toThrow(ConfigError);
    });

    it('should include config path in ConfigError', () => {
      const data = {
        sharedFiles: []
      };
      
      try {
        validateConfig(data, '/path/to/config.json');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect((error as ConfigError).configPath).toBe('/path/to/config.json');
      }
    });

    it('should format validation errors nicely', () => {
      const data = {
        sharedFiles: [],
        linkMode: 'invalid'
      };
      
      try {
        validateConfig(data, '/path/to/config.json');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect(error.message).toContain('Configuration validation failed:');
        expect(error.message).toContain('sharedFiles');
        expect(error.message).toContain('linkMode');
      }
    });
  });

  describe('validateCliOptions', () => {
    it('should return parsed options for valid data', () => {
      const data = {
        dryRun: true,
        verbose: false
      };
      
      const result = validateCliOptions(data);
      
      expect(result.dryRun).toBe(true);
      expect(result.verbose).toBe(false);
    });

    it('should throw Error for invalid CLI options', () => {
      const data = {
        dryRun: 'invalid'
      };
      
      expect(() => validateCliOptions(data)).toThrow(Error);
      expect(() => validateCliOptions(data)).not.toThrow(ConfigError);
    });

    it('should format CLI option validation errors', () => {
      const data = {
        dryRun: 'invalid',
        verbose: 123
      };
      
      try {
        validateCliOptions(data);
      } catch (error) {
        expect(error.message).toContain('CLI options validation failed:');
        expect(error.message).toContain('dryRun');
        expect(error.message).toContain('verbose');
      }
    });
  });

  describe('ConfigError', () => {
    it('should create ConfigError with proper properties', () => {
      const error = new ConfigError(
        'Test error message',
        '/path/to/config.json',
        { some: 'details' }
      );
      
      expect(error.name).toBe('ConfigError');
      expect(error.message).toBe('Test error message');
      expect(error.configPath).toBe('/path/to/config.json');
      expect(error.details).toEqual({ some: 'details' });
    });

    it('should be instance of Error', () => {
      const error = new ConfigError('Test', '/path/config.json');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigError);
    });
  });
});