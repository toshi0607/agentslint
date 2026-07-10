# Commands fixture

コメントと文字列内は検知せず、コマンド位置のみ検知する:

```bash
# npm run deploy
echo 'use npm run deploy for prod'
npm run definitely-missing
cd x && npm run also-missing
```
