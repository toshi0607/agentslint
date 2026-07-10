# agentslint

AI コーディングエージェントの設定ファイル(`AGENTS.md` / `CLAUDE.md` / `.claude/` 一式)を CI で検証するリンター。

**ステータス: MVP 実装済み**(未公開・公開準備中)

- 設計: [DESIGN.md](DESIGN.md)
- 実装計画: [tasks/todo.md](tasks/todo.md)

```
# 将来の姿
npx agentslint          # ローカル実行
uses: toshi0607/agentslint@v1   # GitHub Action
```

壊れた参照パス、存在しないコマンド、肥大化したコンテキスト、不正な skill frontmatter を、コードレビューと同じ場所(PR)で検出します。
