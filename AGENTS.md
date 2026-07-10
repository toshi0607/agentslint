# agentslint

AI コーディングエージェント設定ファイル(AGENTS.md / CLAUDE.md / .claude/ 一式)を CI で検証するリンター。TypeScript / Node 20+ / ESM。

## コマンド

- ビルド: `npm run build`(tsc)
- テスト: `npm run test`(vitest。pretest でビルドが走る)

## 構成

- [src/cli.ts](src/cli.ts) — エントリポイント(引数解釈・終了コード)
- [src/discover.ts](src/discover.ts) — 対象ファイル探索(.gitignore 尊重)
- [src/rules/](src/rules/) — ルール実装(1 ルール 1 ファイル、`Rule` 契約)
- [src/report/](src/report/) — pretty / json / sarif / github の各フォーマッタ
- [fixtures/](fixtures/) — テストデータ。`broken/` と `regression/` は意図的に壊れたファイルを含む
- [examples/demo/](examples/demo/) — README 用のデモプロジェクト(意図的に壊れている。self-lint では ignore)
- [DESIGN.md](DESIGN.md) — 設計ドキュメント

## 規約

- 誤検知を出すくらいなら検知しない(このリンターの憲法。迷ったらアンダーマッチに倒す)
- ルール追加は「実装 + テスト + docs」の 3 点セット
- 実行時依存は unified / remark-parse / yaml のみ。追加は要議論
