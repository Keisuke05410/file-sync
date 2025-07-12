import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import type { Config, SyncPlan, SyncResult, SyncError, UnlinkResult, DoctorResult, SelectiveSync } from '../types/index.js';
import { SyncPlanner } from './planner.js';
import { SymlinkManager, FileSystemError } from './symlink.js';

export class SyncEngine {
  private planner: SyncPlanner;
  private symlinkManager: SymlinkManager;

  constructor() {
    this.planner = new SyncPlanner();
    this.symlinkManager = new SymlinkManager();
  }

  async sync(config: Config, dryRun = false, selectiveSync?: SelectiveSync): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Execute pre-sync hook
      if (config.hooks?.beforeSync && !dryRun) {
        await this.executeHook(config.hooks.beforeSync, 'beforeSync');
      }

      // Create sync plan
      const plan = await this.planner.createSyncPlan(config, selectiveSync);

      // Validate plan
      const validation = await this.planner.validatePlan(plan);
      if (!validation.valid) {
        for (const error of validation.errors) {
          result.errors.push({
            file: '',
            worktree: '',
            error,
            code: 'VALIDATION_ERROR'
          });
        }
        return result;
      }

      // Execute sync plan
      await this.executePlan(plan, config.overwrite, dryRun, result);

      // Execute post-sync hook
      if (config.hooks?.afterSync && !dryRun) {
        await this.executeHook(config.hooks.afterSync, 'afterSync');
      }

      result.success = result.errors.length === 0;
      return result;

    } catch (error) {
      result.errors.push({
        file: '',
        worktree: '',
        error: `Sync failed: ${error}`,
        code: 'SYNC_ERROR'
      });
      return result;
    }
  }

  private async executePlan(
    plan: SyncPlan,
    overwrite: boolean,
    dryRun: boolean,
    result: SyncResult
  ): Promise<void> {
    for (const action of plan.syncActions) {
      try {
        if (dryRun) {
          // In dry run mode, just count what would be done
          this.updateResultCounts(action.action, result);
        } else {
          // Execute the actual sync action
          await this.symlinkManager.executeAction(action, overwrite);
          this.updateResultCounts(action.action, result);
        }
      } catch (error) {
        const syncError: SyncError = {
          file: action.file,
          worktree: action.targetWorktree,
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof FileSystemError && error.code ? { code: error.code } : {})
        };
        
        result.errors.push(syncError);
      }
    }
  }

  private updateResultCounts(action: string, result: SyncResult): void {
    switch (action) {
      case 'create':
        result.created++;
        break;
      case 'update':
        result.updated++;
        break;
      case 'skip':
        result.skipped++;
        break;
    }
  }

  private async executeHook(command: string, hookName: string): Promise<void> {
    try {
      execSync(command, {
        stdio: 'inherit',
        encoding: 'utf-8'
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Hook '${hookName}' failed: ${errorMessage}`);
    }
  }

  async createPlan(config: Config, selectiveSync?: SelectiveSync): Promise<SyncPlan> {
    return this.planner.createSyncPlan(config, selectiveSync);
  }

  async validatePlan(plan: SyncPlan): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    return this.planner.validatePlan(plan);
  }

  getSyncSummary(plan: SyncPlan): {
    totalFiles: number;
    totalWorktrees: number;
    actionCounts: Record<string, number>;
    filesByWorktree: Record<string, number>;
  } {
    return this.planner.getSyncSummary(plan);
  }

  async checkStatus(config: Config): Promise<{
    sourceWorktree: string;
    targetWorktrees: string[];
    syncedFiles: Record<string, {
      valid: string[];
      broken: string[];
      missing: string[];
    }>;
  }> {
    const plan = await this.planner.createSyncPlan(config);
    const syncedFiles: Record<string, {
      valid: string[];
      broken: string[];
      missing: string[];
    }> = {};

    // Get list of files that should be synced from configuration
    const configFiles = [...new Set(plan.syncActions.map(action => action.file))];

    // Check status for each target worktree
    for (const worktree of plan.targetWorktrees) {
      // Scan for existing symlinks in the worktree
      const existingSymlinks = await this.symlinkManager.scanExistingSymlinks(worktree);
      
      // Combine files from configuration and existing symlinks
      const allFiles = [...new Set([...configFiles, ...existingSymlinks])];
      
      const status = await this.symlinkManager.validateSymlinks(worktree, allFiles);
      syncedFiles[worktree.path] = status;
    }

    return {
      sourceWorktree: plan.sourceWorktree.path,
      targetWorktrees: plan.targetWorktrees.map(wt => wt.path),
      syncedFiles
    };
  }

  async unlinkSymlinks(config: Config, dryRun = false): Promise<UnlinkResult> {
    const unlinked: string[] = [];
    const errors: SyncError[] = [];

    try {
      // Create sync plan to get worktree information
      const plan = await this.planner.createSyncPlan(config);

      // Get current working directory to determine mode
      const currentPath = process.cwd();
      const isInSourceWorktree = currentPath === plan.sourceWorktree.path;
      
      // Determine target worktrees based on current location
      const targetWorktrees = isInSourceWorktree 
        ? plan.targetWorktrees  // All worktrees from source
        : plan.targetWorktrees.filter(wt => wt.path === currentPath); // Only current worktree
      
      const mode = isInSourceWorktree ? 'all' : 'current';

      // Get unique files from sync actions
      const uniqueFiles = [...new Set(plan.syncActions.map(action => action.file))];

      // Remove symlinks using SymlinkManager
      const result = await this.symlinkManager.removeSymlinks(targetWorktrees, uniqueFiles, dryRun);
      
      unlinked.push(...result.removed);
      errors.push(...result.errors);

      return { unlinked, errors, mode };

    } catch (error) {
      errors.push({
        file: '',
        worktree: '',
        error: `Unlink failed: ${error}`,
        code: 'UNLINK_ERROR'
      });
      return { unlinked, errors, mode: 'all' };
    }
  }

  async cleanBrokenLinks(config: Config, dryRun = false): Promise<{
    cleaned: string[];
    errors: SyncError[];
  }> {
    const cleaned: string[] = [];
    const errors: SyncError[] = [];

    // Use the same improved status checking that includes existing symlinks
    const status = await this.checkStatus(config);

    for (const [worktreePath, fileStatus] of Object.entries(status.syncedFiles)) {
      for (const brokenFile of fileStatus.broken) {
        try {
          if (!dryRun) {
            const { unlinkSync } = await import('fs');
            const { join } = await import('path');
            const filePath = join(worktreePath, brokenFile);
            unlinkSync(filePath);
          }
          cleaned.push(`${worktreePath}:${brokenFile}`);
        } catch (error) {
          errors.push({
            file: brokenFile,
            worktree: worktreePath,
            error: error instanceof Error ? error.message : String(error),
            code: 'CLEAN_ERROR'
          });
        }
      }
    }

    return { cleaned, errors };
  }

  async doctor(config: Config): Promise<DoctorResult> {
    const result: DoctorResult = {
      configValid: true,
      sourceWorktreeExists: true,
      targetWorktreesAccessible: true,
      missingFiles: [],
      brokenSymlinks: [],
      permissionIssues: [],
      recommendations: []
    };

    try {
      // Try to create sync plan to validate configuration
      const plan = await this.planner.createSyncPlan(config);
      
      // Check if source worktree exists
      result.sourceWorktreeExists = plan.sourceWorktree !== undefined;
      
      // Check for missing files by directly validating configured file patterns
      result.missingFiles = await this.checkMissingFiles(config, plan.sourceWorktree);
      
      // Check target worktrees accessibility and symlink status
      try {
        for (const worktree of plan.targetWorktrees) {
          const uniqueFiles = [...new Set(plan.syncActions.map(action => action.file))];
          const symlinkStatus = await this.symlinkManager.validateSymlinks(worktree, uniqueFiles);
          
          // Collect broken symlinks
          result.brokenSymlinks.push(...symlinkStatus.broken);
        }
        
        result.targetWorktreesAccessible = true;
      } catch (error) {
        result.targetWorktreesAccessible = false;
        
        // Check for permission issues
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('EACCES') || errorMessage.includes('permission denied')) {
          result.permissionIssues.push(errorMessage);
        }
      }
      
    } catch {
      result.configValid = false;
    }
    
    // Generate recommendations
    if (!result.configValid) {
      result.recommendations.push('Fix configuration validation errors');
    }
    
    if (!result.sourceWorktreeExists) {
      result.recommendations.push('Check source worktree path and ensure it exists');
    }
    
    if (!result.targetWorktreesAccessible) {
      result.recommendations.push('Check target worktrees accessibility');
    }
    
    if (result.missingFiles.length > 0) {
      for (const file of result.missingFiles) {
        result.recommendations.push(`Remove ${file} from sharedFiles or create the file in source worktree`);
      }
    }
    
    if (result.brokenSymlinks.length > 0) {
      result.recommendations.push('Run sync-worktrees clean to remove broken symlinks');
    }
    
    if (result.permissionIssues.length > 0) {
      result.recommendations.push('Check file permissions for worktree operations');
    }
    
    return result;
  }

  async checkMissingFiles(config: Config, sourceWorktree: any): Promise<string[]> {
    const missingFiles: string[] = [];
    
    for (const pattern of config.sharedFiles) {
      // Check if pattern is a literal file (not a glob pattern)
      if (!pattern.includes('*') && !pattern.includes('?') && !pattern.includes('[')) {
        const filePath = join(sourceWorktree.path, pattern);
        if (!existsSync(filePath)) {
          missingFiles.push(pattern);
        }
      } else {
        // For glob patterns, check if at least one file matches
        try {
          const matches = await glob(pattern, {
            cwd: sourceWorktree.path,
            nodir: true,
            dot: true
          });
          if (matches.length === 0) {
            missingFiles.push(pattern);
          }
        } catch {
          // If glob fails, consider the pattern as missing
          missingFiles.push(pattern);
        }
      }
    }
    
    return missingFiles;
  }
}