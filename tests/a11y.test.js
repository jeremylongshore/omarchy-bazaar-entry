const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8")

test("the persistent bar control exposes a named button and pointer activation", () => {
  const qml = read("BarWidget.qml")
  assert.match(qml, /Accessible\.role:\s*Accessible\.Button/)
  assert.match(qml, /Accessible\.name:\s*root\.opened\s*\?\s*"Close Bazaar"\s*:\s*"Open Bazaar"/)
  assert.match(qml, /onPressed:\s*function\s*\(b\)/)
})

test("the popup has keyboard focus, close, tab, move, and activation routes", () => {
  const qml = read("Panel.qml")
  assert.match(qml, /KeyboardPanel\s*\{/)
  assert.match(qml, /focusTarget:\s*keyCatcher/)
  assert.match(qml, /PanelKeyCatcher\s*\{/)
  assert.match(qml, /onCloseRequested:\s*root\.close\(\)/)
  assert.match(qml, /onTabRequested:\s*function\s*\(direction\)/)
  assert.match(qml, /onMoveRequested:\s*function\s*\(dx,\s*dy\)/)
  assert.match(qml, /onActivateRequested:/)
})

test("search has an accessible name and untrusted catalog fields are bounded plain text", () => {
  const qml = read("Panel.qml")
  assert.match(qml, /Accessible\.role:\s*Accessible\.EditableText/)
  assert.match(qml, /Accessible\.name:\s*"Search Bazaar plugins"/)
  for (const binding of ["rowItem.modelData.name", "rowItem.modelData.description"]) {
    const start = qml.indexOf(binding)
    assert.notEqual(start, -1, `${binding} binding exists`)
    const block = qml.slice(start, start + 520)
    assert.match(block, /textFormat:\s*Text\.PlainText/)
    assert.match(block, /width:\s*rowCol\.width/)
    assert.match(block, /elide:\s*Text\.ElideRight/)
  }
})
