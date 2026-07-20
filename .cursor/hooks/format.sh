#!/usr/bin/env bash
set -euo pipefail

# Cursor sends hook JSON on stdin. On Windows, hooks often run as
# `bash --login -i`, and stdin may never close — unbounded `cat` hangs forever.
read_payload() {
    local line payload=""

    # Wait briefly for the first line of JSON; exit empty on timeout.
    if IFS= read -r -t 2 line; then
        payload="$line"
    elif [[ -n "${line:-}" ]]; then
        # EOF without a trailing newline still leaves data in $line.
        payload="$line"
    else
        return 0
    fi

    # Drain any remaining lines briefly (payload is usually one line).
    while IFS= read -r -t 0.2 line; do
        payload+=$'\n'"$line"
    done || true

    printf '%s' "$payload"
}

payload="$(read_payload)"

if [[ -z "$payload" ]]; then
    exit 0
fi

file_path="$(jq -r '.file_path // empty' <<< "$payload" 2>/dev/null || true)"

if [[ -z "$file_path" ]]; then
    exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ignore_path="$repo_root/.prettierignore"

if [[ "$file_path" != /* ]]; then
    file_path="$repo_root/$file_path"
fi

if [[ ! -f "$file_path" ]]; then
    exit 0
fi

prettier_target="$file_path"
if [[ "$file_path" == "$repo_root/"* ]]; then
    prettier_target="${file_path#"$repo_root"/}"
fi

if ! (
    cd "$repo_root"
    npx --no-install prettier --ignore-path "$ignore_path" --ignore-unknown --write "$prettier_target"
) >/dev/null 2>&1; then
    exit 0
fi
