# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a CLI tool project for synchronizing files between Git worktrees. The tool allows developers to share configuration files (like docker-compose.yml, .env, IDE settings) across multiple worktrees of the same Git repository using symbolic links.

## Project Status

**PRODUCTION READY** - The project is fully implemented with comprehensive testing (331 tests passing), robust error handling, and complete CLI functionality. Ready for real-world usage.

## Core Architecture

### Key Components
- **CLI System** (`src/cli.ts`): Commander.js-based CLI with 5 main commands (sync, init, status, unlink, clean)
- **Configuration System** (`src/config/`): Zod-based schema validation with comprehensive error handling
- **Git Integration** (`src/git/`): Repository detection and worktree discovery using Git commands
- **Sync Engine** (`src/sync/`): Orchestrates planning, execution, and validation of sync operations
- **Symlink Management** (`src/sync/symlink.ts`): Creates and manages symbolic links with relative/absolute modes
- **Logger System** (`src/utils/logger.ts`): Configurable logging with colors, progress indicators, and verbosity levels

### Technical Stack
- **Language**: TypeScript with strict mode and Node.js 18.x+
- **CLI Framework**: Commander.js for command parsing and argument handling
- **Validation**: Zod for schema validation and type safety
- **Testing**: Vitest with coverage reporting (331 tests)
- **Build**: TypeScript compiler with ES modules
- **File Operations**: Native Node.js fs module with async/await patterns

### Architecture Patterns
- **Dependency Injection**: Logger and configuration instances passed to components
- **Error Handling**: Custom error classes (`GitError`, `ConfigError`, `FileSystemError`)
- **Async/Await**: Consistent async patterns throughout the codebase
- **Type Safety**: Comprehensive TypeScript types and interfaces
- **Modular Design**: Clear separation of concerns across modules

## Project Structure

```
worktree-sync/
├── package.json              # Project configuration and dependencies
├── tsconfig.json             # TypeScript configuration
├── bin/                      # Executable files
│   └── sync-worktrees       # CLI entry point
├── src/                      # TypeScript source code
│   ├── index.ts             # Main entry point
│   ├── cli.ts               # CLI command definitions
│   ├── config/              # Configuration handling
│   │   ├── loader.ts        # Config file loading
│   │   ├── schema.ts        # Zod schema definitions
│   │   └── validator.ts     # Config validation
│   ├── git/                 # Git operations
│   │   ├── repository.ts    # Repository information
│   │   └── worktree.ts      # Worktree operations
│   ├── sync/                # Synchronization logic
│   │   ├── engine.ts        # Sync engine
│   │   ├── symlink.ts       # Symlink operations
│   │   └── planner.ts       # Sync planning
│   ├── utils/               # Utilities
│   │   ├── logger.ts        # Logging
│   │   ├── fs.ts            # File system operations
│   │   └── error.ts         # Error handling
│   └── types/               # TypeScript type definitions
│       └── index.ts         # Common types
├── tests/                    # Test files
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
├── docs/                     # Documentation
│   ├── requirements.md      # Requirements (existing)
│   └── design.md           # Design document (existing)
└── .worktreesync.json      # Configuration file
```

## Key Requirements Implementation

### Functional Requirements
1. **FR-1**: Support standalone .worktreesync.json configuration file
2. **FR-2**: Use `git rev-parse --show-toplevel` for repository root detection
3. **FR-3**: Use `git worktree list` for automatic worktree discovery
4. **FR-4**: Implement idempotent symbolic link creation/updating
5. **FR-5**: Main worktree holds actual files, others get symbolic links
6. **FR-6**: Provide single command CLI interface (`npx sync-worktrees`)
7. **FR-7**: Include --dry-run option for preview without changes

### Non-Functional Requirements
- **NFR-1**: No dependency on specific directory naming or structure
- **NFR-2**: Clear console output with operation details and error messages
- **NFR-3**: Cross-platform compatibility (macOS/Linux primary)
- **NFR-4**: Performance target: complete within seconds for typical projects

## Common Commands

### Development Setup
```bash
npm install                   # Install dependencies
npm run build                 # Build TypeScript code
npm test                      # Run tests with Vitest
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage report
npm run lint                 # Lint code with ESLint
npm run lint:fix             # Lint and fix code automatically
npm run type-check           # Check TypeScript types
npm run dev                  # Run in development mode
```

### CLI Usage
```bash
npx sync-worktrees           # Sync files across worktrees
npx sync-worktrees --dry-run # Preview changes without applying
npx sync-worktrees --verbose # Show detailed output
npx sync-worktrees --files "*.env,docker-compose.yml" # Sync specific files
npx sync-worktrees --worktree feature # Sync to specific worktree (by branch name)
npx sync-worktrees --worktree /repo/feature # Sync to specific worktree (by path)
npx sync-worktrees init      # Create sample configuration file
npx sync-worktrees status    # Check synchronization status
npx sync-worktrees unlink    # Remove symbolic links (intelligent mode)
npx sync-worktrees clean     # Remove broken symbolic links
npx sync-worktrees doctor    # Diagnose configuration and worktree health
npx sync-worktrees --help    # Show help information
```

## Configuration Format

### Configuration File (.worktreesync.json)
```json
{
  "$schema": "https://unpkg.com/worktree-sync/schema.json",
  "sharedFiles": [
    "docker-compose.yml",
    ".env.local",
    ".vscode/settings.json",
    "tools/**/*.sh"
  ],
  "sourceWorktree": "main",
  "linkMode": "relative",
  "overwrite": false,
  "ignore": [],
  "hooks": {
    "beforeSync": "echo 'Starting sync...'",
    "afterSync": "echo 'Sync completed!'"
  }
}
```

### Configuration Options
- **sharedFiles** (required): Array of file patterns to sync (glob patterns supported)
- **sourceWorktree**: Source worktree specified by:
  - Branch name: `"main"`, `"develop"`, `"feature/auth"`
  - Absolute path: `"/Users/user/projects/myrepo"`
  - Relative path from repository root: `"./worktrees/feature"`, `"../myrepo-feature"`
  - Default: `"main"`
- **linkMode**: Type of symlinks - "relative" or "absolute" (default: "relative")
- **overwrite**: Whether to overwrite existing files/links (default: false)
- **ignore**: Array of patterns to exclude from syncing
- **hooks**: Commands to run before/after sync operations

### Command-Line Interface
- **Main Command**: `npx sync-worktrees [config-path]` - Sync files across worktrees
- **Init Command**: `npx sync-worktrees init [config-path]` - Create sample configuration
- **Status Command**: `npx sync-worktrees status [config-path]` - Check sync status
- **Unlink Command**: `npx sync-worktrees unlink [config-path]` - Remove symbolic links intelligently
- **Clean Command**: `npx sync-worktrees clean [config-path]` - Remove broken links
- **Doctor Command**: `npx sync-worktrees doctor [config-path]` - Diagnose configuration and worktree health
- **Global Options**: `--dry-run`, `--verbose`, `--quiet`, `--no-color`
- **Selective Sync Options**: `--files <patterns>`, `--worktree <name>` (for main command)
  - `--files`: Comma-separated file patterns (e.g., "*.env,docker-compose.yml")
  - `--worktree`: Worktree branch name (e.g., "feature") or path pattern (e.g., "/repo/feature")

## Git Integration Patterns

### Repository Detection
```bash
git rev-parse --show-toplevel  # Get repository root
git worktree list              # List all worktrees
```

### Expected Git Command Output Processing
- Parse `git worktree list` output to extract worktree paths
- Handle both bare and non-bare repository scenarios
- Validate worktree accessibility before processing

## Error Handling Considerations

- Invalid or inaccessible worktree paths
- Missing source files in main worktree
- Permission issues with symbolic link creation
- Cross-platform symbolic link compatibility
- Git command execution failures
- Existing files when overwrite is false
- Broken symbolic links from deleted source files

## Testing Strategy

- **Framework**: Vitest with comprehensive test suite (331 tests passing)
- **Unit Tests**: Mock Git commands and file system operations with detailed scenarios
- **Integration Tests**: Use actual Git worktrees in temporary directories
- **Test Coverage**: Available via `npm run test:coverage` with detailed reporting
- **Key Test Scenarios**:
  - Git command parsing and error handling
  - Symbolic link creation and updates
  - Configuration validation with Zod schemas
  - Dry-run functionality verification
  - CLI command execution and option parsing
  - Error handling and recovery scenarios
  - Cross-platform compatibility testing

## Development Notes

- All file paths in configuration must be relative to repository root
- Symbolic links should be created as relative paths when possible
- Handle existing files/links gracefully (overwrite or skip based on configuration)
- Main worktree is never modified (it holds the actual files)
- Other worktrees only contain symbolic links to main worktree files
- Consider file permissions and ownership when creating links
- Use TypeScript strict mode for better type safety
- Follow existing Raksul coding standards (RuboCop style for formatting consistency)

## Implementation Status

### ✅ Completed Features
- **Core Architecture**: Full TypeScript implementation with strict type checking
- **CLI Interface**: Complete Commander.js integration with all planned commands
- **Configuration System**: Zod-based validation with comprehensive error handling
- **Git Integration**: Repository detection and worktree discovery
- **Symlink Management**: Relative/absolute link creation with idempotent operations
- **Testing Suite**: 351 tests covering unit and integration scenarios
- **Error Handling**: Robust error system with custom error classes
- **Logging System**: Configurable logging with colors and progress indicators
- **Dry-run Support**: Preview functionality across all commands
- **Hook System**: Pre/post sync command execution
- **Status Command**: Check current synchronization state
- **Unlink Command**: Intelligent symbolic link removal based on execution context
- **Clean Command**: Remove broken symbolic links
- **Doctor Command**: Comprehensive health check and diagnostics for configuration and worktrees
- **Selective Sync**: Support for syncing specific files or worktrees via CLI options
- **Glob Patterns**: Full pattern matching support for file selection

## Development Methodology

- **Development Methodology**: 
  - t-wadaのTDD手法(RED-GREEN-REFACTOR)に従って開発を進めて下さい。

## Communication and Interaction Notes

- **Test and Verification Instructions**:
  - 私に手動でテストや動作を確認してほしいときは具体的に指示を出して下さい。

## Coding Guidelines

- **Commit Practices**:
  - 作業が一区切りついたらその度に適切な粒度でcommitして下さい。

## Quality Assurance

- **Required Verification Before Completion**:
  - 会話が終わる前に必ず以下のチェックを実行して、すべてが正常に動作することを確認すること：
    - `npm run build` - TypeScriptビルドが成功すること
    - `npm test` - 全てのテストが通ること
    - `npm run lint` - リンターチェックが通ること（可能な場合）
    - `npm run type-check` - 型チェックが通ること（可能な場合）
    - その他プロジェクトに必要なコマンドがあれば実行すること