# agentslint 設計ドキュメント

作成日: 2026-07-10 / ステータス: MVP 実装済み(未公開)

## 1. 一言で

**AI コーディングエージェント設定ファイル(AGENTS.md / CLAUDE.md / .claude/ 一式)を CI で検証するリンター。**
CLI(npm)と GitHub Action の 2 形態で配布し、「チームのリポジトリの CI に常駐する」ことを最初から狙う。

## 2. なぜ作るか

- AGENTS.md / CLAUDE.md は「書いたら書きっぱなし」になりがちで、参照パスやコマンドがコードベースの変化で壊れる。壊れた設定はエージェントの精度を下げ、トークンを浪費する。
- エージェント設定は今や複数ファイルに分散する(AGENTS.md、CLAUDE.md、.claude/skills/、.claude/settings.json…)。この一貫性は個人のローカル実行ではなくチームの CI で守られるべきだが、その決定版がまだない。

## 3. 競合分析(2026-07-10 調査)

| プロジェクト | ★ | 特徴 |
|---|---|---|
| seojoonkim/agentlinter | 70 | 採点・診断・自動修正。トークン効率・セキュリティ |
| 0xmariowu/AgentLint | 45 | Claude Code / Codex / Cursor 対応のハーネスリンター |
| samilozturk/agentlint | 29 | AGENTS.md / rules / skills の構造・鮮度・コードベース整合 |
| mauhpr/agentlint | 27 | フック型リアルタイムガードレール。77 ルール |
| Mr-afroverse/agentlint | 6 | Copilot / Cursor / Windsurf。ドリフト・壊れたパス検知 |
| akz4ol/agentlint | 3 | エージェント設定のサプライチェーンセキュリティ |
| amarships/agents-md-linter | 0 | AGENTS.md の生成と監査 |
| CSOAI-ORG/meok-agents-md-lint-mcp | 0 | MCP サーバー型リンター |

**読み取り**: 乱立は需要の証拠。ただし決定版不在で、共通の弱点は**配布形態**(ローカル CLI・フック中心で、チーム CI への常駐を狙った設計がない)。

### 差別化

1. **CI ファースト**: GitHub Action 同梱・SARIF 出力(GitHub code scanning 統合)・PR 差分アノテーション。エージェント設定は個人の善意ではなくチームの CI で守る、という立場を取り切る。
2. **モノレポ対応**: ネストした AGENTS.md / CLAUDE.md の探索とスコープ解決を最初からサポート。
3. **ルール追加の障壁を下げる**: ルール 1 つ = 実装 + テスト + ドキュメントの 3 点セット。型が決まっているので新ルールの提案・実装に参加しやすい。
4. **日英ドキュメント併記**: 日本語圏の開発者にも一次情報を提供する。

## 4. スコープ

### In(v1)
- 対象ファイル: `AGENTS.md`(ネスト含む)、`CLAUDE.md`(`@import` 解決含む)、`.claude/skills/*/SKILL.md`、`.claude/settings.json`
- 出力: pretty(TTY)、JSON、SARIF、GitHub Actions アノテーション
- 配布: npm CLI(`npx agentslint`)、GitHub Action(同一リポジトリの `action.yml`、`uses: toshi0607/agentslint@v1`)
- 設定: `.agentslintrc.json`(ルールの on/off・閾値・除外パス)

### Out(少なくとも v1 では)
- 自動修正(--fix)— まず検知の信頼性を上げる
- .cursor/rules / copilot-instructions 対応 — v2 で拡張(ルール機構は汎用に設計しておく)
- MCP サーバー形態、リアルタイムフック形態 — 既存プロジェクトの土俵。追わない
- AGENTS.md の生成 — linter は検証に徹する

## 5. ルール仕様(MVP: 8 ルール)

| ID | 名前 | 内容 | 既定 |
|---|---|---|---|
| AL001 | broken-file-reference | 記載された相対パス・`@import`・リンク先ファイルが存在しない | error |
| AL002 | stale-command | 記載コマンドが package.json scripts / Makefile / justfile / Taskfile に存在しない | warn |
| AL003 | token-budget | ファイルの概算トークン数が閾値超過(既定 4,000)。コンテキスト浪費の検知 | warn |
| AL004 | skill-frontmatter | SKILL.md の frontmatter 検証(name 必須・kebab-case・description 必須・長さ上限) | error |
| AL005 | settings-schema | .claude/settings.json の検証(JSON 妥当性・既知キーの型・未知キー警告) | error |
| AL006 | secret-pattern | API キー等のシークレットらしきパターンの混入 | error |
| AL007 | boilerplate | 生成テンプレのまま中身がない(プレースホルダ文言の残存) | warn |
| AL008 | duplicate-heading | AGENTS.md と CLAUDE.md の同一見出し重複(矛盾ガイダンスの入口検知)。v1 は見出し一致まで | info |

AL001–AL006 は実装済み(AL006 は 0.0.2 で追加)。AL007–AL008 は今後追加する。

ルール実装の契約(プラグイン機構):

```ts
interface Rule {
  id: string;            // AL001
  name: string;          // broken-file-reference
  defaultSeverity: 'error' | 'warn' | 'info';
  appliesTo: FileKind[]; // agents-md | claude-md | skill | settings
  check(ctx: FileContext): Finding[];
}
```

- ルール本体 `src/rules/<id>-<name>.ts` + テスト + `docs/rules/<id>.md`(日英)の 3 点セット。
- 新ルールはこの 3 点セットの PR で追加できる。good first issue の型でもある。

### 誤検知に対する態度

リンターの信頼はゼロ誤検知で決まる。判断に迷う検知はデフォルト off か info に落とす。
たとえば AL001 はコードフェンス内・URL・アンカーを対象外とし、AL002 は既知のマニフェストが
存在する場合のみ照合する。

## 6. アーキテクチャ

```
src/
  cli.ts           # 引数解釈・終了コード(findings に error があれば 1)
  discover.ts      # 対象ファイル探索(モノレポ: ルートから再帰、.gitignore 尊重)
  parse/
    markdown.ts    # md の見出し・リンク・コードスパン抽出(remark)
    imports.ts     # CLAUDE.md @import 解決(循環検知含む)
  rules/           # ルール実装(上記契約)
  report/
    pretty.ts / json.ts / sarif.ts / gh-annotations.ts
  config.ts        # .agentslintrc.json 読み込み・マージ
action.yml         # Action は cli の薄いラッパ
```

技術選定と理由:
- **TypeScript / Node 20+ / ESM**。npm 配布と Action 同居が最短。
- 依存は最小限: `remark`(md AST。自前正規表現パースは AL001/AL008 の誤検知源になるので採らない)、`yaml`(frontmatter)。CLI フレームワークは使わない(サブコマンドが増えたら再検討)。
- トークン概算は tiktoken 系 wasm を入れず `CJK 文字数 + その他文字数/4` の近似で開始(閾値検知用途には十分。docs に近似である旨明記)。

## 7. 公開までの計画

1. **公開時 UX**: `npx agentslint` が設定ゼロで動くことを最重要とする(対象ファイルがなくても意味のある出力)。
2. **ドッグフーディング**: 自分のアクティブリポジトリ全部に Action を導入し、実例リンクを README に載せる。
3. **告知**: Zenn(日本語)、英語 README 整備後に海外コミュニティ。
4. **コミュニティ**: 公開と同時に「新ルール提案」issue テンプレートと good first issue を用意。ルール 3 点セットの型があるのでレビューコストは低い。

## 8. リスクと対策

| リスク | 対策 |
|---|---|
| 競合が先に決定版化する | CI/SARIF/モノレポの角度を先に取り切る |
| エージェント本体(Claude Code 等)が検証機能を内蔵する | その場合も「CI でチーム横断に強制する」需要は残る。Action 特化はヘッジでもある |
| AGENTS.md / skills 仕様の変化 | 仕様追従はむしろ更新頻度=活発さのシグナル。ルールをデータ駆動(スキーマ外部化)にして追従コストを下げる |
| ルール PR の品質ばらつき | 3 点セット + fixture テスト必須を CONTRIBUTING に明記 |

## 9. 命名

- npm: `@toshi0607/agentslint` — 無印の `agentslint` は 404 だったが、publish 時に npm の類似名保護(`agents-lint` と衝突)で 403 となったためスコープ付きに変更(2026-07-10)。bin 名は `agentslint` のまま
- GitHub: `toshi0607/agentslint`。GitHub Action はソースから実行する composite のため npm 名の影響なし
