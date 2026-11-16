#!/bin/sh
# Contents/MacOS/AgentPulse: what runs when the app is opened (SPEC 7.1).
# It only picks a terminal and hands it AgentPulse.command, then exits, so the
# app never lingers in the Dock.
resources=$(cd "$(dirname "$0")/../Resources" && pwd)
command="$resources/AgentPulse.command"

iterm_installed() {
	for dir in /Applications "$HOME/Applications"; do
		[ -d "$dir/iTerm.app" ] && return 0
	done
	# Installed somewhere else: ask Spotlight by bundle id.
	[ -n "$(mdfind "kMDItemCFBundleIdentifier == 'com.googlecode.iterm2'" 2>/dev/null | head -n 1)" ]
}

# iTerm2 asks "OK to run …?" every time a script is handed to it with `open`,
# so it gets an AppleScript request instead; macOS asks once for permission.
# The path is passed as an argument, never spliced into the script.
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
# Terminal runs a .command opened this way without asking.
exec open -b com.apple.Terminal "$command"
