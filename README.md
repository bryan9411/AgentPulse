# AgentPulse

在一個終端機視窗裡管理多個 AI coding agent。左邊列出每個 AI 的狀態，右邊直接顯示選中的那個 AI 本人的畫面，可以切過去打字。

支援 Claude Code（`claude`）、Antigravity CLI（`agy`）與 Codex CLI（`codex`，未實測）。

## 安裝前置

在 macOS 的「終端機」執行：

```bash
brew install tmux
```

```bash
xcode-select --install
```

- `tmux` 需要 3.2 以上。沒有 Homebrew 的話先照 <https://brew.sh> 安裝。
- 第二行安裝 Apple 開發者工具，裡面包含 `git`；已經裝過的話會顯示「already installed」，可以略過。
- 至少要裝好一家 AI 的 CLI，並先自己開過一次、完成登入。

缺少 `tmux` 或 `git` 時，AgentPulse 一啟動就會列出缺什麼、怎麼安裝，然後結束。

## 產生執行檔

需要 [Bun](https://bun.sh)。

```bash
bun install
```

```bash
bun run build:mac
```

產出 `dist/AgentPulse`，是單一執行檔（約 90 MB），不需要另外安裝 Bun 就能執行。

## 啟動

- **雙擊：** 把 `dist/AgentPulse` 複製到桌面，雙擊後會開在「終端機」。
- **在終端機裡：** 進到專案資料夾後執行 `AgentPulse`，這個資料夾會自動加入清單。「終端機」和 iTerm2 都可以。

AI 用 nvm、fnm、asdf 這類工具安裝也沒關係：AgentPulse 啟動時會向你的 shell 問出完整的 PATH，不論從哪裡開都找得到。

第一次啟動清單是空的，按 `a` 輸入專案資料夾路徑（必須是 git 儲存庫），再按 `n` 選一家 AI 啟動。

關掉終端機視窗不會停掉 AI。下次打開 AgentPulse，所有 AI 和對話都還在。

## 按鍵

在 AgentPulse 裡按 `?` 可以隨時看這份清單。

**在右邊跟 AI 對話時**

| 按鍵 | 作用 |
|---|---|
| `ctrl+q` | 回到左邊的清單（放大時也會還原） |
| 其他所有按鍵 | 原樣交給 AI，包括 `ctrl+c` |

**在左邊的清單**

| 按鍵 | 作用 |
|---|---|
| `↑` `↓` 或 `k` `j` | 上下選擇，右邊跟著切換 |
| `←` `→` 或 `h` `l` | 收合或展開專案 |
| `enter` | 開始跟選中的 AI 對話 |
| `z` | 同上，並把 AI 放大到整個視窗 |
| `n` | 在這個專案新增一個 AI |
| `w` | 開新分支（git worktree，另開一個資料夾）並在裡面啟動 AI |
| `m` | 把 `w` 開的分支合併回主線並清理；執行前會列出每一步 |
| `x` | 關閉選中的 AI（會先確認） |
| `d` | 看它的資料夾改了什麼 |
| `o` | 用瀏覽器開啟它的本機網頁（`http://localhost:<port>`） |
| `/` | 搜尋；`esc` 清除 |
| `f` | 只看需要你處理的 AI |
| `a` | 加入專案資料夾 |
| `t` | 切換英文／繁體中文 |
| `?` | 按鍵說明 |
| `q` | 離開；所有 AI 繼續在背景執行 |

**狀態符號**

| 符號 | 意思 |
|---|---|
| `●` | 工作中 |
| `◐` | 在等你同意或回答 |
| `○` | 在等你輸入下一句 |
| `✓` | 做完了，你還沒看 |
| `✕` | 出錯停下來了 |

## 設定檔

位置：`~/.config/agentpulse/config.json`，第一次啟動時自動建立，可以直接用文字編輯器修改。

| 欄位 | 作用 | 預設 |
|---|---|---|
| `projects` | 清單裡的專案資料夾 | `[]` |
| `sidebarWidth` | 左欄寬度 | `30` |
| `notifications` | AI 等你同意或出錯時跳 macOS 通知 | `true` |
| `glyphs` | 狀態符號顯示成兩格寬時改成 `"ascii"` | `"unicode"` |
| `keys.back` | 回到清單的按鍵，tmux 寫法（`C-q` 就是 `ctrl+q`） | `"C-q"` |
| `contextWarnAt` | 記憶用量到幾 % 時變色提醒 | `80` |
| `language` | `"en"` 或 `"zh-TW"` | `"en"` |

錯誤記錄在同一個資料夾的 `agentpulse.log`。

## 常見問題

**怎麼離開？按 `ctrl+c` 沒用。**
`ctrl+c` 會交給 AI，只會停掉那個 AI。要離開 AgentPulse，先按 `ctrl+q` 回到左邊，再按 `q`。AI 會繼續在背景執行。

**按了 `ctrl+c` 之後 AI 不見了，畫面寫著 exited。**
AI 已經結束。按 `ctrl+q` 回到左邊，按 `x` 關閉它，再按 `n` 開一個新的。

**第一次啟動畫面停住、沒有反應。**
專案放在「文件」「桌面」或「下載項目」資料夾時，macOS 第一次會跳出視窗詢問「終端機」能否存取該資料夾，按「允許」之前程式會停住。

**按 `shift+enter` 沒有換行，直接送出了。**
「終端機」本身不支援 `shift+enter` 換行，直接執行 Claude Code 也一樣。改按 `ctrl+j` 換行。iTerm2 可以用 `shift+enter`。

**狀態符號對不齊，或看起來佔兩格。**
在設定檔把 `glyphs` 改成 `"ascii"`。iTerm2 使用者也可以檢查 Settings → Profiles → Text 的「Treat ambiguous-width characters as double width」是否被打開了（預設關閉）。

**畫面寫著「視窗太小」。**
終端機視窗至少要 70 欄寬、16 行高，拉大視窗即可。

**更新 AgentPulse 之後畫面怪怪的。**
在終端機執行 `AgentPulse --restart-ui`，只會重建 AgentPulse 自己的畫面，AI 不受影響。

**我自己的 tmux 會被影響嗎？**
不會。AgentPulse 只用自己專屬的兩個 tmux server，不讀寫 `~/.tmux.conf`。
