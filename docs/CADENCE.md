# Update cadence

The scheduler selects work. Research discovers and reads original disclosures. The pipeline validates and publishes candidates. The UI consumes the published document. A layout change never starts research or advances a check date.

## Routine and requested runs

| Run | Scope | When facts change |
|---|---|---|
| Sunday discovery | `industry,technology:*`, due/unprocessed company disclosures; missing calendar dates separately | New or revised original disclosures only |
| Wednesday discovery | `industry,technology:*` and due/unprocessed company disclosures | New supply/demand, pricing or targeted disclosures |
| Confirmed earnings review | The companies due in the calendar, about 24 hours after the announced call | The complete report bundle, including comparable prior data and guidance |
| User request | Requested company/section, or comprehensive discovery if unspecified | Same evidence and publication gates as scheduled work |
| Regular close | Quote adapter after the completed trading session | Final daily OHLC only; no report acquisition |

The monitoring automation runs Sunday and Wednesday in America/Los_Angeles. Select the run mode using that local weekday. Neither routine run sweeps every company's report directory or reopens unchanged statements. Company discovery is selected only for confirmed reports due for review or identified, unprocessed disclosures. An explicit manual run may still request a broader check. Interim guidance revisions, preliminary results, restatements and material filings qualify as new disclosures even between quarterly reports.

```sh
npm run monitor -- schedule --mode weekly
npm run monitor -- schedule --mode midweek
npm run monitor -- schedule --mode earnings
npm run monitor -- schedule --mode manual --company nvidia
npm run monitor -- plan --scope discovery --targets industry,technology:facilities,technology:processes,technology:products --run .monitor/runs/check-new
```

`schedule` only prints a deterministic plan. It does not create external tasks. For each discovery target, read its current original IR/news index and relevant new releases. Store read receipts and register source IDs/roles in the catalog when needed. In discovery coverage, set `finding=unchanged|new_disclosure|unconfirmed` and `latest_disclosure={url,published_at}`. Identify the newest relevant report/guidance, not an old bookmark. Store the actual search time in `reviewed_at`.

When industry or technology research finds a financial revision or a new report, create a targeted `discovery` run for that company and then process its report/guidance scope. Do not wait for the next quarterly event. Due and unprocessed company disclosures also appear in routine plans so a missed event run can recover without a full-company sweep.

Run `build` and `apply` to publish discovery outcomes. Before committing, re-read and re-stamp the agent analysis (`data/outlook.json`, see `MONITORING.md`). Then plan from that new state and process new items with `micron`, `company:<id>`, `industry`, `calendar`, or the affected `technology:*` topic. `batch --targets industry,calendar` combines explicit scopes. Unchanged quarterly facts, their original-source dates and the legacy full-audit timestamp remain unchanged. A pending or failed lookup retains its last successful discovery time. Re-discovering an unprocessed release keeps its pending alert. Process it using the same `latest_disclosure` identity to resolve the alert.

```sh
npm run monitor -- plan --scope company:nvidia --run .monitor/runs/nvidia-report
npm run monitor -- plan --scope batch --targets industry,calendar --run .monitor/runs/industry-calendar
```

Every targeted scope needs a result, including failures. Retain credible prior facts when access or extraction fails. Reading a public abstract does not count as reading the paid report.

## Technology coverage

Factory, process and product discovery are separate catalog targets in both routine plans. Complete all configured official index reads before marking each topic successful. The first record import only advances content time. The header displays all-source discovery separately and uses `research.technology_starts_at` to avoid backdating the new coverage schedule. New Micron, Samsung and SK hynix financial report bundles must review every registered technical item; changes enter explicit batch scopes with fresh evidence. See [TECHNOLOGY.md](TECHNOLOGY.md) for source lists, required fields, comparison baselines, failure rules and examples.

## Company calendar and event task

Calendar entries have a stable ID, company, report period, `scheduled_at`, `review_after`, confirmation status and evidenced source. Announced call time is not proof that results have been published. Unknown dates stay unknown; estimates never trigger a confirmed-release alert or an automatic event run.

The Sunday plan returns `calendar_targets` for registered companies without an outstanding confirmed report date. Read only the relevant official event calendar or date announcement for these targets, and persist evidenced dates through the `calendar` scope. Unknown or estimated dates remain unconfirmed. This is calendar maintenance, not company financial discovery: it does not advance company discovery or report-source check dates. A confirmed outstanding date needs no routine recheck unless a new announcement changes it; revalidate it when the event task executes. If the calendar lookup reveals an already-published, unprocessed report, perform targeted discovery for that company.

After calendar changes or report processing, inspect `schedule --mode earnings`. Privately inspect existing automations and maintain one next-event task for this website, using `next_event_run_at` and its companies. Reschedule when the issuer changes its confirmed date; do not duplicate tasks. At execution, re-read latest main and the calendar, confirm the publication actually appeared, and process only due companies. Afterward look for that company's next official date and arrange the next confirmed event; if a source is unavailable, retain the pending state and schedule a bounded retry. Routine runs continue to include overdue or unprocessed companies. Do not edit the separate MU technical-analysis task. Task identifiers stay outside the public repository.

The initial calendar confirms Micron's FY2026 Q4 call. Other companies display “date to be confirmed” until their official calendar is reviewed. Company coverage comes from the catalog, so adding a company extends calendar maintenance without a weekly financial sweep.

Micron's FY2026 Q4 earnings release and prepared remarks were imported on October 1, 2026; the FY2026 10-K supplement remains pending. Until it is resolved, Wednesday/Sunday maintenance also performs targeted `company:micron` discovery for the FY2026 10-K. The rows waiting on it are explicit `unavailable` gaps with the FQ3 prior column kept: finished goods, work in process, raw materials, trade receivables and their revenue ratio, quarter-end RPO and complete contract liabilities. A formula whose input is such a gap stays pending; a total disclosed before its components (balance-sheet inventories) is published while its reconciliation waits. Total receivables cannot substitute for trade receivables. Import the 10-K through a `micron` run that fills those rows; do not create another standalone retry or expand this supplement into an all-company financial sweep.

## Freshness shown to readers

- The header's collapsed “last update” is the latest successful release that changed published facts or quotes. It is derived from the immutable release chain and content differences, never the JSON file write time or an unchanged discovery. The expanded times keep quote, industry, each technology topic and each company's last review separate.
- `config/update-schedule.json` is the public, reviewed copy of the enabled website monitoring automation, confirmed earnings task and `.github/workflows/quote.yml`. Update it when any of those actual tasks change, including pauses and reschedules. Do not infer an unknown company's earnings date or publish a past event as a new plan. The build generates `data/update-status.json` and an embedded offline copy; the UI requires its revision to match the data. `verify-live` checks both hashes and the release manifest. The displayed times are approximate planned starts in Pacific time, not completion promises.
- Quarterly facts carry their reporting period and publication date; elapsed statement age alone does not expire them.
- Company report/discovery age alone never triggers an overdue warning. Company warnings reflect failed/pending targeted checks, unprocessed disclosures or a confirmed event whose review time has passed. The legacy `financial_discovery_days` field remains in stored policy for schema compatibility and is not an active timer. Industry discovery keeps a four-day interval plus a 24-hour grace period. Display warnings only in the relevant section.
- “New disclosure pending” remains distinct from “expected announcement time passed; publication unconfirmed.” A completed report removes its old calendar deadline.
- Market staleness counts completed trading sessions, excluding weekends and confirmed holidays. No intraday price expectation is created. Unknown calendar years require a calendar update.
- `last_successful_check_at` remains a historical full-source audit field; it is not the dashboard's freshness clock. Refresh only reloads published data.

Policy and registries live in `pipeline/catalog.json`. Date-only publication values retain the publisher's date. Discovery clocks are UTC, company events include an explicit offset, and task scheduling uses America/Los_Angeles.

## Retired AI news section

The AI 动态 tab was removed on October 2, 2026. The `news` discovery target has `cadence: "retired"` in the catalog, so `schedule` and a default `discovery` run no longer select it, and its old check raises no freshness warning. Do not collect AI news or add `news.<id>` items. The twelve published stories, their evidence and immutable `fact_refs` stay in the ledger as history (removing them would be a data release, not a UI change). Old `#news` and `#news-<id>` links open 总览.

## Quote execution and failure handling

`.github/workflows/quote.yml` runs a deterministic quote update from 18:10 ET on trading weekdays. GitHub may start scheduled runs hours late, so any start between 18:00 and 22:59 ET proceeds. Under daylight time both cron entries pass; the second finds no newer completed close and changes nothing, or acts as a retry after a failed first run. A scheduled run skips while an earlier regular-close candidate PR is still open. A source error still records a failure receipt. `scripts/quote-update.mjs` captures the Yahoo daily OHLC response, checks MU/USD identity, session completion, consecutive trading sessions, OHLC bounds and splits, and enters the normal candidate pipeline. Splits and unknown calendar years require reviewed normalization. Source failures produce a failure receipt and keep the old price.

`scripts/publish-quote.sh` creates a candidate PR, explicitly dispatches `monitor.yml`, waits for that exact commit's checks and verifies that main has not moved. Only then does it merge and dispatch deployment. It never bypasses branch protection. Because events written with `GITHUB_TOKEN` do not start new workflows automatically, explicit dispatch is necessary. The repository must allow GitHub Actions to create PRs; restricted approval requirements can leave the candidate PR pending. A failed or blocked workflow is not a completed price update.

The exchange calendar is based on [Nasdaq's published schedule](https://m.nasdaqtrader.com/Trader.aspx?id=Calendar). Extend the maintained years and their holiday tests before a new year. The quote provider supplies the actual close time, including early-close sessions.

## Acceptance checks

`npm test` covers old quarterly facts, section-specific failures, unchanged-report discovery, pending-release persistence, calendar rollover, event eligibility, independent manual scope, market holidays and immutable historical references. `npm run test:ui` exercises fixed local fixtures, long content, forecasts, dated historical links, sources and offline fallback. No test fetches financial sources. Run `verify --base` and the exact candidate's GitHub CI before merging; confirm the deployment and full live hash afterward.
