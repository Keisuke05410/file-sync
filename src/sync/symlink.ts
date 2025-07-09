import { lstatSync, existsSync, symlinkSync, unlinkSync, readlinkSync } from 'fs';
import { dirname, resolve, relative, join } from 'path';
import { mkdir } from 'fs/promises';
import type { WorktreeInfo, SyncAction } from '../types/index.js';

export class FileSystemError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly operation: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}

export class SymlinkManager {
  
  async createSymlink(
    sourcePath: string,
    targetPath: string,
    linkMode: 'relative' | 'absolute' = 'relative'
  ): Promise<void> {
    try {
      // Ensure target directory exists
      const targetDir = dirname(targetPath);
      await mkdir(targetDir, { recursive: true });

      // Calculate link path
      const linkPath = linkMode === 'relative' 
        ? relative(targetDir, sourcePath)
        : sourcePath;

      // Remove existing file/link if it exists
      if (existsSync(targetPath)) {
        await this.removeExisting(targetPath);
      }

      // Create the symlink
      symlinkSync(linkPath, targetPath);
      
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code || 'UNKNOWN';
      const message = error instanceof Error ? error.message : String(error);
      throw new FileSystemError(
        `Failed to create symlink from ${sourcePath} to ${targetPath}: ${message}`,
        targetPath,
        'createSymlink',
        code
      );
    }
  }

  async removeExisting(path: string): Promise<void> {
    try {
      const stats = lstatSync(path);
      
      if (stats.isSymbolicLink()) {
        unlinkSync(path);
      } else if (stats.isFile()) {
        // This is a regular file, we might not want to remove it
        throw new FileSystemError(
          `Target path contains a regular file. Use --overwrite to replace it.`,
          path,
          'removeExisting',
          'EEXIST'
        );
      }
    } catch (error: unknown) {
      if (error instanceof FileSystemError) {
        throw error;
      }
      
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, which is fine
        return;
      }
      
      throw new FileSystemError(
        `Failed to remove existing file: ${error instanceof Error ? error.message : String(error)}`,
        path,
        'removeExisting',
        (error as NodeJS.ErrnoException).code
      );
    }
  }

  isValidSymlink(path: string): boolean {
    try {
      if (!existsSync(path)) {
        return false;
      }
      
      const stats = lstatSync(path);
      if (!stats.isSymbolicLink()) {
        return false;
      }
      
      // Check if the symlink target exists
      const targetPath = readlinkSync(path);
      const resolvedTarget = resolve(dirname(path), targetPath);
      return existsSync(resolvedTarget);
      
    } catch {
      return false;
    }
  }

  isSymlinkPointingTo(linkPath: string, expectedTarget: string): boolean {
    try {
      if (!existsSync(linkPath)) {
        return false;
      }
      
      const stats = lstatSync(linkPath);
      if (!stats.isSymbolicLink()) {
        return false;
      }
      
      const actualTarget = readlinkSync(linkPath);
      const resolvedActual = resolve(dirname(linkPath), actualTarget);
      const resolvedExpected = resolve(expectedTarget);
      
      return resolvedActual === resolvedExpected;
      
    } catch {
      return false;
    }
  }

  async createSyncAction(
    sourceWorktree: WorktreeInfo,
    targetWorktree: WorktreeInfo,
    relativeFilePath: string,
    linkMode: 'relative' | 'absolute',
    overwrite: boolean
  ): Promise<SyncAction> {
    const sourcePath = join(sourceWorktree.path, relativeFilePath);
    const targetPath = join(targetWorktree.path, relativeFilePath);
    
    // Check if source file exists
    if (!existsSync(sourcePath)) {
      return {
        targetWorktree: targetWorktree.path,
        file: relativeFilePath,
        sourcePath,
        targetPath,
        linkPath: '',
        action: 'skip',
        reason: 'Source file does not exist'
      };
    }

    const linkPath = linkMode === 'relative' 
      ? relative(dirname(targetPath), sourcePath)
      : sourcePath;

    // Check if target already exists
    if (existsSync(targetPath)) {
      const stats = lstatSync(targetPath);
      
      if (stats.isSymbolicLink()) {
        // Check if it's already pointing to the correct source
        if (this.isSymlinkPointingTo(targetPath, sourcePath)) {
          return {
            targetWorktree: targetWorktree.path,
            file: relativeFilePath,
            sourcePath,
            targetPath,
            linkPath,
            action: 'skip',
            reason: 'Symlink already exists and points to correct source'
          };
        } else {
          return {
            targetWorktree: targetWorktree.path,
            file: relativeFilePath,
            sourcePath,
            targetPath,
            linkPath,
            action: 'update',
            reason: 'Symlink exists but points to different source'
          };
        }
      } else {
        // Regular file exists
        if (!overwrite) {
          return {
            targetWorktree: targetWorktree.path,
            file: relativeFilePath,
            sourcePath,
            targetPath,
            linkPath,
            action: 'skip',
            reason: 'Target file exists and overwrite is disabled'
          };
        } else {
          return {
            targetWorktree: targetWorktree.path,
            file: relativeFilePath,
            sourcePath,
            targetPath,
            linkPath,
            action: 'update',
            reason: 'Overwriting existing file'
          };
        }
      }
    }

    return {
      targetWorktree: targetWorktree.path,
      file: relativeFilePath,
      sourcePath,
      targetPath,
      linkPath,
      action: 'create',
      reason: 'Creating new symlink'
    };
  }

  async executeAction(action: SyncAction, overwrite: boolean): Promise<void> {
    if (action.action === 'skip') {
      return;
    }

    try {
      if (action.action === 'update' && existsSync(action.targetPath)) {
        if (overwrite) {
          await this.removeExisting(action.targetPath);
        } else {
          throw new FileSystemError(
            'Target exists and overwrite is disabled',
            action.targetPath,
            'executeAction',
            'EEXIST'
          );
        }
      }

      // Determine link mode from the action's linkPath
      const linkMode = resolve(action.linkPath) === action.linkPath ? 'absolute' : 'relative';
      
      await this.createSymlink(action.sourcePath, action.targetPath, linkMode);
      
    } catch (error) {
      if (error instanceof FileSystemError) {
        throw error;
      }
      
      throw new FileSystemError(
        `Failed to execute action for ${action.file}: ${error}`,
        action.targetPath,
        'executeAction'
      );
    }
  }

  async removeSymlinks(worktrees: WorktreeInfo[], files: string[], dryRun = false): Promise<{
    removed: string[];
    errors: Array<{
      file: string;
      worktree: string;
      error: string;
      code: string;
    }>;
  }> {
    const removed: string[] = [];
    const errors: Array<{
      file: string;
      worktree: string;
      error: string;
      code: string;
    }> = [];

    for (const worktree of worktrees) {
      for (const file of files) {
        const filePath = join(worktree.path, file);

        try {
          // Check if file exists
          if (!existsSync(filePath)) {
            continue;
          }

          // Check if it's a symlink
          let stats;
          try {
            stats = lstatSync(filePath);
          } catch (lstatError) {
            const errorMessage = lstatError instanceof Error ? lstatError.message : String(lstatError);
            errors.push({
              file,
              worktree: worktree.path,
              error: errorMessage,
              code: 'LSTAT_ERROR'
            });
            continue;
          }

          if (!stats.isSymbolicLink()) {
            continue; // Skip regular files
          }

          // Remove symlink
          if (!dryRun) {
            unlinkSync(filePath);
          }
          
          removed.push(file);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorCode = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';
          
          errors.push({
            file,
            worktree: worktree.path,
            error: errorMessage,
            code: errorCode !== 'UNKNOWN' ? errorCode : 'UNLINK_ERROR'
          });
        }
      }
    }

    return { removed, errors };
  }

  async validateSymlinks(worktree: WorktreeInfo, files: string[]): Promise<{
    valid: string[];
    broken: string[];
    missing: string[];
  }> {
    const valid: string[] = [];
    const broken: string[] = [];
    const missing: string[] = [];

    for (const file of files) {
      const filePath = join(worktree.path, file);
      
      if (!existsSync(filePath)) {
        missing.push(file);
        continue;
      }

      if (this.isValidSymlink(filePath)) {
        valid.push(file);
      } else {
        const stats = lstatSync(filePath);
        if (stats.isSymbolicLink()) {
          broken.push(file);
        }
      }
    }

    return { valid, broken, missing };
  }
}