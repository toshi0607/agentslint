# agentslint 実装計画

## Constraints

| Constraint | Source | Verify by |
|---|---|---|
| npm 名は `agentslint`(公開時に 0.0.1 確保) | DESIGN.md §9 | `npm view agentslint` |
| 依存最小(remark / yaml 以外は要議論) | DESIGN.md §6 | package.json diff |
| v1 に --fix・生成機能を入れない | DESIGN.md §4 | スコープレビュー |
| 誤検知を出すくらいなら検知しない | DESIGN.md §5 | fixture テスト(valid で findings 0) |

## Assumptions

| Assumption | Status | Evidence |
|---|---|---|
| npm `agentslint` が空き | VERIFIED | registry 404(2026-07-10) |
| GitHub に同名リポジトリなし | VERIFIED | gh api search 404(2026-07-10) |
| 競合 8 プロジェクトに CI/SARIF 特化の決定版なし | VERIFIED | DESIGN.md §3 の調査(2026-07-10) |

## Phase 0: 準備
- [ ] GitHub リポジトリ作成(public)・npm 0.0.1 publish — verify: `npm view agentslint version`
- [ ] CLAUDE.md / AGENTS.md 実サンプルを fixtures 化 — verify: fixtures で意図した findings が出る

## Phase 1: MVP(ルール AL001–AL005)
- [ ] discover + markdown parse + @import 解決 — verify: `npm test` green
- [ ] AL001 broken-file-reference(valid fixture で誤検知ゼロ)— verify: fixture テスト
- [ ] AL002 stale-command / AL003 token-budget / AL004 skill-frontmatter / AL005 settings-schema — verify: 各 fixture テスト
- [ ] pretty / JSON / SARIF 出力・終了コード — verify: broken fixture で exit 1

## Phase 2: CI 統合
- [ ] SARIF を GitHub code scanning に取り込んで表示確認
- [ ] action.yml — verify: 自リポジトリの PR にアノテーションが付く
- [ ] 自分のアクティブリポジトリ 5 つに導入 — verify: 各リポジトリの CI green

## Phase 3: 公開
- [ ] README 英語化・docs/rules/ 8 ページ(日英)— verify: 自分自身で lint してリンク切れなし
- [ ] good first issue 10 本 + ルール提案テンプレート — verify: issue 数
- [ ] Zenn 記事公開・X 告知 — verify: 記事 URL

## Notes
(実装中の判断・逸脱をここに記録)

## Review
(レビュー結果をここに記録)
