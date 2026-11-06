#!/bin/bash
set -euo pipefail
TOOL_DIR="$PWD/.tool-bin"
mkdir -p "$TOOL_DIR"
curl -fSL https://github.com/Losses/boring/releases/download/v0.0.0-snapshot.5/registry-tool -o "$TOOL_DIR/registry-tool"
chmod +x "$TOOL_DIR/registry-tool"

TREE_DIR="$PWD/.tree"
rm -rf "$TREE_DIR"
mkdir -p "$TREE_DIR"
for d in */; do
  case "$d" in .git/|.tool-bin/|.tree/|dist/) continue ;; esac
  cp -r "$d" "$TREE_DIR/"
done

"$TOOL_DIR/registry-tool" --tree "$TREE_DIR" --output "$PWD/dist" --base-url https://registry.tiqian.org --swift-scope tiqian --archive-base https://registry-storage.tiqian.org
