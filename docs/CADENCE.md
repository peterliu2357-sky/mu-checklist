# Update cadence and AI news

The scheduler selects work. Research discovers and reads original disclosures. The pipeline validates and publishes candidates. The UI consumes the published document. A layout change never starts research or advances a check date.

## Routine and requested runs

| Run | Scope | When facts change |
|---|---|---|
| Sunday discovery | `industry,news`, due/unprocessed company disclosures; missing calendar dates separately | New or revised original disclosures only |
| Wednesday discovery | `industry,news` and due/unprocessed company disclosures | New supply/demand, pricing, AI developments or targeted disclosures |
| Confirmed earnings review | The companies due in the calendar, about 24 hours after the announced call | The complete report bundle, including comparable prior data and guidance |
| User request | Requested company/section, or comprehensive discovery if unspecified | Same evidence and publication gates as scheduled work |
| Regular close | Quote adapter after the completed trading session | Final daily OHLC only; no report/news acquisition |

The monitoring automation runs Sunday and Wednesday in America/Los_Angeles. Select the run mode using that local weekday. Neither routine run sweeps every company's report directory or reopens unchanged statements. Company discovery is selected only for confirmed reports due for review or identified, unprocessed disclosures. An explicit manual run may still request a broader check. Interim guidance revisions, preliminary results, restatements and material filings qualify as new disclosures even between quarterly reports.

```sh
npm run monitor -- schedule --mode weekly
npm run monitor -- schedule --mode midweek
npm run monitor -- schedule --mode earnings
npm run monitor -- schedule --mode manual --company nvidia
npm run monitor -- plan --scope discovery --targets industry,news --run .monitor/runs/check-new
```

`schedule` only prints a deterministic plan. It does not create external tasks. For each discovery target, read its current original IR/news index and relevant new releases. Store read receipts and register source IDs/roles in the catalog when needed. In discovery coverage, set `finding=unchanged|new_disclosure|unconfirmed` and `latest_disclosure={url,published_at}`. Identify the newest relevant report/guidance, not an old bookmark. Store the actual search time in `reviewed_at`.

When news research finds a financial revision or a new report, create a targeted `discovery` run for that company and then process its report/guidance scope. Do not wait for the next quarterly event. Due and unprocessed company disclosures also appear in routine plans so a missed event run can recover without a full-company sweep.

Run `build` and `apply` to publish discovery outcomes. Then plan from that new state and process new items with `micron`, `company:<id>`, `industry`, `news`, or `calendar`. `batch --targets news,calendar` combines explicit scopes. Unchanged quarterly facts, their original-source dates and the legacy full-audit timestamp remain unchanged. A pending or failed lookup retains its last successful discovery time. Re-discovering an unprocessed release keeps its pending alert. Process it using the same `latest_disclosure` identity to resolve the alert.

```sh
npm run monitor -- plan --scope company:nvidia --run .monitor/runs/nvidia-report
npm run monitor -- plan --scope batch --targets news,calendar --run .monitor/runs/news-calendar
```

Every targeted scope needs a result, including failures. Retain credible prior facts when access or extraction fails. Reading a public abstract does not count as reading the paid report. Use `news` coverage for the stories actually reviewed; advance the broader `discovery/news` check only after checking all configured news entry sources, recording any unavailable source as incomplete.

## Company calendar and event task

Calendar entries have a stable ID, company, report period, `scheduled_at`, `review_after`, confirmation status and evidenced source. Announced call time is not proof that results have been published. Unknown dates stay unknown; estimates never trigger a confirmed-release alert or an automatic event run.

The Sunday plan returns `calendar_targets` for registered companies without an outstanding confirmed report date. Read only the relevant official event calendar or date announcement for these targets, and persist evidenced dates through the `calendar` scope. Unknown or estimated dates remain unconfirmed. This is calendar maintenance, not company financial discovery: it does not advance company discovery or report-source check dates. A confirmed outstanding date needs no routine recheck unless a new announcement changes it; revalidate it when the event task executes. If the calendar lookup reveals an already-published, unprocessed report, perform targeted discovery for that company.

After calendar changes or report processing, inspect `schedule --mode earnings`. Privately inspect existing automations and maintain one next-event task for this website, using `next_event_run_at` and its companies. Reschedule when the issuer changes its confirmed date; do not duplicate tasks. At execution, re-read latest main and the calendar, confirm the publication actually appeared, and process only due companies. Afterward look for that company's next official date and arrange the next confirmed event; if a source is unavailable, retain the pending state and schedule a bounded retry. Routine runs continue to include overdue or unprocessed companies. Do not edit the separate MU technical-analysis task. Task identifiers stay outside the public repository.

The initial calendar confirms Micron's FY2026 Q4 call. Other companies display “date to be confirmed” until their official calendar is reviewed. Company coverage comes from the catalog, so adding a company extends calendar maintenance without a weekly financial sweep.

## Freshness shown to readers

- The header's collapsed “last update” is the latest successful release that changed published facts, quotes or news. It is derived from the immutable release chain and content differences, never the JSON file write time or an unchanged discovery. The expanded times keep quote, industry, all-source news discovery and each company's last review separate. A news import is not an all-source news check.
- `config/update-schedule.json` is the public, reviewed copy of the enabled website monitoring automation, confirmed earnings task and `.github/workflows/quote.yml`. Update it when any of those actual tasks change, including pauses and reschedules. Do not infer an unknown company's earnings date or publish a past event as a new plan. The build generates `data/update-status.json` and an embedded offline copy; the UI requires its revision to match the data. `verify-live` checks both hashes and the release manifest. The displayed times are approximate planned starts in Pacific time, not completion promises.
- Quarterly facts carry their reporting period and publication date; elapsed statement age alone does not expire them.
- Company report/discovery age alone never triggers an overdue warning. Company warnings reflect failed/pending targeted checks, unprocessed disclosures or a confirmed event whose review time has passed. The legacy `financial_discovery_days` field remains in stored policy for schema compatibility and is not an active timer. Industry/news discovery keeps a four-day interval plus a 24-hour grace period. Display warnings only in the relevant section.
- “New disclosure pending” remains distinct from “expected announcement time passed; publication unconfirmed.” A completed report removes its old calendar deadline.
- Market staleness counts completed trading sessions, excluding weekends and confirmed holidays. No intraday price expectation is created. Unknown calendar years require a calendar update.
- `last_successful_check_at` remains a historical full-source audit field; it is not the dashboard's freshness clock. Refresh only reloads published data.

Policy and registries live in `pipeline/catalog.json`. Date-only publication values retain the publisher's date. Discovery clocks are UTC, company events include an explicit offset, and task scheduling uses America/Los_Angeles.

## News contract and extension

Categories cover memory supply/pricing, cloud spending, capacity/investment, hardware products, and AI applications. Register entities/categories in the catalog. Prefer releases with substantive facts or numbers over commentary and repeated coverage of the same story.

Each item has a stable `news.<id>` definition, `story_key`, category, companies, original publication date, substantive update date, fact summary, nature, target/observation period, original sources and section locator. Keep estimates, management plans and actual progress distinct. Source excerpts and research review follow the same evidence contract as financial data. Dates do not advance merely because an agent checked again.

For a supported quantitative checklist value, add `fact_refs: [{metric_id,record_id}]` using the immutable ledger record ID. Materialization generates `news.fact_records`; do not copy a live metric value into the story. A future quarterly change must not change historical news. TrendForce's dated release appears in news; its standardized observation remains in the industry checklist, sharing the same evidence-backed fact.

Use one card per story, merging substantive revisions under the same `story_key`. Preserve original publication dates and historical ledger records. The UI defaults to 30 days and supports category/company filters, all-history viewing and `#news-<id>` links. Retain old stories; the date filter archives them from the default view.

## Quote execution and failure handling

`.github/workflows/quote.yml` runs a deterministic quote update around 18:10 ET on trading weekdays. `scripts/quote-update.mjs` captures the Yahoo daily OHLC response, checks MU/USD identity, session completion, consecutive trading sessions, OHLC bounds and splits, and enters the normal candidate pipeline. Splits and unknown calendar years require reviewed normalization. Source failures produce a failure receipt and keep the old price.

`scripts/publish-quote.sh` creates a candidate PR, explicitly dispatches `monitor.yml`, waits for that exact commit's checks and verifies that main has not moved. Only then does it merge and dispatch deployment. It never bypasses branch protection. Because events written with `GITHUB_TOKEN` do not start new workflows automatically, explicit dispatch is necessary. The repository must allow GitHub Actions to create PRs; restricted approval requirements can leave the candidate PR pending. A failed or blocked workflow is not a completed price update.

The exchange calendar is based on [Nasdaq's published schedule](https://m.nasdaqtrader.com/Trader.aspx?id=Calendar). Extend the maintained years and their holiday tests before a new year. The quote provider supplies the actual close time, including early-close sessions.

## Acceptance checks

`npm test` covers old quarterly facts, section-specific failures, unchanged-report discovery, pending-release persistence, calendar rollover, event eligibility, independent manual scope, market holidays, evidence-backed news and immutable historical references. `npm run test:ui` exercises fixed local news fixtures, phone filters, long content, forecasts, dated historical links, sources and offline fallback. No test fetches financial sources. Run `verify --base` and the exact candidate's GitHub CI before merging; confirm the deployment and full live hash afterward.
