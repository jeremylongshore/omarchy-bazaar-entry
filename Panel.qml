import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Bazaar panel: renders the marketplace the Service owns, and drives it with
// Herald-standard keys. This file never fetches and never writes the cache;
// Service.qml does both. It writes exactly one thing, the saved list, and only
// through the service.
Panel {
  id: root
  moduleName: "io.github.jeremylongshore.bazaar"
  ipcTarget: "io.github.jeremylongshore.bazaar"
  // manageIpc MUST stay false: the base Panel would otherwise register its own
  // IpcHandler on this same target and collide with the one declared below.
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  property var service: null

  readonly property int rowsMax: 12

  // One clock for the whole panel. Never call Date.now() inside a binding: it
  // makes every age string a non-reactive snapshot of whenever that binding
  // last happened to evaluate.
  property double nowMs: Date.now()

  // Bumped by the service on every store change so the computed properties
  // below re-evaluate. A JS array mutated in place does not notify QML on its
  // own, so without this the panel renders stale forever.
  property int revision: 0

  property string query: ""
  property string category: ""
  property string tag: ""
  property string kind: ""
  property bool savedOnly: false
  property bool installedOnly: false
  property string sortKey: "velocity"
  property int cursor: 0

  readonly property var allRows: {
    root.revision
    return root.service ? root.service.rows : []
  }

  readonly property bool installedPartial: {
    root.revision
    return root.service ? root.service.installedPartial === true : false
  }

  readonly property var installedMap: {
    root.revision
    return root.service ? root.service.installed : ({})
  }

  readonly property var savedMap: {
    root.revision
    var s = root.service ? root.service.saved : null
    return (s && s[Model.DEFAULT_LIST]) ? s[Model.DEFAULT_LIST] : ({})
  }

  readonly property int newCount: {
    root.revision
    return root.service ? root.service.newCount : 0
  }

  readonly property bool showStalled: {
    root.revision
    return root.service ? root.service.showStalledMode === "On" : true
  }

  readonly property bool badgeOn: {
    root.revision
    return root.service ? root.service.newBadgeMode === "On" : true
  }

  readonly property var visibleRows: {
    var r = Model.search(root.allRows, root.query)
    r = Model.filter(r, root.category, root.tag, root.savedOnly, root.savedMap,
                     { kind: root.kind, installedOnly: root.installedOnly,
                       installed: root.installedMap })
    return Model.sort(r, root.sortKey)
  }

  readonly property var pageRows: root.visibleRows.slice(0, root.rowsMax)

  // Category pills. "All" first, then the categories that actually exist in the
  // loaded data, so the row can never offer a filter that returns nothing.
  // Every category the data actually contains would be fifteen pills and three
  // wrapped rows, which costs more panel height than the results it filters.
  // Capped at the most populated ones, plus whichever is currently selected so
  // an active filter is always visible even when it is outside the top set.
  readonly property int chipsMax: 8

  // Kind is a second, shorter axis. Plugin Manager filters on exactly this and
  // Bazaar did not, which is a capability gap rather than a taste difference.
  readonly property var kindModel: {
    var out = [{ label: "ANY KIND", value: "" }]
    var ks = Model.kindsByCount(root.allRows).slice(0, 5)
    for (var i = 0; i < ks.length; i++) out.push({ label: ks[i].toUpperCase(), value: ks[i] })
    return out
  }

  readonly property var chipModel: {
    var out = [{ label: "ALL", value: "" }]
    var cats = Model.categoriesByCount(root.allRows).slice(0, root.chipsMax)
    var has = false
    for (var i = 0; i < cats.length; i++) {
      out.push({ label: cats[i].toUpperCase(), value: cats[i] })
      if (cats[i] === root.category) has = true
    }
    if (root.category && !has) {
      out.push({ label: root.category.toUpperCase(), value: root.category })
    }
    return out
  }

  // ---- Bar-facing contract, read by BarWidget.qml.

  // The pill counts what has been listed since you last opened the panel, and
  // shows a plain icon otherwise. It never renders a zero.
  readonly property string label: {
    if (root.badgeOn && root.newCount > 0) return "󰏖 " + Model.compact(root.newCount) + " new"
    return "󰏖"
  }

  readonly property bool isAlert: root.badgeOn && root.newCount > 0

  readonly property string tooltip: {
    var n = root.allRows.length
    if (n === 0) return "Bazaar: loading the marketplace"
    var t = "Bazaar: " + Model.compact(n) + " plugins listed"
    if (root.newCount > 0) t += ", " + Model.compact(root.newCount) + " new since you looked"
    var saved = Model.savedCount(root.service ? root.service.saved : null, Model.DEFAULT_LIST)
    if (saved > 0) t += ", " + Model.compact(saved) + " saved"
    return t
  }

  // ---- Actions.

  function clampCursor() {
    var n = root.pageRows.length
    if (n === 0) { root.cursor = 0; return }
    if (root.cursor < 0) root.cursor = 0
    if (root.cursor > n - 1) root.cursor = n - 1
  }

  function moveCursor(dy) {
    root.cursor = root.cursor + (dy > 0 ? 1 : -1)
    root.clampCursor()
  }

  function selected() {
    var rows = root.pageRows
    if (!rows.length) return null
    root.clampCursor()
    return rows[root.cursor]
  }

  // The one string this widget puts on a clipboard, and registry entries are
  // written by third parties, so it goes through safeInstallCommand first: a
  // newline in a pasted command runs a second command.
  //
  // wl-copy takes it on STDIN rather than in an argv. The first-party panels
  // build "printf %s <quoted> | wl-copy" through bash -c, which is correct but
  // depends on the quoting being right every time. A Process with no shell has
  // nothing to quote and nothing to escape.
  // Enter INSTALLS now. Copying a command was the whole interaction, and both
  // competing browsers install directly; a browser that can only tell you what
  // to type is doing half the job. Copy is still there on y, because someone
  // who wants to read the source before running it should not lose the command.
  function installSelected() {
    var row = root.selected()
    if (!row || !root.service) return
    if (!row.installAvailable) {
      root.notice = row.name + " has no install command in the catalog"
      return
    }
    if (Model.isInstalled(root.installedMap, row.id)) {
      root.notice = row.name + " is already installed"
      return
    }
    root.notice = "installing " + row.name + "…"
    root.service.install(row.repo)
  }

  function copySelected() {
    var row = root.selected()
    if (!row) return
    var cmd = Model.safeInstallCommand(row.installCommand)
    if (!cmd) { root.notice = "no install command listed for " + row.name; return }
    copyProc.stdinEnabled = true
    copyProc.command = ["wl-copy", "--type", "text/plain"]
    copyProc.pending = cmd
    copyProc.running = true
    root.notice = "copied install command for " + row.name
  }

  // The marketplace listing, not the repository. It carries the preview, the
  // rendered description, the install command and the heart control, which is
  // what someone deciding on a plugin actually wants. The repo is a separate
  // question and gets its own key.
  function openSelected() {
    var row = root.selected()
    if (!row) return
    var url = Model.listingUrl(row.id)
    if (!url) return
    openProc.command = ["xdg-open", url]
    openProc.running = true
    root.notice = "opened the listing for " + row.name
  }

  function openRepoSelected() {
    var row = root.selected()
    if (!row) return
    var url = Model.repoUrl(row.repo)
    if (!url) { root.notice = "no repository listed for " + row.name; return }
    openProc.command = ["xdg-open", url]
    openProc.running = true
    root.notice = "opened the repository for " + row.name
  }

  function toggleSaveSelected() {
    var row = root.selected()
    if (!row || !root.service) return
    root.service.toggleSaved(row.id)
  }

  function cycleSort() {
    var i = Model.SORTS.indexOf(root.sortKey)
    root.sortKey = Model.SORTS[(i + 1) % Model.SORTS.length]
    root.cursor = 0
  }

  function cycleKind() {
    var ks = Model.kindsByCount(root.allRows)
    if (!ks.length) return
    var i = ks.indexOf(root.kind)
    root.kind = (i < 0) ? ks[0] : (i === ks.length - 1 ? "" : ks[i + 1])
    root.cursor = 0
  }

  function cycleCategory() {
    var cats = Model.categories(root.allRows)
    if (!cats.length) return
    var i = cats.indexOf(root.category)
    root.category = (i < 0) ? cats[0] : (i === cats.length - 1 ? "" : cats[i + 1])
    root.cursor = 0
  }

  function clearFilters() {
    root.query = ""; root.category = ""; root.tag = ""; root.kind = ""
    root.savedOnly = false; root.installedOnly = false
    root.cursor = 0
  }

  function refresh() {
    if (root.service && root.service.refreshIfStale) root.service.refreshIfStale()
  }

  property string notice: ""

  Timer {
    interval: 4000
    running: root.notice !== ""
    repeat: false
    onTriggered: root.notice = ""
  }

  Connections {
    target: root.service
    function onStoreChanged() {
      root.revision++
      if (root.service && root.service.installNotice) {
        root.notice = root.service.installNotice
        root.service.installNotice = ""
      }
    }
  }

  // Opening the panel is what "you looked" means, so the watermark moves here
  // rather than on fetch. Moving it on fetch would clear the badge while you
  // were away, which is the one time it needed to persist.
  onOpenedChanged: {
    if (root.opened) {
      root.nowMs = Date.now()
      if (root.service) {
        root.service.markSeen()
        root.service.refreshIfStale()
      }
    }
  }

  Process {
    id: copyProc
    property string pending: ""
    stdinEnabled: true
    onStarted: {
      // Write once, then close the pipe. wl-copy reads until EOF, so without
      // this it would hang holding the clipboard open forever.
      copyProc.write(copyProc.pending)
      copyProc.stdinEnabled = false
    }
  }

  Process { id: openProc }

  // KeyboardPanel, not PanelWindow: the first-party keyboard-driven popup is
  // what carries anchorItem, fittedContentWidth/Height and the focus plumbing.
  // A PanelWindow has no contentHeight at all, which a running shell reported
  // as "Cannot assign to non-existent property" while the static gates and
  // qmllint both passed the file. Contracts like this are only provable by
  // loading the plugin.
  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(560))
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function (direction) { root.switchPanel(direction) }
      onMoveRequested: function (dx, dy) { root.moveCursor(dy) }
      // PanelKeyCatcher emits returnRequested THEN activateRequested on the
      // same Return press, so wiring both would fire two copies on one keypress.
      onActivateRequested: root.installSelected()
      onTextKey: function (t) {
        if (t === "y") root.copySelected()
        else if (t === "k") root.cycleKind()
        else if (t === "i") { root.installedOnly = !root.installedOnly; root.cursor = 0 }
        else if (t === "o") root.openSelected()
        else if (t === "g") root.openRepoSelected()
        else if (t === "s") root.toggleSaveSelected()
        else if (t === "t") root.cycleSort()
        else if (t === "f") root.cycleCategory()
        else if (t === "a") { root.savedOnly = !root.savedOnly; root.cursor = 0 }
        else if (t === "r") root.refresh()
        else if (t === "c") root.clearFilters()
        else if (t === "/") searchInput.forceActiveFocus()
      }

      Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: contentColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: contentColumn
          width: parent.width
          spacing: Style.spacing.xl

          // ---- Hero.
          Item {
            width: parent.width
            height: heroCol.implicitHeight

            Column {
              id: heroCol
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.controlPaddingX
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.controlPaddingX
              spacing: Style.spacing.sm

              Text {
                text: "BAZAAR"
                textFormat: Text.PlainText
                width: heroCol.width
                elide: Text.ElideRight
                color: root.bar ? root.bar.foreground : Color.foreground
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.title
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                // The listed count is rendered from the data actually loaded,
                // never written into the copy: the marketplace grows daily and
                // a number baked into a string is a false claim by tomorrow.
                text: root.allRows.length === 0
                  ? "Loading the marketplace"
                  : (Model.compact(root.visibleRows.length) + " of " +
                     Model.compact(root.allRows.length) + " plugins  ·  " +
                     Model.compact(Model.installedCount(root.installedMap)) +
                     (root.installedPartial ? "+ installed (partial)" : " installed") + "  ·  " +
                     Model.sortLabel(root.sortKey) +
                     (root.category ? "  ·  " + root.category.toUpperCase() : "") +
                     (root.kind ? "  ·  " + root.kind.toUpperCase() : "") +
                     (root.savedOnly ? "  ·  SAVED" : "") +
                     (root.installedOnly ? "  ·  INSTALLED" : ""))
                textFormat: Text.PlainText
                width: heroCol.width
                elide: Text.ElideRight
                color: root.bar ? Qt.darker(root.bar.foreground, 1.4) : Color.muted
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
                font.letterSpacing: 1
              }
            }
          }

          // ---- Search.
          Item {
            width: parent.width
            height: searchBox.height

            Rectangle {
              id: searchBox
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.controlPaddingX
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.controlPaddingX
              height: searchInput.implicitHeight + Style.spacing.controlPaddingY * 2
              radius: Style.cornerRadius
              color: Style.normalFill
              border.width: searchInput.activeFocus ? Style.hoverBorderWidth : Style.normalBorderWidth
              border.color: root.bar ? Qt.rgba(root.bar.foreground.r, root.bar.foreground.g,
                                               root.bar.foreground.b, Style.normalBorderAlpha)
                                     : Color.foreground

              TextInput {
                id: searchInput
                anchors.fill: parent
                anchors.leftMargin: Style.spacing.controlPaddingX
                anchors.rightMargin: Style.spacing.controlPaddingX
                verticalAlignment: TextInput.AlignVCenter
                text: root.query
                onTextChanged: { root.query = text; root.cursor = 0 }
                color: root.bar ? root.bar.foreground : Color.foreground
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
                selectByMouse: true
                clip: true
                Accessible.role: Accessible.EditableText
                Accessible.name: "Search Bazaar plugins"
                // Escape hands focus back to the key catcher so the panel's
                // single-letter keys work again without closing the panel.
                Keys.onEscapePressed: keyCatcher.forceActiveFocus()
                Keys.onDownPressed: keyCatcher.forceActiveFocus()
              }

              Text {
                anchors.fill: parent
                anchors.leftMargin: Style.spacing.controlPaddingX
                anchors.rightMargin: Style.spacing.controlPaddingX
                verticalAlignment: Text.AlignVCenter
                visible: root.query === "" && !searchInput.activeFocus
                text: "Press / to search by name, tag or author"
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: root.bar ? Qt.darker(root.bar.foreground, 1.7) : Color.muted
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
              }
            }
          }

          // ---- Filter chips. The lock-explorer panel, one of the best
          //      performing listings on the marketplace, puts its category
          //      filters on screen as a row of pills rather than behind a key.
          //      An affordance nobody can see is an affordance nobody uses, and
          //      the first build hid every filter behind a single letter.
          Flow {
            id: chipRow
            width: parent.width - Style.spacing.controlPaddingX * 2
            x: Style.spacing.controlPaddingX
            spacing: Style.spacing.sm

            Repeater {
              model: root.chipModel

              Rectangle {
                required property var modelData
                readonly property bool selected: modelData.value === root.category
                height: chipText.implicitHeight + Style.spacing.xs * 2
                width: chipText.implicitWidth + Style.spacing.controlPaddingX
                radius: height / 2
                color: selected ? Style.selectedFill : Style.normalFill
                border.width: selected ? Style.selectedBorderWidth : Style.normalBorderWidth
                border.color: root.bar
                  ? Qt.rgba(root.bar.foreground.r, root.bar.foreground.g, root.bar.foreground.b,
                            selected ? Style.selectedBorderAlpha : Style.normalBorderAlpha)
                  : Color.muted

                Text {
                  id: chipText
                  anchors.centerIn: parent
                  text: modelData.label
                  textFormat: Text.PlainText
                  elide: Text.ElideRight
                  width: Math.min(implicitWidth, chipRow.width)
                  color: parent.selected
                    ? (root.bar ? root.bar.foreground : Color.foreground)
                    : (root.bar ? Qt.darker(root.bar.foreground, 1.5) : Color.muted)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                  font.letterSpacing: 1
                }

                MouseArea {
                  anchors.fill: parent
                  onClicked: { root.category = parent.modelData.value; root.cursor = 0 }
                }
              }
            }
          }

          // ---- Kind chips. A second, shorter axis than category.
          Flow {
            id: kindRow
            width: parent.width - Style.spacing.controlPaddingX * 2
            x: Style.spacing.controlPaddingX
            spacing: Style.spacing.sm
            visible: root.allRows.length > 0

            Repeater {
              model: root.kindModel

              Rectangle {
                required property var modelData
                readonly property bool selected: modelData.value === root.kind
                height: kindText.implicitHeight + Style.spacing.xs * 2
                width: kindText.implicitWidth + Style.spacing.controlPaddingX
                radius: height / 2
                color: selected ? Style.selectedFill : "transparent"
                border.width: Style.normalBorderWidth
                border.color: root.bar
                  ? Qt.rgba(root.bar.foreground.r, root.bar.foreground.g, root.bar.foreground.b,
                            selected ? Style.selectedBorderAlpha : Style.normalBorderAlpha * 0.6)
                  : Color.muted

                Text {
                  id: kindText
                  anchors.centerIn: parent
                  text: modelData.label
                  textFormat: Text.PlainText
                  elide: Text.ElideRight
                  width: Math.min(implicitWidth, kindRow.width)
                  color: parent.selected
                    ? (root.bar ? root.bar.foreground : Color.foreground)
                    : (root.bar ? Qt.darker(root.bar.foreground, 1.7) : Color.muted)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                  font.letterSpacing: 1
                }

                MouseArea {
                  anchors.fill: parent
                  onClicked: { root.kind = parent.modelData.value; root.cursor = 0 }
                }
              }
            }
          }

          // ---- Results.
          Column {
            id: resultsCol
            width: parent.width
            spacing: Style.spacing.xs

            Repeater {
              model: root.pageRows

              Item {
                id: rowItem
                required property var modelData
                required property int index
                width: resultsCol.width
                height: rowCol.implicitHeight + Style.spacing.md

                readonly property bool isCursor: rowItem.index === root.cursor
                readonly property bool isSaved: !!root.savedMap[rowItem.modelData.id]
                readonly property bool isInstalled: Model.isInstalled(root.installedMap, rowItem.modelData.id)
                readonly property bool hasUpdate: Model.hasUpdate(root.installedMap, rowItem.modelData)

                Rectangle {
                  anchors.fill: parent
                  anchors.leftMargin: Style.spacing.sm
                  anchors.rightMargin: Style.spacing.sm
                  radius: Style.cornerRadius
                  visible: rowItem.isCursor
                  color: Style.selectedFill
                }

                // A thin accent stripe rather than an initials tile.
                //
                // The first build drew a rounded square carrying two initials,
                // copying the website's card treatment. On a dense list it
                // failed at its only job: OVaxry, OmaLab and Omamail all reduce
                // to "O", so three consecutive rows showed three identical
                // tiles sitting beside the very names they were derived from.
                // The colour was doing the distinguishing work and the letters
                // were pure noise, so the letters went.
                Rectangle {
                  id: stripe
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.controlPaddingX
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(3)
                  height: rowCol.implicitHeight
                  radius: width / 2
                  color: Qt.hsla(Model.accentHue(rowItem.modelData.accent), 0.45, 0.62, 0.9)
                }

                // Stats live in a fixed-width column on the right so the numbers
                // form a readable column instead of trailing each name at a
                // different offset.
                Column {
                  id: statCol
                  anchors.right: parent.right
                  anchors.rightMargin: Style.spacing.controlPaddingX
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(96)
                  spacing: Style.spacing.xxs

                  Text {
                    text: Model.compact(rowItem.modelData.hearts) + " \u2665   " +
                          Model.compact(rowItem.modelData.copies) + " inst"
                    textFormat: Text.PlainText
                    width: statCol.width
                    horizontalAlignment: Text.AlignRight
                    elide: Text.ElideRight
                    color: root.bar ? Qt.darker(root.bar.foreground, 1.3) : Color.foreground
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }

                  Text {
                    text: Model.velocityText(rowItem.modelData.velocity)
                    textFormat: Text.PlainText
                    width: statCol.width
                    horizontalAlignment: Text.AlignRight
                    elide: Text.ElideRight
                    color: root.bar ? Qt.darker(root.bar.foreground, 1.8) : Color.muted
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }

                  // Relative magnitude at a glance, scaled to the 90th percentile
                  // rather than the maximum: the top plugin runs about twenty
                  // times the median, so scaling to it flattens everything else
                  // into an invisible sliver.
                  Rectangle {
                    width: statCol.width
                    height: Style.space(2)
                    radius: height / 2
                    color: Style.normalFill

                    Rectangle {
                      width: parent.width * Model.barFraction(
                        rowItem.modelData[root.sortKey === "name" || root.sortKey === "newest"
                          ? "velocity" : root.sortKey], root.pageRows,
                        root.sortKey === "name" || root.sortKey === "newest"
                          ? "velocity" : root.sortKey)
                      height: parent.height
                      radius: parent.radius
                      color: Qt.hsla(Model.accentHue(rowItem.modelData.accent), 0.45, 0.60, 0.85)
                    }
                  }
                }

                Column {
                  id: rowCol
                  anchors.left: stripe.right
                  anchors.leftMargin: Style.spacing.md
                  anchors.right: statCol.left
                  anchors.rightMargin: Style.spacing.md
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.spacing.xxs

                  Text {
                    // Installed state leads the row, because "do I already have
                    // this" is the first question and the benchmark browsers
                    // answer it while Bazaar did not.
                    text: (rowItem.isInstalled ? (rowItem.hasUpdate ? "\u21bb " : "\u25cf ") : "") +
                          (rowItem.isSaved ? "\u2605 " : "") + rowItem.modelData.name +
                          (rowItem.modelData.verified ? "  \u2713" : "")
                    // Names and descriptions are written by third parties, so
                    // every one of these renders as plain text and is bounded. A
                    // long name cannot push a row or shove the stats off screen.
                    textFormat: Text.PlainText
                    width: rowCol.width
                    elide: Text.ElideRight
                    color: root.bar ? root.bar.foreground : Color.foreground
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.body
                    font.bold: rowItem.isCursor
                  }

                  Text {
                    text: rowItem.modelData.description
                    textFormat: Text.PlainText
                    width: rowCol.width
                    elide: Text.ElideRight
                    maximumLineCount: 1
                    visible: rowItem.modelData.description !== ""
                    color: root.bar ? Qt.darker(root.bar.foreground, 1.5) : Color.muted
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.bodySmall
                  }

                  Text {
                    text: (rowItem.hasUpdate ? "UPDATE  \u00b7  "
                           : rowItem.isInstalled ? "INSTALLED  \u00b7  " : "") +
                          (rowItem.modelData.isNew ? "NEW  \u00b7  " : "") +
                          (root.showStalled && rowItem.modelData.stalled ? "NO INSTALL CMD  \u00b7  " : "") +
                          (rowItem.modelData.kind ? rowItem.modelData.kind.toUpperCase() + "  \u00b7  " : "") +
                          rowItem.modelData.category.toUpperCase() +
                          (rowItem.modelData.tags.length ? "  \u00b7  " + rowItem.modelData.tags.join(" ") : "") +
                          "  \u00b7  " + Model.ageText(rowItem.modelData.listedAt, root.nowMs)
                    textFormat: Text.PlainText
                    width: rowCol.width
                    elide: Text.ElideRight
                    color: rowItem.modelData.stalled
                      ? (root.bar ? root.bar.urgent : Color.urgent)
                      : rowItem.hasUpdate
                        ? Qt.hsla(0.11, 0.55, 0.62, 1.0)
                        : (root.bar ? Qt.darker(root.bar.foreground, 1.9) : Color.muted)
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                    font.letterSpacing: 1
                  }
                }

                MouseArea {
                  anchors.fill: parent
                  acceptedButtons: Qt.LeftButton | Qt.RightButton
                  onClicked: function (m) {
                    root.cursor = rowItem.index
                    if (m.button === Qt.RightButton) root.openSelected()
                    else root.installSelected()
                  }
                }
              }
            }

            // ---- Empty state. Names the filter responsible, because "nothing
            //      found" with a filter silently applied reads as a broken
            //      widget rather than a narrow search.
            Item {
              width: parent.width
              height: emptyText.implicitHeight + Style.spacing.lg
              visible: root.allRows.length > 0 && root.pageRows.length === 0

              Text {
                id: emptyText
                anchors.left: parent.left
                anchors.leftMargin: Style.spacing.controlPaddingX
                anchors.right: parent.right
                anchors.rightMargin: Style.spacing.controlPaddingX
                anchors.verticalCenter: parent.verticalCenter
                text: root.savedOnly
                  ? "Nothing saved yet. Press s on a plugin to save it."
                  : "No plugin matches. Press c to clear the search and filters."
                textFormat: Text.PlainText
                wrapMode: Text.WordWrap
                color: root.bar ? Qt.darker(root.bar.foreground, 1.5) : Color.muted
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
            }
          }

          // ---- Footer: keys, and any transient notice.
          Item {
            width: parent.width
            height: footerText.implicitHeight + Style.spacing.lg

            Text {
              id: footerText
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.controlPaddingX
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.controlPaddingX
              anchors.verticalCenter: parent.verticalCenter
              text: root.notice !== ""
                ? root.notice
                : "enter install  \u00b7  y copy  \u00b7  o listing  \u00b7  s save  \u00b7  i installed  \u00b7  k kind  \u00b7  t sort  \u00b7  c clear"
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              color: root.bar ? Qt.darker(root.bar.foreground, 1.7) : Color.muted
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }
          }
        }
      }
    }
  }

  IpcHandler {
    target: root.ipcTarget
    function refresh(): void { root.refresh() }
    function toggle(): void { root.toggle() }
  }
}
