import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export class RepositoryManager {
  private static instance: RepositoryManager;
  private repositoryRoot: string | null = null;

  static getInstance(): RepositoryManager {
    if (!RepositoryManager.instance) {
      RepositoryManager.instance = new RepositoryManager();
    }
    return RepositoryManager.instance;
  }

  async getRepositoryRoot(): Promise<string> {
    if (this.repositoryRoot) {
      return this.repositoryRoot;
    }

    try {
      const result = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const rootPath = result.trim();
      this.repositoryRoot = rootPath;
      return rootPath;
    } catch (error: any) {
      const exitCode = error.status || 1;
      const stderr = error.stderr?.toString() || '';
      
      if (exitCode === 128) {
        throw new GitError(
          'Not inside a Git repository. Please run this command from within a Git repository.',
          'git rev-parse --show-toplevel',
          exitCode,
          stderr
        );
      }
      
      throw new GitError(
        `Failed to get repository root: ${stderr || error.message}`,
        'git rev-parse --show-toplevel',
        exitCode,
        stderr
      );
    }
  }

  async isGitRepository(path: string): Promise<boolean> {
    try {
      const gitDir = resolve(path, '.git');
      return existsSync(gitDir);
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const result = execSync('git branch --show-current', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      return result.trim();
    } catch (error: any) {
      const exitCode = error.status || 1;
      const stderr = error.stderr?.toString() || '';
      
      throw new GitError(
        `Failed to get current branch: ${stderr || error.message}`,
        'git branch --show-current',
        exitCode,
        stderr
      );
    }
  }

  async getCommitHash(ref = 'HEAD'): Promise<string> {
    try {
      const result = execSync(`git rev-parse ${ref}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      return result.trim();
    } catch (error: any) {
      const exitCode = error.status || 1;
      const stderr = error.stderr?.toString() || '';
      
      throw new GitError(
        `Failed to get commit hash for ${ref}: ${stderr || error.message}`,
        `git rev-parse ${ref}`,
        exitCode,
        stderr
      );
    }
  }

  async isGitInstalled(): Promise<boolean> {
    try {
      execSync('git --version', {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return true;
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.repositoryRoot = null;
  }
}