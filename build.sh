#!/bin/bash
set -euo pipefail
curl -sL https://github.com/Losses/boring/releases/latest/download/registry-tool -o /tmp/registry-tool
chmod +x /tmp/registry-tool
/tmp/registry-tool --tree "$PWD" --output "$PWD/dist" --base-url https://registry.tiqian.org --swift-scope tiqian --archive-base https://registry-storage.tiqian.org
