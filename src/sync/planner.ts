import { glob } from 'glob';
import { relative } from 'path';
import { minimatch } from 'minimatch';
import type { WorktreeInfo, Config, SyncPlan, SyncAction, SelectiveSync } from '../types/index.js';
import { WorktreeManager } from '../git/worktree.js';
import { SymlinkManager } from './symlink.js';

export class SyncPlanner {
  private worktreeManager: WorktreeManager;
  private symlinkManager: SymlinkManager;

  // Configuration file that is always synced
  private static readonly CONFIG_FILE_NAME = '.worktreesync.json';

  constructor() {
    this.worktreeManager = new WorktreeManager();
    this.symlinkManager = new SymlinkManager();
  }

  async createSyncPlan(config: Config, selectiveSync?: SelectiveSync): Promise<SyncPlan> {
    // Get source worktree
    const sourceWorktree = await this.worktreeManager.getSourceWorktree(config.sourceWorktree);
    
    // Get target worktrees (all except source)
    let targetWorktrees = await this.worktreeManager.getTargetWorktrees(sourceWorktree);

    // Apply worktree filtering if specified
    if (selectiveSync?.worktreeName) {
      const worktreeName = selectiveSync.worktreeName;
      targetWorktrees = targetWorktrees.filter(worktree => 
        worktree.branch === worktreeName || 
        worktree.path.includes(worktreeName)
      );
    }

    // Determine which file patterns to use
    const filePatterns = selectiveSync?.filePatterns || config.sharedFiles;

    // Resolve file patterns
    const filesToSync = await this.resolveFilePatterns(
      sourceWorktree,
      filePatterns,
      config.ignore
    );

    // Ensure configuration file is always included
    const finalFiles = this.ensureConfigFileIncluded(filesToSync);

    // Create sync actions for each target worktree
    const syncActions: SyncAction[] = [];
    
    for (const targetWorktree of targetWorktrees) {
      for (const file of finalFiles) {
        const action = await this.symlinkManager.createSyncAction(
          sourceWorktree,
          targetWorktree,
          file,
          config.linkMode,
          config.overwrite
        );
        
        syncActions.push(action);
      }
    }

    return {
      sourceWorktree,
      targetWorktrees,
      syncActions
    };
  }

  private async resolveFilePatterns(
    sourceWorktree: WorktreeInfo,
    patterns: string[],
    ignorePatterns: string[] = []
  ): Promise<string[]> {
    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: sourceWorktree.path,
        nodir: true,
        dot: true
      });
      
      allFiles.push(...files);
    }

    // Remove duplicates
    const uniqueFiles = [...new Set(allFiles)];

    // Apply ignore patterns
    const filteredFiles = uniqueFiles.filter(file => {
      return !ignorePatterns.some(ignorePattern => 
        minimatch(file, ignorePattern)
      );
    });

    return filteredFiles.sort();
  }

  /**
   * Ensures the configuration file is always included in the sync files list
   * This guarantees that all worktrees have access to the configuration file
   */
  private ensureConfigFileIncluded(files: string[]): string[] {
    return files.includes(SyncPlanner.CONFIG_FILE_NAME) 
      ? files 
      : [SyncPlanner.CONFIG_FILE_NAME, ...files];
  }

  async validatePlan(plan: SyncPlan): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if source worktree is accessible
    const sourceAccessible = await this.worktreeManager.validateWorktreeAccess(plan.sourceWorktree);
    if (!sourceAccessible) {
      errors.push(`Source worktree is not accessible: ${plan.sourceWorktree.path}`);
    }

    // Check target worktrees
    for (const targetWorktree of plan.targetWorktrees) {
      const accessible = await this.worktreeManager.validateWorktreeAccess(targetWorktree);
      if (!accessible) {
        warnings.push(`Target worktree is not accessible: ${targetWorktree.path}`);
      }
    }

    // Check for actions that will be skipped
    const skippedActions = plan.syncActions.filter(action => action.action === 'skip');
    if (skippedActions.length > 0) {
      const skippedByReason = skippedActions.reduce((acc, action) => {
        const reason = action.reason || 'Unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [reason, count] of Object.entries(skippedByReason)) {
        warnings.push(`${count} file(s) will be skipped: ${reason}`);
      }
    }

    // Check for potential conflicts
    const updateActions = plan.syncActions.filter(action => action.action === 'update');
    if (updateActions.length > 0) {
      warnings.push(`${updateActions.length} existing file(s)/link(s) will be updated`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  getSyncSummary(plan: SyncPlan): {
    totalFiles: number;
    totalWorktrees: number;
    actionCounts: Record<string, number>;
    filesByWorktree: Record<string, number>;
  } {
    const actionCounts = plan.syncActions.reduce((acc, action) => {
      acc[action.action] = (acc[action.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const filesByWorktree = plan.syncActions.reduce((acc, action) => {
      const worktreeName = relative(process.cwd(), action.targetWorktree) || action.targetWorktree;
      acc[worktreeName] = (acc[worktreeName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const uniqueFiles = new Set(plan.syncActions.map(action => action.file));

    return {
      totalFiles: uniqueFiles.size,
      totalWorktrees: plan.targetWorktrees.length,
      actionCounts,
      filesByWorktree
    };
  }

  filterPlanByWorktree(plan: SyncPlan, worktreePath: string): SyncAction[] {
    return plan.syncActions.filter(action => action.targetWorktree === worktreePath);
  }

  filterPlanByFile(plan: SyncPlan, filePath: string): SyncAction[] {
    return plan.syncActions.filter(action => action.file === filePath);
  }

  async optimizePlan(plan: SyncPlan): Promise<SyncPlan> {
    // Remove actions that are unnecessary
    const optimizedActions = plan.syncActions.filter(action => {
      // Skip actions that don't need to be performed
      if (action.action === 'skip' && 
          action.reason === 'Symlink already exists and points to correct source') {
        return false;
      }
      return true;
    });

    return {
      ...plan,
      syncActions: optimizedActions
    };
  }
}