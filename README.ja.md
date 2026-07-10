# agentslint(日本語版)

AI コーディングエージェントの設定ファイル(`AGENTS.md` / `CLAUDE.md` / `.claude/` 一式)を CI で検証するリンター。

エージェント設定は静かに腐ります。ドキュメントは移動され、スクリプトはリネームされ、skill は壊れ — エージェントは現実と食い違った指示にトークンを浪費しながら静かに劣化します。agentslint はそれを、他のリグレッションと同じ場所(CI)で検出します。

![agentslint demo](docs/demo.svg)

意図的に壊してあるデモプロジェクトで再現できます:

```bash
git clone https://github.com/toshi0607/agentslint && cd agentslint/examples/demo
npx @toshi0607/agentslint
```

## 使い方

### CLI

```bash
npx @toshi0607/agentslint                 # カレントディレクトリ以下を検証
npx @toshi0607/agentslint --format json   # pretty | json | sarif | github
```

終了コード: error の指摘があれば 1、なければ 0。グローバルインストール(`npm i -g @toshi0607/agentslint`)後のコマンド名は `agentslint` です。

### GitHub Action

```yaml
jobs:
  agentslint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: toshi0607/agentslint@v0.0.1
```

指摘は PR の Files changed 上にインラインアノテーションとして表示されます。SARIF での code scanning 連携は [README.md](README.md#code-scanning-sarif) を参照してください。

## ルール

| ID | 名前 | 内容 | 既定 |
|---|---|---|---|
| AL001 | broken-file-reference | リンク・`@import` の参照先ファイルが存在しない | error |
| AL002 | stale-command | 記載コマンドが package.json scripts / Makefile / justfile に存在しない | warn |
| AL003 | token-budget | 概算トークン数が閾値超過(既定 4,000。近似値) | warn |
| AL004 | skill-frontmatter | SKILL.md の frontmatter 検証 | error |
| AL005 | settings-schema | .claude/settings.json の検証 | error |

AL006〜AL008(secret-pattern / boilerplate / duplicate-heading)は計画中([DESIGN.md](DESIGN.md) 参照)。

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

## 方針: 誤検知ゼロ

リンターの信頼は「間違えないこと」で決まります。agentslint は意図的にアンダーマッチします — コードフェンス内はスキップ、コマンドはコマンド位置のみマッチ(コメント・文字列内は対象外)、散文中の `@scope/package` は import 扱いしません。確信が持てない検知は黙ります。

## ドキュメント

- [English README](README.md)
- 設計: [DESIGN.md](DESIGN.md) / 実装計画: [tasks/todo.md](tasks/todo.md)

## License

[MIT](LICENSE)
