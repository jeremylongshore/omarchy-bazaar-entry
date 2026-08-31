#!/usr/bin/env bash
# Acceptance lane: validate, lint, load, open, and capture Bazaar in the
# shared production-parity Omarchy shell.
# RTM: REQ-BZ-007, REQ-BZ-008
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/rig-verify.sh" "$ROOT"
"$ROOT/scripts/rig-render.sh" "$ROOT" "$ROOT/preview.png"
test -s "$ROOT/preview.png"
jq -e '.sourceDirty == false and .sourcePackageSha256 == .remotePackageSha256' \
  "$ROOT/.rig-proof.json" >/dev/null
jq -e '.sourceDirty == false and .sourcePackageSha256 == .remotePackageSha256
  and (.previewSha256 | length == 64) and .dimensions == "1280 x 720"
  and .nonblackCoverage >= 0.35' "$ROOT/.render-proof.json" >/dev/null
