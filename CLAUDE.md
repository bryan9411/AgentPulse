# AgentPulse 開發規範

AgentPulse 是自用的終端機工具：左欄列出所有 AI coding agent 的狀態，右側嵌入當前那個 AI 本人的終端機。完整規格見 `SPEC.md`，進度見 `PROGRESS.md`。

## 每次開工先做

1. 讀 `PROGRESS.md` 的「目前位置」，確認現在在哪個階段、下一步是什麼。
2. 讀 `SPEC.md` 中與該步驟相關的章節。
3. 一次只做一個階段；M0 的驗證項目全部通過之前，不寫功能程式碼。

## 溝通與文件語言

- 與使用者的對話、三份文件、commit 以外的說明文字：**繁體中文，台灣用語**（檔案、資料夾、程式碼、設定、預設、視窗、終端機）。
- 程式碼、識別字、註解、介面上的所有文字：**英文**。介面沒有中文模式。
- 使用者不一定熟悉終端機慣例。提到按鍵時寫 `ctrl+q`，不要寫 `^Q`；用到術語時用一句白話說明。

## 指令

```bash
bun install            # 安裝相依套件
bun run dev            # 開發模式執行（等同 bun run src/index.tsx）
bun test               # 執行測試
bunx tsc --noEmit      # 型別檢查
bun run build:mac      # 產出 dist/AgentPulse
```

`package.json` 的 `name` 必須是 `agentpulse`，`build:mac` 必須是：

```
bun build ./src/index.tsx --compile --outfile dist/AgentPulse
```

不得為這個指令加上額外參數；需要調整打包行為時，改用相依套件或設定檔解決。

## 鐵律

違反以下任何一條都必須先停下來問使用者。

1. **不使用原生模組。** 禁止 `node-pty` 與任何需要 C++ 編譯的套件。
2. **執行期相依套件只有 `ink`、`react`、`string-width`。** 新增任何執行期套件前先取得同意，並確認它能被 `bun build --compile` 打包。`react-devtools-core` 必須留在 devDependencies，移除會讓編譯失敗。
3. **外部程式一律經過 `src/infra/exec.ts`。** 不在其他地方直接呼叫 `Bun.spawn` 或 `child_process`。
4. **不碰使用者的 tmux。** 只使用 `agentpulse-ui` 與 `agentpulse` 兩個專屬 socket 與自己產生的設定檔；不讀寫 `~/.tmux.conf`，不對預設 server 下任何會改變狀態的指令。
5. **只保留一個按鍵。** 焦點在 AI 格時，除了 `ctrl+q` 以外的所有按鍵都必須原樣交給 AI。不得新增第二個全域按鍵。
6. **不自製 AI 的輸入與指令。** 不做輸入框、不做 `/` 選單、不維護指令庫、不替使用者回答授權提示。
7. **不讀取憑證內容。** 帳號狀態只檢查環境變數與檔案「是否存在」；不讀取、不記錄、不顯示金鑰或 token 的值。
8. **git 破壞性操作必須先確認。** 合併、移除 worktree、刪除分支前顯示將執行的每一步；不使用 `--force`、`-D`、`reset --hard`、`clean`；合併衝突一律 `git merge --abort`，不刪除任何東西。
9. **Auto-Compact 預設關閉。** 只有在 `SPEC.md` 5.6 的四個條件同時成立時才送出指令。
10. **未實測就明說。** 沒有在本機實際跑過的行為，在程式註解、`PROGRESS.md` 與回報中都標示「未實測」，不得寫成已完成。

## 架構規則

模組配置見 `SPEC.md` 6.3。相依方向只能單向：

```
ui → state → services → agents / infra
```

- `ui/` 只讀 `state/`，不直接呼叫 `services/`、`agents/`、`infra/`。
- `infra/` 不匯入任何上層模組。
- 各家 AI 的差異只能出現在 `src/agents/<id>.ts`。其他模組不得出現 `if (agent === 'claude')` 這類判斷。
- 作業系統差異只能出現在 `src/infra/platform/`。
- `hud/` 的排版函式必須是純函式（輸入資料與寬度，輸出字串陣列），以便測試。

## 介面規則

- **配色只用 `src/ui/theme.ts` 的常數**，色碼見 `SPEC.md` 3.1。九成文字只用主要文字與次要文字兩階；彩色只用於狀態符號與警示數字。
- **不使用 emoji。** 狀態符號只用 `SPEC.md` 3.2 的那一組，並支援 `glyphs: "ascii"` 備援。
- **所有寬度計算都經過 `src/ui/text.ts`**（`string-width` 的包裝）。不得用 `.length` 計算顯示寬度，路徑與分支名稱可能含中文。
- 不畫圓角框、不加裝飾性邊框。分隔只用細線與留白。
- 終端機視窗縮放時，清單與資訊列必須重新排版，不得出現殘影或折行錯位。

## tmux 慣例

- 工作階段 session 名稱以 `agentpulse-` 開頭。
- Metadata 存在 session 的 user option，名稱以 `@ap-` 開頭，欄位見 `SPEC.md` 5.1。
- AgentPulse 不另存工作階段狀態檔；重新啟動時一律從 tmux 讀回。
- 所有 tmux 指令都加 `-u`；環境沒有 UTF-8 語系時補上 `LANG=en_US.UTF-8`。
- 固定格子大小掛在 `window-resized` hook，不用 `client-resized`。
- Ink 以 `alternateScreen: true` 啟動，不開 `incrementalRendering`。
- 其餘經 M0 實測的做法見 `SPEC.md` 6.2，可參考 `spike/m0/src/index.tsx`。
- 送字給 AI 只有一個情境：Auto-Compact。使用 `send-keys -l` 送出文字，稍候再送 `Enter`。

## 程式風格

- TypeScript `strict`。不使用 `any`；真的需要時用 `unknown` 加型別收窄。
- 使用具名匯出，不使用 default export（Ink 根元件除外）。
- 檔名：元件用 `PascalCase.tsx`，其他用 `camelCase.ts`。
- 非同步外部呼叫都要有逾時；失敗時保留上一次的結果並記錄，不讓整個介面中斷。
- 輪詢工作上一輪未完成時略過本輪，不堆疊。
- 註解只寫「為什麼」，不重述程式碼在做什麼。

## 測試

- 使用 `bun test`。
- **狀態分類必須有測試案例：** 每個 adapter 的 `classify` 以實際擷取的畫面文字為輸入，放在 `tests/fixtures/<agent>/`。新增或修改規則時同步新增案例。
- `hud/` 排版函式、`ui/text.ts`、衝突預警的交集計算、worktree 流程的前置檢查，都要有單元測試。
- 涉及 git 的測試一律在暫存資料夾建立臨時儲存庫，不得操作本專案或使用者的儲存庫。
- 需要 tmux 的整合測試使用獨立的測試 socket，結束時關閉該 server。

## 版本控制

- `PROGRESS.md` **不進 git**（已列在 `.gitignore`）。`CLAUDE.md` 與 `SPEC.md` 進 git。
- 只有在使用者要求時才 commit 或 push。
- 規格有任何變動，先改 `SPEC.md`（含第 8 節的調整紀錄），再改程式。

## 完成一項工作的定義

1. 型別檢查與測試通過。
2. 實際執行過並確認行為；無法實測的部分已標示。
3. `PROGRESS.md` 已更新：勾選完成項目、填寫驗證方式、更新「目前位置」。
