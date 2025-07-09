# Worktree Sync

A CLI tool for synchronizing files between Git worktrees using symbolic links.

## Overview

This tool allows developers to share configuration files (like docker-compose.yml, .env, IDE settings) across multiple worktrees of the same Git repository. It automatically detects all worktrees and creates symbolic links from a designated source worktree to all other worktrees.

## Features

- 🔄 **Automatic Worktree Detection**: Uses Git commands to find all worktrees regardless of their location
- 🔗 **Symbolic Link Management**: Creates and maintains symlinks with relative or absolute paths
- 📝 **Pattern-based File Selection**: Support for glob patterns and ignore patterns
- 🏗️ **Dry Run Support**: Preview changes before applying them
- ⚙️ **Flexible Configuration**: JSON-based configuration with sensible defaults
- 🎯 **Source Worktree**: Designate any worktree as the source of truth
- 🛠️ **Maintenance Commands**: Status checking and broken link cleanup

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run the tool
npx sync-worktrees
```

## Quick Start

1. **Create a configuration file** in your repository root:

```bash
npx sync-worktrees init
```

2. **Edit `.worktreesync.json`** to specify which files to sync:

```json
{
  "sharedFiles": [
    "docker-compose.yml",
    ".env.local",
    ".vscode/settings.json"
  ],
  "sourceWorktree": "main"
}
```

3. **Run the sync**:

```bash
npx sync-worktrees
```

## Configuration

### Basic Configuration

```json
{
  "sharedFiles": [
    "docker-compose.yml",
    ".env.local",
    ".vscode/settings.json",
    "tools/**/*.sh"
  ],
  "sourceWorktree": "main",
  "linkMode": "relative",
  "overwrite": false,
  "ignore": [
    "*.log",
    "node_modules/**"
  ],
  "hooks": {
    "beforeSync": "echo 'Starting sync...'",
    "afterSync": "echo 'Sync completed!'"
  }
}
```

### Configuration Options

- **`sharedFiles`** (required): Array of file patterns to sync (glob patterns supported)
- **`sourceWorktree`** (default: "main"): Name of the source worktree (branch name)
- **`linkMode`** (default: "relative"): Type of symlinks - "relative" or "absolute"
- **`overwrite`** (default: false): Whether to overwrite existing files/links
- **`ignore`**: Array of patterns to exclude from syncing
- **`hooks`**: Commands to run before and after syncing

## Commands

### Main Sync Command

```bash
# Sync files across worktrees
npx sync-worktrees

# Preview changes without applying them
npx sync-worktrees --dry-run

# Show detailed output
npx sync-worktrees --verbose

# Use custom config file
npx sync-worktrees path/to/config.json
```

### Utility Commands

```bash
# Create sample configuration file
npx sync-worktrees init

# Check synchronization status
npx sync-worktrees status

# Clean broken symbolic links
npx sync-worktrees clean
```

### Command Options

- `-d, --dry-run`: Preview changes without applying them
- `-v, --verbose`: Show detailed output
- `-q, --quiet`: Show only errors
- `--no-color`: Disable colored output

## How It Works

1. **Repository Detection**: Uses `git rev-parse --show-toplevel` to find the repository root
2. **Worktree Discovery**: Uses `git worktree list` to automatically detect all worktrees
3. **File Resolution**: Resolves glob patterns to find actual files in the source worktree
4. **Link Planning**: Creates a plan of which symbolic links to create/update/skip
5. **Execution**: Creates symbolic links from source files to target worktrees

## Example Workflow

Given this worktree setup:

```
/projects/myapp/              # main worktree
├── docker-compose.yml        # actual file
├── .env.local               # actual file
└── .vscode/
    └── settings.json        # actual file

/projects/myapp-feature/      # feature worktree
/projects/myapp-hotfix/       # hotfix worktree
```

After running `sync-worktrees`:

```
/projects/myapp-feature/
├── docker-compose.yml → ../myapp/docker-compose.yml
├── .env.local → ../myapp/.env.local
└── .vscode/
    └── settings.json → ../myapp/.vscode/settings.json

/projects/myapp-hotfix/
├── docker-compose.yml → ../myapp/docker-compose.yml
├── .env.local → ../myapp/.env.local
└── .vscode/
    └── settings.json → ../myapp/.vscode/settings.json
```

## Development

### Project Structure

```
src/
├── index.ts            # Main entry point
├── cli.ts              # CLI command definitions
├── config/             # Configuration handling
│   ├── loader.ts       # Config file loading
│   └── schema.ts       # Zod schema definitions
├── git/                # Git operations
│   ├── repository.ts   # Repository information
│   └── worktree.ts     # Worktree operations
├── sync/               # Synchronization logic
│   ├── engine.ts       # Sync engine
│   ├── symlink.ts      # Symlink operations
│   └── planner.ts      # Sync planning
├── utils/              # Utilities
│   └── logger.ts       # Logging system
└── types/              # TypeScript types
    └── index.ts        # Common types
```

### Scripts

```bash
npm run build          # Build TypeScript code
npm run dev            # Run in development mode
npm test               # Run tests
npm run lint           # Lint code
npm run type-check     # Check TypeScript types
```

## Requirements

- Node.js 18.x or higher
- Git installed and available in PATH
- Must be run from within a Git repository

## License

MIT