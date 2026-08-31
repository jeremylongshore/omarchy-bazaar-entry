# Testing Context: Bazaar
<!-- TESTING.md schema v1. Policy defaults were scaffolded by implement-tests for engineer review. -->

## Classification (policy)

Repo type: frontend (Omarchy QML bar widget with public marketplace reads and private local state)
Primary language(s): QML, JavaScript ES5, Bash
Applicable layers: L1, L2, L3, L4-contract, L4-integration, L5-security, L5-a11y, L5-perf, L6-smoke, L6-e2e, L6-visual, L7-UAT
Waived layers: L4-migration (no schema migration), L5-chaos (single-user desktop plugin)
Compliance overlay: none

## Thresholds (policy, hash-pinned)

coverage.line: 95
coverage.branch: 90
coverage.function: 95
mutation.kill_rate: 90
crap.prod_max: 30
crap.test_max: 15
crap.project_avg: 10
flaky.tolerance: 0/3runs
test.complexity_ceiling: 15
personas.flow_coverage_min: 100
journeys.step_coverage_min: 100

## Installed gates (observational)

L0: @intentsolutions/audit-harness 1.3.1
L1: pre-push fail-closed gate lane plus GitHub Actions test and gate workflows
L2: ShellCheck, npm audit, pinned Actions, and canonical Omarchy C28-C43 gates
L3: node:test, c8 coverage, Stryker mutation, and three-run concurrent stability
L4-contract: captured real marketplace catalog and stats fixtures plus QML-to-Model contract assertions
L4-integration: service URL, refresh cadence, cache, shortlist, and installed-state contracts
L5-security: clipboard newline and length guards, URL allowlists, bounded payloads, plain-text rendering, and local-only shortlist
L5-a11y: named bar button, named search input, keyboard focus, close, tab, move, and activation paths
L5-perf: catalog and stats cadences, body ceiling, installed scan ceiling, and C42 resource gate
L6-smoke: manifest entry-point, module identity, gate-runner, and presentation contract tests
L6-e2e: Buzz validator, qmllint, isolated real shell, live IPC open, and direct full-frame capture
L6-visual: exact 1280x720 live render with hash-bound human inspection
L7-UAT: search, shortlist, safe handoff, and freshness journeys mapped in tests/JOURNEYS.md

## Frameworks (observational)

unit: node:test
coverage: c8 12
mutation: Stryker 10, full non-incremental run
policy: @intentsolutions/audit-harness 1.3.1
e2e: scripts/rig-verify.sh plus scripts/rig-render.sh on intent-ops-buzz/omarchy-rig

## Last audit (observational)

date: 2026-08-30
grade: B (89/100 pending fresh Buzz production evidence)
auditor: audit-tests plus omarchy-ship
p0_gaps: 1, fresh production E2E render and visual approval unavailable while Buzz is offline
p1_gaps: 0 after implementation
p2_gaps: 0

## Traceability (observational, updated by audit-tests)

rtm.total_requirements: 9
rtm.by_moscow:
  must: 8 (7 covered, 1 blocked on Buzz)
  should: 1 (1 covered, 0 uncovered)
  could: 0
  wont: 0
rtm.orphaned_tests: 0
personas.declared: 3
personas.under_threshold: 0 locally, production journey pending
journeys.declared: 3
journeys.fully_covered: 2 locally
journeys.partial: 1 pending Buzz

## Hash manifest

version: 1
last_init: 2026-08-30 during the requested test-system implementation
protected_files:
  - tests/TESTING.md policy sections
  - tests/RTM.md MoSCoW tiers
  - tests/JOURNEYS.md criticality
  - stryker.config.json thresholds
