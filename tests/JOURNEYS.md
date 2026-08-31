# User Journeys: Bazaar
<!-- Managed by audit-tests. Journey criticality is hash-pinned after review. -->

## Journey: discover and safely install a useful plugin

Personas: keyboard-first plugin explorer
Trigger: the operator opens Bazaar from the persistent bar control
Critical: true
Linked RTM: REQ-BZ-001, REQ-BZ-002, REQ-BZ-004, REQ-BZ-006, REQ-BZ-008

| # | Step | Layer | Test file | Status |
|---|---|---|---|---|
| 1 | Plugin loads and opens through live IPC | L6 | e2e/buzz.sh | Blocked on Buzz availability |
| 2 | Search and filter narrow third-party listings | L3, L4 | tests/model.test.js, tests/mutation-contract.test.js | Covered |
| 3 | Trending and install availability remain honest | L3 | tests/model.test.js, tests/mutation-contract.test.js | Covered |
| 4 | Keyboard selection reaches copy and open actions | L5, L6 | tests/a11y.test.js | Covered |
| 5 | Clipboard and URL handoff reject hostile data | L3, L5 | tests/model.test.js, tests/mutation-contract.test.js | Covered |

Coverage: 4/5 steps locally; live-shell step pending Buzz

## Journey: build a private shortlist without an account

Personas: privacy-conscious evaluator
Trigger: the operator saves a listing for later
Critical: true
Linked RTM: REQ-BZ-003, REQ-BZ-005

| # | Step | Layer | Test file | Status |
|---|---|---|---|---|
| 1 | Read only public marketplace catalog and aggregate stats | L4, L5 | tests/contract.test.js | Covered |
| 2 | Add and remove a selected listing without mutating input state | L3 | tests/model.test.js | Covered |
| 3 | Filter the catalog to the private saved set | L3, L7 | tests/model.test.js, tests/mutation-contract.test.js | Covered |
| 4 | Send no account, credential, telemetry, or user payload | L2, L5 | tests/contract.test.js, scripts/gates | Covered |

Coverage: 4/4 steps (100%)

## Journey: publish a listing that tells the whole product story

Personas: plugin maintainer
Trigger: the maintainer prepares Bazaar for marketplace verification
Critical: true
Linked RTM: REQ-BZ-007, REQ-BZ-008, REQ-BZ-009

| # | Step | Layer | Test file | Status |
|---|---|---|---|---|
| 1 | Both descriptions use the exact 500-character allowance | L3, L6 | tests/model.test.js, tests/contract.test.js | Covered |
| 2 | Banner visibly depicts discovery, ranking, and marketplace results | L6 | tests/contract.test.js, assets/banner.svg | Covered |
| 3 | Gate runner rejects malformed or misleading gate output | L2, L6 | tests/gate-runner.test.js | Covered |
| 4 | Exact clean commit renders at 1280x720 in the isolated Buzz shell | L6 | e2e/buzz.sh | Blocked on Buzz availability |
| 5 | Human approval binds to the exact preview hash | L6, L7 | scripts/approve-preview.sh, tests/contract.test.js | Blocked until fresh render |

Coverage: 3/5 steps locally; production render and approval pending Buzz
