const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const Model = require("../Model.js")

// Fixtures are real payloads captured live 2026-08-22 from the marketplace
// registry and the engagement worker, trimmed to a reviewable number of sources
// with their structure intact. Tests run against captured bytes, never the
// network. Recapture procedure: docs/FIXTURES.md.
const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")

const CATALOG = fixture("catalog.json")
const STATS = fixture("stats.json")
const NOW = Date.parse("2026-08-22T06:00:00Z")

const rows = () =>
  Model.join(Model.parseCatalog(CATALOG), Model.parseStats(STATS), NOW)

// --------------------------------------------------------------- http parsing

test("parseHttpResponse splits headers, body and status from one stdout", () => {
  const raw = 'HTTP/2 200 \r\netag: "abc"\r\ncontent-type: application/json\r\n\r\n{"a":1}\n200'
  const r = Model.parseHttpResponse(raw)
  assert.equal(r.status, 200)
  assert.equal(r.etag, '"abc"')
  assert.equal(r.body, '{"a":1}')
})

test("parseHttpResponse reports a 304 with an empty body", () => {
  // This is the case that matters: 304 means the cache is still good, so the
  // caller must keep what it has rather than overwrite it with emptiness.
  const raw = 'HTTP/2 304 \r\netag: "abc"\r\n\r\n\n304'
  const r = Model.parseHttpResponse(raw)
  assert.equal(r.status, 304)
  assert.equal(r.body.trim(), "")
})

test("parseHttpResponse reads the LAST header block, not a redirect's", () => {
  const raw = 'HTTP/2 301 \r\netag: "old"\r\nlocation: /x\r\n\r\n' +
              'HTTP/2 200 \r\netag: "new"\r\n\r\n{"ok":true}\n200'
  const r = Model.parseHttpResponse(raw)
  assert.equal(r.status, 200)
  assert.equal(r.etag, '"new"')
  assert.equal(r.body, '{"ok":true}')
})

test("parseHttpResponse survives junk without throwing", () => {
  for (const bad of ["", null, undefined, "not http at all", "\n\n"]) {
    const r = Model.parseHttpResponse(bad)
    assert.equal(typeof r.status, "number")
    assert.equal(typeof r.body, "string")
  }
})

// -------------------------------------------------------------------- catalog

test("parseCatalog reads the flat catalog array", () => {
  // Every field the panel renders must be populated for every listing, or rows
  // render blank. The raw registry could not satisfy this, which is why the
  // widget reads the site catalog instead.
  const all = Model.parseCatalog(CATALOG)
  assert.ok(all.length > 0)
  assert.ok(all.some((p) => p.id === "agx.screen-time"))
  assert.ok(all.some((p) => p.id === "lacuna.shell-suite"))
  // Every field the panel renders must be populated, or rows render blank.
  for (const p of all) {
    assert.ok(p.name, `no name for ${p.id}`)
    assert.ok(p.category, `no category for ${p.id}`)
  }
})

test("parseCatalog never throws on malformed input", () => {
  for (const bad of ["", "{", "null", "[]", '{"plugins":"nope"}', '{"plugins":[null,3]}']) {
    assert.deepEqual(Model.parseCatalog(bad), [])
  }
})

test("stalled comes from installAvailable, never inferred from traffic", () => {
  // The marketplace states this outright. An earlier build guessed it from
  // "real traffic and zero copies", which was a fair proxy and still wrong for
  // anything newly listed or simply quiet.
  const all = Model.parseCatalog(CATALOG)
  const off = all.filter((p) => p.installAvailable === false).map((p) => p.id)
  assert.ok(off.length > 0, "fixture must contain an uninstallable listing")
  for (const r of Model.join(all, {}, NOW)) {
    assert.equal(r.stalled, off.includes(r.id), r.id)
  }
})

test("parseCatalog lowercases tags so filtering is case-insensitive", () => {
  for (const p of Model.parseCatalog(CATALOG)) {
    for (const t of p.tags) assert.equal(t, t.toLowerCase())
  }
})

// ----------------------------------------------------------------------- join

test("join attaches live counts and leaves unknown plugins at zero", () => {
  const r = rows()
  const known = r.find((x) => x.id === "agx.screen-time")
  assert.ok(known.views > 0)
  const stats = Model.parseStats(STATS)
  for (const x of r) {
    if (!stats[x.id]) assert.equal(x.views + x.copies + x.hearts, 0)
  }
})

test("velocity is views per day, which is the only non-cumulative rank", () => {
  // hearts/copies/views only ever grow, so ranking on them returns whatever has
  // been listed longest. Velocity is what makes "trending" mean anything.
  const r = rows().find((x) => x.views > 0 && x.ageDays > 0)
  assert.ok(Math.abs(r.velocity - r.views / r.ageDays) < 1e-9)
})

test("ageDays floors at half a day so a same-day listing cannot divide by zero", () => {
  const r = Model.join(
    [{ id: "x", name: "x", description: "", author: "", category: "", tags: [], repo: "", installCommand: "", listedAt: new Date(NOW).toISOString() }],
    { x: { views: 10, copies: 0, hearts: 0 } }, NOW)
  assert.ok(Number.isFinite(r[0].velocity))
  assert.equal(r[0].ageDays, 0.5)
})

test("initialsFor always yields two readable characters", () => {
  assert.equal(Model.initialsFor({ initials: "LA" }), "LA")
  assert.equal(Model.initialsFor({ name: "Notification Center" }), "NC")
  assert.equal(Model.initialsFor({ name: "vitals" }), "VI")
  assert.equal(Model.initialsFor({}), "??")
})

test("accentHue is stable and inside the unit interval", () => {
  for (const a of ["rose", "coral", "amber", "lime", "cyan", "violet", "unknown", ""]) {
    const h = Model.accentHue(a)
    assert.ok(h >= 0 && h <= 1, `${a} -> ${h}`)
    assert.equal(h, Model.accentHue(a), "not stable")
  }
})

test("barFraction scales to the 90th percentile, never above 1", () => {
  const rows = [{ v: 1000 }, { v: 100 }, { v: 50 }, { v: 10 }, { v: 0 }]
  for (const r of rows) {
    const f = Model.barFraction(r.v, rows, "v")
    assert.ok(f >= 0 && f <= 1, `${r.v} -> ${f}`)
  }
  assert.equal(Model.barFraction(0, rows, "v"), 0)
  assert.equal(Model.barFraction(5, [], "v"), 0)
})

// --------------------------------------------------------------------- search

test("search requires every term to match somewhere", () => {
  const r = rows()
  const hits = Model.search(r, "screen time")
  assert.ok(hits.length >= 1)
  assert.equal(Model.search(r, "screen zzzznotathing").length, 0)
})

test("search is substring, not prefix, and case-insensitive", () => {
  const r = rows()
  assert.ok(Model.search(r, "SCREEN").length >= 1)
})

test("empty search returns everything untouched", () => {
  const r = rows()
  assert.equal(Model.search(r, "   ").length, r.length)
  assert.equal(Model.search(r, "").length, r.length)
})

// --------------------------------------------------------------------- filter

test("filter narrows by category and by tag", () => {
  const r = rows()
  const cat = Model.categories(r)[0]
  for (const x of Model.filter(r, cat, "")) assert.equal(x.category, cat)
  const tag = Model.tags(r)[0]
  for (const x of Model.filter(r, "", tag)) assert.ok(x.tags.includes(tag))
})

test("filter with no criteria is a pass-through", () => {
  const r = rows()
  assert.equal(Model.filter(r, "", "", false, {}).length, r.length)
})

// ----------------------------------------------------------------------- sort

test("every sort key orders descending and breaks ties by name", () => {
  const r = rows()
  for (const key of ["velocity", "hearts", "copies", "views"]) {
    const s = Model.sort(r, key)
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i]
      assert.ok(a[key] >= b[key], `${key} not descending at ${i}`)
      if (a[key] === b[key]) {
        assert.ok(a.name.toLowerCase() <= b.name.toLowerCase(), `${key} tie unstable`)
      }
    }
  }
})

test("sort does not mutate its input", () => {
  const r = rows()
  const before = r.map((x) => x.id).join(",")
  Model.sort(r, "hearts")
  assert.equal(r.map((x) => x.id).join(","), before)
})

test("an unknown sort key falls back to trending rather than throwing", () => {
  const r = rows()
  assert.deepEqual(
    Model.sort(r, "nonsense").map((x) => x.id),
    Model.sort(r, "velocity").map((x) => x.id))
})

test("newest sorts by listing date, most recent first", () => {
  const s = Model.sort(rows(), "newest")
  for (let i = 1; i < s.length; i++) {
    const a = Date.parse(s[i - 1].listedAt) || 0
    const b = Date.parse(s[i].listedAt) || 0
    assert.ok(a >= b)
  }
})

// ------------------------------------------------------------------ new badge

test("markNew counts listings newer than the watermark", () => {
  const r = rows()
  const n = Model.markNew(r, Date.parse("2026-08-16T00:00:00Z"))
  assert.equal(n, r.filter((x) => x.isNew).length)
  assert.ok(r.every((x) => !x.isNew || Date.parse(x.listedAt) > Date.parse("2026-08-16T00:00:00Z")))
})

test("a zero watermark marks nothing new, so a first run never floods", () => {
  const r = rows()
  assert.equal(Model.markNew(r, 0), 0)
})

// ---------------------------------------------------------------- saved lists

test("toggleSaved adds then removes, without mutating the original", () => {
  const a = Model.emptySaved()
  const b = Model.toggleSaved(a, "saved", "x.y")
  assert.equal(Model.isSaved(b, "saved", "x.y"), true)
  assert.equal(Model.isSaved(a, "saved", "x.y"), false, "input was mutated")
  const c = Model.toggleSaved(b, "saved", "x.y")
  assert.equal(Model.isSaved(c, "saved", "x.y"), false)
})

test("parseSaved survives junk and always yields the default list", () => {
  for (const bad of ["", "{", "null", "[]", '{"saved":5}']) {
    const s = Model.parseSaved(bad)
    assert.ok(s.saved && typeof s.saved === "object")
  }
})

test("savedOnly filters to the saved set", () => {
  const r = rows()
  const id = r[0].id
  const saved = Model.toggleSaved(Model.emptySaved(), "saved", id).saved
  const out = Model.filter(r, "", "", true, saved)
  assert.equal(out.length, 1)
  assert.equal(out[0].id, id)
})

// ------------------------------------------------------- install command guard

test("safeInstallCommand refuses anything that could smuggle a second command", () => {
  // This is the one string the widget puts on a clipboard, and registry entries
  // are written by third parties. A newline in a pasted command runs it.
  assert.equal(Model.safeInstallCommand("git clone https://x\nrm -rf ~"), "")
  assert.equal(Model.safeInstallCommand("git clone https://x\r\nevil"), "")
  assert.equal(Model.safeInstallCommand(""), "")
  assert.equal(Model.safeInstallCommand("x".repeat(401)), "")
  assert.equal(Model.safeInstallCommand("  git clone https://x  "), "git clone https://x")
})

test("repoUrl accepts only https github urls", () => {
  assert.equal(Model.repoUrl("https://github.com/a/b"), "https://github.com/a/b")
  for (const bad of ["http://github.com/a/b", "https://evil.com/a", "file:///etc/passwd", "", null]) {
    assert.equal(Model.repoUrl(bad), "")
  }
})

// -------------------------------------------------------------------- display

test("compact abbreviates thousands without lying about small numbers", () => {
  assert.equal(Model.compact(0), "0")
  assert.equal(Model.compact(999), "999")
  assert.equal(Model.compact(1000), "1k")
  assert.equal(Model.compact(1540), "1.5k")
  assert.equal(Model.compact(23400), "23k")
})

test("ageText reads in human units", () => {
  assert.equal(Model.ageText(new Date(NOW).toISOString(), NOW), "today")
  assert.equal(Model.ageText(new Date(NOW - 86400000).toISOString(), NOW), "1d")
  assert.equal(Model.ageText(new Date(NOW - 5 * 86400000).toISOString(), NOW), "5d")
  assert.equal(Model.ageText("nonsense", NOW), "")
})

test("listingUrl points at the marketplace page and refuses a hostile id", () => {
  assert.equal(
    Model.listingUrl("io.github.jeremylongshore.pit-wall"),
    "https://omarchyplugins.com/plugin.html?id=io.github.jeremylongshore.pit-wall")
  // Ids come from a third-party catalog and end up in a URL handed to xdg-open,
  // so anything that is not the shape the marketplace issues is refused rather
  // than encoded and hoped for.
  for (const bad of ["", "../evil", "a b", "javascript:alert(1)", null, undefined, "x".repeat(200)]) {
    assert.equal(Model.listingUrl(bad), "", JSON.stringify(bad))
  }
})

// ------------------------------------------------------------ installed state

test("parseInstalled keys on the manifest id, never the directory name", () => {
  // Omarchy installs under the full plugin id, a hand clone is usually a short
  // name, and both appear on the same machine in practice: the rig carried
  // "listening-post" and "io.github.jeremylongshore.listening-post" for one
  // plugin. Keying on the folder would report an installed plugin as missing
  // and let a duplicate hide.
  const text = [
    JSON.stringify({ id: "io.github.x.thing", version: "1.0.0", dir: "thing" }),
    JSON.stringify({ id: "io.github.x.thing", version: "1.0.0", dir: "io.github.x.thing" }),
    JSON.stringify({ id: "io.github.x.other", version: "0.2.0", dir: "other" }),
  ].join("\n")
  const inst = Model.parseInstalled(text)
  assert.equal(Model.installedCount(inst), 2, "the duplicate directory must collapse")
  assert.equal(Model.isInstalled(inst, "io.github.x.thing"), true)
  assert.equal(Model.isInstalled(inst, "io.github.x.other"), true)
  assert.equal(Model.isInstalled(inst, "io.github.x.absent"), false)
})

test("parseInstalled survives junk lines without throwing", () => {
  const text = 'garbage\n{not json\n\n' + JSON.stringify({ id: "a.b", version: "1" }) + "\nmore junk"
  const inst = Model.parseInstalled(text)
  assert.equal(Model.installedCount(inst), 1)
  for (const bad of ["", null, undefined, "   "]) {
    assert.equal(Model.installedCount(Model.parseInstalled(bad)), 0)
  }
})

test("parseInstalled caps how many entries it will build", () => {
  const many = Array.from({ length: 900 }, (_, i) =>
    JSON.stringify({ id: "p" + i, version: "1.0.0" })).join("\n")
  assert.equal(Model.installedCount(Model.parseInstalled(many)), Model.MAX_INSTALLED)
})

test("hasUpdate compares versions numerically, not as strings", () => {
  // "0.10.0" must beat "0.9.0". A string compare gets this backwards and would
  // tell a user they are up to date when they are a release behind.
  const inst = Model.parseInstalled(JSON.stringify({ id: "a", version: "0.9.0" }))
  assert.equal(Model.hasUpdate(inst, { id: "a", version: "0.10.0" }), true)
  assert.equal(Model.hasUpdate(inst, { id: "a", version: "0.9.0" }), false)
  assert.equal(Model.hasUpdate(inst, { id: "a", version: "0.8.9" }), false)
  // Not installed, or no version on either side: never claim an update.
  assert.equal(Model.hasUpdate(inst, { id: "b", version: "2.0.0" }), false)
  assert.equal(Model.hasUpdate(inst, { id: "a", version: "" }), false)
})

test("compareVersions handles prerelease and ragged segment counts", () => {
  assert.equal(Model.compareVersions("1.2.0", "1.2"), 0)
  assert.equal(Model.compareVersions("1.2.1", "1.2"), 1)
  assert.equal(Model.compareVersions("2.0.0", "10.0.0"), -1)
  assert.equal(Model.compareVersions("1.0.0-beta", "1.0.0"), 0)
})

// ------------------------------------------------------------- kind filtering

test("filter narrows by kind and by installed, and composes with the rest", () => {
  const rows = Model.join(Model.parseCatalog(CATALOG), Model.parseStats(STATS), NOW)
  const kind = Model.kindsByCount(rows)[0]
  for (const r of Model.filter(rows, "", "", false, {}, { kind })) {
    assert.equal(r.kind, kind)
  }
  const inst = {}
  inst[rows[0].id] = { version: "0.0.1" }
  const only = Model.filter(rows, "", "", false, {}, { installedOnly: true, installed: inst })
  assert.equal(only.length, 1)
  assert.equal(only[0].id, rows[0].id)
})

test("filter with no opts still behaves exactly as before", () => {
  // Back-compat matters: the opts argument was added later and every existing
  // call site passes five arguments.
  const rows = Model.join(Model.parseCatalog(CATALOG), Model.parseStats(STATS), NOW)
  assert.equal(Model.filter(rows, "", "", false, {}).length, rows.length)
})

test("kindsByCount orders by population and lists only kinds present", () => {
  const rows = Model.join(Model.parseCatalog(CATALOG), Model.parseStats(STATS), NOW)
  const ks = Model.kindsByCount(rows)
  const counts = ks.map((k) => rows.filter((r) => r.kind === k).length)
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i - 1] >= counts[i])
  for (const k of ks) assert.ok(rows.some((r) => r.kind === k))
  assert.deepEqual(Model.kindsByCount([]), [])
})

// -------------------------------------------- installed scan truncation

test("parseInstalled reports truncation when it hits the cap", () => {
  // A bound applied SILENTLY is its own defect, and this is the second time the
  // lesson has been learned in this family: the Crew Chief spool was bounded
  // without saying so and would have reported a complete fleet that was short
  // 338 sessions. Caught here by the security review lane before merge.
  const many = Array.from({ length: 400 }, (_, i) =>
    JSON.stringify({ id: "p" + i, version: "1.0.0" })).join("\n")
  const map = Model.parseInstalled(many)
  assert.equal(Model.installedCount(map), Model.MAX_INSTALLED)
  assert.equal(Model.installedTruncated(), true, "a capped scan must report itself partial")
})

test("parseInstalled reports truncation when the census exceeds what it read", () => {
  // The bound that actually bites is the reader's, and the parser cannot see
  // what the reader chose not to send. The census line closes that gap.
  const text = [
    JSON.stringify({ __installedTotal: 900 }),
    JSON.stringify({ id: "a", version: "1.0.0" }),
    JSON.stringify({ id: "b", version: "1.0.0" }),
  ].join("\n")
  Model.parseInstalled(text)
  assert.equal(Model.installedTruncated(), true)
  assert.equal(Model.installedTotal(), 900)
})

test("a complete scan is NOT reported as truncated", () => {
  // The flag has to mean something, so it must be false in the common case.
  const text = [
    JSON.stringify({ __installedTotal: 2 }),
    JSON.stringify({ id: "a", version: "1.0.0" }),
    JSON.stringify({ id: "b", version: "1.0.0" }),
  ].join("\n")
  const map = Model.parseInstalled(text)
  assert.equal(Model.installedCount(map), 2)
  assert.equal(Model.installedTruncated(), false)
})

test("duplicate directories for one plugin do not read as truncation", () => {
  // Omarchy installs under the full id and a hand clone uses a short name, so
  // the census counts DIRECTORIES while the map holds unique ids. That gap is
  // normal and must not be mistaken for dropped data.
  const text = [
    JSON.stringify({ __installedTotal: 2 }),
    JSON.stringify({ id: "same.plugin", version: "1.0.0", dir: "short" }),
    JSON.stringify({ id: "same.plugin", version: "1.0.0", dir: "same.plugin" }),
  ].join("\n")
  const map = Model.parseInstalled(text)
  assert.equal(Model.installedCount(map), 1, "ids collapse")
  assert.equal(Model.installedTruncated(), false, "a collapsed duplicate is not a dropped read")
})

test("installedCensus tolerates a missing or malformed census line", () => {
  assert.equal(Model.installedCensus(""), -1)
  assert.equal(Model.installedCensus("no census here"), -1)
  assert.equal(Model.installedCensus('{"__installedTotal":42}'), 42)
})
