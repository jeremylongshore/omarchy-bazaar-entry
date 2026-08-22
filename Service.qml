import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Bazaar background service: owns both fetches, the on-disk cache, the saved
// list, and the "new since you last looked" watermark.
//
// NO external runtime. A stock Omarchy install has no node, python or ruby on
// the graphical session PATH: Omarchy installs node through mise, and mise shims
// are not exported to the session that launches Quickshell, so a plugin with an
// external poller installs cleanly, enables cleanly, and then silently never
// populates. This depends on nothing but Quickshell and the curl every Omarchy
// box already ships.
//
// Auto-update is the whole point of the service, and it is built to cost almost
// nothing when there is nothing new:
//
//   catalog.json   2.0 MB raw, 245 KB gzipped, and it carries an ETag, so an
//                  unchanged catalog answers 304 with no body at all.
//   /v1/stats      no ETag, but about 15 KB gzipped, so a plain fetch is
//                  already cheaper than the machinery to avoid one.
//
// Neither endpoint is authenticated and neither ever receives anything about
// the user. This service only reads.
Item {
  id: root

  property var shell: null
  property var manifest: null

  readonly property string moduleId: "io.github.jeremylongshore.bazaar"
  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string stateDir:
    (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/omarchy/bazaar"
  readonly property string catalogPath: stateDir + "/catalog.json"
  readonly property string statsPath: stateDir + "/stats.json"
  readonly property string internalPath: stateDir + "/internal.json"
  readonly property string savedPath: stateDir + "/saved.json"

  readonly property string catalogUrl:
    "https://omarchyplugins.com/catalog.json"
  readonly property string statsUrl: "https://api.omarchyplugins.com/v1/stats"

  readonly property int pollIntervalSec: 1800
  readonly property int fetchTimeoutSec: 30

  // ---- Settings, read from this plugin's own bar-layout entry in shell.json.
  //      A service is not a bar widget, so it cannot use BarWidget.setting().
  property string notificationsMode: "Off"
  property string defaultSort: "Trending"
  property string newBadgeMode: "On"
  property string showStalledMode: "On"

  // ---- Store
  property string catalogText: ""
  property string statsText: ""
  property string catalogEtag: ""
  property double catalogFetchedAt: 0
  property double statsFetchedAt: 0
  property double lastSeenAt: 0
  property var saved: Model.emptySaved()

  // What is on this machine, keyed by plugin id. Refreshed on load, after every
  // install, and whenever the panel opens.
  property var installed: ({})

  // Set when the scan hit its bound, so the hero can mark the count partial
  // rather than stating a number it cannot stand behind.
  property bool installedPartial: false

  property var rows: []
  property int newCount: 0
  property string lastError: ""
  property bool cacheLoaded: false
  property bool savedLoaded: false
  property bool fetchingCatalog: false
  property bool fetchingStats: false
  property bool installing: false
  property string installTarget: ""
  property string installNotice: ""

  signal storeChanged()

  // ------------------------------------------------------------------ settings

  function readSettings() {
    var cfg = shellConfigFile.text()
    if (!cfg) return
    var data
    try { data = JSON.parse(cfg) } catch (e) { return }
    var bar = data && data.bar
    var entries = (bar && bar.layout) ? bar.layout : []
    for (var i = 0; i < entries.length; i++) {
      var it = entries[i]
      if (!it || it.module !== root.moduleId) continue
      var s = it.settings || {}
      root.notificationsMode = String(s.notifications || "Off")
      root.defaultSort = String(s.defaultSort || "Trending")
      root.newBadgeMode = String(s.newBadge || "On")
      root.showStalledMode = String(s.showStalled || "On")
      return
    }
  }

  function sortKey() {
    var m = String(root.defaultSort || "Trending").toLowerCase()
    if (m === "hearts") return "hearts"
    if (m === "installs") return "copies"
    if (m === "views") return "views"
    if (m === "newest") return "newest"
    if (m === "name") return "name"
    return "velocity"
  }

  // ------------------------------------------------------------------- rebuild

  function rebuild() {
    var plugins = Model.parseCatalog(root.catalogText)

    // A cache that exists but yields nothing is not a cache, it is a trap. The
    // freshness stamp would keep saying "asked recently" for the whole max-age
    // while the widget rendered empty.
    //
    // This is not hypothetical: partway through this build the data source moved
    // from the raw registry to the site catalog, and every existing install had
    // a cached body in the old shape with a fresh timestamp beside it. Clearing
    // the stamp here turns that into one wasted fetch instead of six hours of
    // blank panel, and it covers any future shape change for free.
    if (root.catalogText !== "" && plugins.length === 0) {
      root.catalogFetchedAt = 0
      root.catalogEtag = ""
      root.poll()
    }

    var stats = Model.parseStats(root.statsText)
    var joined = Model.join(plugins, stats, Date.now())
    root.newCount = Model.markNew(joined, root.lastSeenAt)
    root.rows = joined
    root.storeChanged()
  }

  // Called when the panel is opened. Moving the watermark here, rather than on
  // fetch, is what makes the badge mean "since you last LOOKED" instead of
  // "since the last poll", which would clear itself while you were away.
  function markSeen() {
    root.lastSeenAt = Date.now()
    root.persistInternal()
    root.newCount = Model.markNew(root.rows, root.lastSeenAt)
    root.storeChanged()
  }

  // Scan the plugins directory for what is already installed.
  //
  // Keyed by the id INSIDE each manifest, never by the directory name: Omarchy
  // installs under the full plugin id, a hand clone is usually a short name, and
  // both appear side by side in practice. Matching on the folder would report an
  // installed plugin as missing.
  //
  // Bounded like every other external read here, because a plugins directory is
  // user-controlled and this process never restarts.
  function scanInstalled() {
    installedProc.command = ["bash", "-c",
      "cd \"$HOME/.config/omarchy/plugins\" 2>/dev/null || exit 0; "
      // Census first: how many plugin directories EXIST, not how many are about
      // to be read. Without it the parser cannot tell that the reader stopped
      // early, and the hero would state a confidently wrong count.
      + "printf '{\"__installedTotal\":%s}\\n' $(ls -1d */ 2>/dev/null | wc -l); "
      + "n=0; for d in */; do "
      + "[ -f \"$d/manifest.json\" ] || continue; "
      + "n=$((n+1)); [ $n -gt " + Model.MAX_INSTALLED + " ] && break; "
      + "head -c " + Model.MAX_MANIFEST_BYTES + " -- \"$d/manifest.json\" 2>/dev/null "
      + "| jq -c --arg d \"${d%/}\" '{id,version,dir:$d}' 2>/dev/null; "
      + "done; true"]
    installedProc.running = true
  }

  // Install through the first-party CLI rather than reimplementing a clone.
  //
  // An argv array with no shell: the repo URL comes from a third-party catalog,
  // and building a shell string out of it is the exec-injection shape gate c34
  // exists to refuse. --yes is required because the CLI refuses to proceed
  // without confirmation in a non-interactive context.
  function install(repoUrl) {
    var url = Model.repoUrl(repoUrl)
    if (!url) { root.lastError = "refusing to install from an unrecognised URL"; return }
    if (root.installing) return
    root.installing = true
    root.installTarget = url
    installProc.command = ["omarchy", "plugin", "add", url, "--enable", "--yes"]
    installProc.running = true
  }

  function toggleSaved(id) {
    root.saved = Model.toggleSaved(root.saved, Model.DEFAULT_LIST, id)
    savedFile.setText(JSON.stringify(root.saved))
    root.storeChanged()
  }

  // ---------------------------------------------------------------------- poll

  // Every argv element is a constant. No user data, no credential, and nothing
  // read from the catalog ever reaches a command line.
  //
  // Flag choices, each a decision rather than a default:
  //   --proto =https  exactly https. No http, no file, no scp.
  //   --compressed    the catalog is 2.0 MB raw and 245 KB gzipped.
  //   -D - -o -       headers AND body on one stdout, split in Model.js, so the
  //                   ETag round trip needs no temp files.
  //   -w http_code    the status on the final line.
  //   --max-time      a wall-clock bound on the whole transfer.
  //   no -L           a shipped URL must be the real one. A source that starts
  //                   redirecting has to fail loudly, not follow silently to a
  //                   host nobody vetted.
  //   --              ends option parsing before the URL.
  function fetchArgs(url, etag) {
    var a = ["curl", "-sS", "--proto", "=https", "--compressed",
      "--max-time", String(root.fetchTimeoutSec),
      "--max-filesize", String(Model.MAX_BODY_CHARS),
      "-D", "-", "-o", "-", "-w", "\n%{http_code}",
      "-H", "User-Agent: bazaar/1.0 (Omarchy bar widget)"]
    if (etag) { a.push("-H"); a.push("If-None-Match: " + etag) }
    a.push("--"); a.push(url)
    return a
  }

  function poll() {
    if (!root.cacheLoaded || !root.savedLoaded) return
    root.readSettings()
    var now = Date.now()

    if (!root.fetchingStats &&
        (now - root.statsFetchedAt) / 1000 >= Model.STATS_MAX_AGE_SEC) {
      root.fetchingStats = true
      statsProc.command = root.fetchArgs(root.statsUrl, "")
      statsProc.running = true
    }
    if (!root.fetchingCatalog &&
        (now - root.catalogFetchedAt) / 1000 >= Model.CATALOG_MAX_AGE_SEC) {
      root.fetchingCatalog = true
      catalogProc.command = root.fetchArgs(root.catalogUrl, root.catalogEtag)
      catalogProc.running = true
    }
  }

  // Refresh on open when the cache is stale, so the panel is current when it is
  // actually looked at and idle the rest of the time.
  function refreshIfStale() {
    root.scanInstalled()
    root.poll()
  }

  function onCatalogResponse(raw) {
    if (!root.fetchingCatalog) return
    root.fetchingCatalog = false
    var r = Model.parseHttpResponse(raw)

    if (r.status === 304) {
      // The cache is still good. Stamp it so we do not re-ask immediately, and
      // KEEP the body we already have. Overwriting here with an empty body is
      // the bug this branch exists to prevent.
      root.catalogFetchedAt = Date.now()
      root.persistInternal()
      return
    }
    if (r.status !== 200 || !r.body) {
      root.lastError = "catalog fetch failed"
      return
    }
    // Only accept a body that actually parses into entries. A CDN error page is
    // a 200 with a body, and replacing a good cache with one would empty the
    // widget until the next successful poll.
    var probe = Model.parseCatalog(r.body)
    if (!probe.length) { root.lastError = "catalog response was not usable"; return }

    root.catalogText = r.body
    root.catalogEtag = r.etag
    root.catalogFetchedAt = Date.now()
    root.lastError = ""
    catalogFile.setText(r.body)
    root.persistInternal()
    root.rebuild()
  }

  function onStatsResponse(raw) {
    if (!root.fetchingStats) return
    root.fetchingStats = false
    var r = Model.parseHttpResponse(raw)
    if (r.status !== 200 || !r.body) { root.lastError = "stats fetch failed"; return }
    // Stats are an enrichment, not the spine: the widget is fully usable with
    // registry data alone, so a bad stats payload must never blank the list.
    var probe = Model.parseStats(r.body)
    var any = false
    for (var k in probe) { any = true; break }
    if (!any) return

    root.statsText = r.body
    root.statsFetchedAt = Date.now()
    root.lastError = ""
    statsFile.setText(r.body)
    root.persistInternal()
    root.rebuild()
  }

  // ------------------------------------------------------------- persistence

  function persistInternal() {
    internalFile.setText(JSON.stringify({
      catalogEtag: root.catalogEtag,
      catalogFetchedAt: root.catalogFetchedAt,
      statsFetchedAt: root.statsFetchedAt,
      lastSeenAt: root.lastSeenAt
    }))
  }

  function loadInternal(text) {
    var d
    try { d = JSON.parse(String(text || "")) } catch (e) { d = null }
    if (d && typeof d === "object") {
      root.catalogEtag = String(d.catalogEtag || "")
      root.catalogFetchedAt = Number(d.catalogFetchedAt) || 0
      root.statsFetchedAt = Number(d.statsFetchedAt) || 0
      root.lastSeenAt = Number(d.lastSeenAt) || 0
    }
    root.cacheLoaded = true
    root.scanInstalled()
    root.rebuild()
    root.poll()
  }

  // ------------------------------------------------------------------- procs

  Process {
    id: catalogProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.onCatalogResponse(text)
    }
    onExited: function (code) {
      if (code !== 0 && root.fetchingCatalog) {
        root.fetchingCatalog = false
        root.lastError = "catalog fetch failed"
      }
    }
  }

  Process {
    id: installedProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.installed = Model.parseInstalled(text)
        root.installedPartial = Model.installedTruncated()
        root.storeChanged()
      }
    }
  }

  Process {
    id: installProc
    stdout: StdioCollector { waitForEnd: true }
    onExited: function (code) {
      root.installing = false
      // The CLI prints its own diagnostics; surface only the verdict, and
      // rescan either way so a partial install is still reflected.
      root.installNotice = code === 0
        ? "installed, enable it from the bar settings if it did not appear"
        : "install failed (exit " + code + ")"
      root.scanInstalled()
      root.storeChanged()
    }
  }

  Process {
    id: statsProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.onStatsResponse(text)
    }
    onExited: function (code) {
      if (code !== 0 && root.fetchingStats) {
        root.fetchingStats = false
        root.lastError = "stats fetch failed"
      }
    }
  }

  // -------------------------------------------------------------- file views

  FileView {
    id: catalogFile
    path: root.catalogPath
    atomicWrites: true
    printErrors: false
    onLoaded: { root.catalogText = text(); root.rebuild() }
    onLoadFailed: root.catalogText = ""
  }

  FileView {
    id: statsFile
    path: root.statsPath
    atomicWrites: true
    printErrors: false
    onLoaded: { root.statsText = text(); root.rebuild() }
    onLoadFailed: root.statsText = ""
  }

  FileView {
    id: internalFile
    path: root.internalPath
    atomicWrites: true
    printErrors: false
    onLoaded: root.loadInternal(text())
    onLoadFailed: root.loadInternal("")
  }

  FileView {
    id: savedFile
    path: root.savedPath
    atomicWrites: true
    printErrors: false
    onLoaded: { root.saved = Model.parseSaved(text()); root.savedLoaded = true; root.storeChanged() }
    onLoadFailed: { root.saved = Model.emptySaved(); root.savedLoaded = true }
  }

  FileView {
    id: shellConfigFile
    path: (Quickshell.env("XDG_CONFIG_HOME") || root.home + "/.config") + "/omarchy/shell.json"
    printErrors: false
    // Settings are edited in Omarchy's settings UI, which rewrites this file.
    // Without the watch, a sort change appeared to do nothing until the next
    // poll, which is up to half an hour away.
    watchChanges: true
    onFileChanged: reload()
    onLoaded: { root.readSettings(); root.storeChanged() }
  }

  Timer {
    interval: root.pollIntervalSec * 1000
    running: true
    repeat: true
    onTriggered: root.poll()
  }
}
