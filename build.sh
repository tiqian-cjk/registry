#!/bin/bash
set -euo pipefail
# Download latest registry tool from boring releases
curl -sL https://github.com/Losses/boring/releases/latest/download/registry-tool.tar.gz | tar xz -C /tmp/
bun /tmp/registry-tool/run.ts --tree "$PWD" --output "$PWD/dist" --base-url https://registry.tiqian.org --swift-scope tiqian --archive-base https://registry-storage.tiqian.org
