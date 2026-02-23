#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"

if [[ -z "$payload" ]]; then
    exit 0
fi

file_path="$(node -e 'let input = ""; process.stdin.on("data", (chunk) => (input += chunk)); process.stdin.on("end", () => { try { const payload = JSON.parse(input); process.stdout.write(payload.file_path || ""); } catch {} });' <<< "$payload")"

if [[ -z "$file_path" ]]; then
    exit 0
fi

if [[ "$file_path" != /* ]]; then
    file_path="$(pwd)/$file_path"
fi

if [[ ! -f "$file_path" ]]; then
    exit 0
fi

case "$file_path" in
    */node_modules/*|*/build/*|*/dist/*|*/.git/*)
        exit 0
        ;;
esac

if ! npx --no-install prettier --ignore-unknown --write "$file_path" >/dev/null 2>&1; then
    exit 0
fi
