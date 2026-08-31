# Personas: Bazaar
<!-- Managed by audit-tests. -->

## Keyboard-first plugin explorer

Tier: local Omarchy user
Permissions: public marketplace reads and local plugin state
Key flows: open Bazaar, search and filter listings, inspect rank signals, copy or open a selected listing
Test coverage:
  - open and keyboard routing: tests/a11y.test.js and e2e/buzz.sh
  - search, filter, and ranking: tests/model.test.js and tests/mutation-contract.test.js
  - safe copy and open: tests/model.test.js and tests/mutation-contract.test.js
Coverage: 3/3 flows locally; live open pending Buzz

## Privacy-conscious evaluator

Tier: local Omarchy user
Permissions: no account and no credential
Key flows: browse public data, save a private shortlist, verify no personal data leaves the machine
Test coverage:
  - public read-only endpoints: tests/contract.test.js
  - private shortlist behavior: tests/model.test.js and tests/mutation-contract.test.js
  - no credentials or telemetry: tests/contract.test.js and scripts/gates
Coverage: 3/3 flows (100%)

## Plugin maintainer

Tier: marketplace contributor
Permissions: repository and local test rig
Key flows: understand what is trending, find missing install commands, verify marketplace presentation before submission
Test coverage:
  - trending and install availability: tests/model.test.js and tests/mutation-contract.test.js
  - fail-closed release gates: tests/gate-runner.test.js and scripts/run-plugin-gates.sh
  - exact render provenance and visual approval: tests/contract.test.js and e2e/buzz.sh
Coverage: 3/3 flows locally; final render pending Buzz
