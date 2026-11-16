import {join} from 'node:path';
import {DEFAULT_LANG, strings, type Lang} from '../i18n/strings.ts';
import {COLORS} from '../ui/theme.ts';

// tmux 預設只用 modifyOtherKeys 向外層終端機要求延伸按鍵，iTerm2 3.4 不支援導致 Shift+Enter 變回普通 Enter；
// 改寫 Eneks/Dseks 同時發出 modifyOtherKeys 與 kitty 鍵盤協定要求，讓終端機挑認得的用
const EXTENDED_KEYS_OVERRIDE = String.raw`set -as terminal-overrides ',*:Eneks=\E[>4;2m\E[>1u:Dseks=\E[>4m\E[<u'`;

// 兩座 server 共用設定：取消 prefix 鍵、不延遲 Esc（確保即時送達 AI），並啟用真彩色與延伸按鍵
const COMMON = `
set -g prefix None
set -g prefix2 None
unbind-key -a -T prefix
set -s escape-time 0
set -s focus-events on
set -s extended-keys on
set -s extended-keys-format csi-u
set -g default-terminal "tmux-256color"
set -as terminal-features ",*:RGB"
set -as terminal-features ",*:extkeys"
${EXTENDED_KEYS_OVERRIDE}
set -g mouse on
set-environment -g COLORTERM truecolor
`;

export function uiTmuxConf(): string {
	const c = COLORS;
	return `# 由 AgentPulse 自動產生，每次啟動都會覆寫
${COMMON}
# 滑鼠拖曳與連擊只轉送給會處理滑鼠的窗格（內嵌的 AI client）；左側欄、HUD 與佔位畫面不進入 copy-mode
bind-key -T root MouseDrag1Pane if-shell -F "#{||:#{pane_in_mode},#{mouse_any_flag}}" { send-keys -M } { }
bind-key -T root DoubleClick1Pane select-pane -t = \\; if-shell -F "#{||:#{pane_in_mode},#{mouse_any_flag}}" { send-keys -M } { }
bind-key -T root TripleClick1Pane select-pane -t = \\; if-shell -F "#{||:#{pane_in_mode},#{mouse_any_flag}}" { send-keys -M } { }
set -g status on
set -g status-position top
set -g status-interval 0
set -g status-style "bg=${c.bg},fg=${c.dim}"
set -g status-format[0] " AgentPulse"
set -g window-style "bg=${c.bg},fg=${c.text}"
set -g window-active-style "bg=${c.bg},fg=${c.text}"
set -g pane-border-style "fg=${c.rule},bg=${c.bg}"
set -g pane-active-border-style "fg=${c.accent},bg=${c.bg}"
set -g pane-border-status top
set -g pane-border-format "#{?@ap-label, #[fg=${c.accent}]#{@ap-label}#[fg=${c.rule}] ,}"
set -g pane-border-lines single
set -g pane-border-indicators off
set -g message-style "bg=${c.selected},fg=${c.text}"
# 加上 -q 相容支援最低版本的 tmux 3.2（popup 樣式為較新版才有的選項）
set -gq popup-style "bg=${c.bg},fg=${c.text}"
set -gq popup-border-style "fg=${c.dim},bg=${c.bg}"
set -gq popup-border-lines single
`;
}

export function confPaths(dir: string): {ui: string; agents: string} {
	return {ui: join(dir, 'ui.tmux.conf'), agents: join(dir, 'agents.tmux.conf')};
}

// 提示文字讓使用者明確知道 AI 已結束，避免誤以為畫面卡住
export function exitedFormat(lang: Lang = DEFAULT_LANG): string {
	return `#[fg=${COLORS.text},bg=${COLORS.selected}] ${strings(lang).tmux.exited('#{pane_dead_status}')} #[default]`;
}

export function agentsTmuxConf(lang: Lang = DEFAULT_LANG): string {
	return `# 由 AgentPulse 自動產生，每次啟動都會覆寫
${COMMON}
set -g status off
set -g history-limit 50000
set -g remain-on-exit on
set -g remain-on-exit-format "${exitedFormat(lang)}"
# 關閉目前顯示中的工作階段時改切到其他工作階段，避免內嵌 client 直接 detach
set -g detach-on-destroy off
set -g window-size latest
set -g allow-passthrough on
set -s set-clipboard on
set -s copy-command "pbcopy"
# 拖曳結束時複製到 macOS 剪貼簿並保留反白選取，不跳回底部
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-no-clear "pbcopy"
bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-no-clear "pbcopy"
bind-key -T copy-mode-vi MouseDown1Pane select-pane \\; send-keys -X clear-selection
bind-key -T copy-mode MouseDown1Pane select-pane \\; send-keys -X clear-selection
# 單純點擊不拖曳時離開 copy-mode，讓之後打字能立刻送給 AI
bind-key -T copy-mode-vi MouseUp1Pane send-keys -X cancel
bind-key -T copy-mode MouseUp1Pane send-keys -X cancel
`;
}
