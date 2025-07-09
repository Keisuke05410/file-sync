import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ConfigLoader } from './config/loader.js';
import { SyncEngine } from './sync/engine.js';
import { Logger, LogLevel } from './utils/logger.js';
import type { CliOptions, SyncAction } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class CLI {
  private program: Command;
  private logger: Logger;

  constructor() {
    this.program = new Command();
    this.logger = Logger.getInstance();
    this.setupCommands();
  }

  private setupCommands(): void {
    // Get version from package.json
    const packageJsonPath = resolve(__dirname, '../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    this.program
      .name('sync-worktrees')
      .description('CLI tool for synchronizing files between Git worktrees using symbolic links')
      .version(packageJson.version);

    // Main sync command
    this.program
      .argument('[config-path]', 'Path to configuration file (default: .worktreesync.json)')
      .option('-d, --dry-run', 'Preview changes without applying them', false)
      .option('-v, --verbose', 'Show detailed output', false)
      .option('-q, --quiet', 'Show only errors', false)
      .option('--no-color', 'Disable colored output', false)
      .action(async (configPath: string | undefined, options: CliOptions) => {
        await this.handleSyncCommand(configPath, options);
      });

    // Init command
    this.program
      .command('init')
      .description('Create a sample configuration file')
      .argument('[config-path]', 'Path for configuration file (default: .worktreesync.json)')
      .action(async (configPath: string | undefined) => {
        await this.handleInitCommand(configPath);
      });

    // Status command
    this.program
      .command('status')
      .description('Check current synchronization status')
      .argument('[config-path]', 'Path to configuration file (default: .worktreesync.json)')
      .option('-v, --verbose', 'Show detailed output', false)
      .option('-q, --quiet', 'Show only errors', false)
      .option('--no-color', 'Disable colored output', false)
      .action(async (configPath: string | undefined, options: CliOptions) => {
        await this.handleStatusCommand(configPath, options);
      });

    // Clean command
    this.program
      .command('clean')
      .description('Remove broken symbolic links')
      .argument('[config-path]', 'Path to configuration file (default: .worktreesync.json)')
      .option('-d, --dry-run', 'Preview changes without applying them', false)
      .option('-v, --verbose', 'Show detailed output', false)
      .option('-q, --quiet', 'Show only errors', false)
      .option('--no-color', 'Disable colored output', false)
      .action(async (configPath: string | undefined, options: CliOptions) => {
        await this.handleCleanCommand(configPath, options);
      });
  }

  private configureLogger(options: CliOptions): void {
    let level = LogLevel.INFO;
    
    if (options.quiet) {
      level = LogLevel.ERROR;
    } else if (options.verbose) {
      level = LogLevel.DEBUG;
    }

    this.logger = Logger.configure({
      level,
      useColor: !options.noColor
    });
  }

  private async handleSyncCommand(configPath: string | undefined, options: CliOptions): Promise<void> {
    this.configureLogger(options);

    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig(configPath);
      
      this.logger.progress('Syncing worktrees...');
      
      const engine = new SyncEngine();
      const plan = await engine.createPlan(config);
      
      // Show plan summary
      const summary = engine.getSyncSummary(plan);
      this.logger.info(`📁 Repository: ${plan.sourceWorktree.path}`);
      this.logger.info(`📍 Found ${summary.totalWorktrees + 1} worktrees:`);
      this.logger.info(`  ✓ ${plan.sourceWorktree.branch} → ${plan.sourceWorktree.path} (source)`);
      
      for (const worktree of plan.targetWorktrees) {
        this.logger.info(`  ✓ ${worktree.branch} → ${worktree.path}`);
      }

      if (options.dryRun) {
        this.logger.info('\n🔗 Would create symlinks:');
        this.showSyncActions(plan.syncActions, true);
        this.logger.info(chalk.blue('\nℹ️  This is a dry run. No changes were made.'));
      } else {
        // Execute sync
        const result = await engine.sync(config, false);
        
        this.logger.info('\n🔗 Creating symlinks:');
        this.showSyncActions(plan.syncActions, false);
        
        if (result.success) {
          const total = result.created + result.updated;
          this.logger.success(`Sync completed! (${total} symlinks processed)`);
          
          if (result.skipped > 0) {
            this.logger.info(`  ${result.skipped} files skipped`);
          }
        } else {
          this.logger.failure('Sync completed with errors!');
          for (const error of result.errors) {
            this.logger.error(`  ${error.file}: ${error.error}`);
          }
          process.exit(1);
        }
      }
      
    } catch (error) {
      this.logger.failure(`Sync failed: ${error}`);
      process.exit(1);
    }
  }

  private async handleInitCommand(configPath: string | undefined): Promise<void> {
    try {
      const configLoader = new ConfigLoader();
      const createdPath = await configLoader.createSampleConfigFile(configPath);
      this.logger.success(`Configuration file created: ${createdPath}`);
      this.logger.info('Edit the file to specify which files to sync across worktrees.');
    } catch (error) {
      this.logger.failure(`Failed to create configuration file: ${error}`);
      process.exit(1);
    }
  }

  private async handleStatusCommand(configPath: string | undefined, options: CliOptions): Promise<void> {
    this.configureLogger(options);

    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig(configPath);
      
      const engine = new SyncEngine();
      const status = await engine.checkStatus(config);
      
      this.logger.info(`📁 Source worktree: ${status.sourceWorktree}`);
      this.logger.info(`📍 Target worktrees: ${status.targetWorktrees.length}`);
      
      for (const [worktreePath, fileStatus] of Object.entries(status.syncedFiles)) {
        const total = fileStatus.valid.length + fileStatus.broken.length + fileStatus.missing.length;
        this.logger.info(`\n  ${worktreePath}:`);
        this.logger.info(`    ✅ ${fileStatus.valid.length}/${total} valid symlinks`);
        
        if (fileStatus.broken.length > 0) {
          this.logger.warning(`    🔗 ${fileStatus.broken.length} broken symlinks`);
          if (options.verbose) {
            for (const file of fileStatus.broken) {
              this.logger.info(`      - ${file}`);
            }
          }
        }
        
        if (fileStatus.missing.length > 0) {
          this.logger.info(`    ❓ ${fileStatus.missing.length} missing files`);
          if (options.verbose) {
            for (const file of fileStatus.missing) {
              this.logger.info(`      - ${file}`);
            }
          }
        }
      }
      
    } catch (error) {
      this.logger.failure(`Status check failed: ${error}`);
      process.exit(1);
    }
  }

  private async handleCleanCommand(configPath: string | undefined, options: CliOptions): Promise<void> {
    this.configureLogger(options);

    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig(configPath);
      
      const engine = new SyncEngine();
      const result = await engine.cleanBrokenLinks(config, options.dryRun);
      
      if (result.cleaned.length > 0) {
        if (options.dryRun) {
          this.logger.info('Would clean broken symlinks:');
        } else {
          this.logger.success('Cleaned broken symlinks:');
        }
        
        for (const cleaned of result.cleaned) {
          this.logger.info(`  ✓ ${cleaned}`);
        }
      } else {
        this.logger.info('No broken symlinks found.');
      }
      
      if (result.errors.length > 0) {
        this.logger.warning('Some files could not be cleaned:');
        for (const error of result.errors) {
          this.logger.error(`  ${error.file}: ${error.error}`);
        }
      }
      
    } catch (error) {
      this.logger.failure(`Clean failed: ${error}`);
      process.exit(1);
    }
  }

  private showSyncActions(actions: SyncAction[], isDryRun: boolean): void {
    const groupedByWorktree = actions.reduce((acc, action) => {
      const worktree = action.targetWorktree;
      if (!acc[worktree]) acc[worktree] = [];
      acc[worktree].push(action);
      return acc;
    }, {} as Record<string, SyncAction[]>);

    const prefix = isDryRun ? '•' : '✓';

    for (const [worktree, worktreeActions] of Object.entries(groupedByWorktree)) {
      const worktreeName = worktree.split('/').pop() || worktree;
      this.logger.raw(`  [${worktreeName}]`);
      
      for (const action of worktreeActions) {
        if (action.action === 'skip') {
          this.logger.raw(`  ⚠ ${action.file} (${action.reason})`);
        } else {
          this.logger.raw(`  ${prefix} ${action.file} → ${action.linkPath}`);
        }
      }
      this.logger.raw('');
    }
  }

  async run(argv: string[]): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      this.logger.failure(`CLI error: ${error}`);
      process.exit(1);
    }
  }
}