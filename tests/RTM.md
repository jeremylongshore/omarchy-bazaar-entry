# Requirements Traceability Matrix: Bazaar
<!-- Managed by audit-tests. MoSCoW decisions are hash-pinned after review. -->

| Req ID | MoSCoW | Source | Description | Layers | Test files | Status |
|---|---|---|---|---|---|---|
| REQ-BZ-001 | MUST | README.md | Search marketplace names, descriptions, tags, and authors from the bar | L3, L4 | tests/model.test.js, tests/mutation-contract.test.js | Covered |
| REQ-BZ-002 | MUST | README.md | Filter by category and kind and rank with honest views-per-day trending | L3, L7 | tests/model.test.js, tests/mutation-contract.test.js | Covered |
| REQ-BZ-003 | MUST | README.md | Keep a private local shortlist and new-listing watermark | L3, L4, L5 | tests/model.test.js, tests/mutation-contract.test.js, tests/contract.test.js | Covered |
| REQ-BZ-004 | MUST | README.md | Copy only one bounded newline-free install command and open only approved URLs | L3, L5 | tests/model.test.js, tests/mutation-contract.test.js | Covered |
| REQ-BZ-005 | MUST | Service.qml | Use bounded public catalog and stats reads with no account, token, telemetry, or user-data upload | L2, L4, L5 | tests/contract.test.js, scripts/gates | Covered |
| REQ-BZ-006 | MUST | Panel.qml | Render third-party catalog fields as bounded plain text with complete keyboard paths | L2, L5, L6 | tests/a11y.test.js, scripts/gates | Covered |
| REQ-BZ-007 | MUST | manifest.json | Run on stock Omarchy without Node or Python at runtime | L2, L6 | tests/contract.test.js, scripts/rig-verify.sh | Covered locally, production proof pending |
| REQ-BZ-008 | MUST | submission process | Validate, load, open, and capture the exact clean commit in the production-parity Buzz shell | L6, L7 | e2e/buzz.sh | Blocked on Buzz availability |
| REQ-BZ-009 | SHOULD | marketplace presentation | Show searchable listings, category lanes, trending signals, and shortlist value at marketplace scale | L3, L6 | tests/contract.test.js, assets/banner.svg, preview.png | Covered locally |
