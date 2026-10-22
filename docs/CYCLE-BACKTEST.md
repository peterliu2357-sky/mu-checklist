# 周期信号回测（2026-10-22）

This report decides which rows appear in the 周期 signal row. A signal stays there only if, without hindsight, it turned before Micron's gross margin at both cycle peaks the site can test: 2018 and 2022. Everything else stays on its card as a reading, not as a signal.

Rerun: `python3 -I research/cycle-backtest/fetch.py` (about an hour; add `--skip-comtrade` to reuse saved customs data), then `python3 -I research/cycle-backtest/backtest.py`. Inputs are saved in `research/cycle-backtest/inputs/`, results in `results.json` and `events.json`.

## Target and turns

The yardstick is Micron's quarterly GAAP gross margin from SEC XBRL (revenue, gross profit, COGS and inventory, FY2009 onward). DRAM ASP direction comes from the sequential ASP sentences in each 10-Q since FY2017 and is used as a second check.

| Turn | Gross margin turn (quarter end) | DRAM ASP turn (quarter end) |
|---|---|---|
| 2018 peak | FQ4 2018 (2018-08-30), 61.0% | FQ4 2018; first sequential decline FQ1 2019 |
| 2019 trough | FQ1 2020 (2019-11-28), 26.6% | FQ2 2020; first increase FQ3 2020 |
| 2022 peak | FQ3 2022 (2022-06-02), 46.7%, after a flat run from FQ4 2021 | FQ4 2021; first decline FQ1 2022 |
| 2023 trough | FQ2 2023 (2023-03-02), −32.7% including inventory write-downs | FQ4 2023; first increase FQ1 2024 |

The small 2016 trough and the 2020–21 mini-cycle are also dated, so warnings at those turns are not counted as false alarms, but they are not scored.

## Rule (fixed before scoring)

- Each signal is turned into its year-on-year change of a 3-month average (quarterly data: year-on-year change of the quarter). Inventory-type signals are sign-flipped so "worse" is always down.
- A peak warning fires when that change has fallen 3 months in a row (2 quarters for quarterly data) by at least half its typical pre-2015 move. A trough all-clear is the mirror image. A warning re-arms only after the opposite warning.
- A warning counts from its publication date: month end plus the source's lag (customs 1 day, BOK 15 days, Nanya 10 days, Statistics Korea 30 days, Micron filings 28 days, hyperscaler filings 30 days).
- At each turn the signal's state is its latest published warning. It is a hit if that warning matches the turn and is at least 3 months (one quarter) old. A matching warning published up to 6 months after the turn is reported as a negative lead.
- Unmatched warnings from 2015 to 2025 are false alarms.

Change after the first run: quarterly signals originally used the same 3-period confirmation as monthly ones, which meant 9 months of data. They now use 2 quarters. This changed Micron inventory days from a miss to a hit and is the only rule change.

## Result

Lead in months before Micron's gross-margin turn (negative = after the turn; — = no matching warning).

| Signal | 2018 peak | 2022 peak | 2019 trough | 2023 trough | False alarms | Decision |
|---|---|---|---|---|---|---|
| 韩国存储芯片出口额 (customs HS 854232) | 6.0 | 6.0 | −2.1 | −5.0 | 2 | **Signal row** |
| 美光库存天数 | 8.0 | 17.0 | −0.9 | — | 2 | **Signal row** |
| 韩国半导体出口额 (HS 8541+8542) | 6.0 | 6.0 | −2.1 | −4.0 | 2 | Card only: leads, but memory is two thirds to nine tenths of it, so it repeats the memory signal |
| 韩国央行 DRAM 出口价格指数 | 7.5 | 1.6 | −3.5 | — | 3 | Card only: moves with Micron's margin (best correlation at lag 0, 0.85); added as the official price yardstick |
| 南亚科月营收 | −2.4 | 5.7 | 1.6 | −4.3 | 4 | Card only |
| 韩国电子零件业库存/出货比 (KSIC 26) | — | 5.1 | 6.0 | — | 10 | Card only: right in 2022 and 2019, but noisy |
| 美光总收入 (proxy for DRAM revenue) | 8.0 | −0.9 | −3.9 | — | 3 | Off the signal row: coincident with margin |
| 四家云厂商资本开支合计 | −5.0 | 4.0 | 1.0 | — | 2 | Off the signal row |
| 韩国央行闪存出口价格指数 | 9.5 | −1.4 | 2.4 | — | 4 | Not added |
| 韩国半导体业开工率指数 | — | −1.9 | 3.0 | −3.9 | 6 | Not added |

Against the DRAM ASP turns instead, the 2022 peak is nine months earlier (FQ4 2021). Micron inventory days still leads it by 8 months; Korea memory exports turn 3 months after it.

Correlation check (signal change against the change in Micron's margin k quarters later, 2015–2024): Micron inventory days is strongest one quarter ahead (0.78 at lag 1 against 0.43 at lag 0). Korea memory exports is strongest at lag 0 (0.89) and still 0.81 one quarter ahead. The BOK DRAM index falls from 0.85 at lag 0 to 0.70 at lag 1.

No signal called the troughs a quarter early. Peaks are where these signals help, which is also the turn that matters while the cycle is rising.

## Rows that cannot be tested

These have no free history that reaches back to 2018, so they leave the signal row and stay on their cards: DDR4, DDR5 and TLC spot prices; TrendForce contract-price, NAND trend, DRAM sufficiency and NAND market forecasts; Micron's own outlook; enterprise SSD lead time and SSD revenue estimates; the mobile proxies; customer inventory days (no value yet). Micron's gross margin is the target itself and cannot lead itself. The spot-to-contract premium is shown next to spot on the 价格 card but is not yet testable either; its history starts now.

## Limits

- Two peaks and two troughs are few. The leads above are evidence, not a guarantee.
- The customs series in the test is HS 854232 from UN Comtrade. The site's row uses the trade ministry's memory figure, which is broader (it includes multi-chip packages): September 2025 was 117.9 亿美元 in the ministry release and 93.5 亿美元 under HS 854232. Both come from the same customs records and turn together.
- The inventory ratio is for KSIC 26 (electronic components, computers and communications equipment), where semiconductors are the largest part. A semiconductor-only ratio is published by Statistics Korea (KOSIS) but needs an API key.
- The 2023 gross-margin trough is pulled earlier by inventory write-downs, so trough leads against it are understated.

## Korea memory exports check (September 2026)

The site shows 540.70 亿美元 of memory inside 602.95 亿美元 of semiconductor exports, about 90%. The ministry PDF (2026-10-01 release, p12) gives memory 117.9 → 540.7 and system semiconductors 43.0 → 55.4, so the row matches its source. The share rose from 71% in September 2025 because memory prices rose: the release lists DDR5 16Gb fixed prices up 687.5% year on year, and the BOK DRAM export price index rose from 83.16 to 289.16 over the same months. The figure is correct.
