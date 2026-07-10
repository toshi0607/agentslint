# agentslint 実装計画

## Constraints

| Constraint | Source | Verify by |
|---|---|---|
| npm 名は `@toshi0607/agentslint`(bin 名は agentslint) | DESIGN.md §9 | `npm view @toshi0607/agentslint` |
| 依存最小(remark / yaml 以外は要議論) | DESIGN.md §6 | package.json diff |
| v1 に --fix・生成機能を入れない | DESIGN.md §4 | スコープレビュー |
| 誤検知を出すくらいなら検知しない | DESIGN.md §5 | fixture テスト(valid で findings 0) |

## Assumptions

| Assumption | Status | Evidence |
|---|---|---|
| npm `agentslint` が空き | 反証済み | registry は 404 だったが publish 時に類似名保護(agents-lint)で 403。404 チェックは十分条件でないと判明 → @toshi0607/agentslint に変更(2026-07-10) |
| GitHub に同名リポジトリなし | VERIFIED | gh api search 404(2026-07-10) |
| 競合 8 プロジェクトに CI/SARIF 特化の決定版なし | VERIFIED | DESIGN.md §3 の調査(2026-07-10) |

## Phase 0: 準備
- [x] GitHub リポジトリ作成(public)— 済(github.com/toshi0607/agentslint、タグ v0.0.1、2026-07-10)
- [x] npm 0.0.1 publish — 済(@toshi0607/agentslint@0.0.1。`npm view` で 0.0.1、`npx -y @toshi0607/agentslint` の実行確認済み、2026-07-10)
- [x] CLAUDE.md / AGENTS.md 実サンプルを fixtures 化 — 済(fixtures/valid・broken・regression。broken で 6 errors/3 warnings/1 info)

## Phase 1: MVP(ルール AL001–AL005)
- [x] discover + markdown parse + @import 解決 — 済(npm test 37/37 pass、2026-07-10)
- [x] AL001 broken-file-reference(valid fixture で誤検知ゼロ)— 済(fixture テスト + %エンコード/scoped package/参照スタイルリンクの回帰テスト)
- [x] AL002 stale-command / AL003 token-budget / AL004 skill-frontmatter / AL005 settings-schema — 済(各 fixture テスト。AL002 はコマンド位置のみマッチ)
- [x] pretty / JSON / SARIF 出力・終了コード — 済(broken fixture exit 1 / valid exit 0 / 実リポジトリ 2 ファイル走査 0 件 exit 0)

## Phase 2: CI 統合
- [x] SARIF を GitHub code scanning に取り込んで表示確認 — 済(analyses API で tool=agentslint, results 0 を確認、2026-07-10)
- [x] action.yml — 済(CI の self-lint ジョブが `uses: ./` で success。PR 上のアノテーション表示は最初の PR で確認予定)
- [ ] 自分のアクティブリポジトリ 5 つに導入 — verify: 各リポジトリの CI green

## Phase 3: 公開
- [x] README 英語化(README.md=EN、README.ja.md=JA)+ CLI メッセージ英語化 + examples/demo と docs/demo.svg — 済(2026-07-10、npm test 39/39・self-lint 0 件)
- [ ] docs/rules/ 8 ページ(日英)— verify: 自分自身で lint してリンク切れなし
- [ ] good first issue 10 本 + ルール提案テンプレート — verify: issue 数
- [ ] Zenn 記事公開・X 告知 — verify: 記事 URL

## Notes
- 2026-07-10: CLI の全メッセージを英語化(国際公開が前提のため。診断メッセージの i18n 機構は入れず英語単一言語)。ドキュメントは README.md=EN / README.ja.md=JA の 2 本立て
- vitest は ^3 に固定(vitest 4 系の rolldown ネイティブバインディングが Node 22.3.0 の engines 制約で npm に silently skip され MODULE_NOT_FOUND になるため)
- `.agentslintrc.json` の ignore は cwd 基準で適用(ESLint と同じ挙動)。リポジトリ自身の self-lint では fixtures/ を除外
- @import 検出は「左境界(行頭 or 空白)+ doc 系拡張子 + プレフィックスなし複数セグメントは先頭ディレクトリ実在時のみ」に制限(誤検知ゼロ優先の意図的アンダーマッチ)

## Review
2026-07-10 フレッシュコンテキストレビュー(設計準拠 + 誤検知観点)の結果と対応:
- H1 %エンコードリンクの誤検知 → decodeURIComponent 併用で解消(回帰テストあり)
- H2 散文中の @scope/pkg・中間 @ の誤検知 → 左境界 + 拡張子 allowlist + 先頭ディレクトリ実在ゲートで解消(回帰テストあり)
- M1 シェルコメント・文字列内コマンドの誤検知 → コマンド位置のみマッチに変更(回帰テストあり)
- M2 ignore glob の ReDoS(`**/` 8 連で約 86 秒)→ セグメント単位 DP マッチャーに置換(回帰テストあり)
- M3 stale dist で統合テストが走る → pretest で build を強制
- L1 非文字列 name/description の素通り → typeof 検査 + 専用エラー
- L2 ハングル・CJK 拡張 A がトークン概算から漏れ → 範囲追加
- L3 参照スタイルリンク未チェック → definition ノードも収集
- L4 README のステータス陳腐化 → 更新
最終状態: npm test 37/37 pass(回帰 9 件含む)
