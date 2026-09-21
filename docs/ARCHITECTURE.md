# Architecture decisions

## Modules and contracts

| Module | Responsibility | Dependency boundary |
|---|---|---|
| `pipeline/acquire.mjs` | HTTPS capture, content hashes, access/read receipts | No UI, no GitHub write credentials |
| `pipeline/catalog.json` | Coverage, stable definitions, source roles, formulas | Explicit versioned configuration |
| `pipeline/model.mjs` | Immutable records, projection, deterministic formulas | No network or DOM |
| `pipeline/validate.mjs` | Schema, semantics, evidence, periods, reconciliations | No live source fetching |
| `pipeline/run.mjs` | Candidate state, scope outcomes, timestamp derivation | Inputs are records plus research artifacts |
| `pipeline/evolution.mjs` | Definition evolution and append-only history | Compare previous and candidate releases |
| `lib/monitor-core.js` | Pure comparisons and renderability compatibility | Browser or Node; no acquisition |
| `assets/monitor.js` | DOM rendering, navigation, published JSON loading | No research or publication dependency |
| workflow/build | Verified artifact publication | Build allowlist; research caches excluded |

The renderer's `isRenderable` is intentionally a lightweight defensive compatibility check. It is not the publication validator. Publication validates the formal schema, catalog, source roles, evidence binding, formulas, history and run scope.

## Extension protocol

For an ordinary new metric: add a stable definition to the catalog, register its source roles, add the candidate row with a stable ID, capture/review evidence, then build. Current/prior values use the registered unit; evidence declares temporal/accounting basis. Existing row types render generically. Add a fixed source example and a negative case for a novel interpretation risk.

For a new company: add its discovery adapter and group, required-company coverage, definitions and sources. Do not edit validators to change a hardcoded company count. Required coverage is derived from the registry.

For a new numeric operation/type: add an explicit named operation/renderer and independent expected-value tests. Never evaluate arbitrary formulas from source documents. Formula dependencies are ordered and cycles are rejected; mixed-unit inputs fail.

For a change in economic meaning: increment the definition version, identify the applicable reporting period, and provide newly reviewed evidence. Source restatements preserve old records while new document references select the restated comparison. Comparable prior-period values must follow the same definition. Retire a definition with `active=false` instead of reusing/deleting its identity. Remove obsolete view/formula references explicitly.

Adding an optional record should not change existing expected results. A deliberate removal or retirement changes the coverage contract and therefore requires an explicit configuration/review change. Display labels are not data identities; row references prefer `row_id` and retain legacy labels for schema-2 compatibility.

## Testing strategy

- Formal schema and semantic negative tests catch missing companies, missing source roles, wrong units, forecasts as actuals, broken references and inconsistent periods.
- Reconciliations check inventory components, net capex and adjusted free cash flow. Don't assert incomplete component sets add to a total.
- Independent historical numbers and saved supporting inputs replay formulas without calling financial sites.
- Mutation tests deliberately break evidence hashes, normalization, scope dates and definition versions.
- Run tests cover successful evidenced updates, explicit failures, partial coverage, replay and stale base data.
- Mobile tests use fixed fixtures at 320/390/430 px, navigation, disclosures, hyperlinks, fallback and refresh isolation.

Test fixture expectations are not regenerated from current live data during normal updates. An intentional schema migration must explain fixture changes. Real facts changing next quarter is not itself a regression.

## Limits and future work

Agent-assisted extraction is explicit: this release does not pretend to have reliable scrapers for every changing issuer PDF. The source adapter and evidence contract permit adding deterministic extractors later without changing the UI. Source excerpts and metadata support review; they cannot mathematically prove natural-language correspondence.

Work caches are recoverable while present. Published records/evidence/receipts survive loss of chat context; if unpublished caches disappear, restart the unfinished run rather than inventing missing source-read history. Full publisher documents may remain external for licensing reasons; record whether hashes refer to original bytes or tool exports.

The initial public migration retains legacy provenance without inventing a fresh review. Only existing unchanged records qualify; changed records require verified evidence. Repository-owner access can bypass conventions unless branch protection and Pages workflow settings are enabled. Those account-level controls are distinct from passing local tests.
