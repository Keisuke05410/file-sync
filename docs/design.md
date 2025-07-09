# Worktree Sync CLI Tool 設計書

## 1. 技術スタック

### 言語とランタイム

- **言語**: TypeScript
  - 型安全性による開発効率の向上
  - IDEサポートの充実
  - エラーの早期発見
  
- **ランタイム**: Node.js 18.x 以上
  - LTS版で安定性が高い
  - ES modules、Top-level await対応
  - 改善されたエラーハンドリング

### パッケージ管理

- **パッケージマネージャー**: npm
  - Node.js標準で追加インストール不要
  - `npx sync-worktrees` コマンドが要件に含まれている
  - 最もシンプルで汎用的

### ビルドツール

- **ビルドツール**: なし（直接実行）
  - TypeScriptをtsx/ts-nodeで直接実行
  - CLIツールなのでバンドル不要
  - 開発・デバッグが容易

### 主要依存パッケージ

- `commander` - CLIフレームワーク
- `chalk` - カラー出力
- `ora` - プログレス表示
- `zod` - 設定ファイルバリデーション

## 2. プロジェクト構造

```
worktree-sync/
├── package.json              # プロジェクト設定
├── tsconfig.json             # TypeScript設定
├── .gitignore               # Git除外設定
├── README.md                # プロジェクト説明
├── bin/                     # 実行可能ファイル
│   └── sync-worktrees       # CLIエントリーポイント（シェバン付き）
├── src/                     # ソースコード
│   ├── index.ts            # メインエントリーポイント
│   ├── cli.ts              # CLIコマンド定義
│   ├── config/             # 設定関連
│   │   ├── loader.ts       # 設定ファイル読み込み
│   │   ├── schema.ts       # 設定スキーマ定義（Zod）
│   │   └── validator.ts    # 設定検証
│   ├── git/                # Git操作
│   │   ├── repository.ts   # リポジトリ情報取得
│   │   └── worktree.ts     # ワークツリー操作
│   ├── sync/               # 同期処理
│   │   ├── engine.ts       # 同期エンジン
│   │   ├── symlink.ts      # シンボリックリンク操作
│   │   └── planner.ts      # 同期計画作成
│   ├── utils/              # ユーティリティ
│   │   ├── logger.ts       # ログ出力
│   │   ├── fs.ts          # ファイルシステム操作
│   │   └── error.ts       # エラーハンドリング
│   └── types/              # 型定義
│       └── index.ts        # 共通型定義
├── tests/                   # テスト
│   ├── unit/               # ユニットテスト
│   ├── integration/        # 統合テスト
│   └── fixtures/           # テストデータ
├── docs/                    # ドキュメント
│   ├── requirements.md      # 要件定義（既存）
│   └── design.md           # 設計書（本ファイル）
└── .worktreesync.json      # 設定ファイル
```

## 3. 設定ファイル仕様

### ファイル名

`.worktreesync.json`

### ファイル形式

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

### 設定項目詳細

| 項目 | 型 | デフォルト | 説明 |
|------|-----|------------|------|
| `sharedFiles` | `string[]` | 必須 | 共有するファイルのパターン配列。グロブパターン対応 |
| `sourceWorktree` | `string` | `"main"` | 原本となるワークツリー名（ブランチ名） |
| `linkMode` | `"relative" \| "absolute"` | `relative` | シンボリックリンクのタイプ |
| `overwrite` | `boolean` | `false` | 既存ファイル/リンクの上書き |
| `ignore` | `string[]` | `[]` | 除外パターン |
| `hooks` | `object` | `{}` | 前後処理スクリプト |

## 4. 動作仕様

### 基本動作フロー

1. **メインワークツリーのファイルを原本として保持**
   - shared-filesディレクトリは作成しない
   - メインワークツリー（デフォルトは`main`）の実ファイルをそのまま使用

2. **他のワークツリーにシンボリックリンクを作成**
   - メインワークツリー以外の全てのワークツリーに対して処理
   - メインワークツリーの実ファイルへの相対パスでリンクを作成

3. **ディレクトリ構造の維持**
   - 全てのワークツリーが同じディレクトリ構造を持つ
   - シンボリックリンクは元のファイルと同じ場所に配置

### 具体的な動作例

初期状態：
```
/projects/myapp/              # main ワークツリー
├── docker-compose.yml        # 実ファイル
├── .env.local               # 実ファイル
└── .vscode/
    └── settings.json        # 実ファイル

/projects/myapp-feature/      # feature ワークツリー
└── (空)

/projects/myapp-hotfix/       # hotfix ワークツリー
└── (空)
```

同期後：
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

## 5. エラーハンドリング戦略

### エラーカテゴリ

#### Git関連エラー

```typescript
class GitError extends Error {
  constructor(message: string, public command: string, public exitCode: number) {}
}
```

- Git コマンド未インストール → 明確なエラーメッセージ
- Git リポジトリ外での実行 → 使用方法を案内
- ワークツリーアクセス不可 → スキップして警告表示

#### ファイルシステムエラー

```typescript
class FileSystemError extends Error {
  constructor(message: string, public path: string, public operation: string) {}
}
```

- 権限不足 → sudo使用の提案またはスキップ
- ディスク容量不足 → 即座に中断
- 既存ファイル競合 → overwrite設定に従う

#### 設定ファイルエラー

```typescript
class ConfigError extends Error {
  constructor(message: string, public configPath: string, public details?: any) {}
}
```

- 設定ファイル不在 → サンプル設定の生成を提案
- JSONパースエラー → 行番号と詳細を表示
- スキーマ検証エラー → Zodエラーを分かりやすく整形

### エラー処理の原則

- **部分的失敗を許容**: 1つのワークツリーで失敗しても他は処理継続
- **ロールバック不要**: シンボリックリンクの作成は冪等性があるため
- **詳細ログ**: --verbose オプションでスタックトレース表示
- **終了コード**: 
  - 0: 成功
  - 1: 部分的失敗
  - 2: 完全失敗

## 6. テスト戦略

### テストフレームワーク

- **テストランナー**: Vitest
  - TypeScript ネイティブサポート
  - 高速実行（ESBuild使用）
  - Jest互換API
  - Watch モード充実

- **アサーション**: Vitest内蔵 + zod
  - Vitest の expect API
  - 設定検証は zod スキーマ

- **モック**: Vitest内蔵
  - vi.mock() でモジュールモック
  - vi.spyOn() でメソッドスパイ

### テスト構造

```
tests/
├── unit/                      # ユニットテスト
│   ├── config/
│   │   ├── loader.test.ts    # 設定読み込み
│   │   └── validator.test.ts # スキーマ検証
│   ├── git/
│   │   ├── repository.test.ts # Git操作モック
│   │   └── worktree.test.ts  # ワークツリー検出
│   └── sync/
│       └── symlink.test.ts    # リンク作成ロジック
├── integration/              # 統合テスト
│   ├── cli.test.ts          # CLIコマンド実行
│   └── end-to-end.test.ts   # 実際のGitリポジトリ使用
└── fixtures/                 # テストデータ
    ├── configs/             # サンプル設定
    └── repos/               # テスト用Gitリポジトリ
```

### テスト方針

- **ユニットテスト**
  - Git コマンドは全てモック
  - ファイルシステムは仮想FS（memfs）使用
  - 各モジュール独立してテスト

- **統合テスト**
  - 実際の Git リポジトリを一時作成
  - 実際のファイルシステム使用
  - CLI の E2E テスト

- **カバレッジ目標**
  - 全体: 80%以上
  - 重要モジュール: 90%以上

## 7. CLI設計

### フレームワーク

**Commander.js** を採用
- 最も普及しているNode.js CLIフレームワーク
- シンプルで直感的なAPI
- TypeScript型定義が充実
- サブコマンド対応（将来の拡張性）

### コマンド構造

```bash
# メインコマンド
npx sync-worktrees [options]

# オプション
  -c, --config <path>     設定ファイルパス (デフォルト: .worktreesync.json)
  -d, --dry-run          実行内容のプレビュー
  -v, --verbose          詳細ログ表示
  -q, --quiet            エラーのみ表示
  --no-color             カラー出力無効化
  -h, --help             ヘルプ表示
  -V, --version          バージョン表示

# 将来のサブコマンド候補
sync-worktrees init       # 設定ファイル生成
sync-worktrees status     # 現在の同期状態確認
sync-worktrees clean      # 壊れたリンクの削除
```

### 出力例

```
🔄 Syncing worktrees...
📁 Repository: /Users/username/projects/myapp
📍 Found 3 worktrees:
  ✓ main     → /Users/username/projects/myapp (source)
  ✓ feature  → /Users/username/projects/myapp-feature
  ✓ hotfix   → /Users/username/projects/myapp-hotfix

🔗 Creating symlinks:
  [main] (source worktree - skipped)
  
  [feature]
  ✓ docker-compose.yml → ../myapp/docker-compose.yml
  ✓ .env.local → ../myapp/.env.local
  ✓ .vscode/settings.json → ../myapp/.vscode/settings.json
  
  [hotfix]
  ✓ docker-compose.yml → ../myapp/docker-compose.yml
  ✓ .env.local → ../myapp/.env.local
  ✓ .vscode/settings.json → ../myapp/.vscode/settings.json

✅ Sync completed! (6 symlinks created)
```

## 8. ロギング・デバッグ機能

### ログレベル

```typescript
enum LogLevel {
  ERROR = 0,   // エラーのみ（--quiet）
  WARN = 1,    // 警告以上
  INFO = 2,    // 通常情報（デフォルト）
  DEBUG = 3,   // デバッグ情報（--verbose）
  TRACE = 4    // 詳細トレース（--debug）
}
```

### ログ出力設計

- **通常出力（INFO）**
  - 絵文字付きの分かりやすいメッセージ
  - 進捗状況の表示
  - 成功/失敗のサマリー

- **詳細出力（DEBUG）**
  - 実行するGitコマンド
  - ファイルパスの解決過程
  - シンボリックリンクの作成詳細

- **デバッグ出力（TRACE）**
  - 環境変数 `DEBUG=sync-worktrees:*` で有効化
  - スタックトレース
  - 設定ファイルの解析結果
  - Git コマンドの生出力

### デバッグ用環境変数

```bash
# デバッグモード有効化
DEBUG=sync-worktrees:* npx sync-worktrees

# 特定モジュールのみ
DEBUG=sync-worktrees:git npx sync-worktrees
DEBUG=sync-worktrees:config npx sync-worktrees

# ドライラン + デバッグ
DEBUG=* npx sync-worktrees --dry-run
```

### エラー時の出力例

```
❌ Error: Failed to create symlink
   Path: /Users/username/projects/myapp-feature/docker-compose.yml
   Reason: Permission denied
   
   Try running with sudo or check file permissions.
   
   Run with --verbose for more details.
```

## 9. 実装優先順位

1. **Phase 1: 基本機能**
   - プロジェクト初期設定
   - Git操作モジュール（リポジトリ検出、ワークツリー一覧）
   - 設定ファイル読み込み・検証
   - シンボリックリンク作成

2. **Phase 2: CLI実装**
   - Commanderによるコマンドライン解析
   - ロギングシステム
   - ドライラン機能

3. **Phase 3: エラーハンドリング**
   - 各種エラークラス実装
   - リカバリー処理
   - ユーザーフレンドリーなエラーメッセージ

4. **Phase 4: テスト**
   - ユニットテスト作成
   - 統合テスト作成
   - カバレッジ測定

5. **Phase 5: 拡張機能**
   - サブコマンド実装
   - フック機能
   - 高度な設定オプション

## 10. 重要な設計方針

### メインワークツリーの特別扱い

- **原本ファイルの保持**: メインワークツリー（デフォルトは`main`）に実ファイルを配置
- **他のワークツリーはリンクのみ**: メイン以外は全てシンボリックリンク
- **削除時の考慮**: メインワークツリー削除時の警告機能

### シンボリックリンクの管理

- **相対パス優先**: ワークツリー間の移動に対応
- **ディレクトリ構造の自動作成**: 必要なディレクトリは自動的に作成
- **壊れたリンクの検出**: statusコマンドで確認可能（将来実装）

### 設定の簡潔性

- **最小限の設定**: 必須項目は`sharedFiles`のみ
- **適切なデフォルト値**: 一般的なユースケースに最適化
- **拡張性の確保**: 将来の機能追加を考慮した設計