#!/bin/sh
# iTerm2 在指令結束後會立刻關掉視窗，若啟動檢查失敗先等使用者按 enter，避免看不到錯誤說明
"$(dirname "$0")/agentpulse"
status=$?
if [ "$status" -ne 0 ]; then
	printf '\n按 enter 關閉這個視窗 / Press enter to close this window. '
	read -r _ </dev/tty
fi
exit "$status"
