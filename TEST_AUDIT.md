# Bazaar Test Audit

Date: 2026-08-30
Classification: frontend Omarchy plugin with public API reads, private local state, and marketplace presentation
Grade: B (89/100 pending production E2E evidence)

## Layer status

| Layer | Status | Evidence |
|---|---|---|
| L1 hooks and CI | Implemented | tracked pre-push hook, fail-closed gate runner, pinned GitHub Actions |
| L2 static and security | Implemented | ShellCheck, npm audit, canonical C28-C43 gates |
| L3 unit and function | Implemented | node:test, c8, Stryker, three-run concurrent stability |
| L4 contract and integration | Implemented locally | captured catalog/stats fixtures and QML-to-Model contracts |
| L5 system quality | Implemented locally | security boundaries, accessibility paths, and resource ceilings |
| L6 E2E and visual | Blocked externally | current Buzz host is offline; no stale receipt is accepted |
| L7 acceptance | Mapped | three journeys and nine requirements; production journey remains partial |

## Findings

P0: Fresh Buzz validation, live shell load, IPC open, 1280x720 capture, and hash-bound visual approval are unavailable while intent-ops-buzz is offline.

P1: None after implementation. The old rig scripts could not produce the proof the E2E test required, the old gate runner accepted malformed output, and mutation testing initially scored below policy. Those defects are remediated locally and require the final full gate run.

P2: None.

## Current deterministic evidence

- 72 tests pass after adding contract, accessibility, gate-runner, and mutation-boundary coverage.
- c8 reports 100% statements, 100% lines, 100% functions, and 95.45% branches for Model.js.
- A fresh non-incremental Stryker run scores 90.73%, above the 90% blocking floor.
- npm audit reports zero vulnerabilities after pinning the qs override.
- Both marketplace descriptions are exactly 500 characters and identical.
- C43 accepts the authored Bazaar-specific banner and blocks only missing fresh render proof.
- Escape review found no threshold downgrade, test deletion, mutation bypass, or architecture weakening.

Final release authority requires the complete gate lane, audit-harness run, and fresh Buzz evidence.
