#!/usr/bin/env node

import { CLI } from './cli.js';
import { RepositoryManager } from './git/repository.js';
import { Logger } from './utils/logger.js';

export async function main(): Promise<void> {
  const logger = Logger.getInstance();

  try {
    // Check if Git is installed
    const repoManager = RepositoryManager.getInstance();
    const gitInstalled = await repoManager.isGitInstalled();
    
    if (!gitInstalled) {
      logger.failure('Git is not installed or not available in PATH.');
      logger.info('Please install Git and try again.');
      process.exit(1);
    }

    // Check if we're in a Git repository
    try {
      await repoManager.getRepositoryRoot();
    } catch (error) {
      logger.failure('Not inside a Git repository.');
      logger.info('Please run this command from within a Git repository.');
      process.exit(1);
    }

    // Run the CLI
    const cli = new CLI();
    await cli.run(process.argv);
    
  } catch (error) {
    logger.failure(`Unexpected error: ${error}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = Logger.getInstance();
  logger.failure(`Uncaught exception: ${error.message}`);
  logger.close();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const logger = Logger.getInstance();
  logger.failure(`Unhandled rejection: ${reason}`);
  logger.close();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  const logger = Logger.getInstance();
  logger.info('\nShutting down gracefully...');
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  const logger = Logger.getInstance();
  logger.info('Shutting down gracefully...');
  logger.close();
  process.exit(0);
});

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const logger = Logger.getInstance();
    logger.failure(`Failed to start: ${error}`);
    logger.close();
    process.exit(1);
  });
}