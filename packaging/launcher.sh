#!/bin/sh
# App bundle 入口：挑選終端機並交給它開啟 AgentPulse.command 後立刻結束，避免圖示一直留在 Dock
resources=$(cd "$(dirname "$0")/../Resources" && pwd)
command="$resources/AgentPulse.command"

iterm_installed() {
	for dir in /Applications "$HOME/Applications"; do
		[ -d "$dir/iTerm.app" ] && return 0
	done
	# 若安裝在其他資料夾，透過 Spotlight 依 Bundle ID 尋找
	[ -n "$(mdfind "kMDItemCFBundleIdentifier == 'com.googlecode.iterm2'" 2>/dev/null | head -n 1)" ]
}

# 用 open 開啟腳本時 iTerm2 每次都會跳詢問視窗，改走 AppleScript 只要授權一次；路徑以 argv 傳入避免字串注入
open_in_iterm() {
	/usr/bin/osascript - "$command" <<'APPLESCRIPT'
on run argv
	set target to quoted form of (item 1 of argv)
	tell application id "com.googlecode.iterm2"
		if (count of windows) > 0 then
			tell current window
				create tab with default profile command target
			end tell
		else
			create window with default profile command target
		end if
		activate
	end tell
end run
APPLESCRIPT
}

if iterm_installed && open_in_iterm; then
	exit 0
fi
# Terminal.app 用這種方式開啟 .command 不會每次跳確認
exec open -b com.apple.Terminal "$command"
