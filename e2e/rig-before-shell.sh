#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="$HOME/.local/state/omarchy/bazaar"
PLUGINS_DIR="$HOME/.config/omarchy/plugins"
mkdir -p "$STATE_DIR" "$PLUGINS_DIR/crew-chief" "$PLUGINS_DIR/flow-boundary"

cp -f "$PLUGIN_DIR/e2e/catalog.json" "$STATE_DIR/catalog.json"
cp -f "$PLUGIN_DIR/e2e/stats.json" "$STATE_DIR/stats.json"

NOW_MS=$(( $(date +%s) * 1000 ))
jq -n --argjson now "$NOW_MS" \
  '{catalogEtag:"rig-fixture",catalogFetchedAt:$now,statsFetchedAt:$now,lastSeenAt:1787850000000}' \
  > "$STATE_DIR/internal.json"
jq -n '{saved:{"io.github.patel.radio-atlas":true,"io.github.jeremylongshore.quiet-queue":true}}' \
  > "$STATE_DIR/saved.json"

jq -n '{id:"io.github.jeremylongshore.crew-chief",version:"1.0.0"}' \
  > "$PLUGINS_DIR/crew-chief/manifest.json"
jq -n '{id:"io.github.jeremylongshore.flow-boundary",version:"0.1.0"}' \
  > "$PLUGINS_DIR/flow-boundary/manifest.json"

jq -e '.plugins | length == 8' "$STATE_DIR/catalog.json" >/dev/null
jq -e '.plugins["io.github.patel.radio-atlas"].views == 1840' "$STATE_DIR/stats.json" >/dev/null
