export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

import type { ConfigSchema } from '../config/schema.js';

export type Config = ConfigSchema;

export interface SyncPlan {
  sourceWorktree: WorktreeInfo;
  targetWorktrees: WorktreeInfo[];
  syncActions: SyncAction[];
}

export interface SyncAction {
  targetWorktree: string;
  file: string;
  sourcePath: string;
  targetPath: string;
  linkPath: string;
  action: 'create' | 'update' | 'skip';
  reason?: string;
  isDirectory?: boolean;
}

export interface SyncResult {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: SyncError[];
}

export interface SyncError {
  file: string;
  worktree: string;
  error: string;
  code?: string;
}

export interface UnlinkResult {
  unlinked: string[];
  errors: SyncError[];
  mode: 'all' | 'current';
}

export interface DoctorResult {
  configValid: boolean;
  sourceWorktreeExists: boolean;
  targetWorktreesAccessible: boolean;
  missingFiles: string[];
  brokenSymlinks: string[];
  permissionIssues: string[];
  recommendations: string[];
}

export interface LogLevel {
  ERROR: 0;
  WARN: 1;
  INFO: 2;
  DEBUG: 3;
  TRACE: 4;
}

export interface CliOptions {
  config?: string;
  dryRun?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  files?: string;
  worktree?: string;
}

export interface SelectiveSync {
  filePatterns?: string[];
  worktreeName?: string;
}