# Recapturing the test fixtures

The offline suite runs against real payloads, never the network. Both were
captured live and trimmed to a reviewable number of entries with their structure
intact.

```bash
curl -sfL https://omarchyplugins.com/catalog.json      -o /tmp/catalog.json
curl -sfL https://api.omarchyplugins.com/v1/stats      -o /tmp/stats.json
```

Then trim `catalog.json` to a handful of `plugins[]` entries and filter
`stats.json` to the same ids. Keep at least one entry with
`installAvailable: false`, because that is what the stalled-listing test asserts
against, and at least one `Suite` kind, because suites carry a different shape.

Fixtures currently in the tree were captured 2026-08-22.
