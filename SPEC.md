# AgentPulse 產品與技術規格

> 版本 0.1（規劃定案）｜2026-11-15
> 狀態：M0 技術驗證已於 2026-11-15 完成，結果見第 9 節；功能尚未開始實作。
> 內文標示「待 M0 驗證」之處，以第 9 節的實測結果為準。其餘沒有在本機實測過的判斷標示為「未實測」。

---

## 1. 產品定位

**一句話：** 在同一個終端機視窗裡，左邊看所有 AI 的狀態，右邊就是當前那個 AI 本人的終端機。

- **使用者：** 作者本人自用。不對外發佈，所以不做簽章、公證、安裝腳本。
- **解決的問題：** 同時開多個 AI coding agent 時，不用輪流切分頁巡視；誰停下來等授權會主動通知；多分支平行開發有隔離與衝突預警。
- **不改變的事：** AI 本身的能力、指令、輸入方式、費用。右側就是原版。

### 不做的事（Non-goals）

| 項目 | 原因 |
|---|---|
| 多主題切換 | 定案為單一極簡配色 |
| 中文介面、i18n | 定案為英文介面 |
| 自製輸入框、自製 `/` 指令選單、指令庫 | 右側是原版 AI，輸入與指令一律由該 AI 自己處理 |
| Y/N、1–9 快捷作答 | 同上，直接在 AI 裡按它要的鍵 |
| 憑證過期燈號 | 無法從檔案可靠判斷；帳號只分 `signed in` / `not set` |
| Markdown 美化、語法高亮 | 右側是原版畫面，不重新排版 |
| 登入、登出功能 | 完全沿用本機各家 CLI 的憑證 |
| 簽章、公證、對外散佈 | 自用 |

---

## 2. 名詞

| 名詞 | 意思 |
|---|---|
| 專案 | 一個 git 儲存庫的主資料夾 |
| 工作階段（session） | 一個正在跑的 AI，綁定一個資料夾與分支 |
| 清單 | 左欄，依專案分組列出所有工作階段 |
| AI 格 | 右側主要區域，顯示被選中工作階段的原版 AI 終端機 |
| 資訊列（HUD） | AI 格上方 3–4 行，顯示該工作階段的環境與進度 |
| 頂列 | 視窗最上面 1 行，顯示總覽與各家帳號狀態 |
| Worktree | 同一個專案的另一個資料夾，簽出在不同分支，讓多個 AI 互不干擾 |

---

## 3. 畫面

```
 AgentPulse  5 sessions · ◐ 1 needs approval · ✕ 1 error        claude ●  codex ●  gemini ○  aider ○
────────────────────────┬───────────────────────────────────────────────────────────────────────
 Sessions               │ fix/login-bug · shop-api · codex                                ○ idle
 / filter               │ gpt-5-codex [high] · MCP github, postgres · skills 4 · AGENTS.md ✓
                        │ ⎇ fix/login-bug · +128 −34 · 42m · output 3s ago · :3000
 ▾ shop-api 2           │ context 82% ━━━━━━━━━━━━━━━━━━━━────  system 18 · chat 64 · free 18
   ◐ feat/checkout      ├── codex ──────────────────────────────────────────────────────────────
   ○ fix/login-bug      │
 ▾ landing-page 2       │   （這一格是 AI 本人的終端機，內容由該 AI 繪製）
   ● main               │
   ✓ feat/hero          │
 ▾ data-pipeline 1      │
   ✕ refactor/etl       │
                        │
 ! conflict · 2 branches│
   src/cart.ts          │
                        │
 ctrl+q back            │
```

**視窗過小：** 終端機視窗小於 70 欄 × 16 行時，清單只顯示 `Window too small` 與所需的最小尺寸，資訊列清空；放大視窗後自動恢復。AI 格照常運作。

### 3.1 配色（單一、不可切換）

| 用途 | 色碼 |
|---|---|
| 底色（深炭灰） | `#1d1e21` |
| 主要文字（淺灰） | `#c9cacd` |
| 次要文字（暗灰） | `#73767d` |
| 分隔線 | `#33353a` |
| 選中列底色 | `#2b2d32` |
| 警示（需要授權、context 過高） | `#d0a24c` |
| 執行中 | `#86b07f` |
| 錯誤 | `#cf7575` |

- 九成文字只用淺灰與暗灰兩階。彩色只用在狀態符號與警示數字。
- AI 格內的顏色由該 AI 自己決定，AgentPulse 不干涉。
- 底色以 tmux `window-style` 套用到整個視窗，包含 AI 格（待 M0 驗證）。

### 3.2 符號

| 符號 | 意思 |
|---|---|
| `●` | running，AI 正在工作 |
| `◐` | needs approval，等你授權或回答 |
| `○` | idle，等你輸入下一句 |
| `✓` | done，剛做完且你還沒看過，或程序正常結束 |
| `✕` | error，程序異常結束或畫面出現錯誤 |
| `▾` `▸` | 專案群組展開、收合 |

- 介面不使用 emoji，避免寬度計算不一致。
- 上述符號屬於東亞「寬度不明確」字元，部分終端機設定會顯示成兩格寬（待 M0 驗證）。設定檔提供 `glyphs: "ascii"` 備援。

---

## 4. 操作

鍵盤焦點同一時間只在一邊：清單，或 AI 格。

### 4.1 焦點在 AI 格

| 按鍵 | 行為 |
|---|---|
| `ctrl+q` | 回到清單。若 AI 格正放大，先還原版面 |
| 其他所有按鍵 | 原樣交給 AI |

`ctrl+q` 是唯一保留鍵，可在設定檔改成別的鍵。

`ctrl+z` 也照樣交給 AI。Claude Code 收到後會暫停自己，AgentPulse 不攔截這個按鍵，而是在偵測到暫停後自動讓它恢復，見 5.3。

### 4.2 焦點在清單

| 按鍵 | 行為 |
|---|---|
| `↑` `↓` 或 `k` `j` | 移動選取，AI 格立即切換到該工作階段 |
| `←` `→` 或 `h` `l` | 收合、展開選中的專案群組；選取在工作階段列時，`←` 收合它所屬的群組並把選取移到群組列 |
| `enter` | 把焦點交給 AI 格，開始打字。選取在專案群組列時改為切換展開／收合 |
| `z` | 把 AI 格放大到滿版並把焦點交給它；按 `ctrl+q` 還原 |
| `n` | 在選中的專案開一個新的工作階段（選 AI） |
| `w` | 為選中的專案建立 worktree 分支並啟動 AI |
| `m` | 把選中的 worktree 分支合併回主線並清理 |
| `x` | 關閉選中的工作階段（需確認） |
| `d` | 檢視該工作階段資料夾的 `git diff` |
| `o` | 用預設瀏覽器開啟偵測到的 `http://localhost:<port>` |
| `/` | 輸入關鍵字篩選清單 |
| `f` | 切換「只看需要處理的」（`◐` 與 `✕`） |
| `c` | 切換選中工作階段的 Auto-Compact |
| `a` | 新增專案（輸入資料夾路徑） |
| `?` | 按鍵說明 |
| `q` | 離開 AgentPulse。所有 AI 繼續在背景執行 |

**以鍵盤操作為主。** 所有功能都必須能只用鍵盤完成，不得有只能用滑鼠才做得到的功能。

滑鼠只是 tmux 內建的附帶行為，不列為必要功能，未實測：點左欄或 AI 格可切換焦點，滾輪可捲動 AI 格歷史，拖曳分隔線可調整左欄寬度。

暫不處理：用鍵盤捲動 AI 格歷史。目前 tmux 的預設按鍵全部解除，捲動歷史只能靠滾輪或 AI 自己的按鍵。使用者 2026-11-15 決定先不加按鍵。

### 4.3 為什麼放大不用 `ctrl+e`

`ctrl+e` 在 Claude Code、Codex、Gemini CLI、Aider 的輸入框裡都是「游標移到行尾」。若被 AgentPulse 攔走，AI 的輸入行為就和原版不同。所以放大改由清單上的 `z` 觸發，`ctrl+q` 還原，保留鍵維持只有一個。

---

## 5. 功能規格

### 5.1 工作階段管理

- 支援四種 AI：Claude Code（`claude`）、Codex CLI（`codex`）、Gemini CLI（`gemini`）、Aider（`aider`）。
- 每個工作階段是專屬 tmux server 上的一個 session，名稱前綴 `agentpulse-`。
- 建立時在 session 上寫入 metadata（tmux user option）：

| Option | 內容 |
|---|---|
| `@ap-agent` | `claude` / `codex` / `gemini` / `aider` |
| `@ap-project` | 專案主資料夾絕對路徑 |
| `@ap-cwd` | 該工作階段的工作資料夾 |
| `@ap-branch` | 建立當下的分支名稱 |
| `@ap-worktree` | 是否為 AgentPulse 建立的 worktree（`1` / `0`） |
| `@ap-created` | 建立時間（epoch 秒） |

- AgentPulse 關閉後工作階段繼續執行；重新開啟時由 tmux 讀回所有 `agentpulse-` session 及其 metadata，不另存狀態檔。
- AI 程序結束後保留該格（`remain-on-exit`），以便讀取結束碼；由使用者按 `x` 關閉。

### 5.2 嵌入與焦點

- AI 格是一個 tmux pane，裡面跑一個連到「工作階段 server」的巢狀 tmux client。
- 在清單移動選取時，對該 client 執行 `switch-client` 切換顯示的 session，不重開程序。
- 工作階段的視窗大小自動跟隨 AI 格大小。
- `enter` / `z` / `ctrl+q` 以 `select-pane` 與 `resize-pane -Z` 實作。

### 5.3 狀態偵測

每秒抓取每個工作階段畫面的最後數十行純文字，交給該 AI 的 adapter 分類。判定順序：

1. 程序已結束：結束碼 0 為 `done`，非 0 為 `error`。
2. 畫面出現錯誤樣式（認證失敗、API 錯誤、額度用盡等）：`error`。
3. 畫面出現授權或選擇提示：`needs approval`。
4. 畫面出現忙碌樣式，或最近 2 秒內畫面有變化：`running`。
5. 其餘：若上一個狀態是 `running` 且此後使用者尚未在 AI 格看過它，為 `done`；否則為 `idle`。

- 各家的樣式規則放在各自的 adapter，並以實際擷取的畫面做成測試案例。
- 這是啟發式判斷，會有誤判；規則需隨各家 CLI 改版維護。
- **卡頓標示：** 狀態為 `running` 且畫面超過 180 秒沒有變化，資訊列顯示 `stalled?`。其他狀態不判定卡頓。
- **暫停自動恢復：** 在 Claude Code 裡按 `ctrl+z`，它會暫停自己、把終端機交還，並等 shell 用 `fg` 叫回。AI 格外層沒有 shell，所以畫面會停在暫停訊息，打 `fg` 也只是把字印在畫面上（M0 實測）。處理方式：
  - 每秒擷取畫面時，由 adapter 的 `isSuspended` 判斷畫面是否停在暫停訊息。成立時對該格的程序群組送出 `SIGCONT`（讓程式繼續執行的系統訊號）。AI 會自行重畫，輸入到一半的文字仍在。
  - 同一個工作階段 3 秒內最多送一次，避免誤判時反覆重畫。
  - 程序已結束的格子不做這項判斷。Claude Code 結束後，畫面會露出先前留下的暫停訊息（M0 實測）。
  - 不攔截按鍵，也不送任何文字給 AI。
  - 不以程序狀態判斷：外層沒有 shell 時，系統不會把程序標成已停止，`ps` 仍顯示執行中（M0 實測）。
  - 不定時對所有 AI 送 `SIGCONT`：Claude Code 每收到一次就整個重畫（M0 實測）。
  - 不在外層包一層 shell：macOS 內建的 `/bin/sh` 在非互動模式下無法可靠地接手被暫停的程式（M0 實測兩種寫法都失敗）。
  - 暫停期間打的字會留在終端機的緩衝區，恢復後送進 AI 的輸入框。恢復通常在 1 秒內發生，影響有限。
  - Claude Code 2.1.325 已實測。其餘三家未實測，`isSuspended` 先一律回傳 `false`。

### 5.4 通知

- 任一工作階段**進入** `needs approval` 或 `error` 時，發送 macOS 系統通知，並讓清單上該列的符號閃爍。
- 進入 `idle`、`done` 不通知，只更新符號。
- 同一工作階段同一狀態 30 秒內不重複通知。
- 當下正顯示在 AI 格且焦點在 AI 格的工作階段不通知。
- 通知以 `osascript` 發送，來源會顯示為「工序指令編寫程式」，需在系統設定允許其通知。

### 5.5 資訊列（HUD）

顯示選中工作階段的資訊，查不到的欄位顯示 `—`。

| 行 | 內容 |
|---|---|
| 1 | 分支 · 專案 · AI 名稱；右側為狀態 |
| 2 | 模型與思考檔位 · MCP 伺服器名稱 · Skills 數量 · 規範檔是否存在 |
| 3 | 分支 · 新增／刪除行數 · 累計執行時間 · 距上次畫面變化多久 · 本機 port |
| 4 | Context 百分比、進度條、結構明細 |

- **規範檔：** Claude Code 看 `CLAUDE.md`，Codex 看 `AGENTS.md`，Gemini 看 `GEMINI.md`。
- **增刪行數：** `git diff HEAD --shortstat`，另計未追蹤檔案數。
- **本機 port：** `lsof` 列出監聽中的 TCP port，比對是否屬於該工作階段的程序樹；並輔以畫面上出現的 `localhost:<port>`。

### 5.6 Context 與 Auto-Compact

- 顯示已用百分比，以及「系統／MCP」「對話」「剩餘」三段明細。
- **明細是估算：** 各家記錄檔只有總量。以該工作階段第一輪的輸入 token 數當作「系統／MCP」基底，其餘算作「對話」。畫面以 `≈` 標示。
- 已用達 80% 時，百分比改以警示色顯示。
- **Auto-Compact** 預設關閉，逐工作階段以 `c` 開關。開啟後，同時滿足以下條件才送出該 AI 的壓縮指令：
  - 已用達 85%
  - 狀態為 `idle`
  - AI 的輸入框是空的
  - 距上次自動壓縮超過 10 分鐘
- 壓縮指令由 adapter 提供（Claude Code、Codex 為 `/compact`，Gemini 為 `/compress`）。Aider 沒有對應指令，不支援。
- 模型的 context 視窗大小由 adapter 內建對照表提供，可在設定檔覆寫；查不到就不顯示百分比。

### 5.7 帳號狀態

頂列顯示四家各一個符號：`●` 為 `signed in`，`○` 為 `not set`。每 60 秒檢查一次。

| AI | 判定為 signed in 的條件（任一成立） |
|---|---|
| Claude Code | 環境變數 `ANTHROPIC_API_KEY`；或 `~/.claude.json` 內有 `oauthAccount` |
| Codex | 環境變數 `OPENAI_API_KEY`；或 `~/.codex/auth.json` 存在 |
| Gemini | 環境變數 `GEMINI_API_KEY`；或 `~/.gemini/oauth_creds.json` 存在 |
| Aider | 任一供應商金鑰環境變數存在 |

- 只檢查「是否存在」，**不讀取、不記錄、不顯示**任何金鑰或 token 的值。
- 認證失敗不另設燈號；畫面出現認證失敗字樣時，該工作階段依 5.3 變為 `error`。

### 5.8 專案清單、搜尋、篩選

- 專案登錄在設定檔。在某個 git 儲存庫內啟動 AgentPulse 時，自動把該儲存庫加入。
- 清單依專案分組，組內列出工作階段（分支名稱與 AI 名稱）。
- `/` 以關鍵字比對專案名、分支名、AI 名稱。`f` 只顯示 `◐` 與 `✕`。

### 5.9 Worktree

**建立（`w`）：** 輸入分支名稱、選擇 AI 後，依序執行：

1. `git worktree add -b <branch> <path> <base>`，路徑為 `<專案上層>/<專案名>.worktrees/<branch>`。
2. 在該資料夾建立工作階段並啟動 AI。
3. 清單出現新的一列。

**合併並清理（`m`）：** 先顯示確認對話框，列出將要執行的每一步，使用者確認後才進行：

1. 檢查該 AI 不在 `running` 狀態，否則中止。
2. 檢查 worktree 是否有未提交的修改；有的話請使用者輸入提交訊息後提交，或取消。
3. 檢查專案主資料夾在主線分支且沒有未提交的修改，否則中止並說明。
4. 在主資料夾執行 `git merge --no-ff <branch>`。
5. 若發生衝突：執行 `git merge --abort`，列出衝突檔案，**不刪除任何東西**。
6. 合併成功後：關閉該工作階段、`git worktree remove <path>`、`git branch -d <branch>`。

- 全程不使用 `--force`、`-D`，不自動捨棄任何修改。
- 不處理推送與 PR。

### 5.10 衝突預警

- 每 15 秒，對有兩個以上工作階段的專案，取得每個工作資料夾「已修改的檔案」：
  - 未提交的修改（`git status --porcelain`）
  - 該分支相對主線已提交的修改（`git diff --name-only <merge-base>...HEAD`）
- 同一個檔案出現在兩個以上的工作資料夾時，在清單下方顯示檔名與涉及的分支數。

### 5.11 Diff 與開啟網頁

- `d`：以 tmux 浮動視窗顯示 `git diff --color=always`，用系統分頁程式捲動（`display-popup`，需 tmux 3.2 以上）。
- `o`：偵測到一個 port 時直接 `open http://localhost:<port>`；多個時先讓使用者選。

### 5.12 後段功能

以下保留在規格內，但排在最後一個階段，核心版用過之後再決定是否實作：

- **多宮格：** AI 格分割為 2 或 4 格，各自連到不同工作階段。
- **廣播：** 勾選多個工作階段後送出同一段文字；略過狀態為 `needs approval` 的工作階段。
- **Token 統計：** 彙整各模型的 token 用量。
- **外部工作階段：** 掃描使用者自己在預設 tmux server 手動啟動的 AI，依程序樹辨識身分後列入清單。
- **WSL：** 平台介面已預留，尚無實作。

---

## 6. 技術架構

### 6.1 技術棧

| 項目 | 選擇 |
|---|---|
| 語言 | TypeScript（strict） |
| 介面 | `ink` 8 + `react` 19.3 |
| 寬度計算 | `string-width` |
| 執行與打包 | Bun 1.4 以上，`bun build --compile` |
| 外部程式 | 系統的 `tmux`（3.2 以上）、`git`、`lsof`、`ps`、`osascript`、`open` |

- **禁止原生模組：** 不使用 `node-pty` 或任何需要 C++ 編譯的套件。
- **`react-devtools-core` 必須列為 devDependency。** Ink 內有一個只在除錯時載入的匯入，不安裝的話 `bun build --compile` 會因無法解析而失敗（M0 實測）。它不會在執行時被用到。
- 原始需求指定的 `cli-table3`、`cli-highlight` 已因 Markdown 美化取消而移除。
- TOML 以 Bun 內建的 `Bun.TOML` 解析，不加套件。

### 6.2 程序與 tmux 拓樸

使用兩個專屬 tmux server，皆以 AgentPulse 產生的設定檔啟動，**不讀取也不修改使用者的 `~/.tmux.conf` 與預設 server**。

| Server（socket） | 內容 |
|---|---|
| `agentpulse-ui` | 一個 session、一個視窗，內含清單格、資訊列格、AI 格 |
| `agentpulse` | 每個工作階段一個 session |

啟動流程：

1. 使用者執行 `AgentPulse`。程式檢查 `tmux`、`git` 是否存在（找不到時依序嘗試 `/opt/homebrew/bin`、`/usr/local/bin`）。
2. 若 UI session 不存在：產生兩份 tmux 設定檔，建立 UI session 與版面，在清單格啟動 `AgentPulse --role=sidebar`。
3. 以繼承終端機的方式執行 `tmux -L agentpulse-ui attach`，等它結束後程式結束。

- **清單格** 跑唯一的常駐程式：Ink 介面、背景輪詢、狀態儲存都在這個程序。
- **資訊列與頂列** 由清單程序產生文字後輸出，不另開程序。
  - 資訊列是一個 4 行的窄格，清單程序直接寫入該格的 tty（M0 已驗證）。該格以 `select-pane -d` 停用輸入。
  - 頂列是 tmux 的 status，以 `status-format[0]` 設定。
  - AI 格上方的標籤線（例如 `── claude ──`）是 tmux 的 `pane-border-status`，文字取自該格的 `@ap-label`。
- **AI 格** 跑巢狀 client：`tmux -L agentpulse attach -t <session>`。

兩個 server 的設定重點：

| 設定 | UI server | 工作階段 server |
|---|---|---|
| prefix | 停用 | 停用 |
| 預設按鍵 | 全部解除，只綁 `ctrl+q` | 全部解除 |
| status | 頂部 1 行 | 關閉 |
| mouse | 開 | 開 |
| `escape-time` | 0 | 0 |
| 真彩色、延伸按鍵 | 開 | 開 |
| `remain-on-exit` | — | 開 |
| `history-limit` | — | 50000 |

M0 已確認的實作要點：

- **所有 tmux 指令都加 `-u`**，並在環境沒有 UTF-8 語系時補上 `LANG=en_US.UTF-8`。否則巢狀 client 會把中文與框線降為 ASCII。
- **啟動巢狀 client 前清除 `TMUX` 環境變數**（`env -u TMUX`），否則 tmux 拒絕巢狀連線。
- **切換工作階段：** `switch-client -c <AI 格的 tty> -t <session>`。工作階段視窗大小會自動跟隨 AI 格。
- **固定格子大小：** 左欄寬度與資訊列高度掛在 `window-resized` hook 重設。不可用 `client-resized`，它在 tmux 重排版面之前觸發，設定會被蓋掉。
- **焦點偵測：** `window-pane-changed` hook 以訊號（`SIGUSR1`）通知清單程序，另以低頻輪詢 `#{pane_active}` 保底。
- **環境隔離：** 啟動工作階段 server 時清除 `CLAUDE*` 與 `CLAUDECODE` 環境變數，避免從另一個 Claude Code 內啟動時影響內層 AI。
- **Ink 設定：** 使用 `alternateScreen: true`，不開 `incrementalRendering`（格子縮放後會留下殘影）。

巢狀 tmux 實測可行，原先規劃的 `swap-pane` 備援不採用。

### 6.3 模組

```
src/
  index.tsx          入口：依 --role 分流（啟動流程 / 清單程式）
  bootstrap/         相依檢查、產生 tmux 設定、建立版面、attach
  app/               清單程式的組裝：鍵盤路由、焦點狀態、對話框狀態機
  ui/                Ink 元件（只讀 state）
    SessionList  GroupRow  SessionRow  ConflictNote  KeyHints
    dialogs/         新增工作階段、worktree、合併確認、關閉確認、說明
    theme.ts         配色與符號常數
    text.ts          string-width 包裝：截斷、補白、對齊
  hud/               資訊列與頂列的排版（純函式）與輸出
  state/             單一 store、selectors、actions
  services/          背景邏輯，無 UI
    scheduler.ts     分級輪詢
    sessions.ts      工作階段生命週期
    layout.ts        AI 格切換、放大、多宮格
    status/          狀態分類、卡頓、通知觸發
    context/         用量、Auto-Compact
    accounts.ts  worktree.ts  conflictRadar.ts  ports.ts  tokens.ts
  agents/            每家 AI 一個 adapter
    types.ts  claude.ts  codex.ts  gemini.ts  aider.ts
  infra/             對外唯一出口
    exec.ts          Bun.spawn 包裝：逾時、併發上限、錯誤分類
    tmux.ts  git.ts  fsx.ts
    signal.ts        對程序群組送訊號（暫停自動恢復用）
    platform/        types.ts  darwin.ts  wsl.ts（預留）
  config/            設定檔讀寫
```

**相依方向只能單向：** `ui → state → services → agents / infra`。

- `ui/` 不得直接呼叫 `infra/`。
- `infra/` 不得匯入上層任何模組。
- 所有外部程式呼叫都必須經過 `infra/exec.ts`。

### 6.4 Adapter 介面

```ts
type AgentId = 'claude' | 'codex' | 'gemini' | 'aider';
type AgentState = 'running' | 'needs-approval' | 'idle' | 'done' | 'error';

interface AgentAdapter {
  id: AgentId;
  displayName: string;
  rulesFile: string | null;               // CLAUDE.md / AGENTS.md / GEMINI.md
  compactCommand: string | null;          // '/compact' | '/compress' | null

  launchCommand(opts: { cwd: string }): string[];
  matchProcess(commandLine: string): boolean;        // 辨識外部工作階段
  classify(screen: string): Exclude<AgentState, 'done'> | null;
  isInputEmpty(screen: string): boolean;             // Auto-Compact 前確認
  isSuspended(screen: string): boolean;              // 畫面停在暫停訊息，見 5.3

  accountStatus(): Promise<'signed-in' | 'not-set'>;
  mcpServers(cwd: string): Promise<string[]>;
  skillsCount(cwd: string): Promise<number>;
  sessionInfo(ctx: { cwd: string; sessionId?: string }): Promise<{
    model?: string;
    effort?: string;
    context?: { used: number; window: number; baseline: number };
    tokens?: { input: number; output: number };
  }>;
}
```

新增一家 AI 只需要新增一個 adapter 檔並註冊，其他模組不改。

### 6.5 Platform 介面

```ts
interface Platform {
  binDirs: string[];                       // PATH 找不到程式時依序嘗試的資料夾
  notify(title: string, body: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  listeningPorts(): Promise<Array<{ pid: number; port: number }>>;
  processTree(): Promise<Array<{ pid: number; ppid: number; command: string }>>;
}
```

第一階段只實作 `darwin.ts`。`wsl.ts` 僅保留介面，呼叫時丟出「尚未支援」。`binDirs` 在 M1 加入：macOS 為 `/opt/homebrew/bin`、`/usr/local/bin`，讓 6.2 啟動流程第 1 步的備援路徑不寫死在平台模組以外。其餘方法隨 M3、M4 實作。

### 6.6 輪詢排程

| 頻率 | 工作 |
|---|---|
| 1 秒 | 擷取所有工作階段畫面並分類狀態；恢復被暫停的 AI（5.3） |
| 2 秒 | 選中工作階段的記錄檔是否更新（context、模型） |
| 5 秒 | 選中工作階段的 git 統計與 port；其他工作階段每 30 秒 |
| 15 秒 | 衝突預警 |
| 60 秒 | 帳號狀態、MCP、Skills、規範檔 |

- 同一類工作上一輪尚未完成時，略過這一輪，不堆疊。
- 外部程式同時執行數量設上限，逾時即放棄並保留上一次結果。

### 6.7 設定檔

位置：`~/.config/agentpulse/config.json`。同資料夾另放兩份自動產生的 tmux 設定檔。

```json
{
  "projects": ["/absolute/path/to/repo"],
  "sidebarWidth": 30,
  "notifications": true,
  "glyphs": "unicode",
  "keys": { "back": "C-q" },
  "autoCompact": {
    "enabledByDefault": false,
    "warnAt": 80,
    "triggerAt": 85,
    "cooldownMinutes": 10
  },
  "contextWindows": {}
}
```

`contextWindows` 是「模型名稱 → context 視窗 token 數」的覆寫表。

### 6.8 各家資料來源

| 項目 | Claude Code | Codex | Gemini | Aider |
|---|---|---|---|---|
| 模型、思考檔位 | 工作階段記錄檔的 `message.model`、`effort` | `~/.codex/config.toml` | `~/.gemini/settings.json` | 啟動畫面 |
| Context 用量 | 記錄檔最後一筆 `message.usage` | 工作階段記錄檔 | 畫面底部狀態 | 無 |
| MCP | `~/.claude.json`、專案 `.mcp.json` | `config.toml` 的 `mcp_servers` | `settings.json` 的 `mcpServers` | 無 |
| Skills | `~/.claude/skills/`、專案 `.claude/skills/` | — | — | — |
| 本機實測 | 記錄檔欄位已確認存在 | 未實測 | 未實測 | 未實測 |

- Claude Code 記錄檔位置：`~/.claude/projects/<路徑代碼>/<sessionId>.jsonl`。啟動時指定 session id 以便精確對應（旗標待 M0 驗證）；無法指定時取該資料夾最新的記錄檔。
- Codex、Gemini、Aider 目前未安裝於開發機，相關實作只能依官方文件撰寫，完成後需標示未實測，直到實機驗證。

---

## 7. 打包與執行

`package.json` 必須包含：

```json
{
  "name": "agentpulse",
  "scripts": {
    "build:mac": "bun build ./src/index.tsx --compile --outfile dist/AgentPulse"
  }
}
```

- 產物 `dist/AgentPulse` 是內含 Bun 執行環境的單一執行檔，複製到桌面後可雙擊開啟（會開在 Terminal.app）。
- 本機編譯的檔案沒有隔離標記，自用不需要簽章。
- 雙擊啟動時工作目錄是家目錄，所以專案來源以設定檔的 `projects` 為準。
- 執行時仍需要系統已安裝 `tmux` 與 `git`，以及至少一家 AI 的 CLI。

---

## 8. 相對原始需求的調整紀錄

| 原始需求 | 定案 | 原因 |
|---|---|---|
| 右側以 `capture-pane` 鏡像畫面 | 改為嵌入原版 AI 終端機 | 輸入與原版完全一致、沒有延遲 |
| 5 套主題、`T` 鍵 | 移除 | 改為單一極簡配色 |
| 預設繁中、`L` 鍵切英文 | 移除，只留英文 | 使用者決定 |
| 底部獨立輸入框、`I` 鍵 | 移除 | 直接在 AI 格輸入 |
| Y/N、1–9 快捷作答 | 移除 | 同上；且固定送 `n` + Enter 在選單式提示有誤核准風險 |
| 智慧指令轉譯器、官方指令庫、自訂指令掃描 | 移除 | 由各 AI 原生選單處理 |
| `Ctrl+V` 匯出剪貼簿圖片到 `/tmp` | 移除 | 由各 AI 原生貼圖機制處理 |
| Markdown 美化、`cli-table3`、`cli-highlight` | 移除 | 右側是原版畫面 |
| 憑證過期紅燈 | 移除 | 無法從檔案可靠判斷 |
| `Esc` 進入導航模式 | 改為 `ctrl+q` 回清單 | `Esc` 是各 AI 的中斷鍵，必須交給 AI |
| `Ctrl+E` 切入原版終端機 | 改為清單上的 `z` 放大 | 右側已是原版；`ctrl+e` 是 AI 輸入框的行尾鍵 |
| `Ctrl+Q` 綁在個別 session | 綁在專屬 UI server | tmux 按鍵綁定是 server 層級 |
| 卡頓：非等待授權且 3 分鐘無輸出 | 只在 `running` 時判定 | 否則閒置的工作階段全被標成卡頓 |
| ✅ 已完成 | 定義為「剛結束且未看過」或程序正常結束 | 互動式 CLI 的完成與等待輸入畫面相同 |
| PageUp / PageDown 翻歷史 | 由 tmux 原生捲動與滑鼠滾輪處理 | 嵌入後不需自製 |
| 多宮格、廣播、Token 統計、外部 tmux 掃描 | 保留，排在最後階段 | 自用優先做核心功能 |
| 滑鼠操作（點選、滾輪、拖曳） | 不列為必要功能，未實測；所有功能必須能只用鍵盤完成 | 使用者決定全程在終端機以鍵盤操作 |
| （原始需求未涵蓋）專案群組的展開收合 | `←` `→`、`h` `l`；群組列上按 `enter` 也可切換 | M1 實作時補上，沿用常見的樹狀清單慣例 |
| （原始需求未涵蓋）視窗過小 | 小於 70 × 16 時清單改顯示提示 | M0 發現 80 × 24 可用但擁擠；再小時左欄 30 欄會擠壓 AI 格 |
| （原始需求未涵蓋）在 AI 格按 `ctrl+z` | 不攔截按鍵；偵測到暫停畫面後自動送 `SIGCONT` 恢復 | 嵌入後外層沒有 shell，無法用 `fg` 叫回，畫面會卡住 |

---

## 9. 風險與 M0 驗證項目

M0 於 2026-11-15 在 macOS 26.6.2、tmux 3.8、Bun 1.4.4、Ink 8.0.0、Claude Code 2.1.322 上實測。驗證程式在 `spike/m0/`。

| 編號 | 驗證項目 | 結果 |
|---|---|---|
| G1 | `bun build --compile` 產出的執行檔能啟動並顯示 Ink 清單，中英文混排對齊 | 通過。執行檔 87 MB。需 `react-devtools-core` 為 devDependency |
| G2 | 巢狀 tmux 下 Claude Code 與直接執行時相同 | 自動驗證通過：24-bit 色彩完整傳遞；按鍵回顯中位數由 23 ms 增為 29 ms；貼上 3000 行 log 正常；Shift+Enter 可換行。貼圖未測。打字手感經使用者試打確認正常 |
| G3 | `ctrl+q` 回清單、`z` 放大、`enter` 交出焦點；清單程式能得知自己是否有焦點 | 通過 |
| G4 | 資訊列以「寫入窄格 tty」繪製，縮放視窗後正確重畫 | 通過（四種視窗大小） |
| G5 | 關閉終端機後重新啟動，工作階段與對話仍在 | 通過。未送出的輸入文字也保留 |
| G6 | 從 Finder 啟動時能找到 `tmux` 與 `git` | 通過。Terminal.app 提供的 PATH 已含 Homebrew 與 nvm |
| G7 | 狀態符號為一格寬 | Terminal.app 通過（實測游標位移）。iTerm2 未測 |
| G8 | `ctrl+q` 在 AI 中沒有重要用途 | Claude Code 通過。其餘三家未安裝，未測 |

M0 另外發現：

- 專案位於「文件」資料夾時，第一次從 Terminal.app 啟動會跳出 macOS 的資料夾存取詢問，允許之前程式會停住。
- Terminal.app 預設視窗為 80x24，版面可運作但擁擠，需要定義視窗過小時的呈現方式。
- 在 Claude Code 裡按 `ctrl+z` 會讓它暫停，嵌入格裡無法用 `fg` 叫回（使用者試用時發現，Claude Code 2.1.325）。對策與實測結果見 5.3「暫停自動恢復」。

其他已知風險：

- **狀態誤判：** 畫面樣式隨各家 CLI 改版而變，需持續維護規則與測試案例。
- **三家未實測：** Codex、Gemini、Aider 未安裝，其 adapter 完成後仍屬未驗證。
- **合併操作：** 涉及使用者的 git 歷史，所有步驟必須先確認、失敗即還原。
