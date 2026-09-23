# Data pipeline

## Ownership and reproducibility

Research finds and reads disclosures. It produces a proposal and evidence. Deterministic code normalizes calculations, checks records and prepares publication. UI code only consumes the generated schema-2 document. It never imports acquisition or publication code.

The first canonical model treats one metric's current/prior comparison and its scope as a single evidence unit. Each record has a content hash, stable metric identity, definition version, report context, payload and evidence links. Outlook and events are separate record types. Prior records and evidence remain append-only; document references select the active version. Changing a report context creates new identities, so old facts cannot silently migrate into a new quarter.

`data/monitor.json` is materialized from `data/ledger.json`. Seven configured derived metrics use named, tested operations with explicit supporting inputs. `data/evidence.json` binds source evidence or formula inputs to specific records. `pipeline/legacy-baseline.json` permits only the initial frozen migration records: it cannot authorize newly changed values.

## One update, end to end

```sh
git fetch origin main
git switch main
git pull --ff-only
npm ci --ignore-scripts
npm run verify
npm test
npm run monitor -- plan --scope full --run .monitor/runs/review
```

Scopes: `full`, `micron`, `industry`, `quote`, `ecosystem`, `source_audit`, `company:<id>`, `discovery`, `news`, `calendar`, `batch`, `maintenance`. Routine work starts with `schedule` and targeted discovery; `full` is an explicit complete source audit. See [cadence and news](CADENCE.md) for targets and event handling. The command creates:

- `manifest.json`: base commit/data/catalog hashes, coverage, source-read receipts, report-bundle declarations and resumable state.
- `proposal.json`: editable candidate in the familiar schema-2 format, including stable IDs.
- `supporting.json`: inputs used by formulas but not shown as separate UI rows.
- `evidence.json`: initially empty; new or changed observations need reviewed source evidence.

The `.monitor/` directory is private working state and is ignored by Git. If it is lost, start a fresh run against the last published records; never reconstruct supposed read receipts from memory.

### Discover and read

Consult the issuer discovery entries in `pipeline/catalog.json`, search the issuer's official IR releases and identify its latest report. Entry URLs are navigation starting points, not proof that an old linked report is still the latest. Agent-assisted discovery supports changing IR sites/PDF layouts without silently guessing at column positions.

Fetch a publicly accessible source to the run cache:

```sh
npm run monitor -- fetch --run .monitor/runs/review --source financial
```

Fetching only produces `status=fetched`; it is not a completed source review. After actually reading relevant original sections, capture the read document or an export from the research tool:

```sh
npm run monitor -- capture --run .monitor/runs/review --source financial --file /path/to/read-source.txt --access full --reviewed
```

Use `--access abstract` for a public summary of an unread paid report, or `secondary` for a secondary report. `capture_format=research_export` distinguishes an extracted/tool-export text hash from original file bytes. Use `--format source_bytes` only for actual original bytes. A blocked source is recorded as a failed read; do not substitute a different metric from a nearby page.

Complete each required coverage item in `manifest.json` with `status=verified|unchanged|gap|failed|pending`, the actually read `evidence` source IDs, `reviewed_at`, a concise reason, and `latest_disclosure: {url,published_at}`. `gap` means the reviewed original does not disclose the requested field; access failures use `failed`. A newly discovered but unprocessed report stays `pending`. Full success requires read receipts for every published source, including sources supporting the prior comparison.

### Fill facts and evidence

Edit `proposal.json`, preserving stable IDs, original publication dates and source types. Register new source roles/metrics before starting a run against the new catalog. Supporting inputs must also be updated when their report changes. Never use a revenue value as shipment evidence.

Create a correctly shaped evidence draft:

```sh
npm run monitor -- evidence-draft --run .monitor/runs/review --metric eco.microsoft.revenue
```

The draft is intentionally unverified. Fill each original raw value, unit, scale, period, table/column locator and source ID. For example a KRW-billions source stored as KRW trillions uses scale `0.001`. The raw input times scale must equal the candidate value. Qualitative disclosures remain qualitative. Complete concise source excerpts and page/section locators. The record's measurement, scope, period basis and accounting basis must match the catalog.

Only then set `review.confirmed=true`, name the review method and set its actual time. The source documents must match this run's captured URL, content hash, access level and read time. Do not copy long paid reports or private notes into public evidence. No automatic numeric test can establish whether an excerpt truly means what the metric says: that review remains an explicit research responsibility.

Use `manifest.report_bundle` to identify a company whose financial quarter has rolled. Its report dates, current/prior data, outlook and required supporting inputs must move together and be newly evidenced. Failed companies keep their entire previous report. Micron rollover also refreshes or clears `expected_report_review_by`. Use `publication_corrections` to explicitly identify a justified date correction or a newly versioned dynamic source; never change publication dates just because it was checked again.

### Build, verify, apply

```sh
npm run monitor -- build --run .monitor/runs/review
npm run monitor -- status --run .monitor/runs/review
npm run monitor -- apply --run .monitor/runs/review
npm run verify
npm test
npm run test:ui
```

Build fixes a completion clock once, recalculates configured formulas and writes `build/candidate.json`, `ledger.json`, `evidence.json`, `receipt.json` and `report.json`. It does not edit published data. Repeating the same completed run with the same inputs yields the same result.

The pipeline derives check timestamps from coverage and read receipts; dates supplied in the candidate cannot make an unchecked scope fresh. A partial/failed attempt can produce a valid failure receipt while preserving old successful dates. `apply` revalidates, verifies source cache hashes, checks the base Git commit and base data hash, then prepares the canonical records, evidence, generated data, immutable previous snapshot and release receipt together. It makes no remote changes.

## Publication and verification

Commit the prepared data files atomically, then push normally. When using GitHub connector Git-data tools, create one tree based on the latest main tree, one commit with that main commit as parent, and update with `force:false`. Publish exactly the tested contents. If main has moved, rebuild/reconcile against it and rerun checks; do not merely change the base SHA in a receipt.

CI runs schema/semantic checks, transition/history checks, regression tests and phone tests, then uploads only the allowlisted build. Pages deployment depends on those checks. See `DEPLOYMENT.md` for the account settings needed to enforce that gate.

```sh
npm run monitor -- verify --base FULL_PREVIOUS_COMMIT_SHA
npm run monitor -- verify-live --url https://peterliu2357-sky.github.io/mu-checklist/
```

Confirm both deployment success and the full live data hash. A successful research run, successful Git commit and successful deployment are separate outcomes. For rollback, revert the coherent release commit, preserving original facts/check dates; do not stamp rolled-back facts as newly checked. Historical snapshots are not overwritten.

## UI-only work

Edit rendering/style files, run `npm test`, `npm run test:ui`, and `npm run build`. Do not create a research run or edit ledger/evidence/check dates. The build refreshes the embedded fallback from the same verified facts. Interface tests mock local data, so layout work does not depend on financial websites or trigger collection.
