import { z } from 'zod';

export const configSchema = z.object({
  $schema: z.string().optional(),
  sharedFiles: z.array(z.string()).min(1, 'At least one shared file must be specified'),
  sourceWorktree: z.string().default('main'),
  linkMode: z.enum(['relative', 'absolute']).default('relative'),
  overwrite: z.boolean().default(false),
  ignore: z.array(z.string()).default([]),
  hooks: z.object({
    beforeSync: z.string().optional(),
    afterSync: z.string().optional()
  }).optional()
});

export type ConfigSchema = z.infer<typeof configSchema>;

export const cliOptionsSchema = z.object({
  config: z.string().optional(),
  dryRun: z.boolean().default(false),
  verbose: z.boolean().default(false),
  quiet: z.boolean().default(false),
  noColor: z.boolean().default(false)
});

export type CliOptionsSchema = z.infer<typeof cliOptionsSchema>;

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly configPath: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function validateConfig(data: unknown, configPath: string): ConfigSchema {
  try {
    return configSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => 
        `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');
      
      throw new ConfigError(
        `Configuration validation failed:\n${issues}`,
        configPath,
        error.issues
      );
    }
    
    throw new ConfigError(
      `Invalid configuration format: ${error}`,
      configPath,
      error
    );
  }
}

export function validateCliOptions(data: unknown): CliOptionsSchema {
  try {
    return cliOptionsSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => 
        `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');
      
      throw new Error(`CLI options validation failed:\n${issues}`);
    }
    
    throw new Error(`Invalid CLI options: ${error}`);
  }
}

// JSON Schema for IDE support
export const jsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    $schema: {
      type: 'string',
      description: 'JSON Schema reference'
    },
    sharedFiles: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'Array of file patterns to sync across worktrees (glob patterns supported)'
    },
    sourceWorktree: {
      type: 'string',
      default: 'main',
      description: 'Source worktree specified by branch name, absolute path, or relative path from repository root'
    },
    linkMode: {
      type: 'string',
      enum: ['relative', 'absolute'],
      default: 'relative',
      description: 'Type of symbolic links to create'
    },
    overwrite: {
      type: 'boolean',
      default: false,
      description: 'Whether to overwrite existing files/links'
    },
    ignore: {
      type: 'array',
      items: { type: 'string' },
      default: [],
      description: 'Array of patterns to exclude from syncing'
    },
    hooks: {
      type: 'object',
      properties: {
        beforeSync: {
          type: 'string',
          description: 'Command to run before syncing'
        },
        afterSync: {
          type: 'string',
          description: 'Command to run after syncing'
        }
      },
      additionalProperties: false,
      description: 'Hooks to run before and after syncing'
    }
  },
  required: ['sharedFiles'],
  additionalProperties: false
};