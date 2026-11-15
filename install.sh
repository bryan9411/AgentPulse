#!/bin/sh
# Installs AgentPulse.app (SPEC 7.1). Uses macOS built-ins only; Bun is
# fetched into a temporary folder when it is not already installed, and
# that folder is deleted at the end, so nothing but the app is left behind.
set -eu

BUN_VERSION=1.4.4
# From https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/SHASUMS256.txt
BUN_SHA256_ARM64=c240d7f0ccb90c263a849fcdb09b7ee62630d921348ed6aafda86b9d577bc510
BUN_SHA256_X64=d4a155adfbfd09155eb3ba05c9e3a544f39297d7a68616d3c7759f67ab5c47dc
BUNDLE_ID=local.agentpulse.app
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
fail() {
	printf '\n安裝停止：%s\n' "$*" >&2
	exit 1
}

cd "$(dirname "$0")"
[ "$(uname -s)" = Darwin ] || fail "AgentPulse 目前只支援 macOS。"
# Homebrew's folders, in case this shell's PATH lacks them.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
export PATH

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

step "檢查需要的程式"
missing=0
if tmux_path=$(command -v tmux); then
	version=$("$tmux_path" -V 2>/dev/null || true)
	major=$(printf '%s' "$version" | sed -n 's/[^0-9]*\([0-9][0-9]*\)\.\([0-9][0-9]*\).*/\1/p')
	minor=$(printf '%s' "$version" | sed -n 's/[^0-9]*\([0-9][0-9]*\)\.\([0-9][0-9]*\).*/\2/p')
	if [ -z "$major" ] || [ "$major" -lt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -lt 2 ]; }; then
		say "  tmux 版本太舊（目前：${version:-未知}），至少要 3.2。更新：brew upgrade tmux"
		missing=1
	else
		say "  tmux：$version"
	fi
else
	say "  沒有安裝 tmux。安裝：brew install tmux"
	missing=1
fi
# /usr/bin/git exists even without the developer tools; it must actually run.
if git_version=$(git --version 2>/dev/null); then
	say "  git：$git_version"
else
	say "  沒有安裝 git。安裝：xcode-select --install"
	missing=1
fi
[ "$missing" -eq 0 ] || fail "請先安裝上面列出的程式，再重新執行 ./install.sh"

step "準備編譯工具 Bun"
if bun=$(command -v bun); then
	say "  使用電腦上已安裝的 Bun：$("$bun" --version)"
else
	case $(uname -m) in
	arm64) asset=bun-darwin-aarch64 sum=$BUN_SHA256_ARM64 ;;
	x86_64) asset=bun-darwin-x64-baseline sum=$BUN_SHA256_X64 ;;
	*) fail "不支援這種處理器：$(uname -m)" ;;
	esac
	say "  暫時下載 Bun $BUN_VERSION（安裝完會自動刪除）"
	curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/$asset.zip" -o "$work/bun.zip" ||
		fail "下載 Bun 失敗，請確認網路連線後再試一次。"
	[ "$(shasum -a 256 "$work/bun.zip" | cut -d ' ' -f 1)" = "$sum" ] ||
		fail "下載的 Bun 檢查碼不符，為了安全已停止。"
	unzip -q "$work/bun.zip" -d "$work"
	bun=$work/$asset/bun
	# package.json's build:mac calls `bun` by name.
	PATH="$work/$asset:$PATH"
fi
# Keep Bun's download cache in the temporary folder too.
BUN_INSTALL_CACHE_DIR=$work/cache
export BUN_INSTALL_CACHE_DIR

step "下載專案套件並編譯（約 1 分鐘）"
"$bun" install --frozen-lockfile
"$bun" run build:mac

step "組裝 AgentPulse.app"
app=$work/AgentPulse.app
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp packaging/Info.plist "$app/Contents/Info.plist"
cp packaging/launcher.sh "$app/Contents/MacOS/AgentPulse"
cp packaging/AgentPulse.command "$app/Contents/Resources/AgentPulse.command"
cp packaging/AppIcon.icns "$app/Contents/Resources/AppIcon.icns"
cp uninstall.sh "$app/Contents/Resources/uninstall.sh"
cp dist/AgentPulse "$app/Contents/Resources/agentpulse"
chmod +x "$app/Contents/MacOS/AgentPulse" "$app/Contents/Resources/AgentPulse.command" \
	"$app/Contents/Resources/uninstall.sh" "$app/Contents/Resources/agentpulse"

step "安裝到「應用程式」資料夾"
if [ -n "${AGENTPULSE_APP_DIR:-}" ]; then
	target_dir=$AGENTPULSE_APP_DIR
elif [ -w /Applications ]; then
	target_dir=/Applications
else
	target_dir=$HOME/Applications
fi
mkdir -p "$target_dir"
target=$target_dir/AgentPulse.app
if [ -e "$target" ]; then
	existing=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$target/Contents/Info.plist" 2>/dev/null || true)
	[ "$existing" = "$BUNDLE_ID" ] || fail "$target 已經存在，但不是 AgentPulse 安裝的，為了安全不會取代它。"
	say "  取代舊版本"
	rm -rf "$target"
fi
mv "$app" "$target"
"$LSREGISTER" -f "$target" 2>/dev/null || true
say "  已安裝到：$target"

# A running UI server keeps the old program in memory until it is rebuilt.
if tmux -L agentpulse-ui has-session 2>/dev/null; then
	step "AgentPulse 正在執行中"
	say "  要讓新版本生效，需要重新整理畫面：會關閉目前的 AgentPulse 視窗，"
	say "  背景執行中的 AI 和對話都不受影響，重新開啟 App 就會接回來。"
	printf '  現在重新整理嗎？輸入 y 後按 enter（直接按 enter 則略過）：'
	answer=
	read -r answer </dev/tty || true
	if [ "$answer" = y ] || [ "$answer" = Y ]; then
		tmux -L agentpulse-ui kill-server 2>/dev/null || true
		say "  已重新整理，請重新開啟 AgentPulse。"
	else
		say "  已略過。之後在終端機執行這行即可重新整理："
		say "  \"$target/Contents/Resources/agentpulse\" --restart-ui"
	fi
fi

step "完成"
say "  開啟方式：在「應用程式」資料夾或 Spotlight（cmd+空白鍵）搜尋 AgentPulse。"
say "  有安裝 iTerm2 會開在 iTerm2，沒有的話開在「終端機」。"
say "  移除方式：在這個資料夾執行 ./uninstall.sh"
say "  詳細說明請看 README.md"
