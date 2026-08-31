const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../Model.js")

const root = path.join(__dirname, "..")
const read = (name) => fs.readFileSync(path.join(root, name), "utf8")

test("every Model function called by QML exists on the node and QML surface", () => {
  const qml = ["Panel.qml", "Service.qml"].map(read).join("\n")
  const called = [...qml.matchAll(/Model\.([A-Za-z][A-Za-z0-9_]*)\s*\(/g)].map(match => match[1])
  assert.ok(called.length > 0)
  for (const name of new Set(called)) assert.equal(typeof Model[name], "function", name)
})

test("manifest, service, bar host, and panel agree on one module id", () => {
  const manifest = JSON.parse(read("manifest.json"))
  const escaped = manifest.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  for (const file of ["BarWidget.qml", "Panel.qml"]) {
    assert.match(read(file), new RegExp(`moduleName: "${escaped}"`))
  }
  assert.match(read("Service.qml"), new RegExp(`moduleId: "${escaped}"`))
})

test("manifest entry points exist and stay inside the repository root", () => {
  const manifest = JSON.parse(read("manifest.json"))
  for (const entry of Object.values(manifest.entryPoints)) {
    const resolved = path.resolve(root, entry)
    assert.ok(resolved.startsWith(root + path.sep))
    assert.equal(fs.statSync(resolved).isFile(), true)
  }
})

test("marketplace presentation is exact, themed, and bound to real-shell proof", () => {
  const manifest = JSON.parse(read("manifest.json"))
  assert.equal(manifest.description.length, 500)
  assert.equal(manifest.barWidget.description.length, 500)
  assert.equal(manifest.barWidget.description, manifest.description)
  const banner = read("assets/banner.svg")
  assert.match(banner, />BAZAAR</)
  assert.match(banner, /<(?:path|circle)\b/)
  assert.match(banner, /marketplace trail/)

  const render = read("scripts/rig-render.sh")
  assert.match(render, /OMARCHY_RIG_RESOLUTION:-1280x720/)
  assert.match(render, /OMARCHY_RIG_SCALE:-1\.25/)
  assert.match(render, /rawShellLogSha256/)
  assert.match(render, /visualInspection:\{status:"pending"/)
  assert.match(render, /refusing to write a clean receipt for a warning-bearing shell log/)
  assert.match(render, /grim "\\\$SHOT"/)
  assert.match(render, /-path '\.\/e2e\/\*'/)
  assert.match(render, /rig-before-shell\.sh/)
  assert.doesNotMatch(render, /grim -g|pkill/)

  const approval = read("scripts/approve-preview.sh")
  assert.match(approval, /product value is visible without reading the README/)
  assert.match(approval, /no primary content is clipped/)
  assert.match(approval, /plugin-specific visual identity/)
})

test("deterministic marketplace render tells Bazaar's complete product story", () => {
  const catalog = JSON.parse(read("e2e/catalog.json"))
  const stats = JSON.parse(read("e2e/stats.json"))
  const hook = read("e2e/rig-before-shell.sh")
  const settings = JSON.parse(read("e2e/render-settings.json"))
  assert.equal(catalog.plugins.length, 8)
  assert.ok(catalog.plugins.some(plugin => plugin.installAvailable === false))
  assert.ok(catalog.plugins.some(plugin => plugin.verificationStatus === "verified"))
  assert.ok(Object.values(stats.plugins).some(row => row.copies > 100))
  assert.equal(settings.settings.defaultSort, "Trending")
  assert.match(hook, /catalogFetchedAt/)
  assert.match(hook, /lastSeenAt/)
  assert.equal((hook.match(/\$PLUGIN_DIR\/manifest\.json/g) || []).length, 2,
    "installed-plugin fixtures must inherit the validated current manifest schema")
  assert.doesNotMatch(hook, /curl|wget|Authorization|Bearer/)
})

test("service network and local-state boundaries stay explicit", () => {
  const service = read("Service.qml")
  assert.match(service, /catalogUrl:[\s\S]*https:\/\/omarchyplugins\.com\/catalog\.json/)
  assert.match(service, /statsUrl:\s*"https:\/\/api\.omarchyplugins\.com\/v1\/stats"/)
  assert.match(service, /readonly property int pollIntervalSec:\s*1800/)
  assert.match(service, /readonly property int fetchTimeoutSec:\s*30/)
  assert.match(service, /catalogFetchedAt/)
  assert.match(service, /savedPath/)
  assert.doesNotMatch(service, /Authorization|Bearer|apiKey|token/)
})
