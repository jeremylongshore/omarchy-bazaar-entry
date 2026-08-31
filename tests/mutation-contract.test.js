const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const Model = require("../Model.js")

const NOW = Date.parse("2026-08-30T12:00:00Z")
const DAY = 86400000

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function plugin(overrides = {}) {
  return Object.assign({
    id: "io.github.alice.market-map",
    name: "Market Map",
    description: "Find useful plugins",
    author: "alice",
    category: "Productivity",
    tags: ["marketplace", "search"],
    repo: "https://github.com/alice/market-map",
    installCommand: "omarchy-plugin-install io.github.alice.market-map",
    installAvailable: true,
    listedAt: new Date(NOW - 10 * DAY).toISOString(),
    kind: "Bar widget",
    status: "available",
    license: "MIT",
    version: "1.2.3",
    stars: 21,
    accent: "amber",
    initials: "MM",
    verificationStatus: "verified"
  }, overrides)
}

test("the exported Bazaar model has a broad deterministic mutation signature", () => {
  const catalog = JSON.stringify({ plugins: [
    plugin(),
    plugin({
      id: "io.github.bob.quiet-tool", name: "Quiet Tool", author: "bob",
      category: "System", tags: ["system", "quiet"], kind: "Panel",
      listedAt: new Date(NOW - DAY).toISOString(), installAvailable: false,
      verificationStatus: "pending", stars: 0, accent: "cyan", initials: "QT"
    }),
    { id: "io.github.carol.fallback_name", repo: "http://github.com/carol/fallback_name" }
  ] })
  const statsText = JSON.stringify({ plugins: {
    "io.github.alice.market-map": { views: 100, copies: 8, hearts: 5 },
    "io.github.bob.quiet-tool": { views: 9, copies: 0, hearts: 1 }
  } })
  const parsed = Model.parseCatalog(catalog)
  const joined = Model.join(parsed, Model.parseStats(statsText), NOW)
  const saved = Model.toggleSaved(Model.emptySaved(), "saved", joined[0].id)
  const installedText = [
    JSON.stringify({ __installedTotal: 3 }),
    JSON.stringify({ id: joined[0].id, version: "1.0.0", dir: "market-map" }),
    JSON.stringify({ id: joined[1].id, version: "2.0.0", dir: "quiet-tool" }),
    "not json"
  ].join("\n")
  const installed = Model.parseInstalled(installedText)

  const cases = {
    constants: [
      Model.MAX_BODY_CHARS, Model.CATALOG_MAX_AGE_SEC, Model.STATS_MAX_AGE_SEC,
      Model.DEFAULT_LIST, Model.SORTS, Model.MAX_INSTALLED, Model.MAX_MANIFEST_BYTES
    ],
    http: [
      "", null, undefined, "not http", "\n200",
      "HTTP/1.1 200 OK\nETag:  one  \n\nbody\n200",
      "HTTP/2 200\r\netag: two\r\n\r\nbody\n200",
      "HTTP/2 301\r\nlocation: /next\r\n\r\nHTTP/2 304\r\netag: three\r\n\r\n\n304",
      "HTTP/2 200\r\nx-etag: wrong\r\netag: right\r\n\r\n{}\n200",
      "HTTP/2 200\r\n\r\n{}\n 200 "
    ].map(Model.parseHttpResponse),
    catalog: [
      Model.parseCatalog(""), Model.parseCatalog("{"), Model.parseCatalog("null"),
      Model.parseCatalog("[]"), Model.parseCatalog('{"plugins":"bad"}'),
      parsed, Model.parseCatalog(JSON.stringify({ plugins: [null, 3, {}, { id: "x" }] }))
    ],
    fallbacks: [
      Model.prettyName("io.github.a.two_words"), Model.prettyName("one--two"),
      Model.prettyName(null), Model.authorFromRepo("https://github.com/alice/repo"),
      Model.authorFromRepo("http://github.com/Bob/repo"),
      Model.authorFromRepo("xhttps://github.com/eve/repo"), Model.authorFromRepo(null)
    ],
    stats: [
      Model.parseStats(""), Model.parseStats("{"), Model.parseStats("null"),
      Model.parseStats("[]"), Model.parseStats('{"plugins":3}'), Model.parseStats(statsText)
    ],
    join: [joined, Model.join([plugin({ listedAt: "bad" })], {}, NOW)],
    age: [
      Model.ageDays("bad", NOW), Model.ageDays(new Date(NOW).toISOString(), NOW),
      Model.ageDays(new Date(NOW - DAY).toISOString(), NOW),
      Model.ageDays(new Date(NOW + DAY).toISOString(), NOW)
    ],
    fresh: [0, NOW - DAY, NOW].map(mark => {
      const rows = clone(joined)
      return { count: Model.markNew(rows, mark), rows }
    }),
    search: ["", "   ", "market", "MARKET search", "quiet system", "missing"].map(q =>
      Model.search(joined, q).map(row => row.id)),
    filter: [
      Model.filter(joined, "", "", false, {}),
      Model.filter(joined, "Productivity", "", false, {}),
      Model.filter(joined, "", "quiet", false, {}),
      Model.filter(joined, "", "", true, saved.saved),
      Model.filter(joined, "", "", false, {}, { kind: "Panel" }),
      Model.filter(joined, "", "", false, {}, { installedOnly: true, installed }),
      Model.filter(joined, "System", "quiet", false, {}, { kind: "Panel", installedOnly: true, installed })
    ].map(rows => rows.map(row => row.id)),
    installed: {
      census: ["", "bad", '{"__installedTotal":0}', '{"__installedTotal":42}'].map(Model.installedCensus),
      map: installed,
      count: Model.installedCount(installed),
      total: Model.installedTotal(),
      truncated: Model.installedTruncated(),
      membership: [Model.isInstalled(installed, joined[0].id), Model.isInstalled(installed, "missing")],
      updates: [
        Model.hasUpdate(installed, joined[0]), Model.hasUpdate(installed, joined[1]),
        Model.hasUpdate(installed, { id: "missing", version: "9.0.0" }),
        Model.hasUpdate({ x: { version: "" } }, { id: "x", version: "1" })
      ]
    },
    versions: [
      ["1.2.3", "1.2.3"], ["1.2.4", "1.2.3"], ["1.2.2", "1.2.3"],
      ["1.2", "1.2.0"], ["1.2.0-beta", "1.2.0"], ["10.0", "2.0"]
    ].map(pair => Model.compareVersions(pair[0], pair[1])),
    saved: {
      empty: Model.emptySaved(),
      parsed: ["", "{", "null", "[]", "{}", '{"later":{"a":true,"b":false},"bad":3}'].map(Model.parseSaved),
      toggled: saved,
      named: Model.toggleSaved(saved, "work", "x"),
      status: [Model.isSaved(saved, "saved", joined[0].id), Model.isSaved(saved, "saved", "missing")],
      counts: [Model.savedCount(saved, "saved"), Model.savedCount(saved, "missing")]
    },
    sort: Model.SORTS.concat(["unknown"]).map(key => ({
      key, label: Model.sortLabel(key), ids: Model.sort(joined, key).map(row => row.id)
    })),
    facets: {
      categories: Model.categories(joined),
      categoriesByCount: Model.categoriesByCount(joined.concat(clone(joined.slice(0, 1)))),
      kindsByCount: Model.kindsByCount(joined.concat(clone(joined.slice(1, 2)))),
      tags: Model.tags(joined.concat(clone(joined.slice(0, 1))))
    },
    accents: ["rose", "ROSE", "coral", "amber", "lime", "cyan", "violet", "unknown", ""].map(Model.accentHue),
    initials: [
      { initials: "abc" }, { initials: " q " }, { name: "Two Words" },
      { name: "one-word" }, { name: "solo" }, {}, null
    ].map(Model.initialsFor),
    bars: [
      Model.barFraction(0, joined, "views"), Model.barFraction(-1, joined, "views"),
      Model.barFraction(5, null, "views"), Model.barFraction(5, [], "views"),
      ...joined.map(row => Model.barFraction(row.views, joined, "views"))
    ],
    compact: [0, 1, 999, 1000, 1500, 9999, 10000, 10500].map(Model.compact),
    velocity: [0, 1.25, 9.99, 10, 99.9, 100, 123.6].map(Model.velocityText),
    ageText: ["bad", NOW, NOW - DAY, NOW - 29 * DAY, NOW - 30 * DAY, NOW - 65 * DAY]
      .map(value => Model.ageText(typeof value === "number" ? new Date(value).toISOString() : value, NOW)),
    commands: [
      "", null, " x ", "\nrm", "x\nrm", "\rrm", "x\rrm",
      "x".repeat(400), "x".repeat(401)
    ].map(Model.safeInstallCommand),
    listings: [
      "", null, " x ", "valid.id", "a/b", "../x", "x".repeat(121), "x".repeat(122)
    ].map(Model.listingUrl),
    repos: [
      "", null, " https://github.com/a/b ", "http://github.com/a/b",
      "xhttps://github.com/a/b", "https://github.com/a/b?x=1", "https://evil.com/a/b"
    ].map(Model.repoUrl)
  }

  const signature = crypto.createHash("sha256").update(JSON.stringify(cases)).digest("hex")
  assert.equal(signature, "7e1a02d0a21462b71ad721a1dd40af69b554c039d187a3ca52740c89aac5f111")
})

test("security boundaries remain observable at their exact edges", () => {
  assert.equal(Model.safeInstallCommand("\nfirst"), "")
  assert.equal(Model.safeInstallCommand("\rfirst"), "")
  assert.equal(Model.safeInstallCommand("x".repeat(400)), "x".repeat(400))
  assert.equal(Model.safeInstallCommand("x".repeat(401)), "")
  assert.equal(Model.repoUrl("xhttps://github.com/a/b"), "")
  assert.equal(Model.repoUrl("https://github.com/a/b?next=https://evil.example"), "")
  assert.equal(Model.listingUrl(" valid.id "), "https://omarchyplugins.com/plugin.html?id=valid.id")

  const explicit = Model.parseCatalog(JSON.stringify({ plugins: [
    plugin({ installAvailable: false, verificationStatus: "verified" }),
    plugin({ id: "other", installAvailable: true, verificationStatus: "pending" })
  ] }))
  assert.deepEqual(explicit.map(item => [item.installAvailable, item.verified]), [
    [false, true], [true, false]
  ])

  const tied = [
    plugin({ id: "z", name: "Zulu", views: 5, listedAt: "2026-08-01T00:00:00Z" }),
    plugin({ id: "a", name: "Alpha", views: 5, listedAt: "2026-08-01T00:00:00Z" })
  ]
  assert.deepEqual(Model.sort(tied, "views").map(item => item.name), ["Alpha", "Zulu"])
  assert.deepEqual(Model.sort(tied, "newest").map(item => item.name), ["Alpha", "Zulu"])
  assert.deepEqual(Model.tags([
    { tags: ["z", "a"] }, { tags: ["z", "b"] }, { tags: ["a"] }
  ]), ["a", "z", "b"])
})

test("parser, ranking, and freshness decisions stay observable at boundary values", () => {
  assert.deepEqual(Model.parseHttpResponse("\n\nbody\n200"), { status: 200, etag: "", body: "body" })
  assert.equal(Model.parseHttpResponse("\n20x").status, 0)
  assert.equal(Model.parseHttpResponse("\nx200").status, 0)
  assert.deepEqual(
    Model.parseHttpResponse("etag: first\nx: etag: wrong\n\nbody\n200"),
    { status: 200, etag: "first", body: "body" }
  )
  assert.equal(Model.parseHttpResponse("HTTP/2 200\netag:\t spaced \n\nbody\n200").etag, "spaced")

  const freshRows = [
    { listedAt: new Date(NOW - DAY).toISOString(), isNew: false },
    { listedAt: new Date(NOW - 10 * DAY).toISOString(), isNew: true },
    { listedAt: "bad", isNew: true }
  ]
  assert.equal(Model.markNew(freshRows, NOW - 5 * DAY), 1)
  assert.deepEqual(freshRows.map(row => row.isNew), [true, false, false])

  const searchRows = [
    { name: "Alpha", id: "id-one", description: "desc", author: "ann", category: "Cat", tags: ["first", "second"] },
    { name: "Beta", id: "id-two", description: "other", author: "bob", category: "Dog", tags: ["third"] }
  ]
  assert.deepEqual(Model.search(searchRows, "  ALPHA   second  ").map(row => row.name), ["Alpha"])
  assert.deepEqual(Model.search(searchRows, "Alphaid-one").map(row => row.name), [])
  assert.deepEqual(Model.search(searchRows, "annCat").map(row => row.name), [])
  assert.deepEqual(Model.filter(searchRows, "", "first", false, {}).map(row => row.name), ["Alpha"])

  const ranked = [
    { id: "slow-z", name: "Zulu", listedAt: "2026-08-01T00:00:00Z", velocity: 1, views: 1 },
    { id: "fast-a", name: "Alpha", listedAt: "2026-08-02T00:00:00Z", velocity: 100, views: 100 }
  ]
  assert.deepEqual(Model.sort(ranked, "name").map(row => row.id), ["fast-a", "slow-z"])
  assert.deepEqual(Model.sort(ranked, "velocity").map(row => row.id), ["fast-a", "slow-z"])

  assert.deepEqual(Model.categories([
    { category: "Zulu" }, { category: "Alpha" }, { category: "Zulu" }, { category: "" }
  ]), ["Alpha", "Zulu"])
  assert.deepEqual(Model.categoriesByCount([
    { category: "Zulu" }, { category: "Alpha" }, { category: "Zulu" }, { category: "Beta" }
  ]), ["Zulu", "Alpha", "Beta"])
  assert.deepEqual(Model.kindsByCount([
    { kind: "Zulu" }, { kind: "Alpha" }, { kind: "Zulu" }, { kind: "Beta" }
  ]), ["Zulu", "Alpha", "Beta"])
  assert.deepEqual(Model.tags([
    { tags: ["Zulu", "Alpha"] }, { tags: ["Zulu", "Beta"] }
  ]), ["Zulu", "Alpha", "Beta"])

  const bars = [{ value: 1 }, { value: 100 }, { value: 10 }, { value: 5 }, { value: 2 },
    { value: 80 }, { value: 60 }, { value: 40 }, { value: 20 }, { value: 0 }]
  assert.equal(Model.barFraction(40, bars, "value"), 0.5)
  assert.equal(Model.barFraction(100, bars, "value"), 1)
  assert.equal(Model.barFraction(0, bars, "value"), 0)

  assert.equal(Model.compareVersions("1", "1.0.1"), -1)
  assert.equal(Model.compareVersions("1.0.1", "1"), 1)
  assert.equal(Model.compareVersions("1.beta.2", "1.0.3"), -1)

  const noCensus = Model.parseInstalled('  {"id":"a","version":"1","dir":" x "}  ')
  assert.deepEqual(noCensus, { a: { version: "1", dir: " x " } })
  assert.equal(Model.installedTotal(), 1)
  assert.equal(Model.installedTruncated(), false)
  const zeroCensus = Model.parseInstalled('{"__installedTotal":0}\n{"id":"a"}')
  assert.equal(Model.installedCount(zeroCensus), 1)
  assert.equal(Model.installedTotal(), 1)
})
