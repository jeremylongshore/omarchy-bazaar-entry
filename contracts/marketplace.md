# Marketplace contract

Bazaar ships one bar widget whose listing copy and runtime behavior tell the
same product story.

- Root and bar-widget descriptions are identical and exactly 500 characters.
- Copy names search, filters, views-per-day ranking, the missing-install-command
  signal, local shortlist, freshness marker, safe command and URL actions, data
  cadence, and account-data boundary.
- `assets/banner.svg` identifies Bazaar and depicts marketplace discovery.
- `preview.png` is accepted only with current-tree Buzz provenance, exact
  1280x720 dimensions, a clean shell-log hash, and visual approval.
- Network reads are bounded to public marketplace catalog and stats data. Saved
  lists and freshness state remain local, and no account data is sent.

`tests/model.test.js`, `tests/contract.test.js`, and gate C43 enforce the
machine-checkable portions.
