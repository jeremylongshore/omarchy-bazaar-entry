# Changelog

Notable changes to Bazaar.

Entries are derived from this repository's commit history, so every line
corresponds to a real change. The format follows Keep a Changelog and the
project uses Semantic Versioning.

Regenerate with `scripts/gen-changelog.sh`.

## [Unreleased]

Nothing yet.

## [1.0.1] - 2026-09-20

### Fixed

- Fetch the catalog from `plugins.omarchy.org`, the marketplace's new home. The
  old host began answering `/catalog.json` with a 301, and Bazaar refuses
  redirects on purpose, so every fresh install stayed on "Loading the
  marketplace". Reported, diagnosed and fixed by @rdannenbring in #8.
- Point the "open listing" link at the same new host.

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

