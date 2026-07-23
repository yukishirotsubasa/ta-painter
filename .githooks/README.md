# .githooks

版本控管的 git hooks。git 預設不會使用這個目錄，每個 clone 需執行一次：

```bash
git config core.hooksPath .githooks
```

| Hook | 作用 |
|---|---|
| `pre-push` | 本次 push 的 commit 若動到 `web/`，執行 `npm run typecheck`（`tsc -b`）；失敗則中止 push。 |

緊急略過：`git push --no-verify`。
