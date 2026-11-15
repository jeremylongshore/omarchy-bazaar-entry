# Changelog

Notable changes to Bazaar.

Entries are derived from this repository's commit history, so every line
corresponds to a real change. The format follows Keep a Changelog and the
project uses Semantic Versioning.

Regenerate with `scripts/gen-changelog.sh`.

## [Unreleased]

Nothing yet.

## [1.0.2] - 2026-11-15

### Fixed

- Qualify Omarchy's palette as `Commons.Color`, as the shell contract requires
  now that Qt 6.12 has its own `Color` type. A contract test fails on any bare
  `Color.` in the shipped QML.

### Changed

- Seed the rig render's isolated home with the current-theme state a real
  Omarchy install has, so first-party shell plugins on current Omarchy do not
  log warnings the render would read as plugin warnings.
- Bump `actions/setup-node` to 7.1.0 and the MiniMax review action to the
  fork's current main (`cfb2c72`), with the audit harness re-pinned.

## [1.0.1] - 2026-09-20

### Fixed

- Fetch the catalog from `plugins.omarchy.org`, the marketplace's new home. The
  old host began answering `/catalog.json` with a 301, and Bazaar refuses
  redirects on purpose, so every fresh install stayed on "Loading the
  marketplace". Reported, diagnosed and fixed by @rdannenbring in #8.
- Point the "open listing" link at the same new host.
- Raise the response size bound from 8 MB to 64 MB. Current curl (8.21, what
  Omarchy ships) counts the decoded body against `--max-filesize`, and the
  marketplace catalog passed 8 MB decoded in September 2026, so every catalog
  fetch was aborting with curl exit 63 even at the correct URL.
- Say what went wrong instead of showing "Loading the marketplace" forever. The
  catalog now keeps its own error, which a successful stats poll can no longer
  clear, and the panel states it, with a specific message when the size bound is
  the cause.

### Changed

- The service contract test now forbids the old catalog URL and any `-L` or
  `--location`, so a stale or redirect-following fetch cannot return unnoticed.
- The rig receipt writers fingerprint only the files git treats as part of the
  project, matching gates c37 and c43.

## [1.0.0] - 2026-08-22

### Added

- Bazaar, the Omarchy plugin marketplace as a bar widget
- Open the marketplace listing, not just the repository
- Install plugins, know what is installed, and filter by kind

### Internal

Tooling and repository changes with no effect on the shipped plugin.

- Vendor rig-render, which loads the plugin into a real shell
- Four-lane MiniMax review, backfilled changelog, and governance files

