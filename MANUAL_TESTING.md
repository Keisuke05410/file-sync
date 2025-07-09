# Manual Testing Guide

This guide provides comprehensive testing procedures for the worktree-sync CLI tool, considering real-world usage scenarios and potential user environments.

## Prerequisites

1. **Build the project**

   ```bash
   cd /Users/k.kaji/src/github.com/raksul/raksul-sandbox/k.kaji/worktree-sync
   npm run build
   ```

2. **Set up the test command**

   ```bash
   # For easier testing, create an alias
   alias test-worktree-sync='node /Users/k.kaji/src/github.com/raksul/raksul-sandbox/k.kaji/worktree-sync/bin/sync-worktrees'
   ```

## Test Categories

### 1. Different Repository Types

#### A. Rails Project (raksul-core)

**Setup:**
```bash
cd /Users/k.kaji/src/github.com/raksul/raksul-core
```

**Test Configuration:**
```bash
cat > .worktreesync.json << 'EOF'
{
  "sharedFiles": [
    "docker-compose.yml",
    ".env.local",
    ".vscode/settings.json",
    "config/database.yml",
    ".rubocop.yml"
  ],
  "sourceWorktree": "main"
}
EOF
```

**Test Steps:**
1. Check help output: `test-worktree-sync --help`
2. Dry run: `test-worktree-sync --dry-run --verbose`
3. Actual run: `test-worktree-sync --verbose`
4. Verify symlinks: `ls -la ../worktree-name/.env.local`

**Expected Results:**
- Clean output with operation summary
- Symlinks created correctly
- No errors or warnings

#### B. Go Project (raksul-session)

**Setup:**
```bash
cd /Users/k.kaji/src/github.com/raksul/raksul-session
```

**Test Configuration:**
```bash
cat > .worktreesync.json << 'EOF'
{
  "sharedFiles": [
    "docker-compose.yml",
    ".env",
    ".vscode/settings.json",
    "go.mod",
    "go.sum",
    ".golangci.yml"
  ],
  "sourceWorktree": "main"
}
EOF
```

**Test Steps:**
1. Create test worktree: `git worktree add ../raksul-session-test feature-branch`
2. Run sync: `test-worktree-sync --verbose`
3. Check symlinks: `ls -la ../raksul-session-test/`
4. Verify file content: `cat ../raksul-session-test/go.mod`
5. Cleanup: `git worktree remove ../raksul-session-test`

**Expected Results:**
- All Go-specific files properly synced
- Symlinks work correctly
- No broken links

#### C. Simple Project

**Setup:**
```bash
# Create a minimal test repository
mkdir -p /tmp/test-repo
cd /tmp/test-repo
git init
echo "test content" > README.md
git add . && git commit -m "Initial commit"
```

**Test Configuration:**
```bash
cat > .worktreesync.json << 'EOF'
{
  "sharedFiles": [
    "README.md",
    "package.json"
  ],
  "sourceWorktree": "main"
}
EOF
```

**Test Steps:**
1. Create worktree: `git worktree add ../test-repo-feature feature`
2. Run sync: `test-worktree-sync --verbose`
3. Check results: `ls -la ../test-repo-feature/`
4. Cleanup: `rm -rf /tmp/test-repo*`

### 2. Error Case Testing

#### A. Configuration Errors

**Test 1: Invalid JSON**
```bash
cd /path/to/test-repo
echo '{ "sharedFiles": [ }' > .worktreesync.json
test-worktree-sync
```

**Expected:** Clear error message about invalid JSON

**Test 2: Missing Required Fields**
```bash
echo '{ "sourceWorktree": "main" }' > .worktreesync.json
test-worktree-sync
```

**Expected:** Error message about missing sharedFiles

**Test 3: Invalid File Patterns**
```bash
cat > .worktreesync.json << 'EOF'
{
  "sharedFiles": [
    "/absolute/path/file.txt",
    "nonexistent.file"
  ]
}
EOF
test-worktree-sync
```

**Expected:** Warning about absolute paths and missing files

#### B. Git Environment Errors

**Test 1: Non-Git Directory**
```bash
cd /tmp
test-worktree-sync
```

**Expected:** Error message about not being in a Git repository

**Test 2: No Worktrees**
```bash
# In a repository with only main worktree
cd /path/to/single-worktree-repo
test-worktree-sync
```

**Expected:** Information about no additional worktrees found

#### C. File System Errors

**Test 1: Read-Only Files**
```bash
cd /path/to/test-repo
echo "readonly content" > readonly.txt
chmod 444 readonly.txt
cat > .worktreesync.json << 'EOF'
{
  "sharedFiles": ["readonly.txt"]
}
EOF
test-worktree-sync
```

**Expected:** Appropriate handling of read-only files

**Test 2: Existing Files with overwrite=false**
```bash
# Create conflicting file in target worktree
echo "existing content" > ../test-worktree/existing.txt
cat > .worktreesync.json << 'EOF'
{
  "sharedFiles": ["existing.txt"],
  "overwrite": false
}
EOF
test-worktree-sync
```

**Expected:** Warning about existing files, no overwrite

### 3. Real-World Scenarios

#### A. New User Onboarding

**Scenario:** First-time user with no configuration

**Test Steps:**
1. Navigate to repository: `cd /path/to/repo`
2. Run without config: `test-worktree-sync`
3. Expected: Helpful error message with setup instructions

**Scenario:** User follows setup instructions

**Test Steps:**
1. Create basic config:
   ```bash
   cat > .worktreesync.json << 'EOF'
   {
     "sharedFiles": [
       "docker-compose.yml",
       ".env.local"
     ]
   }
   EOF
   ```
2. Run dry run: `test-worktree-sync --dry-run`
3. Run actual sync: `test-worktree-sync`
4. Expected: Clear, informative output

#### B. Team Development

**Scenario:** Using shared configuration

**Test Steps:**
1. Simulate pulling config from Git: `git pull origin main`
2. Run sync: `test-worktree-sync`
3. Expected: Works with teammate's configuration

**Scenario:** Updating shared configuration

**Test Steps:**
1. Add new file to config:
   ```bash
   jq '.sharedFiles += [".gitignore"]' .worktreesync.json > tmp.json && mv tmp.json .worktreesync.json
   ```
2. Run sync: `test-worktree-sync`
3. Expected: New file properly synced

#### C. Continuous Usage

**Scenario:** Regular development workflow

**Test Steps:**
1. Make changes to shared files
2. Run sync: `test-worktree-sync`
3. Switch to different worktree
4. Verify changes are reflected
5. Expected: Seamless workflow

### 4. User Experience Testing

#### A. Help and Documentation

**Test Commands:**
```bash
test-worktree-sync --help
test-worktree-sync -h
test-worktree-sync
```

**Expected Results:**
- Clear, concise help text
- Examples of usage
- List of available options

#### B. Output Verbosity

**Test Commands:**
```bash
test-worktree-sync --verbose
test-worktree-sync --quiet
test-worktree-sync # default output
```

**Expected Results:**
- Verbose: Detailed operation logs
- Quiet: Only errors and warnings
- Default: Balanced, informative output

#### C. Dry Run Functionality

**Test Commands:**
```bash
test-worktree-sync --dry-run
test-worktree-sync --dry-run --verbose
```

**Expected Results:**
- Shows what would be done without making changes
- Clear indication that it's a dry run
- Useful for previewing operations

### 5. Performance Testing

#### A. Large File Sets

**Test Configuration:**
```bash
cat > .worktreesync.json << 'EOF'
{
  "sharedFiles": [
    "**/*.yml",
    "**/*.json",
    "**/*.md",
    "**/*.js",
    "**/*.ts"
  ]
}
EOF
```

**Test Steps:**
1. Time execution: `time test-worktree-sync`
2. Check memory usage: `ps aux | grep node`
3. Expected: Completes within reasonable time (< 30 seconds for typical repos)

#### B. Multiple Worktrees

**Test Setup:**
```bash
# Create multiple worktrees
git worktree add ../worktree-1 feature-1
git worktree add ../worktree-2 feature-2
git worktree add ../worktree-3 feature-3
```

**Test Steps:**
1. Run sync: `time test-worktree-sync --verbose`
2. Verify all worktrees: `ls -la ../worktree-*/shared-file`
3. Expected: All worktrees synced efficiently

### 6. Recommended Test Sets

#### Minimum Test Set (Quick validation)

1. **Basic functionality in raksul-core**
2. **Error handling: Invalid JSON**
3. **Error handling: Non-Git directory**
4. **Dry run functionality**
5. **Help message clarity**

**Time requirement:** ~10 minutes

#### Complete Test Set (Full validation)

1. **All repository types** (Rails, Go, simple)
2. **All error cases** (5+ scenarios)
3. **Real-world scenarios** (3+ scenarios)
4. **User experience tests** (help, output, dry-run)
5. **Performance tests** (large files, multiple worktrees)

**Time requirement:** ~45 minutes

### 7. Test Environment Setup

#### A. Clean Test Environment

```bash
# Create isolated test directory
mkdir -p /tmp/worktree-sync-tests
cd /tmp/worktree-sync-tests

# Test with fresh Git repositories
git clone https://github.com/example/test-repo.git
cd test-repo
```

#### B. Backup Strategy

```bash
# Before testing in important repositories
cp -r /path/to/important-repo /path/to/backup-repo

# After testing
if [ "tests_failed" ]; then
  rm -rf /path/to/important-repo
  mv /path/to/backup-repo /path/to/important-repo
fi
```

### 8. Test Reporting

#### A. Success Criteria

- [ ] No errors in basic functionality
- [ ] Clear error messages for invalid inputs
- [ ] Proper symlink creation and maintenance
- [ ] Reasonable performance (< 30s for typical repos)
- [ ] Intuitive user experience

#### B. Test Results Documentation

```markdown
## Test Results

### Test Environment
- OS: macOS/Linux
- Node.js version: X.X.X
- Git version: X.X.X

### Test Results
- Basic functionality: ✅/❌
- Error handling: ✅/❌
- Performance: ✅/❌
- User experience: ✅/❌

### Issues Found
1. [Issue description]
2. [Issue description]

### Recommendations
1. [Recommendation]
2. [Recommendation]
```

## Conclusion

This comprehensive testing guide ensures that the worktree-sync tool is robust, user-friendly, and ready for real-world usage. Follow the recommended test sets based on your development phase and requirements.

For quick validation, use the minimum test set. For release preparation, execute the complete test set.

Remember to test in various environments and with different user personas to ensure broad compatibility and usability.