#!/bin/sh
# Contents/Resources/AgentPulse.command, opened in iTerm2 or Terminal by the
# launcher. iTerm2 closes the window as soon as this exits, which would hide
# the start-up check's explanation, so wait for enter after a failure.
"$(dirname "$0")/agentpulse"
status=$?
if [ "$status" -ne 0 ]; then
	printf '\n按 enter 關閉這個視窗 / Press enter to close this window. '
	read -r _ </dev/tty
fi
exit "$status"
