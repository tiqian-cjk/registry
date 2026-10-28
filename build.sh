#!/bin/bash
set -euo pipefail
TOOL_DIR="$PWD/.tool-bin"
mkdir -p "$TOOL_DIR"
curl -fSL https://github.com/Losses/boring/releases/latest/download/registry-tool -o "$TOOL_DIR/registry-tool"
chmod +x "$TOOL_DIR/registry-tool"
"$TOOL_DIR/registry-tool" --tree "$PWD" --output "$PWD/dist" --base-url https://registry.tiqian.org --swift-scope tiqian --archive-base https://registry-storage.tiqian.org
