#!/bin/sh
# Removes everything AgentPulse put on this Mac (SPEC 7.1). A copy lives in
# AgentPulse.app/Contents/Resources so it still works after the project
# folder is gone.
set -eu

BUNDLE_ID=local.agentpulse.app
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
CONFIG_DIR=$HOME/.config/agentpulse
SOCKET_DIR=${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
export PATH

say() { printf '%s\n' "$*"; }

# Only bundles we installed, never someone else's app of the same name.
apps=
for dir in /Applications "$HOME/Applications" ${AGENTPULSE_APP_DIR:+"$AGENTPULSE_APP_DIR"}; do
	app=$dir/AgentPulse.app
	[ -d "$app" ] || continue
	id=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$app/Contents/Info.plist" 2>/dev/null || true)
	[ "$id" = "$BUNDLE_ID" ] || continue
	case " $apps " in *" $app "*) ;; *) apps="$apps $app" ;; esac
done

has_tmux=0
if command -v tmux >/dev/null 2>&1; then has_tmux=1; fi
running=0
if [ "$has_tmux" -eq 1 ]; then
	running=$(tmux -L agentpulse list-sessions -F '#{session_name}' 2>/dev/null | grep -c '^agentpulse-' || true)
fi
servers=0
for socket in agentpulse-ui agentpulse; do
	if [ -S "$SOCKET_DIR/$socket" ]; then servers=1; fi
done

if [ -z "$apps" ] && [ ! -e "$CONFIG_DIR" ] && [ "$servers" -eq 0 ]; then
	say "沒有找到 AgentPulse 的任何檔案，不需要移除。"
	exit 0
fi

say "這會清掉 AgentPulse 的所有檔案，不留殘留："
say ""
n=1
if [ "$servers" -eq 1 ]; then
	if [ "$running" -gt 0 ]; then
		say "  $n. 關閉 AgentPulse 的背景程式。目前有 $running 個 AI 在背景執行，會一起結束。"
	else
		say "  $n. 關閉 AgentPulse 的背景程式。"
	fi
	n=$((n + 1))
fi
for app in $apps; do
	say "  $n. 刪除 App：$app"
	n=$((n + 1))
done
if [ -e "$CONFIG_DIR" ]; then
	say "  $n. 刪除設定與記錄：$CONFIG_DIR"
	n=$((n + 1))
fi
say "  $n. 清除 AgentPulse 的「控制 iTerm」權限紀錄"
say ""
printf '確定要移除嗎？輸入 y 後按 enter（直接按 enter 則取消）：'
answer=
read -r answer </dev/tty || true
if [ "$answer" != y ] && [ "$answer" != Y ]; then
	say "已取消，沒有刪除任何東西。"
	exit 0
fi

say ""
if [ "$has_tmux" -eq 1 ]; then
	tmux -L agentpulse-ui kill-server 2>/dev/null || true
	tmux -L agentpulse kill-server 2>/dev/null || true
fi
# tmux deletes its socket file on the way out, but one that crashed or was
# killed leaves it behind. Remove it only once tmux confirms nothing is
# listening on it any more.
for socket in agentpulse-ui agentpulse; do
	i=0
	while [ -S "$SOCKET_DIR/$socket" ] && [ "$i" -lt 20 ]; do
		if [ "$has_tmux" -eq 1 ] && ! tmux -L "$socket" list-sessions >/dev/null 2>&1; then
			rm -f "$SOCKET_DIR/$socket"
			break
		fi
		sleep 0.1
		i=$((i + 1))
	done
done
for app in $apps; do
	"$LSREGISTER" -u "$app" 2>/dev/null || true
	rm -rf "$app"
done
rm -rf "$CONFIG_DIR"
# The one-time "control iTerm" permission; only this app's entry.
tccutil reset AppleEvents "$BUNDLE_ID" >/dev/null 2>&1 || true

left=
for app in $apps "$CONFIG_DIR"; do
	if [ -e "$app" ]; then
		left="$left
  $app"
	fi
done
for socket in agentpulse-ui agentpulse; do
	if [ -S "$SOCKET_DIR/$socket" ]; then
		left="$left
  $SOCKET_DIR/$socket"
	fi
done
if [ -n "$left" ]; then
	say "移除沒有完成，下面這些還在：$left"
	exit 1
fi
say "已移除 AgentPulse，沒有留下任何檔案。"
