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
 AgentPulse  5 sessions · ◐ 1 needs approval · ✕ 1 error        claude ●  codex ●  agy ○
────────────────────────┬───────────────────────────────────────────────────────────────────────
 Sessions               │ fix/login-bug · shop-api · codex                                ○ idle
 / filter               │ gpt-5-codex [high] · MCP github, postgres · skills 4 · AGENTS.md ✓
                        │ ⎇ fix/login-bug · +128 −34 · 42m · output 3s ago · :3000
 ▾ shop-api 2           │ context 82% ━━━━━━━━━━━━━━━━━━━━────  ≈ system 18 · chat 64 · free 18
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

### 3.3 介面語言

- 預設英文；焦點在清單時按 `t` 切換成繁體中文，再按一次切回英文。選擇寫回設定檔 `language`，下次啟動沿用。
- 中文用台灣用語，而且要白話：不搬規格內部名詞（例如不寫「AI 格」，寫「右邊」「跟 AI 對話」），用位置與動作描述。
- 翻譯範圍：清單、操作提示、對話框、資訊列、頂列、通知、AI 結束後的提示列、無工作階段時的佔位文字，以及之後的 `?` 說明畫面與 M6 各流程畫面。
- 不翻譯：按鍵名稱（`ctrl+q`、`enter`、`esc`）、分支、專案、模型名稱、`MCP`、`Skills`、檔名、記錄檔內容。
- 會改變資料或需要確認的畫面（合併、移除 worktree 等），兩種語言都要逐步列出接下來會發生什麼。
- 所有介面文字集中在 `src/i18n/` 字典，兩種語言的條目由型別檢查保證一一對應。
- 佔位文字畫在 tmux 格子啟動當下；切換語言後，要等該格下一次重畫才換成新語言。

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
| `w` | 為選中的專案建立 worktree 分支並啟動 AI，見 5.9 |
| `m` | 把選中的 worktree 分支合併回主線並清理；只對 `w` 建立的工作階段有作用，見 5.9 |
| `x` | 關閉選中的工作階段（需確認） |
| `d` | 以浮動視窗檢視該工作階段資料夾的修改，見 5.11 |
| `o` | 用預設瀏覽器開啟偵測到的 `http://localhost:<port>`，見 5.11 |
| `/` | 輸入關鍵字篩選清單，邊打邊篩；`enter` 保留關鍵字回到清單，`esc` 清除 |
| `f` | 切換「只看需要處理的」（`◐` 與 `✕`） |
| `esc` | 篩選中時清除關鍵字與 `f` |
| `a` | 新增專案（輸入資料夾路徑） |
| `?` | 按鍵說明 |
| `t` | 切換介面語言（English／繁體中文），見 3.3 |
| `q` | 離開 AgentPulse。所有 AI 繼續在背景執行 |

**以鍵盤操作為主。** 所有功能都必須能只用鍵盤完成，不得有只能用滑鼠才做得到的功能。

滑鼠只是 tmux 內建的附帶行為，不列為必要功能，未實測：點左欄或 AI 格可切換焦點，滾輪可捲動 AI 格歷史，拖曳分隔線可調整左欄寬度。

暫不處理：用鍵盤捲動 AI 格歷史。目前 tmux 的預設按鍵全部解除，捲動歷史只能靠滾輪或 AI 自己的按鍵。使用者 2026-11-15 決定先不加按鍵。

### 4.3 為什麼放大不用 `ctrl+e`

`ctrl+e` 在 Claude Code、Codex 的輸入框裡都是「游標移到行尾」（agy 未實測）。若被 AgentPulse 攔走，AI 的輸入行為就和原版不同。所以放大改由清單上的 `z` 觸發，`ctrl+q` 還原，保留鍵維持只有一個。

---

## 5. 功能規格

### 5.1 工作階段管理

- 支援三種 AI：Claude Code（`claude`）、Codex CLI（`codex`）、Antigravity CLI（`agy`）。
- 每個工作階段是專屬 tmux server 上的一個 session，名稱前綴 `agentpulse-`。
- 建立時在 session 上寫入 metadata（tmux user option）：

| Option | 內容 |
|---|---|
| `@ap-agent` | `claude` / `codex` / `agy` |
| `@ap-project` | 專案主資料夾絕對路徑 |
| `@ap-cwd` | 該工作階段的工作資料夾 |
| `@ap-branch` | 建立當下的分支名稱 |
| `@ap-worktree` | 是否為 AgentPulse 建立的 worktree（`1` / `0`） |
| `@ap-created` | 建立時間（epoch 秒） |
| `@ap-agent-session` | AI 自己的對話 id，用來找記錄檔（Claude Code 以 `--session-id` 指定；不支援指定的 AI 留空） |
| `@ap-base` | worktree 建立當下主資料夾所在的分支，也就是之後合併回去的主線；不是 worktree 時留空 |

- AgentPulse 關閉後工作階段繼續執行；重新開啟時由 tmux 讀回所有 `agentpulse-` session 及其 metadata，不另存狀態檔。
- AI 程序結束後保留該格（`remain-on-exit`），以便讀取結束碼；由使用者按 `x` 關閉。
- 結束後格子底部以 `remain-on-exit-format` 顯示 `AI exited (status N) · ctrl+q, then x to close`，清單列顯示 `✓`（結束碼 0）或 `✕`（非 0），資訊列右側顯示 `exited (N)`。使用者常以 `ctrl+c` 想離開，結果只結束了 AI，這行文字讓畫面不會看起來像卡住。
- 工作階段名稱為 `agentpulse-` 加一段隨機碼。metadata 與 `new-session` 在同一次 tmux 呼叫中寫入，輪詢不會讀到沒有 metadata 的工作階段；沒有 `@ap-agent` 的 session 一律忽略。
- 工作階段所屬的專案若已不在設定檔，清單仍會列出該專案群組，確保每個工作階段都看得到、關得掉。
- `n` 建立後立即切到該工作階段並把焦點交給 AI 格。工作資料夾為專案主資料夾，`@ap-branch` 取當下分支。

### 5.2 嵌入與焦點

- AI 格是一個 tmux pane，裡面跑一個連到「工作階段 server」的巢狀 tmux client。
- 在清單移動選取時，對該 client 執行 `switch-client` 切換顯示的 session，不重開程序。
- 工作階段的視窗大小自動跟隨 AI 格大小。
- `enter` / `z` / `ctrl+q` 以 `select-pane` 與 `resize-pane -Z` 實作。
- AI 格在沒有工作階段時顯示佔位文字。需要顯示某個工作階段而 AI 格還沒有巢狀 client 時（第一個工作階段、UI 重建後），以 `respawn-pane` 把 AI 格換成連到該工作階段的 client；之後一律 `switch-client`。
- 工作階段 server 設 `detach-on-destroy off`：關閉正在顯示的工作階段時，client 自動換到其他工作階段而不是離開。最後一個也關掉時 client 結束，AI 格退回佔位文字，版面不受影響。
- 重新啟動後第一次讀到工作階段時，選取停在第一個工作階段，AI 格直接接回。

### 5.3 狀態偵測

每秒抓取每個工作階段畫面的最後數十行純文字，交給該 AI 的 adapter 分類。判定順序：

1. 程序已結束：結束碼 0 為 `done`，非 0 為 `error`。
2. 畫面出現錯誤樣式（認證失敗、API 錯誤、額度用盡等）：`error`。
3. 畫面出現授權或選擇提示：`needs approval`。
4. 畫面出現忙碌樣式：`running`。adapter 認不出畫面（`classify` 回傳 `null`）時，最近 2 秒內畫面有變化也視為 `running`。
5. 其餘：若上一個狀態是 `running` 且此後使用者尚未在 AI 格看過它，為 `done`；否則為 `idle`。

- 「畫面有變化」只在 adapter 認不出畫面時才算數。M3 實測 Claude Code 的閒置畫面會自己變化（使用者在輸入框打字、`/effort` 提示與額度提示出現或消失），若一律以變化判定，閒置中打字就會被標成 `running`，停手後又變成 `done`。
- 「看過」指該工作階段正顯示在 AI 格且焦點在 AI 格。
- 授權提示必須先於畫面變化判斷：Claude Code 等待授權時，畫面上的 `⏺` 會一明一暗地閃（M3 實測）。

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
  - Claude Code 2.1.325 已實測。agy 1.5.9 也會因 `ctrl+z` 暫停，但不印任何訊息，只是輸入框下方的提示列整行消失、打的字直接印在框外；送 `SIGCONT` 後恢復，暫停期間打的字進入輸入框（M3 實測）。agy 以「輸入框下方沒有提示列」判定暫停。
  - Codex 未實測，`isSuspended` 先一律回傳 `false`。

### 5.4 通知

- 任一工作階段**進入** `needs approval` 或 `error` 時，發送 macOS 系統通知，並讓清單上該列的符號閃爍。
- 進入 `idle`、`done` 不通知，只更新符號。
- 符號閃爍到使用者在 AI 格看過該工作階段，或它離開 `needs approval`、`error` 為止。
- AgentPulse 啟動後第一次讀到的狀態不算「進入」，不通知也不閃爍。
- 通知標題為 `AgentPulse · <專案>`，內文為 `<分支> · <AI> needs your approval` 或 `stopped with an error`。
- 同一工作階段同一狀態 30 秒內不重複通知。
- 當下正顯示在 AI 格且焦點在 AI 格的工作階段不通知。
- 通知以 `osascript` 發送，來源會顯示為「工序指令編寫程式」，需在系統設定允許其通知。

### 5.5 資訊列（HUD）

顯示選中工作階段的資訊，查不到的欄位顯示 `—`。

| 行 | 內容 |
|---|---|
| 1 | 分支 · 專案 · AI 名稱；右側為狀態 |
| 2 | 模型與思考檔位 · MCP 伺服器名稱 · Skills 數量 · 規範檔是否存在 |
| 3 | 分支 · 新增／刪除行數 · 未追蹤檔案數 · 累計執行時間 · 距上次畫面變化多久 · 本機 port |
| 4 | Context 百分比、進度條、結構明細，見 5.6 |

範例：

```
 claude-opus-5-5 [medium] · MCP github, postgres · skills 4 · CLAUDE.md ✓
 fix/login-bug · +128 -34 · 2 untracked · up 42m · output 3s ago · :3000 :5173
```

- **寬度不足時的截斷順序：** 每行由數個欄位組成，各有優先順序。放不下時從最不重要的欄位開始處理：可縮短的欄位（模型、MCP 名單、分支）先縮短並以 `…` 結尾，縮到下限仍放不下就整個拿掉；其他欄位直接拿掉。最後剩下的一個欄位直接截斷。
  - 第 2 行由不重要到重要：Skills、規範檔、MCP、模型。
  - 第 3 行由不重要到重要：未追蹤檔案數、累計執行時間、距上次畫面變化、port、增刪行數、分支。
- **規範檔：** 在工作資料夾找下列檔案，找到就顯示該檔名加 `✓`，都沒有則顯示 `no <第一個檔名>`。Claude Code：`CLAUDE.md`、`.claude/CLAUDE.md`；Codex：`AGENTS.md`；agy：`GEMINI.md`、`AGENTS.md`（agy 1.5.9 執行檔內的說明文字確認兩者都會讀）。
- **MCP：** 只列設定檔中的伺服器名稱；沒有設定時顯示 `MCP none`。Claude Code 的 claude.ai 連接器要連網才查得到，不列入。
- **增刪行數：** `git diff HEAD --shortstat`，另計未追蹤檔案數（`git ls-files --others --exclude-standard`）。沒有任何修改時顯示 `clean`。第 3 行的分支即時由 git 讀取，可能與第 1 行建立當下的分支不同。
- **累計執行時間：** 自 `@ap-created` 起算。**距上次畫面變化：** 取自 5.3 狀態機的畫面變化時間。
- **本機 port：** `lsof` 列出監聽中的 TCP port，符合任一條件就列入（任何工作階段的 AI 程序本身開的 port 都不列）：屬於該工作階段 AI 程序的子孫程序；該程序的工作資料夾在工作階段資料夾內（M4 實測：以 `&` 放到背景的 dev server 在 shell 結束後父程序變成 1，程序樹比對不到）；畫面上出現 `localhost:<port>` 且該 port 確實在監聽。
- 符號 `⎇`、`−` 屬寬度不明確字元，不使用；減號用 ASCII `-`。

### 5.6 Context 用量顯示

- 顯示已用百分比，以及「系統／MCP」「對話」「剩餘」三段明細。
- **明細是估算：** 各家記錄檔只有總量。以該工作階段第一輪的輸入 token 數當作「系統／MCP」基底，其餘算作「對話」。畫面以 `≈` 標示。
- 已用達 80% 時，百分比改以警示色顯示（門檻可在設定檔 `contextWarnAt` 調整）。
- 模型的 context 視窗大小由 adapter 內建對照表提供，可在設定檔覆寫；查不到就不顯示百分比。
- **已用量：** 最後一次請求送出的輸入 token 數（`input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens`，不含輸出）。M5 實測與 Claude Code `/context` 顯示的總數一致。
- **基底：** 目前這段對話第一筆回覆的同一個數字。它含第一句訊息與附帶的檔案內容，所以「系統／MCP」會比 `/context` 的系統部分略高。
- **壓縮後：** 記錄檔出現 `compact_boundary` 且之後還沒有回覆時，已用量以「基底 + 壓縮後的 token 數（`compactMetadata.postTokens`）」估算；下一次回覆後改回實際數字。M5 實測：壓縮後估計 47.2k，`/context` 為 38k；基底已含第一句訊息的附帶內容，所以估計偏高。
- **格式（第 4 行）：** 有視窗大小時 `context 37% ━━━━──── ≈ system 4 · chat 33 · free 63`，明細為百分比，三段相加為 100；沒有視窗大小時 `context 37.1k ≈ system 37.1k · chat 0`，以 token 數表示。寬度不足時先縮短進度條，再拿掉明細，最後只留 `context 37%`。還沒有任何回覆時顯示 `context —`。只有百分比數字會套警示色；進度條已用部分為主要文字色，剩餘部分為分隔線色。`glyphs: "ascii"` 時進度條改用 `#` 與 `-`。
- **進行中的對話：** Claude Code 內 `/clear`、`/resume` 會換成新的對話 id 與記錄檔。Claude Code 會把每個程序目前的對話 id 寫在 `~/.claude/sessions/<程序 id>.json` 的 `sessionId`，以 AI 格的程序 id 讀取這個欄位來找記錄檔（M5 實測 `/clear` 會立即更新）；讀不到時才用 `@ap-agent-session`。

### 5.7 帳號狀態

頂列顯示三家各一個符號：`●` 為 `signed in`，`○` 為 `not set`。每 60 秒檢查一次。

| AI | 判定為 signed in 的條件（任一成立） |
|---|---|
| Claude Code | 環境變數 `ANTHROPIC_API_KEY`；或 `~/.claude.json` 內有 `oauthAccount` |
| Codex | 環境變數 `OPENAI_API_KEY`；或 `~/.codex/auth.json` 存在 |
| agy | 環境變數 `GEMINI_API_KEY`；或 `~/.gemini/oauth_creds.json` 存在（開發機登入 agy 後確認該檔存在） |

- 只檢查「是否存在」，**不讀取、不記錄、不顯示**任何金鑰或 token 的值。`~/.claude.json` 需解析成物件才能判斷 `oauthAccount` 這個鍵是否存在，解析結果只用來判斷，不保留、不記錄。
- 頂列右側依 Claude Code、Codex、agy 的順序顯示，例如 `claude ●  codex ○  agy ●`。符號用主要文字色，不另上色。
- 認證失敗不另設燈號；畫面出現認證失敗字樣時，該工作階段依 5.3 變為 `error`。

### 5.8 專案清單、搜尋、篩選

- 專案登錄在設定檔。在某個 git 儲存庫內啟動 AgentPulse 時，自動把該儲存庫加入。
- 清單依專案分組，組內列出工作階段（分支名稱與 AI 名稱）。
- 同一個專案中，分支與 AI 都相同的工作階段有兩個以上時，依建立先後在 AI 名稱後加序號：第一個不加，之後為 `#2`、`#3`，例如 `dev claude #2`。資訊列第 1 行的 AI 名稱也加上同樣的序號。序號每次依目前存在的工作階段重新計算，前面的關掉後，後面的序號會往前遞補。
- `/` 以關鍵字比對專案名、分支名、AI 名稱（不分大小寫）。`f` 只顯示 `◐` 與 `✕`。兩者可同時使用。
- 篩選中沒有工作階段的專案群組隱藏；只有專案名稱符合關鍵字時保留該群組。沒有任何符合時清單顯示 `No matches`。
- 清單標題下一行平時顯示 `/ filter` 提示，篩選時改為關鍵字與 `◐ ✕ only`。

### 5.9 Worktree

**建立（`w`）：** 輸入分支名稱、選擇 AI 後，依序執行：

1. `git worktree add -b <branch> <path> <base>`，路徑為 `<專案上層>/<專案名>.worktrees/<branch>`。`<base>` 是主資料夾當下所在的分支，寫入 `@ap-base` 當作這個分支的主線。
2. 在該資料夾建立工作階段並啟動 AI。
3. 清單出現新的一列。

- 對話框在同一個畫面輸入分支名稱與選 AI（`↑` `↓` 選 AI，其餘按鍵都是打字），並即時顯示將建立的資料夾路徑與分出的來源分支。
- 前置檢查，任何一項不過就不執行 `git worktree add`，並在對話框說明：分支名稱不是空的且格式合法（`git check-ref-format --branch`）；主資料夾在某個分支上（不是 detached HEAD）；儲存庫至少有一個 commit；同名分支不存在；目標路徑不存在或是空資料夾；選的 AI 已安裝。
- AI 啟動失敗時不回滾：分支與資料夾留著，對話框說明狀況。移除 worktree 與刪除分支屬於需要先確認的操作，不自動執行。

**合併並清理（`m`）：** 只對 `w` 建立的工作階段有作用（`@ap-worktree` 為 `1`）。先顯示確認對話框，列出將要執行的每一步，使用者確認後才進行：

1. 檢查該 AI 不在 `running` 狀態，否則中止。
2. 檢查 worktree 是否有未提交的修改；有的話請使用者輸入提交訊息後提交，或取消。
3. 檢查專案主資料夾在主線分支且沒有未提交的修改，否則中止並說明。
4. 在主資料夾執行 `git merge --no-ff <branch>`。
5. 若發生衝突：執行 `git merge --abort`，列出衝突檔案，**不刪除任何東西**。
6. 合併成功後：關閉該工作階段、`git worktree remove <path>`、`git branch -d <branch>`。

- 全程不使用 `--force`、`-D`，不自動捨棄任何修改。
- 不處理推送與 PR。
- **檢查的時機：** 按 `m` 時先做第 1 至 3 步的檢查（都只讀取），通過才顯示確認對話框；有任何一項不過，對話框改為說明原因，不提供執行。按 `enter` 後全部重新檢查一次才開始動作，避免對話框開著的期間狀況改變。所有檢查都通過後才提交 worktree 的修改，所以中止時不會留下多餘的 commit。
- **主線：** `@ap-base` 記錄的分支。主資料夾目前所在的分支與它不同時中止。
- **分支：** 以 worktree 資料夾當下所在的分支為準，不用建立時記下的名稱。
- **提交（第 2 步）：** `git add -A` 後 `git commit -m <訊息>`，包含新檔案（留著未追蹤的檔案，`git worktree remove` 會拒絕）。訊息不可空白。
- **主資料夾的未提交修改（第 3 步）：** 只看已追蹤檔案的修改（含已 `add` 的）；未追蹤的檔案不算。主資料夾有另一個合併還沒完成（`MERGE_HEAD` 存在）時也中止，避免之後的 `git merge --abort` 還原到使用者自己的合併。
- **合併（第 4 步）：** 加 `--no-edit`，使用 git 預設的合併訊息，不開編輯器。
- **衝突的判定（第 5 步）：** 合併指令失敗且 `MERGE_HEAD` 存在才算衝突，此時記下衝突檔案（`git diff --name-only --diff-filter=U`）再 `git merge --abort`。指令失敗但 `MERGE_HEAD` 不存在，表示合併根本沒開始（例如主資料夾的未追蹤檔案會被蓋掉），直接回報 git 的訊息，不需要還原。兩種情況都不刪除任何東西；第 2 步的 commit 會留在該分支上。
- **被 git 忽略的檔案：** `git worktree remove` 會連同被忽略的檔案（例如 `.env`、`node_modules`）一起刪除，M6 實測。確認對話框會列出這些項目的名稱。
- **清理失敗：** 第 6 步任何一個指令失敗就停下來，說明已完成到哪一步、剩下什麼還在，不改用強制選項。
- 清理成功後，`<專案名>.worktrees/` 底下因分支名稱含 `/` 而留下的空資料夾一併移除（只移除空的）。
- 修改資料的 git 指令（提交、合併、移除 worktree）逾時為 120 秒，其餘查詢維持 5 秒。

### 5.10 衝突預警

- 每 15 秒，對有兩個以上工作階段的專案，取得每個工作資料夾「已修改的檔案」：
  - 未提交的修改（`git status --porcelain`）
  - 該分支相對主線已提交的修改（`git diff --name-only <merge-base>...HEAD`）
- 同一個檔案出現在兩個以上的工作資料夾時，在清單下方顯示檔名與涉及的分支數。
- 以工作資料夾為單位：同一個資料夾開了多個 AI 只算一份。
- 這裡的主線是主資料夾當下的 `HEAD`；主資料夾本身只算未提交的修改。
- 未提交的修改以 `git status --porcelain -z --untracked-files=all` 讀取：新資料夾裡的檔案逐一列出，中文檔名不會被轉成跳脫字元；改名同時算新舊兩個路徑。
- 清單下方只顯示選取所在專案的提示：一行標題（`! conflict · N branches`，N 為涉及的分支總數）加檔名，檔名最多佔 4 行；超過 4 個時列前 3 個，第 4 行顯示 `+N more`。其他專案有衝突時，該專案群組列的數量前面顯示警示色的 `!`。對話框開啟時提示暫時隱藏。
- 工作階段清單有變動（新增、關閉、合併完成）時立即重新掃描一次，不等下一個 15 秒。

### 5.11 Diff 與開啟網頁

- `d`：以 tmux 浮動視窗開啟滿版互動式 Ink Diff 檢視器（`--role=diff`，`display-popup -w 100% -h 100%`，tmux 3.3 以上另加 `-B` 隱藏外框，需 tmux 3.2 以上）。
  - 檔案清單取自 `git status --porcelain -z --untracked-files=all` 與對 `HEAD` 的 `numstat`（儲存庫還沒有 commit 時退回比較暫存區與工作區），列出每個已變更檔案的狀態與增刪行數；未追蹤的新檔案（文字檔）亦以 `git diff --no-index -- /dev/null <file>` 顯示新增內容，二進位檔顯示摘要。
  - 若系統安裝了 `delta`（`git-delta`），自動以 `delta` 渲染語法上色、行號與詞級差異（並可用 `s` 切換並排檢視）；未安裝時自動退回內建的彩色統一 Diff 與行號檢視器。
  - 支援 `←` / `→`（或 `h` / `l`、`[` / `]`）切換上一個／下一個修改檔案、`↑` / `↓` / `j` / `k` 捲動、`Space` / `b` / `PgDn` / `PgUp` 翻頁、滑鼠滾輪／觸控板上下捲動（視窗啟動時啟用 SGR 滑鼠回報並在輸入代理截出滾輪事件）、`r` 重新整理、`q` / `Esc` 關閉。
  - 浮動視窗開著時暫停重畫資訊列，關閉後立即補畫。資訊列每秒寫入一次，內容會穿透到浮動視窗上（M6 實測）。
  - 沒有任何修改時不開視窗，在清單下方顯示一行提示。
  - `tmux display-popup` 指令會等到浮動視窗關閉才返回（M6 實測），這個呼叫的逾時設為 1 小時；指令被中止時浮動視窗仍留在畫面上，不影響 server（M6 實測）。
- `o`：偵測到一個 port 時直接 `open http://localhost:<port>`；多個時先讓使用者選。port 取自資訊列的偵測結果（5.5）；沒有偵測到時顯示一行提示。
- 清單下方的一次性提示（沒有修改、沒有 port、合併完成等）在下一次按鍵時清除。

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
| 外部程式 | 系統的 `tmux`（3.2 以上）、`git`、`lsof`、`ps`、`osascript`、`open`；選用：`delta`（`git-delta`，美化 Diff 檢視） |

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
| `remain-on-exit` | — | 開（附 `remain-on-exit-format`） |
| `detach-on-destroy` | — | 關 |
| `history-limit` | — | 50000 |

M0 已確認的實作要點：

- **所有 tmux 指令都加 `-u`**，並在環境沒有 UTF-8 語系時補上 `LANG=en_US.UTF-8`。否則巢狀 client 會把中文與框線降為 ASCII。
- **啟動巢狀 client 前清除 `TMUX` 環境變數**（`env -u TMUX`），否則 tmux 拒絕巢狀連線。
- **切換工作階段：** `switch-client -c <AI 格的 tty> -t <session>`。工作階段視窗大小會自動跟隨 AI 格。
- **固定格子大小：** 左欄寬度與資訊列高度掛在 `window-resized` hook 重設。不可用 `client-resized`，它在 tmux 重排版面之前觸發，設定會被蓋掉。
- **焦點偵測：** `window-pane-changed` hook 以訊號（`SIGUSR1`）通知清單程序，另以低頻輪詢 `#{pane_active}` 保底。
- **環境隔離：** 啟動工作階段 server 時清除 `CLAUDE*` 與 `CLAUDECODE` 環境變數，避免從另一個 Claude Code 內啟動時影響內層 AI。
- **Ink 設定：** 使用 `alternateScreen: true`，不開 `incrementalRendering`（格子縮放後會留下殘影）。
- **延伸按鍵的要求（M7 實測）：** tmux 預設只以 modifyOtherKeys（`ESC[>4;2m`）向外層終端機要求延伸按鍵。iTerm2 3.4.16 不支援這種方式，`shift+enter` 會送出和 `enter` 相同的 `\r`；但它支援 Claude Code 直接執行時使用的 kitty 方式，`shift+enter` 送出 `ESC[13;2u`。因此以 `terminal-overrides` 改寫 `Eneks`／`Dseks`，同時送出兩種要求（`ESC[>4;2m ESC[>1u`、`ESC[>4m ESC[<u`），終端機會略過不認得的那一種。

巢狀 tmux 實測可行，原先規劃的 `swap-pane` 備援不採用。

### 6.3 模組

```
src/
  index.tsx          入口：依 --role 分流（啟動流程 / 清單程式）
  bootstrap/         相依檢查、產生 tmux 設定、建立版面、attach
  app/               清單程式的組裝：鍵盤路由、焦點狀態、對話框狀態機
  ui/                Ink 元件（只讀 state）
    SessionList  GroupRow  SessionRow  KeyHints  Lines
    conflictLines.ts 衝突提示的排版（純函式）
    dialogs/         新增工作階段、worktree、合併確認、開啟網頁、關閉確認、說明
    theme.ts         配色與符號常數
    text.ts          string-width 包裝：截斷、補白、對齊
  hud/               資訊列與頂列的排版（純函式）與輸出
  state/             單一 store、selectors、actions
  services/          背景邏輯，無 UI
    scheduler.ts     分級輪詢
    sessions.ts      工作階段生命週期
    layout.ts        AI 格切換、放大、多宮格
    status/          狀態分類、卡頓、通知觸發
    context/         用量估算與視窗對照
    accounts.ts  worktree.ts  conflictRadar.ts  diff.ts  ports.ts  tokens.ts
  agents/            每家 AI 一個 adapter
    types.ts  claude.ts  codex.ts  agy.ts
  infra/             對外唯一出口
    exec.ts          Bun.spawn 包裝：逾時、併發上限、錯誤分類
    tmux.ts  git.ts  fsx.ts
    signal.ts        對程序群組送訊號（暫停自動恢復用）
    platform/        types.ts  darwin.ts  wsl.ts（預留）
  config/            設定檔讀寫
  i18n/              介面文字字典（英文、繁體中文）；最底層，不匯入任何模組
```

**相依方向只能單向：** `ui → state → services → agents / infra`。

- `ui/` 不得直接呼叫 `infra/`。
- `infra/` 不得匯入上層任何模組。
- 所有外部程式呼叫都必須經過 `infra/exec.ts`。

### 6.4 Adapter 介面

```ts
type AgentId = 'claude' | 'codex' | 'agy';
type AgentState = 'running' | 'needs-approval' | 'idle' | 'done' | 'error';

interface AgentAdapter {
  id: AgentId;
  displayName: string;
  rulesFiles: string[];                   // 相對於工作資料夾，第一個是顯示名稱，見 5.5
  binary: string;                         // 啟動前在 PATH 與 platform.binDirs 尋找
  pinsSessionId: boolean;                 // 能否在啟動時指定 AI 自己的對話 id

  launchCommand(opts: { cwd: string; sessionId: string | null }): string[];
  matchProcess(commandLine: string): boolean;        // 辨識外部工作階段
  classify(screen: string): Exclude<AgentState, 'done'> | null;
  isSuspended(screen: string): boolean;              // 畫面停在暫停訊息，見 5.3

  // 以下由呼叫端傳入唯讀的檔案存取介面 HostFs（家目錄、環境變數、檔案是否存在、
  // 讀文字、讀檔頭、讀檔尾、列資料夾、修改時間）；查不到回傳 null，介面顯示 `—`。
  accountStatus(fs: HostFs): 'signed-in' | 'not-set';
  mcpServers(fs: HostFs, cwd: string): string[] | null;
  skillsCount(fs: HostFs, cwd: string): number | null;
  contextWindows: Record<string, number>;  // 模型名稱 → context 視窗 token 數，見 5.6
  sessionInfo(fs: HostFs, ctx: { cwd: string; sessionId: string | null; pid: number | null }): {
    model: string | null;
    effort: string | null;
    context: { used: number; base: number | null } | null;   // M5，token 數
  };
}
```

- 資料方法改為同步並接收 `HostFs`：adapter 不直接匯入 `infra/`，測試可用假的檔案內容；讀的都是小檔案或記錄檔的檔尾，同步讀取不會卡住介面。
- 規範檔是否存在由 `services/` 依 `rulesFiles` 統一檢查，不需各家實作。

新增一家 AI 只需要新增一個 adapter 檔並註冊，其他模組不改。

各方法隨階段加入：M2 只有 `id`、`displayName`、`rulesFile`、`binary`、`launchCommand`、`matchProcess`；M3 加入 `classify`、`isSuspended`；M4 加入資料方法、`pinsSessionId`，`rulesFile` 改為 `rulesFiles`；M5 加入 `contextWindows`、`sessionInfo` 的 `context` 與 `pid`。`launchCommand` 回傳的第一個元素是程式名稱，實際啟動時換成找到的絕對路徑；找不到時新增對話框標示 `not installed`，不建立工作階段。

### 6.5 Platform 介面

```ts
interface Platform {
  binDirs: string[];                       // PATH 找不到程式時依序嘗試的資料夾
  notify(title: string, body: string): Promise<boolean>;   // false：送出失敗，只記錄不中斷
  openUrl(url: string): Promise<boolean>;                  // false：開啟失敗
  listeningPorts(): Promise<Array<{ pid: number; port: number }>>;
  processTree(): Promise<Array<{ pid: number; ppid: number; command: string }>>;
  processCwds(pids: number[]): Promise<Map<number, string>>;   // M4 追加，見 5.5 本機 port
  loginShellPath(): Promise<string | null>;  // M7 追加：使用者 shell 設定後的 PATH，見第 7 節
}
```

第一階段只實作 `darwin.ts`。`wsl.ts` 僅保留介面，呼叫時丟出「尚未支援」。`binDirs` 在 M1 加入：macOS 為 `/opt/homebrew/bin`、`/usr/local/bin`、`~/.local/bin`（agy 與 Claude Code 原生安裝程式的位置），讓 6.2 啟動流程第 1 步的備援路徑不寫死在平台模組以外。`notify` 於 M3、`listeningPorts`（`lsof -nP -iTCP -sTCP:LISTEN -Fpn`）與 `processTree`（`ps -axo pid=,ppid=,command=`）、`processCwds`（`lsof -a -d cwd -p <pids> -Fpn`）於 M4 實作，`openUrl`（`/usr/bin/open <url>`）於 M6。

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
  "contextWarnAt": 80,
  "contextWindows": {},
  "language": "en"
}
```

`contextWindows` 是「模型名稱 → context 視窗 token 數」的覆寫表。`language` 是 `en` 或 `zh-TW`，其他值視為 `en`，見 3.3。

### 6.8 各家資料來源

| 項目 | Claude Code | Codex | agy |
|---|---|---|---|
| 模型、思考檔位 | 記錄檔最後一筆 assistant 的 `message.model` 與同一筆的 `effort`；還沒有回覆時取 `~/.claude/settings.json` 的 `model` | `~/.codex/config.toml` 的 `model`、`model_reasoning_effort` | `~/.gemini/antigravity-cli/settings.json` 的 `model`，例如 `Gemini 4 Hydrogen (Medium)`，括號內為檔位 |
| Context 用量 | 記錄檔最後一筆 assistant 的 `message.usage`；基底為第一筆；見 5.6 | 延後（未實測） | 畫面底部沒有顯示，對話存在 `~/.gemini/antigravity-cli/conversations/*.db`（SQLite）；M5 不支援，顯示 `context —` |
| MCP | `~/.claude.json` 的 `mcpServers` 與 `projects[<工作資料夾>].mcpServers`、工作資料夾的 `.mcp.json` | `config.toml` 的 `mcp_servers` | `~/.gemini/config/mcp_config.json` 的 `mcpServers` |
| Skills | `~/.claude/skills/*/SKILL.md`、工作資料夾 `.claude/skills/*/SKILL.md`、claude.ai 同步的 `~/.claude/skills/synced/<bucket>/*/SKILL.md`、`settings.json` 的 `enabledPlugins` 對應到 `plugins/installed_plugins.json` 安裝資料夾下的 `skills/*/SKILL.md`（與 `/skills` 的數量對照過） | `~/.codex/skills/*/SKILL.md` | `~/.gemini/config/skills/*/SKILL.md`、工作資料夾 `.agents/skills/*/SKILL.md` |
| 帳號 | 見 5.7 | 見 5.7 | 見 5.7 |
| 本機實測 | 記錄檔欄位與 `--session-id` 旗標已確認（2.1.325） | 未實測 | 1.5.9：`settings.json` 的 `model` 欄位與 `oauth_creds.json` 已確認存在；Skills 與 MCP 路徑依執行檔內的字串推得 |

- Claude Code 記錄檔位置：`~/.claude/projects/<路徑代碼>/<sessionId>.jsonl`。建立工作階段時產生 UUID，以 `claude --session-id <uuid>` 啟動並存入 `@ap-agent-session`；讀取時在 `~/.claude/projects/` 的各資料夾找 `<uuid>.jsonl`，不自行重現路徑代碼的規則。M4 之前建立、沒有 id 的工作階段，改取路徑代碼資料夾（非英數字元換成 `-`）中最新的記錄檔。
- 記錄檔可能很大，只讀檔尾 256 KB；找不到 assistant 紀錄時再讀 4 MB。基底讀檔頭 1 MB，找不到時再讀 4 MB（M5 實測第一筆回覆約在 200–360 KB 處）；同一份記錄檔的基底不會變，讀到後記住。
- `/clear`、`/resume` 換對話後，以 `~/.claude/sessions/<程序 id>.json` 的 `sessionId` 找新的記錄檔，見 5.6。`/resume` 未實測。
- 內建視窗大小（2026-11 依 Anthropic 文件，Claude Code `/context` 對 Opus 5.5 顯示 `1m` 一致）：Opus 5.5、Opus 5、Opus 4.6–4.8、Sonnet 5.5、Sonnet 5、Sonnet 4.6、Haiku 5.5、Fable 5–5.2 為 1,000,000；Haiku 4.5 為 200,000。模型名稱以前綴比對，帶日期後綴的名稱也適用。
- Codex 目前未安裝於開發機（使用者沒有訂閱），相關實作只能依官方文件撰寫，完成後需標示未實測，直到實機驗證。agy（Antigravity CLI）1.5.9 已於 2026-11-15 安裝在 `~/.local/bin/agy`。

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

### 7.1 安裝成 App（M7 追加）

使用者 clone 專案後執行 `./install.sh` 安裝 `AgentPulse.app`，執行 `./uninstall.sh` 移除。兩個腳本只用 macOS 內建指令，使用者不必先安裝 Bun。

**`install.sh`：**

1. 檢查 `tmux`（3.2 以上）與 `git` 能否執行；缺少時列出安裝指令後停止，不做任何變更。
2. 準備 Bun：電腦上已有 `bun` 就使用它；沒有時下載官方 1.4.4 版（Apple 晶片用 `bun-darwin-aarch64.zip`，Intel 用 `bun-darwin-x64-baseline.zip`）到暫存資料夾，以寫在腳本裡的 SHA-256 檢查碼核對，不符就停止。
3. 以暫存資料夾作為 Bun 的下載快取（`BUN_INSTALL_CACHE_DIR`），執行 `bun install --frozen-lockfile` 與 `bun run build:mac`。專案套件只放在專案資料夾的 `node_modules`。
4. 在暫存資料夾組出 `AgentPulse.app`，再放到 `/Applications`；沒有寫入權限時改放 `~/Applications`。同位置已有 `AgentPulse.app` 時，確認其 `CFBundleIdentifier` 是 `local.agentpulse.app` 才取代，否則停止。
5. 向 LaunchServices 登記，讓 Spotlight 與 Launchpad 找得到。
6. AgentPulse 的畫面 server 正在執行時，詢問是否重新整理畫面（只關閉 `agentpulse-ui`，AI 不受影響）；不重新整理的話舊畫面會繼續使用舊版程式。
7. 結束時刪除暫存資料夾，電腦上不會多出 Bun 或下載快取。

**App 結構：**

| 路徑 | 內容 |
|---|---|
| `Contents/Info.plist` | `CFBundleIdentifier` 為 `local.agentpulse.app`；`LSUIElement` 為 true，開完終端機視窗就結束，不留在 Dock |
| `Contents/MacOS/AgentPulse` | 啟動腳本：找得到 iTerm2（bundle id `com.googlecode.iterm2`）就以 AppleScript 請 iTerm2 開新視窗執行 `AgentPulse.command`，否則以 `open -b com.apple.Terminal` 交給「終端機」 |
| `Contents/Resources/AgentPulse.command` | 執行 `agentpulse`；結束碼不是 0 時等使用者按 `enter` 才結束，因為 iTerm2 會在程式結束時關閉視窗，使用者會看不到啟動檢查的說明 |
| `Contents/Resources/agentpulse` | `dist/AgentPulse` 的複本 |
| `Contents/Resources/AppIcon.icns` | 圖示，見下方 |
| `Contents/Resources/uninstall.sh` | 與專案根目錄的 `uninstall.sh` 相同，刪掉專案資料夾後仍能移除 |

- iTerm2 以 `open` 打開腳本時，每次都會詢問「OK to run …?」（M7 實測 3.4.16），所以改用 AppleScript；代價是第一次開啟時 macOS 詢問一次「AgentPulse 想要控制 iTerm」。「終端機」以 `open` 打開 `.command` 不會詢問，也不需要「自動化」權限。
- 已經開著時再開一次，會多開一個視窗接到同一個畫面（使用者 2026-11-16 決定）。

**`uninstall.sh`：** 先列出將執行的每一步與背景中的 AI 數量，輸入 `y` 才執行：

1. 關閉 `agentpulse-ui` 與 `agentpulse` 兩個 tmux server（背景中的 AI 會結束）。
2. 向 LaunchServices 取消登記，刪除 `/Applications` 與 `~/Applications` 中 `CFBundleIdentifier` 為 `local.agentpulse.app` 的 `AgentPulse.app`。
3. 刪除 `~/.config/agentpulse/`。
4. 以 `tccutil reset AppleEvents local.agentpulse.app` 清除 AgentPulse 的「自動化」權限紀錄（只清這個 App 的）。
5. 再檢查一次上述位置與兩個 tmux socket 都已不存在，印出結果。

**圖示：** 原稿 `packaging/AppIcon.svg`（左側三個狀態符號、細分隔線、右側脈搏線，配色取自 3.1），轉好的 `packaging/AppIcon.icns` 一起進 git，安裝時直接複製，使用者端不轉檔。
- 本機編譯的檔案沒有隔離標記，自用不需要簽章。
- 雙擊啟動時工作目錄是家目錄，所以專案來源以設定檔的 `projects` 為準。
- 執行時仍需要系統已安裝 `tmux` 與 `git`，以及至少一家 AI 的 CLI。
- 補齊 PATH：不經過 shell 直接執行時（例如 iTerm2 設定檔的 Command、之後的 `.app`），PATH 只有系統預設，找不到 nvm、fnm、asdf 這類工具裝的 AI 與 `node`。所以啟動時先以使用者的 shell（`$SHELL`，沒有時用 `/bin/zsh`）執行 `-ilc` 印出 PATH，逾時 3 秒；取得後放在原本 PATH 之前、去除重複，寫回本程序的環境。這一步在啟動檢查與建立 tmux server 之前，兩個 server 與所有 AI 都繼承同一份 PATH。取不到時沿用原本的 PATH 並記錄。輸出前後加上標記字串，忽略 shell 設定檔印出的其他文字。
- 啟動檢查：先讀設定檔取得語言，再檢查 `tmux`（3.2 以上）、`git` 能否執行、是否在終端機裡。任何一項不過，就以設定的語言列出所有問題與安裝指令後以結束碼 1 離開，雙擊開出的「終端機」視窗會保留這段說明。`git` 以實際執行 `git --version` 判斷：macOS 沒裝開發者工具時 `/usr/bin/git` 仍存在，但只會跳出安裝提示。
- `?` 按鍵說明：以滿版浮動視窗開啟自訂 Ink 說明介面（`--role=help`，`display-popup -w 100% -h 100%`，tmux 3.3 以上另加 `-B`），將按鍵徽章、狀態符號配色與動態設定／日誌路徑分區排版，支援 `↑`/`↓`/`j`/`k`/`Space`/`b`/`PgUp`/`PgDn` 與滑鼠滾輪／觸控板上下捲動，按 `q`/`Esc` 關閉（取代原本寫入 `help.txt` 再交給 `less` 的純文字檢視）。左欄只有 30 欄，放不下完整說明。

---

## 8. 相對原始需求的調整紀錄

| 原始需求 | 定案 | 原因 |
|---|---|---|
| 右側以 `capture-pane` 鏡像畫面 | 改為嵌入原版 AI 終端機 | 輸入與原版完全一致、沒有延遲 |
| 5 套主題、`T` 鍵 | 移除 | 改為單一極簡配色 |
| 預設繁中、`L` 鍵切英文 | 預設英文，清單上 `t` 鍵切換繁體中文（台灣用語、白話），見 3.3 | 使用者原本決定只留英文；2026-11-15 改為保留中文模式，因 M6 起的流程較複雜，有中文說明較好上手。`l` 已用於展開群組，故改用 `t` |
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
| （原始需求未涵蓋）AI 結束後的畫面 | 格子底部顯示結束碼與關閉方式，清單列 `✓`／`✕` | M0 發現使用者會用 `ctrl+c` 想離開，留下的畫面像卡住 |
| （原始需求未涵蓋）關掉正在看的工作階段 | 工作階段 server 設 `detach-on-destroy off`；全部關完時 AI 格退回佔位文字 | 避免巢狀 client 結束後 AI 格空白或版面崩壞 |
| 支援 Aider | 移除，只支援 Claude Code、Codex、Gemini CLI | 使用者決定，沒在使用；Aider 需另付 API 費用，後續階段不必為它維護狀態規則 |
| 支援 Gemini CLI（`gemini`） | 改為 Antigravity CLI（`agy`） | 使用者 2026-11-15 移除 Gemini CLI，改裝 agy 1.5.9；兩者是不同程式，參數與設定資料夾都不同 |
| （原始需求未涵蓋）以畫面變化判定執行中 | 只在 adapter 認不出畫面時採用 | M3 實測閒置畫面會因打字與提示文字而變化，一律採用會誤標 `running` 與 `done` |
| 自動壓縮（Auto-Compact）與 `c` 鍵 | 移除，只保留 Context 用量顯示與警示色 | 使用者決定；避免主動對 AI 送字，且各家已有原生 `/compact`、`/clear` 或 skill |
| （原始需求未涵蓋）資訊列寬度不足 | 欄位依優先順序先縮短、再整個拿掉 | M4 定義；固定順序讓重要欄位（模型、分支）永遠最後才消失 |
| Adapter 資料方法為非同步、無參數 | 改為同步並接收 `HostFs` | M4 實作時調整，見 6.4 |
| （原始需求未涵蓋）Context 用量的計算方式 | 只算輸入 token；壓縮後以基底加壓縮後 token 數估算；以程序 id 跟上 `/clear` 後的新對話 | M5 實測與 Claude Code `/context` 對照，見 5.6 |
| agy、Codex 的 Context 用量 | 暫不支援，顯示 `context —` | agy 畫面不顯示用量、對話存在 SQLite；Codex 延後 |
| （原始需求未涵蓋）合併的「主線」是哪個分支 | 建立 worktree 當下主資料夾所在的分支，存入 `@ap-base` | M6 定義；合併前要能檢查主資料夾是否還在同一個分支上 |
| 合併流程的檢查在確認之後才做 | 按 `m` 時先檢查一次再顯示對話框，確認後重新檢查 | 對話框才能說明是否需要提交訊息；不過的項目直接說明原因 |
| （原始需求未涵蓋）worktree 裡被 git 忽略的檔案 | 確認對話框列出會跟著資料夾一起刪除的項目 | M6 實測 `git worktree remove` 會刪掉 `.env`、`node_modules` 這類檔案而不警告 |
| `d` 顯示 `git diff` | 顯示 `git diff HEAD`，並列出未追蹤的檔名 | 與資訊列的增刪行數同一個基準；AI 新增的檔案也看得到 |
| 衝突提示顯示在清單下方 | 只顯示選取所在專案的提示，其他專案在群組列標 `!` | 左欄只有 30 欄，檔名無法同時標示專案 |
| `openUrl` 回傳 `Promise<void>` | 改回傳是否成功 | 失敗時要能在清單下方提示 |
| （原始需求未涵蓋）同分支多個 AI 無法分辨 | 在 AI 名稱後加 `#2`、`#3` | 使用者 2026-11-15 決定；序號只佔 3 欄，比建立時間省寬度 |
| `?` 按鍵說明的呈現方式 | 浮動視窗，不畫在左欄 | M7 定義；左欄寬度放不下按鍵與說明 |
| （原始需求未涵蓋）iTerm2 的 `shift+enter` | tmux 同時以 modifyOtherKeys 與 kitty 方式要求延伸按鍵 | M7 實測 iTerm2 3.4.16 只支援 kitty 方式，見 6.2 |
| （原始需求未涵蓋）不經過 shell 啟動時的 PATH | 啟動時向使用者的 shell 取得 PATH | M7 實測 iTerm2 直接執行時找不到 nvm 裝的 Claude Code；使用者不必自己設定 |
| 打包產物為單一執行檔 | 另以 `install.sh` 組成 `AgentPulse.app`，雙擊時優先開 iTerm2 | 使用者 2026-11-16 決定；`build:mac` 不變，見 7.1 |
| （原始需求未涵蓋）移除方式 | `uninstall.sh` 一次清掉 AgentPulse 的所有檔案與背景 server | 使用者要求不留殘留 |
| （原始需求未涵蓋）缺少必要程式時的訊息 | 依設定語言列出全部問題與安裝指令；`git` 以能否執行判斷 | M7 定義；雙擊啟動的使用者看不到其他說明 |
| `d` 用 `less` 一次印出所有 `git diff` | 改為自訂互動式 Ink Diff 浮動視窗，支援逐檔切換（`←`/`→`）、`delta` 美化（無 `delta` 則退回內建彩色排版）與 `s` 並排 | 一次印出多檔 Diff 在大量變更時難以瀏覽；`delta` 與逐檔切換讓審查變更更直覺 |
| `?` 寫出 `help.txt` 再交給 `less` | 改為自訂 Ink 浮動視窗，具備按鍵徽章底色、分區標題與快捷捲動 | 與主介面一致的深色主題與清楚視覺層級，閱讀與關閉更直覺 |
| `d` / `?` 浮動視窗佔 90% 且僅鍵盤捲動 | 改為滿版（`-w 100% -h 100%`、無外框）並啟用 SGR 滑鼠滾輪上下捲動 | 90% 視窗高度對較長檔案仍偏矮；在 tmux popup 內攔截滑鼠滾輪可讓長 diff 與說明直接以滾輪瀏覽 |

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
| G8 | `ctrl+q` 在 AI 中沒有重要用途 | Claude Code 通過。其餘當時未安裝，未測 |

M0 另外發現：

- 專案位於「文件」資料夾時，第一次從 Terminal.app 啟動會跳出 macOS 的資料夾存取詢問，允許之前程式會停住。
- Terminal.app 預設視窗為 80x24，版面可運作但擁擠，需要定義視窗過小時的呈現方式。
- 在 Claude Code 裡按 `ctrl+z` 會讓它暫停，嵌入格裡無法用 `fg` 叫回（使用者試用時發現，Claude Code 2.1.325）。對策與實測結果見 5.3「暫停自動恢復」。

其他已知風險：

- **狀態誤判：** 畫面樣式隨各家 CLI 改版而變，需持續維護規則與測試案例。
- **未實測：** Codex 未安裝，其 adapter 完成後仍屬未驗證。agy 的資訊列欄位仍待實測。
- **合併操作：** 涉及使用者的 git 歷史，所有步驟必須先確認、失敗即還原。
