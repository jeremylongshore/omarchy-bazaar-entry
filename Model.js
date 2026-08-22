// Pure logic for Bazaar: parse the marketplace registry and the engagement
// stats, join them, and answer search / filter / sort questions.
//
// No QML and no filesystem access here on purpose. The same file loads in the
// Quickshell JS engine and in node, so every rule below is covered by the
// offline suite against captured real payloads. Logic that cannot be reached by
// a test is logic that ships broken.

// A hard ceiling before JSON.parse. curl's --max-filesize only bites when the
// server sends Content-Length, and both of these hosts chunk, so this is the
// real bound. The catalog is about 2.0 MB uncompressed today and grows with the
// marketplace, so the cap is generous but finite.
var MAX_BODY_CHARS = 8000000

// How often each source is refreshed. The catalog is asked for on a long
// cadence AND conditionally, so an unchanged catalog costs a 304 and no body at
// all. Stats carry no ETag, but gzip to about 15 KB, so a plain fetch is already
// cheaper than the machinery required to avoid one.
var CATALOG_MAX_AGE_SEC = 21600
var STATS_MAX_AGE_SEC = 1800

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

// curl is invoked with -D - -o - -w '\n%{http_code}', so one stdout carries the
// response headers, a blank line, the body, and the status on the final line.
// Splitting it here rather than juggling temp files keeps the whole transport
// in memory and, more importantly, testable offline.
//
// A 304 arrives with headers and NO body, which is the case that matters: it
// means "your cache is still good", and the caller must keep what it has rather
// than overwrite it with emptiness.
function parseHttpResponse(text) {
  var s = String(text || "")
  var out = { status: 0, etag: "", body: "" }
  if (!s) return out

  var nl = s.lastIndexOf("\n")
  if (nl >= 0) {
    var tail = s.slice(nl + 1).trim()
    if (/^\d{3}$/.test(tail)) { out.status = parseInt(tail, 10); s = s.slice(0, nl) }
  }

  // curl emits a header block per response, so a redirect or a 100-continue
  // leaves several. The LAST block describes the response we actually got.
  var sep = s.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n"
  var idx = -1, probe = 0
  while (true) {
    var found = s.indexOf(sep, probe)
    if (found < 0) break
    var after = s.slice(found + sep.length, found + sep.length + 5)
    if (/^HTTP\//.test(after)) { probe = found + sep.length; continue }
    idx = found; break
  }
  if (idx < 0) { out.body = ""; return out }

  var head = s.slice(0, idx)
  out.body = s.slice(idx + sep.length)

  var lines = head.replace(/\r/g, "").split("\n")
  for (var i = lines.length - 1; i >= 0; i--) {
    var m = /^etag:\s*(.+)$/i.exec(lines[i])
    if (m) { out.etag = m[1].trim(); break }
  }
  return out
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// The site's own catalog: one flat array of every listed plugin, carrying the
// real name, description, author, category, tags, GitHub stars and, decisively,
// installAvailable.
//
// This replaced the raw registry.json partway through the build. The registry
// only carries category and tags per plugin, so names had to be derived from
// the plugin id and descriptions did not exist at all: a live render showed
// rows reading "Ovaxry" and "Omalab" with no supporting text. The catalog is
// what the website itself renders, it is populated 930/930 for every field this
// widget shows, and it makes "no install command" an authoritative flag rather
// than something inferred from a traffic pattern.
function parseCatalog(text) {
  var raw
  try { raw = JSON.parse(String(text || "")) } catch (e) { return [] }
  if (!raw || typeof raw !== "object") return []
  var list = Array.isArray(raw.plugins) ? raw.plugins : []

  var out = []
  for (var i = 0; i < list.length; i++) {
    var m = list[i]
    if (!m || typeof m !== "object") continue
    var id = String(m.id || "")
    if (!id) continue

    var tags = []
    if (Array.isArray(m.tags)) {
      for (var t = 0; t < m.tags.length; t++) tags.push(String(m.tags[t]).toLowerCase())
    }

    out.push({
      id: id,
      name: String(m.name || prettyName(id)),
      description: String(m.description || ""),
      author: String(m.author || authorFromRepo(m.repo)),
      category: String(m.category || ""),
      tags: tags,
      repo: String(m.repo || ""),
      installCommand: String(m.installCommand || ""),
      // Authoritative, from the marketplace itself. Do not infer this.
      installAvailable: m.installAvailable !== false,
      listedAt: String(m.listedAt || m.addedAt || ""),
      kind: String(m.kind || ""),
      status: String(m.status || ""),
      license: String(m.license || ""),
      version: String(m.version || ""),
      stars: Number(m.stars) || 0,
      accent: String(m.accent || ""),
      initials: String(m.initials || ""),
      verified: String(m.verificationStatus || "") === "verified",
      views: 0, copies: 0, hearts: 0, velocity: 0, isNew: false
    })
  }
  return out
}

// Fallbacks only. The catalog populates name and author for every listing, but
// a malformed entry must still render as something a person can read rather
// than as a blank row.
function prettyName(id) {
  var parts = String(id || "").split(".")
  var last = parts.length ? parts[parts.length - 1] : ""
  return last.replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase() })
}

function authorFromRepo(repo) {
  var m = /^https?:\/\/github\.com\/([^\/]+)/i.exec(String(repo || ""))
  return m ? m[1] : ""
}

function parseStats(text) {
  var raw
  try { raw = JSON.parse(String(text || "")) } catch (e) { return {} }
  var p = raw && raw.plugins
  return (p && typeof p === "object") ? p : {}
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

// Views, copies and hearts are CUMULATIVE counters, so ranking on them alone
// returns whatever has been listed longest and calls it "trending". Velocity is
// views per day since listing, which is the only field here that answers "what
// is hot right now" rather than "what has been around longest".
function join(plugins, stats, nowMs) {
  var out = []
  for (var i = 0; i < plugins.length; i++) {
    var p = plugins[i]
    var s = stats[p.id]
    var c = {}
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) c[k] = p[k]
    c.views = (s && Number(s.views)) || 0
    c.copies = (s && Number(s.copies)) || 0
    c.hearts = (s && Number(s.hearts)) || 0
    c.ageDays = ageDays(p.listedAt, nowMs)
    c.velocity = c.ageDays > 0 ? (c.views / c.ageDays) : 0
    // The marketplace states this outright, so it is read rather than guessed.
    // An earlier build inferred it from "real traffic, zero copies", which was a
    // decent proxy and still wrong for anything new or quiet.
    c.stalled = (p.installAvailable === false)
    out.push(c)
  }
  return out
}

function ageDays(listedAt, nowMs) {
  var t = Date.parse(String(listedAt || ""))
  if (!isFinite(t)) return 0
  var d = (Number(nowMs) - t) / 86400000
  return d > 0.5 ? d : 0.5
}

// "New since you last looked" is what earns this widget a place on the bar. It
// is a watermark comparison, not a time window, so closing the panel for a week
// still shows everything that appeared in that week.
function markNew(rows, lastSeenMs) {
  var n = 0
  var watermark = Number(lastSeenMs) || 0
  for (var i = 0; i < rows.length; i++) {
    var t = Date.parse(String(rows[i].listedAt || ""))
    rows[i].isNew = watermark > 0 && isFinite(t) && t > watermark
    if (rows[i].isNew) n++
  }
  return n
}

// ---------------------------------------------------------------------------
// Search, filter, sort
// ---------------------------------------------------------------------------

// Every term must match somewhere (AND), which is what people expect when they
// add a word to narrow a list. Matching is substring rather than prefix so
// "note" finds "notification-center".
function search(rows, query) {
  var q = String(query || "").trim().toLowerCase()
  if (!q) return rows
  var terms = q.split(/\s+/)
  var out = []
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    var hay = (r.name + " " + r.id + " " + r.description + " " +
               r.author + " " + r.category + " " + r.tags.join(" ")).toLowerCase()
    var all = true
    for (var t = 0; t < terms.length; t++) {
      if (hay.indexOf(terms[t]) < 0) { all = false; break }
    }
    if (all) out.push(r)
  }
  return out
}

function filter(rows, category, tag, savedOnly, saved) {
  var c = String(category || "").toLowerCase()
  var g = String(tag || "").toLowerCase()
  var s = saved || {}
  if (!c && !g && !savedOnly) return rows
  var out = []
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    if (c && r.category.toLowerCase() !== c) continue
    if (g && r.tags.indexOf(g) < 0) continue
    if (savedOnly && !s[r.id]) continue
    out.push(r)
  }
  return out
}

// ---------------------------------------------------------------------------
// Saved lists
// ---------------------------------------------------------------------------

// The marketplace's hearts are anonymous aggregates by design: the engagement
// worker stores no accounts, cookies or browser identifiers, so there is no
// "plugins I hearted" to fetch back. A personal shortlist is therefore
// something the website structurally cannot offer and a local widget can.
//
// Stored as { list-name: { plugin-id: true } } rather than a flat set, so
// named lists ("to try", "work box") are a UI change later and not a migration.
var DEFAULT_LIST = "saved"

function emptySaved() {
  var s = {}
  s[DEFAULT_LIST] = {}
  return s
}

function parseSaved(text) {
  var raw
  try { raw = JSON.parse(String(text || "")) } catch (e) { return emptySaved() }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptySaved()
  var out = {}
  for (var list in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, list)) continue
    var ids = raw[list]
    if (!ids || typeof ids !== "object") continue
    var keep = {}
    for (var id in ids) {
      if (Object.prototype.hasOwnProperty.call(ids, id) && ids[id]) keep[String(id)] = true
    }
    out[String(list)] = keep
  }
  if (!out[DEFAULT_LIST]) out[DEFAULT_LIST] = {}
  return out
}

function isSaved(saved, list, id) {
  var l = (saved || {})[list || DEFAULT_LIST]
  return !!(l && l[id])
}

function toggleSaved(saved, list, id) {
  var s = parseSaved(JSON.stringify(saved || {}))
  var key = list || DEFAULT_LIST
  if (!s[key]) s[key] = {}
  if (s[key][id]) delete s[key][id]
  else s[key][id] = true
  return s
}

function savedCount(saved, list) {
  var l = (saved || {})[list || DEFAULT_LIST]
  if (!l) return 0
  var n = 0
  for (var k in l) if (Object.prototype.hasOwnProperty.call(l, k)) n++
  return n
}

var SORTS = ["velocity", "hearts", "copies", "views", "stars", "newest", "name"]

function sortLabel(key) {
  if (key === "velocity") return "TRENDING"
  if (key === "hearts") return "HEARTS"
  if (key === "copies") return "INSTALLS"
  if (key === "views") return "VIEWS"
  if (key === "stars") return "GITHUB STARS"
  if (key === "newest") return "NEWEST"
  return "NAME"
}

function sort(rows, key) {
  var copy = rows.slice()
  var k = SORTS.indexOf(key) >= 0 ? key : "velocity"
  copy.sort(function (a, b) {
    if (k === "name") return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
    if (k === "newest") {
      var ta = Date.parse(a.listedAt) || 0, tb = Date.parse(b.listedAt) || 0
      if (tb !== ta) return tb - ta
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
    }
    var va = Number(a[k]) || 0, vb = Number(b[k]) || 0
    if (vb !== va) return vb - va
    // Ties broken by name so the order is stable run to run; an unstable list
    // that reshuffles on every poll is unusable.
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
  })
  return copy
}

function categories(rows) {
  var seen = {}, out = []
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i].category
    if (c && !seen[c]) { seen[c] = true; out.push(c) }
  }
  out.sort()
  return out
}

// Categories ordered by how many plugins carry them, so a capped chip row shows
// the filters that are actually worth offering rather than the alphabetical
// first eight.
function categoriesByCount(rows) {
  var count = {}
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i].category
    if (c) count[c] = (count[c] || 0) + 1
  }
  var out = []
  for (var k in count) if (Object.prototype.hasOwnProperty.call(count, k)) out.push(k)
  out.sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1) })
  return out
}

function tags(rows) {
  var count = {}
  for (var i = 0; i < rows.length; i++) {
    for (var t = 0; t < rows[i].tags.length; t++) {
      var g = rows[i].tags[t]
      count[g] = (count[g] || 0) + 1
    }
  }
  var out = []
  for (var k in count) if (Object.prototype.hasOwnProperty.call(count, k)) out.push(k)
  out.sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1) })
  return out
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

// The catalog assigns each plugin one of six accent names and a two-letter
// initial, which is what the website uses to give every listing a distinct tile.
// Reproducing that here would mean hardcoding six brand colours into a widget
// whose entire visual contract is "inherit the user's theme", and a rose tile on
// a green Everforest bar looks like a bug.
//
// So the accent name only chooses a HUE, and the saturation and lightness stay
// fixed. Each plugin still gets a stable, recognisable colour, and all of them
// sit at the same weight as the rest of the shell.
function accentHue(accent) {
  var a = String(accent || "").toLowerCase()
  if (a === "rose") return 0.95
  if (a === "coral") return 0.04
  if (a === "amber") return 0.11
  if (a === "lime") return 0.26
  if (a === "cyan") return 0.52
  if (a === "violet") return 0.75
  // Unknown accent: derive a stable hue from the id so it is still consistent
  // run to run rather than defaulting everything to one colour.
  var h = 0
  var s = String(accent || "")
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h / 360
}

// Two characters is what fits a square tile at bar-panel scale.
function initialsFor(row) {
  var s = String((row && row.initials) || "").trim()
  if (s) return s.slice(0, 2).toUpperCase()
  var n = String((row && row.name) || "").trim()
  if (!n) return "??"
  var parts = n.split(/[\s._-]+/)
  if (parts.length > 1 && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase()
  return n.slice(0, 2).toUpperCase()
}

// A relative bar needs a denominator that is not dominated by one outlier. The
// top plugin has roughly twenty times the velocity of the median, so scaling to
// the maximum would flatten everything else to an invisible sliver.
function barFraction(value, rows, key) {
  var v = Number(value) || 0
  if (v <= 0 || !rows || !rows.length) return 0
  var vals = []
  for (var i = 0; i < rows.length; i++) vals.push(Number(rows[i][key]) || 0)
  vals.sort(function (a, b) { return b - a })
  var idx = Math.floor(vals.length * 0.1)
  var ref = vals[idx] || vals[0] || 1
  var f = v / ref
  return f > 1 ? 1 : f
}

function compact(n) {
  var v = Number(n) || 0
  if (v >= 10000) return Math.round(v / 1000) + "k"
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k"
  return String(v)
}

function velocityText(v) {
  var n = Number(v) || 0
  if (n >= 100) return Math.round(n) + "/day"
  if (n >= 10) return n.toFixed(0) + "/day"
  return n.toFixed(1) + "/day"
}

function ageText(listedAt, nowMs) {
  var t = Date.parse(String(listedAt || ""))
  if (!isFinite(t)) return ""
  var d = Math.floor((Number(nowMs) - t) / 86400000)
  if (d <= 0) return "today"
  if (d === 1) return "1d"
  if (d < 30) return d + "d"
  var mo = Math.floor(d / 30)
  return mo + "mo"
}

// The install command is the one string this widget puts on a clipboard, so it
// is the one string that must never be trusted blindly. Registry entries are
// written by third parties; a command containing a newline could smuggle a
// second command into a paste. One line, bounded, or nothing.
function safeInstallCommand(cmd) {
  var s = String(cmd || "")
  if (s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) return ""
  s = s.trim()
  if (!s || s.length > 400) return ""
  return s
}

// The marketplace listing page for a plugin. This is the better destination
// than the repository for almost every purpose: it carries the preview image,
// the rendered description, the install command, and the heart control. The
// repo is where you go to read the code, which is a different question.
//
// The id is placed in a query parameter, so it is percent-encoded and validated
// against the shape the marketplace actually issues rather than trusted.
function listingUrl(id) {
  var s = String(id || "").trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(s)) return ""
  return "https://omarchyplugins.com/plugin.html?id=" + encodeURIComponent(s)
}

function repoUrl(repo) {
  var s = String(repo || "").trim()
  return /^https:\/\/github\.com\/[A-Za-z0-9._\/-]+$/.test(s) ? s : ""
}

// Loaded two ways and it must behave identically in both: inside Quickshell via
// `import "Model.js" as Model`, which is where it actually runs, and inside node
// for the offline suite. The guard is what lets one file serve both, so every
// rule above is covered by a test rather than only by a code review. Everything
// here stays ES5: no arrow functions, no let/const, no template literals, no
// require, because the QML engine is what has to run it.
if (typeof module !== "undefined") {
  module.exports = {
    MAX_BODY_CHARS: MAX_BODY_CHARS,
    CATALOG_MAX_AGE_SEC: CATALOG_MAX_AGE_SEC,
    STATS_MAX_AGE_SEC: STATS_MAX_AGE_SEC,
    DEFAULT_LIST: DEFAULT_LIST,
    SORTS: SORTS,
    parseHttpResponse: parseHttpResponse,
    parseCatalog: parseCatalog,
    parseStats: parseStats,
    prettyName: prettyName,
    authorFromRepo: authorFromRepo,
    join: join,
    ageDays: ageDays,
    markNew: markNew,
    search: search,
    filter: filter,
    sort: sort,
    sortLabel: sortLabel,
    categories: categories,
    categoriesByCount: categoriesByCount,
    tags: tags,
    emptySaved: emptySaved,
    parseSaved: parseSaved,
    isSaved: isSaved,
    toggleSaved: toggleSaved,
    savedCount: savedCount,
    accentHue: accentHue,
    initialsFor: initialsFor,
    barFraction: barFraction,
    compact: compact,
    velocityText: velocityText,
    ageText: ageText,
    safeInstallCommand: safeInstallCommand,
    listingUrl: listingUrl,
    repoUrl: repoUrl
  }
}
