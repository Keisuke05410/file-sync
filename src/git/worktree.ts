import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { basename, dirname, isAbsolute, resolve } from 'path';
import { GitError, RepositoryManager } from './repository.js';
import type { WorktreeInfo } from '../types/index.js';

export class WorktreeManager {
  private repositoryManager: RepositoryManager;

  constructor() {
    this.repositoryManager = RepositoryManager.getInstance();
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const result = execSync('git worktree list --porcelain', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return await this.parseWorktreeList(result);
    } catch (error: unknown) {
      let exitCode = 1;
      let stderr = '';
      let message = '';

      if (error && typeof error === 'object' && 'status' in error) {
        exitCode = (error as { status: number }).status;
      }
      
      if (error && typeof error === 'object' && 'stderr' in error) {
        const stderrValue = (error as { stderr: unknown }).stderr;
        stderr = stderrValue ? String(stderrValue) : '';
      }
      
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      
      throw new GitError(
        `Failed to list worktrees: ${stderr || message}`,
        'git worktree list --porcelain',
        exitCode,
        stderr
      );
    }
  }

  private async parseWorktreeList(output: string): Promise<WorktreeInfo[]> {
    const worktrees: WorktreeInfo[] = [];
    const lines = output.split('\n').filter(line => line.trim());
    
    let currentWorktree: Partial<WorktreeInfo> = {};
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Save previous worktree if complete
        if (currentWorktree.path) {
          worktrees.push(this.completeWorktreeInfo(currentWorktree));
        }
        // Start new worktree
        currentWorktree = {
          path: line.substring(9), // Remove 'worktree ' prefix
          isMain: false
        };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
      } else if (line === 'bare') {
        // Skip bare repositories for now
        currentWorktree = {};
      }
    }
    
    // Add the last worktree
    if (currentWorktree.path) {
      worktrees.push(this.completeWorktreeInfo(currentWorktree));
    }

    // Mark the main worktree
    const repositoryRoot = await this.repositoryManager.getRepositoryRoot();
    worktrees.forEach(worktree => {
      if (worktree.path === repositoryRoot) {
        worktree.isMain = true;
      }
    });

    return worktrees;
  }

  private completeWorktreeInfo(partial: Partial<WorktreeInfo>): WorktreeInfo {
    return {
      path: partial.path || '',
      branch: partial.branch || 'detached',
      head: partial.head || '',
      isMain: partial.isMain || false
    };
  }

  async findWorktreeByBranch(branchName: string): Promise<WorktreeInfo | null> {
    const worktrees = await this.listWorktrees();
    return worktrees.find(wt => wt.branch === branchName) || null;
  }

  async getMainWorktree(): Promise<WorktreeInfo | null> {
    const worktrees = await this.listWorktrees();
    return worktrees.find(wt => wt.isMain) || null;
  }

  async getSourceWorktree(sourceWorktreeName: string): Promise<WorktreeInfo> {
    const worktrees = await this.listWorktrees();
    const repositoryRoot = await this.repositoryManager.getRepositoryRoot();
    
    // 1. First try to find by branch name
    let sourceWorktree = worktrees.find(wt => wt.branch === sourceWorktreeName);
    
    // 2. If not found, try by absolute path
    if (!sourceWorktree && isAbsolute(sourceWorktreeName)) {
      sourceWorktree = worktrees.find(wt => wt.path === sourceWorktreeName);
    }
    
    // 3. If not found, try by relative path
    // For relative paths, we need to check against the parent directory of the repository
    if (!sourceWorktree && (sourceWorktreeName.includes('/') || sourceWorktreeName.startsWith('.'))) {
      // First, try resolving from repository root
      const absolutePathFromRepo = resolve(repositoryRoot, sourceWorktreeName);
      sourceWorktree = worktrees.find(wt => wt.path === absolutePathFromRepo);
      
      // If not found, try resolving from repository parent directory
      // This handles cases where worktrees are siblings of the main repository
      if (!sourceWorktree) {
        const repoParent = dirname(repositoryRoot);
        const absolutePathFromParent = resolve(repoParent, sourceWorktreeName);
        sourceWorktree = worktrees.find(wt => wt.path === absolutePathFromParent);
      }
    }
    
    // 4. If not found, try by directory name
    if (!sourceWorktree) {
      sourceWorktree = worktrees.find(wt => 
        basename(wt.path) === sourceWorktreeName
      );
    }
    
    // 5. If still not found, fall back to main worktree
    if (!sourceWorktree) {
      sourceWorktree = worktrees.find(wt => wt.isMain);
    }
    
    if (!sourceWorktree) {
      throw new Error(
        `Source worktree '${sourceWorktreeName}' not found. Available worktrees: ${
          worktrees.map(wt => `${wt.branch} (${wt.path})`).join(', ')
        }`
      );
    }
    
    return sourceWorktree;
  }

  async getTargetWorktrees(sourceWorktree: WorktreeInfo): Promise<WorktreeInfo[]> {
    const allWorktrees = await this.listWorktrees();
    return allWorktrees.filter(wt => wt.path !== sourceWorktree.path);
  }

  async validateWorktreeAccess(worktree: WorktreeInfo): Promise<boolean> {
    try {
      return existsSync(worktree.path);
    } catch {
      return false;
    }
  }

  async validateAllWorktrees(): Promise<{ valid: WorktreeInfo[]; invalid: WorktreeInfo[] }> {
    const worktrees = await this.listWorktrees();
    const valid: WorktreeInfo[] = [];
    const invalid: WorktreeInfo[] = [];
    
    for (const worktree of worktrees) {
      if (await this.validateWorktreeAccess(worktree)) {
        valid.push(worktree);
      } else {
        invalid.push(worktree);
      }
    }
    
    return { valid, invalid };
  }
}