# agentslint

AI コーディングエージェントの設定ファイル(`AGENTS.md` / `CLAUDE.md` / `.claude/` 一式)を CI で検証するリンター。
A CI linter for AI coding agent config files.

壊れた参照パス、存在しないコマンド、肥大化したコンテキスト、不正な skill frontmatter を、コードレビューと同じ場所(PR)で検出します。

## 使い方

### CLI

```bash
npx @toshi0607/agentslint                 # カレントディレクトリ以下を検証
npx @toshi0607/agentslint --format json   # pretty | json | sarif | github
```

グローバルインストール(`npm i -g @toshi0607/agentslint`)後のコマンド名は `agentslint` です。

終了コード: error の指摘があれば 1、なければ 0(CI にそのまま組み込めます)。

### GitHub Action

```yaml
jobs:
  agentslint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: toshi0607/agentslint@v0.0.1
```

指摘は PR の Files changed 上にインラインアノテーションとして表示されます。
GitHub code scanning に取り込む場合:

```yaml
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: toshi0607/agentslint@v0.0.1
        with:
          sarif-file: agentslint.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: agentslint.sarif
```

## ルール

| ID | 名前 | 内容 | 既定 |
|---|---|---|---|
| AL001 | broken-file-reference | リンク・`@import` の参照先ファイルが存在しない | error |
| AL002 | stale-command | 記載コマンドが package.json scripts / Makefile / justfile に存在しない | warn |
| AL003 | token-budget | 概算トークン数が閾値超過(既定 4,000。近似値) | warn |
| AL004 | skill-frontmatter | SKILL.md の frontmatter 検証 | error |
| AL005 | settings-schema | .claude/settings.json の検証 | error |

誤検知を出すくらいなら検知しない、がこのリンターの方針です。AL006〜AL008(secret-pattern / boilerplate / duplicate-heading)は計画中([DESIGN.md](DESIGN.md) 参照)。

## 設定

`.agentslintrc.json`(任意):

```json
{
  "rules": {
    "AL003": { "severity": "warn", "options": { "budget": 8000 } },
    "AL002": "off"
  },
  "ignore": ["fixtures/**"]
}
```

## ドキュメント

- 設計: [DESIGN.md](DESIGN.md)
- 実装計画: [tasks/todo.md](tasks/todo.md)

## License

MIT
