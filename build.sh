#!/bin/bash
set -euo pipefail
TOOL_DIR="$PWD/.tool-bin"
mkdir -p "$TOOL_DIR"
curl -fSL https://github.com/Losses/boring/releases/download/v0.0.0-snapshot.6/registry-tool -o "$TOOL_DIR/registry-tool"
chmod +x "$TOOL_DIR/registry-tool"

TREE_DIR="$PWD/.tree"
rm -rf "$TREE_DIR"
mkdir -p "$TREE_DIR"
for d in */; do
  case "$d" in .git/|.tool-bin/|.tree/|dist/|site/|functions/) continue ;; esac
  cp -r "$d" "$TREE_DIR/"
done

"$TOOL_DIR/registry-tool" --tree "$TREE_DIR" --output "$PWD/dist" --base-url https://registry.tiqian.org --swift-scope tiqian --archive-base https://registry-storage.tiqian.org

# 页面的构建依赖：提椠的网页组件和构建期预排，从 npmjs 装（见 site/.npmrc）
npm ci --prefix site

node site/build.mjs --tree "$TREE_DIR" --catalog "$PWD/catalog.json" --out "$PWD/dist"

# 提椠的网页组件打包到 dist/assets/tiqian/
site/node_modules/.bin/vite build --config site/vite.config.mjs --outDir "$PWD/dist/assets/tiqian"
